import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import cv2
import numpy as np
from board_geometry import hex_grid, nearest_hex, bench_slots, extract_board_region
from board_config import BOARD_ROI, BENCH_ROI
from unit_detector import UnitDetector, decode_detections
from reference_matcher import ReferenceMatcher
from stage_analyzer import TftStageAnalyzer
from tft_catalog import TftCatalog
from trait_calculator import calculate_traits
from repository import MatchRepository
from capture_service import CaptureService, png_bytes
from unit_details import UnitDetails
from audit_unit_dataset import parse_labels


class BoardAnalysisTests(unittest.TestCase):
    def test_unit_cut_by_bench_boundary_is_logged_but_not_assigned_to_board(self):
        with tempfile.TemporaryDirectory() as root:
            analyzer = TftStageAnalyzer(Path(root), Path(root) / 'missing.onnx')
            analyzer.detector.status = 'ready'
            frame = np.zeros((720, 1280, 3), np.uint8)
            height = extract_board_region(frame).shape[0]
            detection = {'box': [200., height-50., 250., float(height)], 'confidence': .9}
            with patch.object(analyzer.detector, 'detect', side_effect=[[detection], []]):
                result = analyzer.analyze(frame, '3-2')
            self.assertEqual(result['board'], [])
            self.assertEqual(result['unitDetections']['board'], [detection])
            self.assertEqual(result['rejectedPositions'], 1)
            self.assertFalse(result['traitsComplete'])

    def test_training_labels_require_single_class_and_normalized_finite_boxes(self):
        self.assertEqual(len(parse_labels('0 .5 .5 .2 .3')), 1)
        self.assertEqual(parse_labels(''), [])
        for value in ('1 .5 .5 .2 .3', '0 nan .5 .2 .3', '0 .1 .5 .8 .3', '0 .5 .5 0 .3'):
            with self.assertRaises(ValueError):
                parse_labels(value)

    def test_bench_units_keep_detection_confidence_without_inventing_identity(self):
        with tempfile.TemporaryDirectory() as root:
            analyzer = TftStageAnalyzer(Path(root), Path(root) / 'missing.onnx')
            analyzer.detector.status = 'ready'
            detection = {'box': [10., 10., 30., 40.], 'confidence': .88}
            with patch.object(analyzer.detector, 'detect', side_effect=[[], [detection]]):
                result = analyzer.analyze(np.zeros((720, 1280, 3), np.uint8), '3-2')
            self.assertEqual(result['bench'][0]['occupancy'], 'unit')
            self.assertEqual(result['bench'][0]['detectionConfidence'], .88)
            self.assertIsNone(result['bench'][0]['championId'])
            self.assertEqual(result['bench'][1]['occupancy'], 'unknown')
            self.assertEqual(result['unitDetections']['bench'], [detection])

    def test_bench_identity_uses_detected_body_not_background_slot(self):
        with tempfile.TemporaryDirectory() as root:
            analyzer = TftStageAnalyzer(Path(root), Path(root) / 'missing.onnx')
            frame = np.zeros((1080,1920,3), np.uint8)
            frame[712:742,370:390] = [10,80,220]
            detection = {'box': [10.,10.,30.,40.], 'confidence': .9}
            with patch.object(analyzer.detector, 'detect', side_effect=[[],[detection]]), \
                 patch.object(analyzer.details, 'analyze', wraps=analyzer.details.analyze) as analyze:
                analyzer.analyze(frame)
            body = analyze.call_args_list[0].args[0]
            self.assertEqual(body.shape, (30,20,3))
            self.assertTrue(np.all(body == [10,80,220]))

    def test_calibrated_item_and_star_regions_use_shared_matchers(self):
        with tempfile.TemporaryDirectory() as root:
            details = UnitDetails(TftCatalog(Path(root)))
            image = np.random.default_rng(8).integers(0, 255, (48, 48, 3), dtype=np.uint8)
            (Path(root) / 'sample.png').write_bytes(cv2.imencode('.png', image)[1].tobytes())
            details.stars = ReferenceMatcher([{'id': '2', 'file': 'sample.png'}], root)
            details.items = ReferenceMatcher([{'id': 'item', 'file': 'sample.png'}], root)
            with patch('unit_details.STAR_ROI', [0, 0, 1, 1]), patch('unit_details.ITEM_ROIS', [[0, 0, 1, 1], None, None]):
                result = details.analyze(image)
            self.assertEqual(result['star'], 2)
            self.assertEqual(result['items'], ['item', None, None])
            self.assertIsNone(result['championId'])

    def test_corrupt_analysis_and_unwritable_debug_do_not_hide_recordings(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            blocked = root / 'file'
            blocked.write_text('not a directory')
            frame = np.zeros((100, 200, 3), np.uint8)
            analyzer = TftStageAnalyzer(root, root / 'absent.onnx')
            self.assertEqual(analyzer.analyze(frame, '3-2', blocked)['status']['board'], 'model_missing')
            repo = MatchRepository(root / 'recordings')
            match = repo.start()
            repo.save_round(match, '3-2', png_bytes(frame))
            with repo.connect() as db:
                db.execute("UPDATE rounds SET analysis_json='[1,2]' WHERE match_id=?", (match,))
            self.assertIsNone(repo.match(match)['rounds'][0]['analysis'])

    def test_nine_real_bench_positions_keep_separate_slots(self):
        # Observed body centers on the recorded 1920x1080 bench, including asymmetric poses.
        centers = [420, 535, 650, 767, 891, 1006, 1130, 1244, 1360]
        with tempfile.TemporaryDirectory() as root:
            analyzer = TftStageAnalyzer(Path(root), Path(root) / 'missing.onnx')
            for width, height in [(1920, 1080), (1280, 720), (2560, 1440)]:
                scale = width / 1920
                ox = int(BENCH_ROI[0] * width)
                detections = [{'box': [(x-22)*scale-ox, 10*scale, (x+22)*scale-ox, 95*scale],
                               'confidence': .9} for x in centers]
                with patch.object(analyzer.detector, 'detect', side_effect=[[], detections]):
                    result = analyzer.analyze(np.zeros((height, width, 3), np.uint8))
                self.assertEqual([b['slot'] for b in result['bench'] if b['bbox'] is not None], list(range(9)))

    def test_recorded_body_feet_map_to_observed_placement_cells(self):
        # Manually inspected bodies in 20261028_044235 / 2-7; not generated from hex_grid.
        examples = [([744,358,835,469], (0,2)), ([849,358,950,466], (0,3)),
                    ([552,465,660,556], (1,0)), ([550,608,594,677], (3,0)),
                    ([672,629,742,696], (3,1))]
        with tempfile.TemporaryDirectory() as root:
            analyzer = TftStageAnalyzer(Path(root), Path(root) / 'missing.onnx')
            for width, height in [(1920,1080), (1280,720), (2560,1440)]:
                scale = width/1920
                detections = [{'box': [a*scale-int(BOARD_ROI[0]*width), b*scale-int(BOARD_ROI[1]*height),
                                       c*scale-int(BOARD_ROI[0]*width), d*scale-int(BOARD_ROI[1]*height)],
                               'confidence': .9} for (a,b,c,d), _ in examples]
                with patch.object(analyzer.detector, 'detect', side_effect=[detections, []]):
                    result = analyzer.analyze(np.zeros((height,width,3), np.uint8))
                self.assertEqual([(v['row'],v['col']) for v in result['board']], [cell for _,cell in examples])
                self.assertTrue(all(v['position']['verified'] is False for v in result['board']))

    def test_geometry_scales_and_rejects_outside_and_nonfinite_points(self):
        grid = hex_grid()
        self.assertEqual(len(grid), 28)
        self.assertEqual(len(bench_slots()), 9)
        for cell in grid:
            for width, height in [(1920, 1080), (1280, 720)]:
                self.assertEqual(nearest_hex(cell['centerX'] * width / width, cell['centerY'] * height / height),
                                 {'row': cell['row'], 'col': cell['col']})
        self.assertIsNone(nearest_hex(0, 0))
        self.assertIsNone(nearest_hex(float('nan'), 0))

    def test_decoded_edge_boxes_remain_inside_crop_after_float_rounding(self):
        from board_geometry import box_crop
        rng = np.random.default_rng(17)
        frame = np.zeros((129,1080,3), np.uint8)
        for _ in range(100):
            raw = np.array([[[rng.uniform(0,640)], [rng.uniform(280,360)],
                             [rng.uniform(200,1600)], [rng.uniform(50,500)], [.9]]], np.float32)
            for detection in decode_detections(raw, 640/1080, (0,282), (1080,129)):
                self.assertGreater(box_crop(frame, detection['box']).size, 0)

    def test_onnx_decode_letterbox_confidence_and_nms(self):
        values = np.array([[[320, 321, 70], [320, 321, 100], [100, 100, 10], [80, 80, 10], [.9, .8, .1]]], np.float32)
        detections = decode_detections(values, 2, (0, 160), (320, 160))
        self.assertEqual(len(detections), 1)
        np.testing.assert_allclose(detections[0]['box'], [135, 60, 185, 100])
        with self.assertRaises(ValueError): decode_detections(np.zeros((1, 84, 10)), 1, (0, 0), (640, 640))
        values[0, 0, 0] = float('nan')
        with self.assertRaises(ValueError): decode_detections(values, 1, (0, 0), (640, 640))

    def test_missing_and_invalid_models_do_not_download_or_predict(self):
        with tempfile.TemporaryDirectory() as root:
            model = Path(root) / 'unit.onnx'
            self.assertEqual(UnitDetector(model).status, 'model_missing')
            model.write_bytes(b'not a model')
            self.assertEqual(UnitDetector(model).status, 'model_invalid')

    def test_reference_matcher_requires_threshold_and_margin(self):
        with tempfile.TemporaryDirectory() as root:
            image = np.random.default_rng(3).integers(0, 255, (48, 48, 3), dtype=np.uint8)
            (Path(root) / 'a.png').write_bytes(cv2.imencode('.png', image)[1].tobytes())
            matcher = ReferenceMatcher([{'id': 'a', 'file': 'a.png'}], root)
            self.assertEqual(matcher.identify(image)['id'], 'a')
            self.assertIsNone(matcher.identify(np.zeros_like(image))['id'])
            matcher = ReferenceMatcher([{'id': 'a', 'file': 'a.png'}, {'id': 'b', 'file': 'a.png'}], root)
            self.assertIsNone(matcher.identify(image)['id'])
            with self.assertRaises(ValueError): ReferenceMatcher([{'id': 'a', 'file': '../outside.png'}], root)

    def test_champion_alignment_recovers_small_crop_shift_and_rejects_ambiguity(self):
        with tempfile.TemporaryDirectory() as root:
            image = np.random.default_rng(17).integers(0, 255, (48, 48, 3), dtype=np.uint8)
            (Path(root) / 'a.png').write_bytes(cv2.imencode('.png', image)[1].tobytes())
            query = cv2.warpAffine(image, np.float32([[1, 0, 3], [0, 1, -2]]), (48, 48))
            entries = [{'id': 'a', 'file': 'a.png'}]
            self.assertIsNone(ReferenceMatcher(entries, root, .85, .15).identify(query)['id'])
            matcher = ReferenceMatcher(entries, root, .85, .15, align=True)
            self.assertEqual(matcher.identify(query)['id'], 'a')
            self.assertIsNone(matcher.identify(np.zeros_like(query))['id'])
            entries.append({'id': 'b', 'file': 'a.png'})
            self.assertIsNone(ReferenceMatcher(entries, root, .85, .15, align=True).identify(query)['id'])
            flat = np.full_like(image, (0, 100, 255))
            (Path(root) / 'flat.png').write_bytes(cv2.imencode('.png', flat)[1].tobytes())
            self.assertIsNone(ReferenceMatcher([{'id': 'flat', 'file': 'flat.png'}], root, align=True).identify(query)['id'])

    def test_champion_alignment_recovers_small_scale_change(self):
        with tempfile.TemporaryDirectory() as root:
            image = np.random.default_rng(23).integers(0, 255, (48, 48, 3), dtype=np.uint8)
            (Path(root) / 'a.png').write_bytes(cv2.imencode('.png', image)[1].tobytes())
            matcher = ReferenceMatcher([{'id': 'a', 'file': 'a.png'}], root, .85, .15, align=True)
            for size in (36, 44):
                query = np.zeros((48, 48, 3), np.uint8)
                offset = (48 - size) // 2
                query[offset:offset+size, offset:offset+size] = cv2.resize(image[4:44,4:44], (size,size))
                self.assertEqual(matcher.identify(query)['id'], 'a')
            unrelated = np.random.default_rng(24).integers(0, 255, (48,48,3), dtype=np.uint8)
            self.assertIsNone(matcher.identify(unrelated)['id'])

    def test_champion_alignment_tolerates_noise_and_small_translation(self):
        with tempfile.TemporaryDirectory() as root:
            rng = np.random.default_rng(52)
            image = rng.integers(20, 230, (96, 96, 3), dtype=np.uint8)
            (Path(root) / 'sample.png').write_bytes(cv2.imencode('.png', image)[1].tobytes())
            matcher = ReferenceMatcher([{'id': 'unit', 'file': 'sample.png'}], root, .85, .15, align=True)
            for offset in (-4, 0, 4):
                query = cv2.warpAffine(image, np.float32([[1, 0, offset], [0, 1, offset]]), (96,96))
                query = np.clip(query.astype(float) + rng.normal(0, 6, query.shape), 0, 255).astype(np.uint8)
                self.assertEqual(matcher.identify(query)['id'], 'unit')

    def test_feature_fallback_requires_geometric_support_and_rejects_ties(self):
        from champion_features import features, compare
        rng = np.random.default_rng(88)
        image = np.zeros((256,256,3), np.uint8)
        for _ in range(90):
            center = tuple(map(int, rng.integers(25,230,2)))
            color = tuple(map(int, rng.integers(40,255,3)))
            cv2.circle(image, center, int(rng.integers(3,10)), color, -1)
        query = cv2.warpAffine(image, cv2.getRotationMatrix2D((128,128), 7, 1.03), (256,256))
        self.assertGreaterEqual(compare(features(query), features(image)), 8)
        self.assertEqual(compare(features(np.zeros_like(image)), features(image)), 0)
        with tempfile.TemporaryDirectory() as root:
            (Path(root) / 'unit.png').write_bytes(cv2.imencode('.png', image)[1].tobytes())
            entries = [{'id': 'a', 'file': 'unit.png'}]
            matcher = ReferenceMatcher(entries, root, threshold=1.01, align=True)
            result = matcher.identify(query)
            self.assertEqual(result['id'], 'a')
            self.assertEqual(result['method'], 'body-feature-geometry')
            self.assertGreaterEqual(result['inliers'], 8)
            entries.append({'id': 'b', 'file': 'unit.png'})
            self.assertIsNone(ReferenceMatcher(entries, root, threshold=1.01, align=True).identify(query)['id'])

    def test_bench_template_does_not_create_unit_without_detection(self):
        with tempfile.TemporaryDirectory() as root:
            analyzer = TftStageAnalyzer(Path(root), Path(root) / 'missing.onnx')
            guessed = {'championId': 'a', 'confidence': 1., 'star': None, 'starConfidence': 0.,
                       'items': [None]*3, 'itemDetails': []}
            with patch.object(analyzer.detector, 'detect', side_effect=[[],[]]), \
                 patch.object(analyzer.details, 'analyze', side_effect=lambda *_: dict(guessed)):
                result = analyzer.analyze(np.zeros((720,1280,3), np.uint8))
            self.assertTrue(all(v['championId'] is None and v['occupancy']=='unknown' for v in result['bench']))

    def test_champion_threshold_does_not_lower_item_threshold(self):
        with tempfile.TemporaryDirectory() as root:
            catalog = TftCatalog(Path(root))
            self.assertEqual(catalog.matcher('champions').threshold, .85)
            self.assertEqual(catalog.matcher('champions').margin, .15)
            self.assertTrue(catalog.matcher('champions').align)
            self.assertFalse(catalog.matcher('items').align)
            self.assertEqual(catalog.matcher('items').threshold, .92)
            self.assertEqual(catalog.matcher('items').margin, .06)

    def test_board_deduplicates_cells_not_champions_and_bench_stays_unknown(self):
        with tempfile.TemporaryDirectory() as root:
            analyzer = TftStageAnalyzer(Path(root), Path(root) / 'missing.onnx')
            analyzer.detector.status = 'ready'
            cells = hex_grid()[:2]
            detections = []
            for cell, confidence in [(cells[0], .7), (cells[0], .9), (cells[1], .8)]:
                x, y = (cell['centerX'] - BOARD_ROI[0]) * 1920, (cell['centerY'] - BOARD_ROI[1]) * 1080
                detections.append({'box': [x-20, y-38, x+20, y+2], 'confidence': confidence})
            frame = np.zeros((1080, 1920, 3), np.uint8)
            with patch.object(analyzer.detector, 'detect', side_effect=[detections, []]):
                result = analyzer.analyze(frame, '3-2')
            self.assertEqual(len(result['board']), 2)
            self.assertEqual(result['board'][0]['detectionConfidence'], .9)
            self.assertTrue(all(v['championId'] is None and v['star'] is None for v in result['board']))
            self.assertTrue(all(v['items'] == [None, None, None] for v in result['board']))
            self.assertTrue(all(v['occupancy'] == 'unknown' for v in result['bench']))
            self.assertFalse(result['traitsComplete'])

    def test_traits_use_distinct_board_units_emblems_and_unknown_thresholds(self):
        with tempfile.TemporaryDirectory() as root:
            catalog = TftCatalog(Path(root))
            catalog.champions = {'a': {'traits': ['mage']}, 'b': {'traits': ['mage']}}
            catalog.traits = {'mage': {'effects': [{'minUnits': 2}, {'minUnits': 4}]}, 'extra': {}}
            catalog.items = {'emblem': {'traitId': 'extra'}}
            board = [{'championId': 'a', 'items': []}, {'championId': 'a', 'items': ['emblem']}, {'championId': 'b', 'items': []}]
            traits, complete = calculate_traits(board, catalog)
            by_id = {t['traitId']: t for t in traits}
            self.assertEqual(by_id['mage']['count'], 2)
            self.assertTrue(by_id['mage']['active'])
            self.assertEqual(by_id['mage']['tier'], 1)
            self.assertIsNone(by_id['extra']['active'])
            self.assertTrue(complete)
            traits, complete = calculate_traits(board + [{'championId': None, 'items': []}], catalog)
            self.assertFalse(complete)
            self.assertTrue(all(t['partial'] for t in traits))

    def test_missing_model_debug_and_storage_retain_old_numeric_data(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            frame = np.zeros((720, 1280, 3), np.uint8)
            analyzer = TftStageAnalyzer(root, root / 'absent.onnx')
            result = analyzer.analyze(frame, '3-2', root / 'debug')
            self.assertEqual(result['status']['board'], 'model_missing')
            self.assertEqual(result['board'], [])
            self.assertTrue((root / 'debug' / 'detections.png').is_file())
            self.assertTrue((root / 'debug' / 'bench_slot_8.png').is_file())
            repo = MatchRepository(root / 'recordings')
            match = repo.start()
            repo.save_round(match, '3-2', png_bytes(frame))
            repo.update_stats(match, '3-2', {'health': 0, 'gold': 0, 'level': 7})
            self.assertIsNone(repo.match(match)['rounds'][0]['board'])
            repo.update_analysis(match, '3-2', result)
            row = repo.match(match)['rounds'][0]
            self.assertEqual((row['health'], row['gold'], row['level']), (0, 0, 7))
            self.assertEqual(row['board'], [])
            self.assertEqual(row['analysis']['status']['board'], 'model_missing')
            self.assertFalse((root / 'recordings' / match / '3-2.analysis.png').exists())
            self.assertTrue(repo.image(row['id']).startswith('data:image/png;base64,'))

    def test_record_loop_analyses_once_after_delay_and_contains_analysis_failure(self):
        with tempfile.TemporaryDirectory() as root:
            service = CaptureService(root)
            frame = np.zeros((100, 200, 3), dtype=np.uint8)
            sequence = iter(['3-1'] * 6 + ['3-2'] * 6)
            class Numbers:
                def detect_stage(self, *_):
                    try: return next(sequence)
                    except StopIteration:
                        service.stop_event.set()
                        return None
                def analyze_stats(self, *_): return {'health': 74, 'gold': 0, 'level': 7}, {}
            class FailingBoard:
                calls = 0
                def analyze(self, *_):
                    self.calls += 1
                    raise RuntimeError('bad model')
            service.analyzer, service.stage_analyzer = Numbers(), FailingBoard()
            with patch('window_detector.capture_frame', return_value=frame), patch('capture_service.STABILIZE_SECONDS', 0), patch.object(service.stop_event, 'wait', side_effect=lambda _: __import__('time').sleep(.005)):
                started = service.start({'mode': 'region', 'monitor': 1, 'region': [0,0,1,1], 'stageRoi': [.4,0,.1,.05]})
                service.thread.join(5)
            self.assertFalse(service.thread.is_alive())
            self.assertEqual(service.stage_analyzer.calls, 2)
            rows = service.repo.match(started['matchId'])['rounds']
            self.assertEqual(len(rows), 2)
            for row in rows:
                self.assertEqual((row['health'], row['gold'], row['level']), (74, 0, 7))
                self.assertEqual(row['analysis']['status']['board'], 'analysis_failed')


if __name__ == '__main__':
    unittest.main()
