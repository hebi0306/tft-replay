import tempfile
import unittest
from unittest.mock import Mock, patch
import numpy as np
from capture_service import CaptureService
from stat_detector import stable_gold


class GoldRetryTests(unittest.TestCase):
    def capture(self, stages, initial, retries, timeout=45):
        with tempfile.TemporaryDirectory() as root:
            service=CaptureService(root)
            service.analyzer=Mock()
            values=iter(stages);clock=[0]
            def stage(*_):
                clock[0]+=1
                try:return next(values)
                except StopIteration:
                    service.stop_event.set()
                    return None
            service.analyzer.detect_stage.side_effect=stage
            service.analyzer.analyze_stats.side_effect=[({'health':74,'gold':gold,'level':7},{})for gold in initial]
            service.analyzer.detect_gold.side_effect=retries
            match=service.repo.start()
            service.update(recording=True,matchId=match)
            with patch('window_detector.capture_frame',return_value=np.zeros((100,200,3),np.uint8)),patch('capture_service.time.monotonic',side_effect=lambda:clock[0]),patch('capture_service.GOLD_RETRY_SECONDS',timeout),patch.object(service.stop_event,'wait'),patch.object(service,'analyze_board'):
                service.record({'stageRoi':[.4,0,.1,.05]},match)
            return service.repo.match(match)['rounds'],service.analyzer

    def test_income_animation_retries_gold_without_repeating_health_and_level(self):
        rounds,analyzer=self.capture(['3-1']*10,[1,3,7],[12,15,15])
        self.assertEqual((rounds[0]['health'],rounds[0]['gold'],rounds[0]['level']),(74,15,7))
        self.assertEqual(analyzer.analyze_stats.call_count,3)
        self.assertEqual(analyzer.detect_gold.call_count,3)

    def test_selection_overlay_can_clear_later_and_zero_is_valid(self):
        rounds,analyzer=self.capture(['3-1']*12,[None,None,None],[None,None,0,0])
        self.assertEqual(rounds[0]['gold'],0)
        self.assertEqual(analyzer.detect_gold.call_count,4)

    def test_retry_timeout_keeps_gold_unknown(self):
        rounds,analyzer=self.capture(['3-1']*15,[None,None,None],[None]*20,timeout=5)
        self.assertIsNone(rounds[0]['gold'])
        self.assertEqual((rounds[0]['health'],rounds[0]['level']),(74,7))
        self.assertEqual(analyzer.analyze_stats.call_count,3)
        self.assertLess(analyzer.detect_gold.call_count,10)

    def test_next_round_gold_does_not_leak_into_previous_round(self):
        rounds,_=self.capture(['3-1']*5+['3-2']*6,[1,2,3,20,20,20],[])
        self.assertEqual([r['stage']for r in rounds],['3-1','3-2'])
        self.assertIsNone(rounds[0]['gold'])
        self.assertEqual(rounds[1]['gold'],20)

    def test_only_recent_consecutive_values_establish_stability(self):
        self.assertIsNone(stable_gold([0,0,3]))
        self.assertIsNone(stable_gold([5,None,5]))
        self.assertIsNone(stable_gold([1,2,3]))
        self.assertEqual(stable_gold([1,2,0,0]),0)
        self.assertEqual(stable_gold([None,12,12]),12)
