import tempfile
import unittest
from analysis import StageTracker, normalized_roi, parse_stage
from repository import MatchRepository
from capture_service import validate_options


class CaptureTests(unittest.TestCase):
    def test_game_process_names_exclude_launchers_and_unrelated_apps(self):
        from window_detector import is_game_process
        for name in ('League of Legends.exe', 'TFTClient-Win64-Shipping.exe', r'C:\Riot Games\TFT\TFTClient-Win64-Shipping.EXE'):
            self.assertTrue(is_game_process(name), name)
        for name in ('TFTClient.exe', 'LeagueClientUx.exe', 'RiotClientServices.exe', 'TFT Replay.exe', 'not-TFTClient-Win64-Shipping.exe'):
            self.assertFalse(is_game_process(name), name)

    def test_real_ocr_on_synthetic_round_image(self):
        import cv2
        import numpy as np
        from analysis import TftImageAnalyzer
        analyzer = TftImageAnalyzer()
        with tempfile.TemporaryDirectory() as root:
            from capture_service import png_bytes
            repo, tracker = MatchRepository(root), StageTracker()
            match_id = repo.start()
            for stage in ('2-1', '2-2', '2-3'):
                frame = np.full((120, 360, 3), 30, dtype=np.uint8)
                cv2.putText(frame, stage, (80, 80), cv2.FONT_HERSHEY_SIMPLEX, 2, (240, 240, 240), 3, cv2.LINE_AA)
                for _ in range(4):
                    detected = analyzer.detect_stage(frame, [0, 0, 1, 1])
                    self.assertEqual(detected, stage)
                    if tracker.observe(detected):
                        repo.save_round(match_id, detected, png_bytes(frame))
                        tracker.commit(detected)
            repo.finish(match_id)
            self.assertEqual([r['stage'] for r in repo.match(match_id)['rounds']], ['2-1', '2-2', '2-3'])

    def test_round_confirmation_errors_duplicates_and_jumps(self):
        tracker = StageTracker()
        for text in ('3-Z', '32', '0-1', '3-8', '3-2 99'):
            self.assertIsNone(parse_stage(text))
        self.assertEqual(parse_stage(' 3 – 2 '), '3-2')
        self.assertIsNone(tracker.observe('3-1'))
        self.assertIsNone(tracker.observe(None))
        self.assertIsNone(tracker.observe('3-1'))
        self.assertIsNone(tracker.observe('3-1'))
        self.assertEqual(tracker.observe('3-1'), '3-1')
        tracker.commit('3-1')
        for stage in ('3-1', '8-1', '3-1', None, '2-7'):
            self.assertIsNone(tracker.observe(stage))
        for _ in range(2): self.assertIsNone(tracker.observe('3-2'))
        self.assertEqual(tracker.observe('3-2'), '3-2')
        tracker.commit('3-2')
        for _ in range(2): self.assertIsNone(tracker.observe('3-5'))
        self.assertEqual(tracker.observe('3-5'), '3-5')

    def test_repository_restart_retains_real_images_and_no_duplicate_rounds(self):
        with tempfile.TemporaryDirectory() as root:
            repo = MatchRepository(root)
            match = repo.start()
            repo.save_round(match, '2-1', b'first')
            repo.save_round(match, '2-1', b'not overwritten')
            recovered = MatchRepository(root)
            row = recovered.match(match)
            self.assertEqual(row['status'], 'interrupted')
            self.assertIsNotNone(row['ended_at'])
            self.assertEqual(len(row['rounds']), 1)
            self.assertTrue(recovered.image(row['rounds'][0]['id']).endswith('Zmlyc3Q='))
            self.assertEqual(recovered.matches()[0]['round_count'], 1)
            with self.assertRaises(ValueError): recovered.save_round(match, '2-2', b'closed')
            with self.assertRaises(ValueError): recovered.image('../secret')
            with self.assertRaises(ValueError): recovered.match('../secret')

    def test_region_validation(self):
        for roi in ([0, 0, 0, 1], [0.8, 0, 0.3, 1], [0, 0, float('nan'), 1], [-1, 0, 1, 1], 'bad'):
            with self.assertRaises(ValueError): normalized_roi(roi)
        normalized_roi([0.4, 0, 0.15, 0.06])
        with self.assertRaises(ValueError): validate_options({'mode': 'window', 'windowId': 'cmd', 'stageRoi': [0, 0, 1, 1]})
        with self.assertRaisesRegex(ValueError, 'stage_roi_too_large'):
            validate_options({'mode': 'window', 'windowId': '123', 'stageRoi': [0, 0, 1, 1]})

    def test_capture_loop_retries_failure_then_persists_and_stops(self):
        from unittest.mock import patch
        import numpy as np
        from capture_service import CaptureService
        with tempfile.TemporaryDirectory() as root:
            service = CaptureService(root)
            frame = np.zeros((100, 200, 3), dtype=np.uint8)
            frames = iter([frame, ValueError('window_minimized'), frame, frame, frame, frame, frame, frame])
            def grab(*_):
                try:
                    value = next(frames)
                except StopIteration:
                    service.stop_event.set()
                    raise ValueError('window_missing')
                if isinstance(value, Exception): raise value
                return value
            class Analyzer:
                def __init__(self): self.stages = iter(['2-1', '2-1', '2-1', '2-1', '2-2', '2-2', '2-2'])
                def detect_stage(self, *_): return next(self.stages)
            service.analyzer = Analyzer()
            with patch('window_detector.capture_frame', side_effect=grab), patch.object(service.stop_event, 'wait', return_value=False):
                result = service.start({'mode': 'region', 'monitor': 1, 'region': [0, 0, 1, 1], 'stageRoi': [0.4, 0, 0.1, 0.05]})
                service.thread.join(timeout=5)
                self.assertFalse(service.thread.is_alive())
            self.assertFalse(service.status()['recording'])
            match = service.repo.match(result['matchId'])
            self.assertEqual(match['status'], 'completed')
            self.assertEqual([r['stage'] for r in match['rounds']], ['2-1', '2-2'])


if __name__ == '__main__':
    unittest.main()
