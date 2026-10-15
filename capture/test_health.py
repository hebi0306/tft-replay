import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np

from analysis import TftImageAnalyzer
from capture_service import CaptureService, validate_options
from health_detector import health_roi


def frame_at(y, value=100):
    frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
    badge = cv2.imread(str(Path(__file__).parent / 'fixtures' / f'health-{value}.png'))
    frame[y:y + badge.shape[0], 1756:1756 + badge.shape[1]] = badge
    return frame


class HealthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.analyzer = TftImageAnalyzer()

    def test_actual_badge_moves_and_resizes(self):
        for value in (100, 86, 80):
            for y in (170, 500, 800):
                for width, height in ((1280, 720), (1920, 1080), (2560, 1440)):
                    frame = cv2.resize(frame_at(y, value), (width, height))
                    detail = {}
                    self.assertEqual(self.analyzer.detect_health(frame, 'auto', detail), value, (y, width, detail))
                    self.assertAlmostEqual(detail['trackedRoi'][1], (y + 10) / 1080, delta=0.003)

    def test_round_header_positions_from_actual_game(self):
        for name, expected in [('extended', '1-4'), ('standard', '1-4'), ('later', '2-4')]:
            frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
            frame[:40, 680:900] = cv2.imread(str(Path(__file__).parent / 'fixtures' / ('stage-' + name + '.png')))
            self.assertEqual(self.analyzer.detect_stage(frame, [0.428, 0.002, 0.025, 0.028]), expected)

    def test_missing_or_ambiguous_badges_are_unknown(self):
        self.assertIsNone(health_roi(np.zeros((1080, 1920, 3), dtype=np.uint8)))
        frame = frame_at(170) + frame_at(500)
        self.assertIsNone(self.analyzer.detect_health(frame, 'auto'))

    def test_auto_is_only_valid_for_health(self):
        options = {'mode': 'window', 'windowId': '1', 'stageRoi': [0.4, 0, 0.03, 0.03]}
        validate_options({**options, 'statRois': {'health': 'auto'}})
        with self.assertRaises(ValueError):
            validate_options({**options, 'statRois': {'gold': 'auto'}})

    def test_ocr_through_recording_storage_and_image_retrieval(self):
        # Real OCR of generated labels plus an actual HP badge; not a live-match claim.
        with tempfile.TemporaryDirectory() as root:
            service = CaptureService(root)
            service.analyzer = self.analyzer
            frames = []
            for stage, y, gold in [('3-1', 170, 32), ('3-2', 500, 50)]:
                frame = frame_at(y)
                for text, origin in [(stage, (805, 55)), (str(gold), (805, 155)), ('7', (805, 255))]:
                    cv2.putText(frame, text, origin, cv2.FONT_HERSHEY_SIMPLEX, 1.2, (240, 240, 240), 2, cv2.LINE_AA)
                frames.extend([frame] * 5)
            sequence = iter(frames)
            def next_frame(*_):
                try:
                    return next(sequence)
                except StopIteration:
                    service.stop_event.set()
                    raise ValueError('window_missing')
            with patch('window_detector.capture_frame', side_effect=next_frame), patch.object(service.stop_event, 'wait', return_value=False):
                result = service.start({'mode': 'region', 'monitor': 1, 'region': [0, 0, 1, 1],
                    'stageRoi': [800/1920, 15/1080, 100/1920, 50/1080],
                    'statRois': {'health': 'auto', 'gold': [800/1920, 115/1080, 100/1920, 50/1080],
                                 'level': [800/1920, 215/1080, 100/1920, 50/1080]}})
                service.thread.join(timeout=15)
            self.assertFalse(service.thread.is_alive())
            rows = service.repo.match(result['matchId'])['rounds']
            self.assertEqual([(r['stage'], r['health'], r['gold'], r['level']) for r in rows],
                             [('3-1', 100, 32, 7), ('3-2', 100, 50, 7)])
            for row in rows:
                self.assertTrue(service.repo.image(row['id']).startswith('data:image/png;base64,'))


if __name__ == '__main__':
    unittest.main()
