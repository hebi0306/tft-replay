import tempfile
import unittest
from unittest.mock import Mock, patch
from capture_service import CaptureService

class AutomaticCaptureTests(unittest.TestCase):
    def test_requires_three_round_readings_and_never_starts_twice(self):
        with tempfile.TemporaryDirectory() as root:
            service = CaptureService(root)
            service.analyzer = Mock()
            service.analyzer.detect_game_end.return_value = False
            service.analyzer.detect_stage.return_value = '1-1'
            windows = [{'id': '123', 'minimized': False}]
            options = {'mode': 'window', 'windowId': '', 'stageRoi': [.428,.002,.025,.028]}
            def start(selected, opening):
                self.assertTrue(selected['_automatic'])
                self.assertEqual(selected['windowId'], '123')
                self.assertEqual(opening[0], '1-1')
                service.update(recording=True)
                return service.status()
            with patch('window_detector.game_windows', return_value=windows),                  patch('window_detector.user32.GetForegroundWindow', return_value=123),                  patch('window_detector.capture_frame', return_value=object()),                  patch.object(service, 'start', side_effect=start) as begin:
                service.auto_tick(options)
                service.auto_tick(options)
                begin.assert_not_called()
                service.auto_tick(options)
                service.auto_tick(options)
                self.assertEqual(begin.call_count, 1)

    def test_opening_combat_saves_preparation_seen_before_record_thread(self):
        import numpy as np
        with tempfile.TemporaryDirectory() as root:
            service = CaptureService(root)
            service.analyzer = Mock()
            service.analyzer.detect_game_end.return_value = False
            service.analyzer.analyze_stats.return_value = ({'health':100, 'gold':0, 'level':1}, {})
            prep = np.full((100, 200, 3), 123, np.uint8)
            combat = np.zeros_like(prep)
            mid = service.repo.start()
            seed = ('1-1', combat, 2, ('combat', None), (prep, '2026-11-15T04:00:00+00:00', 1, 'planning', 1))
            with patch('window_detector.capture_frame', side_effect=ValueError('window_missing')), patch.object(service.stop_event, 'wait'), patch.object(service, 'analyze_board') as board:
                service.record({'_automatic':True, 'stageRoi':[.4, 0, .1, .05]}, mid, seed)
            rows = service.repo.match(mid)['rounds']
            self.assertEqual([r['stage'] for r in rows], ['1-1'])
            self.assertEqual(rows[0]['captured_at'], '2026-11-15T04:00:00+00:00')
            self.assertTrue(np.array_equal(board.call_args.args[0], prep))
            service.analyzer.detect_stage.assert_not_called()

    def test_manual_stop_prevents_immediate_automatic_restart(self):
        with tempfile.TemporaryDirectory() as root:
            service = CaptureService(root)
            service.analyzer = Mock()
            service.analyzer.detect_game_end.return_value = False
            service.analyzer.detect_stage.return_value = '2-1'
            service.auto_window = '123'
            service.stop()
            with patch('window_detector.game_windows', return_value=[{'id':'123','minimized':False}]),                  patch('window_detector.user32.GetForegroundWindow', return_value=123),                  patch('window_detector.capture_frame', return_value=object()),                  patch.object(service,'start') as begin:
                for _ in range(5):
                    service.auto_tick({'stageRoi':[.428,.002,.025,.028]})
                begin.assert_not_called()

    def test_background_game_is_not_captured(self):
        with tempfile.TemporaryDirectory() as root:
            service = CaptureService(root)
            with patch('window_detector.game_windows', return_value=[{'id':'123','minimized':False}]),                  patch('window_detector.user32.GetForegroundWindow', return_value=999),                  patch('window_detector.capture_frame') as capture:
                service.auto_tick({})
                capture.assert_not_called()

    def test_result_screen_requires_repeated_confirmation_and_finishes_match(self):
        import numpy as np
        with tempfile.TemporaryDirectory() as root:
            service = CaptureService(root)
            service.analyzer = Mock()
            service.analyzer.detect_stage.return_value = '3-2'
            service.analyzer.detect_game_end.side_effect = [False, False, False, True, True, True]
            service.analyzer.analyze_stats.return_value = ({'health': 30, 'gold': 20, 'level': 6}, {})
            frame = np.zeros((100, 200, 3), dtype=np.uint8)
            clock = [0]
            def grab(*_):
                clock[0] += 3
                if clock[0] > 30:
                    self.fail('Result screen did not stop recording')
                return frame
            match_id = service.repo.start()
            service.update(recording=True, matchId=match_id)
            with patch('window_detector.capture_frame', side_effect=grab), patch('capture_service.time.monotonic', side_effect=lambda: clock[0]), patch.object(service.stop_event, 'wait'), patch.object(service, 'analyze_board'), patch('capture_service.combat_phase', side_effect=[('planning', 1), ('combat', None), ('combat', None)]):
                service.record({'_automatic': True, 'stageRoi': [.4, 0, .1, .05]}, match_id)
            self.assertEqual(clock[0], 18)
            self.assertFalse(service.status()['recording'])
            self.assertTrue(service.auto_suppressed)
            match = service.repo.match(match_id)
            self.assertEqual(match['status'], 'completed')
            self.assertIsNotNone(match['ended_at'])
            self.assertEqual(match['rounds'], [])

    def test_background_switch_does_not_end_game_but_closed_window_does(self):
        with tempfile.TemporaryDirectory() as root:
            service = CaptureService(root)
            match_id = service.repo.start()
            service.update(recording=True)
            errors = [ValueError('window_background'), ValueError('window_minimized'), ValueError('window_missing')]
            with patch('window_detector.capture_frame', side_effect=errors) as grab, patch.object(service.stop_event, 'wait'):
                service.record({'_automatic': True}, match_id)
            self.assertEqual(grab.call_count, 3)
            self.assertFalse(service.status()['recording'])
            self.assertEqual(service.repo.match(match_id)['status'], 'completed')

    def test_result_screen_does_not_restart_and_next_game_can_start(self):
        with tempfile.TemporaryDirectory() as root:
            service = CaptureService(root)
            service.analyzer = Mock()
            service.analyzer.detect_game_end.return_value = True
            service.analyzer.detect_stage.return_value = '3-2'
            service.update(stage='3-2')
            options = {'stageRoi': [.428,.002,.025,.028]}
            with patch('window_detector.game_windows', return_value=[{'id':'123','minimized':False}]), patch('window_detector.user32.GetForegroundWindow', return_value=123), patch('window_detector.capture_frame', return_value=object()), patch.object(service, 'start') as begin:
                for _ in range(4):
                    service.auto_tick(options)
                begin.assert_not_called()
                service.auto_suppressed = True
                service.analyzer.detect_stage.return_value = '1-1'
                service.analyzer.detect_game_end.return_value = False
                for _ in range(3):
                    service.auto_tick(options)
                begin.assert_called_once()

    def test_end_screen_ocr_and_zero_health(self):
        import numpy as np
        from analysis import TftImageAnalyzer
        analyzer = TftImageAnalyzer.__new__(TftImageAnalyzer)
        analyzer.detect_health = Mock(return_value=30)
        analyzer.ocr = Mock()
        frame = np.zeros((200, 400, 3), dtype=np.uint8)
        for label in ('VICTORY', 'Exit Now', '지금 나가기'):
            analyzer.ocr.return_value = ([[[], label, .95]], None)
            self.assertTrue(analyzer.detect_game_end(frame, {'health': 'auto'}))
        analyzer.ocr.return_value = ([[[], 'Gold 30', .95]], None)
        self.assertFalse(analyzer.detect_game_end(frame, {'health': 'auto'}))
        analyzer.ocr.return_value = ([[[], 'VICTORY', .4]], None)
        self.assertFalse(analyzer.detect_game_end(frame, {'health': 'auto'}))
        analyzer.detect_health.return_value = 0
        self.assertTrue(analyzer.detect_game_end(frame, {'health': 'auto'}))

    def test_long_missing_hud_and_alt_tab_resume_the_same_recording(self):
        import numpy as np
        with tempfile.TemporaryDirectory() as root:
            service = CaptureService(root)
            service.analyzer = Mock()
            service.analyzer.detect_game_end.return_value = False
            service.analyzer.analyze_stats.return_value = ({'health':30, 'gold':20, 'level':6}, {})
            frame = np.zeros((100, 200, 3), dtype=np.uint8)
            timeline = iter([
                (1, '3-7'), (2, '3-7'), (3, '3-7'), (4, '3-7'),
                (30, None), (70, None), (121, None), (151, 'window_background'),
                (152, '4-1'), (153, '4-1'), (154, '4-1'), (155, '4-1'),
                (156, 'window_missing'),
            ])
            clock = [0]
            def grab(*_):
                clock[0], reading = next(timeline)
                if reading and reading.startswith('window_'):
                    raise ValueError(reading)
                service.analyzer.detect_stage.return_value = reading
                return frame
            match_id = service.repo.start()
            with patch('window_detector.capture_frame', side_effect=grab), patch('capture_service.time.monotonic', side_effect=lambda: clock[0]), patch.object(service.stop_event, 'wait'), patch.object(service, 'analyze_board'), patch('capture_service.combat_phase', side_effect=[('planning', 1), ('combat', None)] * 2):
                service.record({'_automatic': True, 'stageRoi': [.4, 0, .1, .05]}, match_id)
            self.assertEqual(clock[0], 156)
            self.assertFalse(service.auto_suppressed)
            match = service.repo.match(match_id)
            self.assertEqual([row['stage'] for row in match['rounds']], ['3-7', '4-1'])
            self.assertEqual(match['status'], 'completed')

    def test_single_false_end_reading_does_not_stop_recording(self):
        import numpy as np
        with tempfile.TemporaryDirectory() as root:
            service = CaptureService(root)
            service.analyzer = Mock()
            service.analyzer.detect_stage.return_value = '3-2'
            service.analyzer.detect_game_end.side_effect = [True, False, True, False]
            service.analyzer.analyze_stats.return_value = ({'health':30, 'gold':20, 'level':6}, {})
            clock = [0]
            frame = np.zeros((100, 200, 3), dtype=np.uint8)
            def grab(*_):
                clock[0] += 3
                if clock[0] == 15:
                    raise ValueError('window_missing')
                return frame
            match_id = service.repo.start()
            with patch('window_detector.capture_frame', side_effect=grab), patch('capture_service.time.monotonic', side_effect=lambda: clock[0]), patch.object(service.stop_event, 'wait'), patch.object(service, 'analyze_board'):
                service.record({'_automatic':True, 'stageRoi':[.4, 0, .1, .05]}, match_id)
            self.assertEqual(clock[0], 15)
            self.assertFalse(service.auto_suppressed)
