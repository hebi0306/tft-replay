import tempfile
import unittest
from unittest.mock import Mock, patch
import cv2
import numpy as np
from capture_service import CaptureService
from stat_detector import stable_gold


class PrecombatCaptureTests(unittest.TestCase):
    def test_replay_keeps_latest_precombat_frame_and_skips_noncombat(self):
        with tempfile.TemporaryDirectory() as root:
            service = CaptureService(root)
            service.analyzer = Mock()
            # Carousel, augment modal, two clean planning frames, combat, and unfinished planning.
            timeline = [
                *([('2-4', (None, None))] * 4),
                *([('2-5', (None, None))] * 3),
                ('2-5', ('planning', 2)), ('2-5', ('planning', 1)),
                ('2-5', ('combat', None)), ('2-5', ('combat', None)),
                *([('2-6', ('planning', 1))] * 3),
            ]
            index = [-1]
            def grab(*_):
                index[0] += 1
                if index[0] == len(timeline):
                    service.stop_event.set()
                    raise ValueError('window_missing')
                return np.full((100, 200, 3), index[0], np.uint8)
            def phase(*_):
                return timeline[index[0]][1]
            def stats(frame, *_):
                self.assertEqual(int(frame[0, 0, 0]), 8)
                return {'health': 74, 'gold': 0, 'level': 7}, {}
            service.analyzer.detect_stage.side_effect = lambda *_: timeline[index[0]][0]
            service.analyzer.analyze_stats.side_effect = stats
            match = service.repo.start()
            service.update(recording=True, matchId=match)
            with patch('window_detector.capture_frame', side_effect=grab), patch('capture_service.combat_phase', side_effect=phase), patch.object(service.stop_event, 'wait'), patch.object(service, 'analyze_board') as board:
                service.record({'stageRoi': [.4, 0, .1, .05]}, match)
            rows = service.repo.match(match)['rounds']
            self.assertEqual([r['stage'] for r in rows], ['2-5'])
            self.assertEqual((rows[0]['health'], rows[0]['gold'], rows[0]['level']), (74, 0, 7))
            saved = cv2.imdecode(np.frombuffer((service.repo.root / match / '2-5.png').read_bytes(), np.uint8), 1)
            self.assertTrue(np.all(saved == 8))
            board.assert_called_once()
            self.assertEqual(board.call_args.args[-1], 'precombat')
            self.assertTrue(np.array_equal(board.call_args.args[0], saved))

    def test_only_recent_consecutive_values_establish_stability(self):
        self.assertIsNone(stable_gold([0,0,3]))
        self.assertIsNone(stable_gold([5,None,5]))
        self.assertIsNone(stable_gold([1,2,3]))
        self.assertEqual(stable_gold([1,2,0,0]),0)
        self.assertEqual(stable_gold([None,12,12]),12)
