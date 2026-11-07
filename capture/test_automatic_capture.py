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
            def start(selected):
                self.assertTrue(selected['_automatic'])
                self.assertEqual(selected['windowId'], '123')
                service.update(recording=True)
                return service.status()
            with patch('window_detector.game_windows', return_value=windows),                  patch('window_detector.user32.GetForegroundWindow', return_value=123),                  patch('window_detector.capture_frame', return_value=object()),                  patch.object(service, 'start', side_effect=start) as begin:
                service.auto_tick(options)
                service.auto_tick(options)
                begin.assert_not_called()
                service.auto_tick(options)
                service.auto_tick(options)
                self.assertEqual(begin.call_count, 1)

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
            with patch('window_detector.capture_frame', side_effect=grab), patch('capture_service.time.monotonic', side_effect=lambda: clock[0]), patch.object(service.stop_event, 'wait'), patch.object(service, 'analyze_board'):
                service.record({'_automatic': True, 'stageRoi': [.4, 0, .1, .05]}, match_id)
            self.assertEqual(clock[0], 18)
            self.assertFalse(service.status()['recording'])
            self.assertTrue(service.auto_suppressed)
            match = service.repo.match(match_id)
            self.assertEqual(match['status'], 'completed')
            self.assertIsNotNone(match['ended_at'])
            self.assertEqual([r['stage'] for r in match['rounds']], ['3-2'])

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

    def test_lost_hud_timeout_survives_background_capture_errors(self):
        import numpy as np
        with tempfile.TemporaryDirectory() as root:
            service = CaptureService(root)
            service.analyzer = Mock()
            service.analyzer.detect_stage.return_value = None
            service.analyzer.detect_game_end.return_value = False
            clock = [0]
            frame = np.zeros((100, 200, 3), dtype=np.uint8)
            def grab(*_):
                clock[0] += 30
                if clock[0] > 150:
                    self.fail('Lost HUD did not time out')
                if clock[0] > 30:
                    raise ValueError('window_background')
                return frame
            match_id = service.repo.start()
            with patch('window_detector.capture_frame', side_effect=grab), patch('capture_service.time.monotonic', side_effect=lambda: clock[0]), patch.object(service.stop_event, 'wait'):
                service.record({'_automatic': True, 'stageRoi': [.4, 0, .1, .05]}, match_id)
            self.assertEqual(clock[0], 120)
            self.assertTrue(service.auto_suppressed)
            self.assertIsNotNone(service.repo.match(match_id)['ended_at'])

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
