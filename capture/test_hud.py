import unittest
from pathlib import Path
from unittest.mock import patch
import cv2
import numpy as np
from analysis import TftImageAnalyzer
from capture_config import STAT_CONFIG, STAGE_ROIS
from hud_detector import locate_hud


def fixture_frame(dx=0, dy=0, scale=1):
    frame = np.zeros((1080, 1920, 3), np.uint8)
    for name, (x, y) in [('stage', (680, 0)), ('shop', (330, 865))]:
        im = cv2.imdecode(np.fromfile(Path(__file__).parent / 'fixtures' / f'hud-{name}.png', dtype=np.uint8), cv2.IMREAD_COLOR)
        im = cv2.resize(im, None, fx=scale, fy=scale)
        px, py = x+dx, y+dy
        frame[py:py+im.shape[0], px:px+im.shape[1]] = im
    return frame


class HudTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.analyzer = TftImageAnalyzer()

    def test_real_hud_moves_and_resolution_changes(self):
        for dx, dy in [(0, 0), (55, 15), (-25, 25)]:
            for width, height in [(1280, 720), (1920, 1080), (2560, 1440)]:
                frame = cv2.resize(fixture_frame(dx, dy), (width, height))
                detail = {}
                self.assertEqual(self.analyzer.detect_stage(frame, STAGE_ROIS[0], detail), '1-4')
                self.assertEqual(detail['source'], 'tracked')
                for kind, value in [('gold', 2), ('level', 3)]:
                    detail = {}
                    actual = getattr(self.analyzer, 'detect_'+kind)(frame, STAT_CONFIG[kind]['roi'], detail)
                    self.assertEqual(actual, value, (dx,dy,width,kind,detail))
                    self.assertEqual(detail['source'], 'tracked', (dx,dy,width,kind,detail))

    def test_two_digit_level_is_not_truncated(self):
        im = cv2.imdecode(np.fromfile(Path(__file__).parent / 'fixtures' / 'hud-level10.png', dtype=np.uint8), cv2.IMREAD_COLOR)
        for width, height in [(1280, 720), (1920, 1080), (2560, 1440)]:
            frame = np.zeros((1080, 1920, 3), np.uint8)
            frame[865:1000, 235:460] = im
            frame = cv2.resize(frame, (width, height))
            self.assertEqual(self.analyzer.detect_level(frame, STAT_CONFIG['level']['roi']), 10)

    def test_hud_scale_can_change_independently_of_resolution(self):
        frame = fixture_frame(0, 10, .85)
        for kind in ('stage', 'gold', 'level'):
            found = locate_hud(frame, kind)
            self.assertIsNotNone(found, kind)
            self.assertAlmostEqual(found['scale'], .85, delta=.051)
        self.assertEqual(self.analyzer.detect_stage(frame, STAGE_ROIS[0]), '1-4')
        self.assertEqual(self.analyzer.detect_gold(frame, STAT_CONFIG['gold']['roi']), 2)
        self.assertEqual(self.analyzer.detect_level(frame, STAT_CONFIG['level']['roi']), 3)

    def test_missing_ambiguous_and_unavailable_icons(self):
        empty = np.zeros((1080,1920,3), np.uint8)
        for kind in ('stage','gold','level'):
            self.assertIsNone(locate_hud(empty, kind))
        frame = fixture_frame()
        frame[45:90, 680:930] = frame[:45,680:930]
        self.assertIsNone(locate_hud(frame,'stage'))
        with patch('hud_detector.icon_template', return_value=None):
            detail = {}
            self.assertEqual(self.analyzer.detect_stage(fixture_frame(), STAGE_ROIS[0], detail), '1-4')
            self.assertEqual(detail['source'], 'fixed')
            for kind, expected in [('gold',2),('level',3)]:
                self.assertEqual(getattr(self.analyzer,'detect_'+kind)(fixture_frame(), STAT_CONFIG[kind]['roi'], detail), expected)
                self.assertEqual(detail['source'],'fixed')

    def test_failed_tracked_ocr_retries_fixed_roi_and_custom_roi_wins(self):
        frame = fixture_frame()
        with patch('hud_detector.locate_hud', return_value={'roi':[0,0,.01,.01],'confidence':.99}):
            detail = {}
            self.assertEqual(self.analyzer.detect_gold(frame, STAT_CONFIG['gold']['roi'], detail), 2)
            self.assertEqual(detail['source'],'fixed')
            self.assertEqual(self.analyzer.detect_stage(frame, STAGE_ROIS[0], detail), '1-4')
            self.assertEqual(detail['source'],'fixed')
        with patch('hud_detector.locate_hud') as locate:
            self.analyzer.detect_gold(frame, [.5,.8,.03,.03])
            self.analyzer.detect_stage(frame, [.4,0,.04,.04])
            locate.assert_not_called()


if __name__ == '__main__':
    unittest.main()
