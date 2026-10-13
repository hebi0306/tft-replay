import sqlite3
import tempfile
import unittest
from pathlib import Path
from stat_detector import parse_stat, majority_stats
from repository import MatchRepository


class StatTests(unittest.TestCase):
    def test_debug_writes_original_processed_and_raw_values(self):
        import json
        import numpy as np
        from capture_service import CaptureService
        with tempfile.TemporaryDirectory() as root:
            service = CaptureService(root)
            match = service.repo.start()
            frame = np.zeros((20, 30, 3), dtype=np.uint8)
            service.save_debug(match, '3-2', 1, frame, {'health': {'roi': frame, 'processed': frame, 'raw': [{'text': '74', 'confidence': 0.9}], 'parsed': 74}}, {'health': 74})
            directory = Path(root) / match / 'debug'
            self.assertTrue((directory / '3-2_1_original.png').exists())
            self.assertTrue((directory / 'health_3-2_1_processed.png').exists())
            data = json.loads((directory / '3-2_1.json').read_text(encoding='utf-8'))
            self.assertEqual(data['details']['health']['raw'][0]['text'], '74')

    def test_recording_votes_only_same_stage_and_preserves_screenshot_on_failure(self):
        from unittest.mock import patch
        import numpy as np
        from capture_service import CaptureService
        with tempfile.TemporaryDirectory() as root:
            service = CaptureService(root)
            frame = np.zeros((100, 200, 3), dtype=np.uint8)
            stages = iter(['3-1'] * 5 + ['3-2'] * 3)
            class Analyzer:
                def __init__(self): self.index = 0
                def detect_stage(self, *_):
                    try: return next(stages)
                    except StopIteration:
                        service.stop_event.set()
                        return None
                def analyze_stats(self, *_):
                    self.index += 1
                    if self.index == 4: raise RuntimeError('temporary OCR failure')
                    return {'health': 74 if self.index < 3 else 71, 'gold': 0, 'level': 7}, {}
            service.analyzer = Analyzer()
            with patch('window_detector.capture_frame', return_value=frame), patch.object(service.stop_event, 'wait', return_value=False):
                result = service.start({'mode': 'region', 'monitor': 1, 'region': [0, 0, 1, 1], 'stageRoi': [0.4, 0, 0.1, 0.05]})
                service.thread.join(timeout=5)
            rounds = service.repo.match(result['matchId'])['rounds']
            self.assertEqual(len(rounds), 2)
            self.assertEqual((rounds[0]['health'], rounds[0]['gold'], rounds[0]['level']), (74, 0, 7))
            self.assertEqual((rounds[1]['health'], rounds[1]['gold'], rounds[1]['level']), (None, None, None))
            self.assertTrue(service.repo.image(rounds[1]['id']).startswith('data:image/png;base64,'))
            self.assertFalse((Path(root) / result['matchId'] / 'debug').exists())

    def test_parser_ranges_and_ambiguous_numbers(self):
        for kind, text, expected in [('health', '87%', 87), ('gold', '32G', 32), ('level', 'Lv.7', 7), ('level', 'LEVEL 7', 7), ('level', '1레벨', 1), ('gold', '0', 0), ('health', '0', 0), ('health', '100', 100), ('level', '10', 10)]:
            self.assertEqual(parse_stat(text, kind), expected)
        for kind, text in [('health', '147'), ('health', '-3'), ('gold', '1000'), ('level', '0'), ('level', '11'), ('gold', '3/20'), ('level', 'Lv7 10'), ('health', '8O'), ('gold', '3.2')]:
            self.assertIsNone(parse_stat(text, kind))
        self.assertEqual(majority_stats([{'health': 74, 'gold': 0, 'level': 7}, {'health': 74, 'gold': 0, 'level': None}, {'health': 71, 'gold': 32, 'level': 8}]), {'health': 74, 'gold': 0, 'level': None})
        self.assertEqual(majority_stats([{'gold': 32}])['gold'], None)

    def test_legacy_migration_preserves_images_and_nulls(self):
        with tempfile.TemporaryDirectory() as root:
            db = sqlite3.connect(Path(root) / 'matches.sqlite3')
            db.executescript("CREATE TABLE matches(id TEXT PRIMARY KEY, started_at TEXT, ended_at TEXT, status TEXT); CREATE TABLE rounds(id INTEGER PRIMARY KEY, match_id TEXT, stage TEXT, image_path TEXT, captured_at TEXT); INSERT INTO matches VALUES('old','a','b','completed'); INSERT INTO rounds VALUES(1,'old','3-2','old.png','a');")
            db.close()
            (Path(root) / 'old.png').write_bytes(b'original')
            repo = MatchRepository(root)
            self.assertIsNone(repo.match('old')['rounds'][0]['health'])
            repo.update_stats('old', '3-2', {'health': 74, 'gold': 0, 'level': None})
            row = MatchRepository(root).match('old')['rounds'][0]
            self.assertEqual((row['health'], row['gold'], row['level']), (74, 0, None))
            self.assertEqual((Path(root) / 'old.png').read_bytes(), b'original')
            with self.assertRaises(ValueError): repo.update_stats('old', '3-2', {'health': -1})

    def test_independent_real_ocr_and_debug_preprocessing(self):
        import cv2
        import numpy as np
        from analysis import TftImageAnalyzer
        analyzer = TftImageAnalyzer()
        for kind, value in [('health', 74), ('gold', 32), ('level', 7)]:
            frame = np.full((80, 160, 3), 25, dtype=np.uint8)
            cv2.putText(frame, str(value), (25, 55), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (240, 240, 240), 2, cv2.LINE_AA)
            detail = {}
            self.assertEqual(getattr(analyzer, 'detect_' + kind)(frame, [0, 0, 1, 1], detail), value)
            self.assertIn('processed', detail)
            self.assertTrue(detail['raw'])


if __name__ == '__main__':
    unittest.main()
