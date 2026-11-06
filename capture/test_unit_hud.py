import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import cv2
import numpy as np
from tft_catalog import TftCatalog
from unit_hud import UnitHud


class UnitHudTests(unittest.TestCase):
    def test_missing_references_and_blank_frame_stay_unknown(self):
        with tempfile.TemporaryDirectory() as root:
            hud = UnitHud(TftCatalog(Path(root)))
            units = [{'bbox': [10,20,60,100], 'star': None}]
            hud.apply(np.zeros((1080,1920,3),np.uint8), units)
            self.assertIsNone(units[0]['star'])
        hud = UnitHud(TftCatalog())
        _, headers, _ = hud.detect(np.zeros((1080,1920,3),np.uint8))
        self.assertEqual(headers, [])

    def test_shared_header_is_not_assigned_to_either_unit(self):
        with tempfile.TemporaryDirectory() as root:
            hud = UnitHud(TftCatalog(Path(root)))
            hud.badges = [True]
            frame = np.zeros((1080,1920,3),np.uint8)
            header = {'star': 2, 'score': .99, 'x': 100, 'y': 200, 'width': 20, 'itemX':112, 'itemY':222}
            units = [{'bbox': [120,215,180,300], 'star': None} for _ in range(2)]
            with patch.object(hud,'detect',return_value=(frame,[header],1)):
                hud.apply(frame,units)
            self.assertEqual([u['star'] for u in units],[None,None])

    def test_rank_templates_and_empty_slot_do_not_fabricate_items(self):
        hud = UnitHud(TftCatalog())
        for row, badge, _ in hud.badges:
            frame = np.zeros((1080,1920,3),np.uint8)
            h,w=badge.shape[:2]
            frame[300:300+h,600:600+w] = badge
            _, headers, _ = hud.detect(frame)
            self.assertEqual([v['star'] for v in headers], [row['star']])
        self.assertIsNone(hud.items.identify(np.zeros((24,24,3),np.uint8))['id'])

    def test_hud_failure_does_not_break_stage_analysis(self):
        from stage_analyzer import TftStageAnalyzer
        with tempfile.TemporaryDirectory() as root:
            analyzer = TftStageAnalyzer(Path(root), Path(root)/'missing.onnx')
            with patch.object(analyzer.hud,'apply',side_effect=RuntimeError('test')):
                result = analyzer.analyze(np.zeros((720,1280,3),np.uint8),'2-1')
            self.assertEqual(result['stage'],'2-1')
            self.assertEqual(result['status']['stars'],'hud_analysis_failed')

    def test_visible_header_survives_missing_body_without_inventing_position(self):
        hud = UnitHud(TftCatalog())
        row, badge, _ = hud.badges[0]
        frame = np.zeros((1080,1920,3),np.uint8)
        h,w = badge.shape[:2]
        frame[300:300+h,600:600+w] = badge
        observations = hud.apply(frame, [])
        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0]['star'], row['star'])
        self.assertIsNone(observations[0]['unitIndex'])
        self.assertFalse(observations[0]['positionVerified'])
        self.assertEqual(observations[0]['items'], [None,None,None])

    def test_counter_mask_does_not_accept_flat_icon(self):
        hud = UnitHud(TftCatalog())
        self.assertIsNone(hud.identify_item(np.full((24,24,3), 100, np.uint8))['id'])
