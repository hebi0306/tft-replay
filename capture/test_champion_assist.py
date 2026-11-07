import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
import numpy as np
from champion_assist import ChampionAssist, canonical_id
from tft_catalog import TftCatalog
from stage_analyzer import TftStageAnalyzer


class ChampionAssistTests(unittest.TestCase):
    def assistant(self):
        model = ChampionAssist.__new__(ChampionAssist)
        model.status, model.current_set = 'ready', 18
        model.input_name, model.ids = 'input', ['a', 'b', None]
        model.mean = np.array([.485, .456, .406], np.float32)[:, None, None]
        model.std = np.array([.229, .224, .225], np.float32)[:, None, None]
        yy, xx = np.mgrid[:205, :180]
        model.anchor = np.exp(-((xx-90)**2+(yy-165)**2)/200).astype(np.float32)
        def run(_, values):
            value = values['input']
            self.assertEqual(value.shape[1:], (4,224,224))
            self.assertEqual(value.dtype, np.float32)
            logits = np.full((len(value),3), -10, np.float32)
            logits[:,0] = 10
            return [logits]
        model.session = Mock()
        model.session.run.side_effect = run
        return model

    def unit(self):
        return {'championId':None,'confidence':.45,'bbox':[600,350,650,450],
                'detectionConfidence':.9,'star':2,'items':['existing-item',None,None]}

    def test_unknown_only_and_bgr_preprocessing_preserve_other_fields(self):
        assist=self.assistant();unknown=self.unit();known={**self.unit(),'championId':'existing','confidence':.93}
        known_before=dict(known);before=dict(unknown)
        frame=np.full((1080,1920,3),(10,80,220),np.uint8)
        result=assist.apply(frame,[known,unknown])
        self.assertEqual(result,{'status':'ready','candidates':1,'accepted':1})
        self.assertEqual(known,known_before)
        self.assertEqual(unknown['championId'],'a')
        self.assertEqual(unknown['identityMethod'],'copilot-context-consensus')
        self.assertEqual(len(unknown['identityModelScores']),3)
        for key in ('bbox','detectionConfidence','star','items'):
            self.assertEqual(unknown[key],before[key])
        value=assist.session.run.call_args.args[1]['input']
        np.testing.assert_allclose(value[0,:3,0,0],(np.array([220,80,10])/255-assist.mean[:,0,0])/assist.std[:,0,0],rtol=1e-5)
        self.assertGreater(float(value[0,3].max()),.9)

    def test_conflicting_low_score_or_empty_predictions_remain_unknown(self):
        frame=np.zeros((1080,1920,3),np.uint8)
        for logits in (np.array([[10,-10,-10],[-10,10,-10],[10,-10,-10]],np.float32),
                       np.zeros((3,3),np.float32),
                       np.array([[-10,-10,10]]*3,np.float32)):
            assist=self.assistant();assist.session.run.side_effect=None;assist.session.run.return_value=[logits]
            unit=self.unit();before=dict(unit)
            self.assertEqual(assist.apply(frame,[unit])['accepted'],0)
            self.assertEqual(unit,before)

    def test_missing_corrupt_model_and_unsupported_frame_fail_closed(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'champion-identity.onnx';catalog=TftCatalog(Path(root))
            self.assertEqual(ChampionAssist(catalog,path).status,'model_missing')
            path.write_bytes(b'not a model')
            path.with_suffix('.json').write_text('{}')
            self.assertEqual(ChampionAssist(catalog,path).status,'model_invalid')
        assist=self.assistant();unit=self.unit()
        self.assertEqual(assist.apply(np.zeros((720,1280,3),np.uint8),[unit])['status'],'unsupported_frame')
        assist.current_set=17
        self.assertEqual(assist.apply(np.zeros((1080,1920,3),np.uint8),[unit])['status'],'unsupported_frame')
        assist.session.run.assert_not_called()
        self.assertIsNone(unit['championId'])

    def test_invalid_boxes_and_weak_detections_do_not_trigger_inference(self):
        assist=self.assistant();units=[]
        for box in ([-1,0,10,20],[0,0,50,50],[600,float('nan'),650,450],None):
            units.append({**self.unit(),'bbox':box})
        units.append({**self.unit(),'detectionConfidence':.1})
        self.assertEqual(assist.apply(np.zeros((1080,1920,3),np.uint8),units)['candidates'],0)
        assist.session.run.assert_not_called()

    def test_invalid_output_or_later_batch_failure_keeps_every_unit_unchanged(self):
        for failure in (RuntimeError('model failed'),[np.zeros((3,2),np.float32)],
                        [np.full((3,3),np.nan,np.float32)]):
            assist=self.assistant();unit=self.unit();before=dict(unit)
            if isinstance(failure,Exception):assist.session.run.side_effect=failure
            else:
                assist.session.run.side_effect=None;assist.session.run.return_value=failure
            self.assertEqual(assist.apply(np.zeros((1080,1920,3),np.uint8),[unit])['status'],'inference_failed')
            self.assertEqual(unit,before)
        assist=self.assistant();units=[self.unit()for _ in range(5)]
        valid=np.full((12,3),-10,np.float32);valid[:,0]=10
        assist.session.run.side_effect=[[valid],RuntimeError('second batch failed')]
        result=assist.apply(np.zeros((1080,1920,3),np.uint8),units)
        self.assertEqual(result['status'],'inference_failed')
        self.assertTrue(all(u['championId']is None for u in units))

    def test_stage_calls_assistant_for_board_and_occupied_bench_only(self):
        with tempfile.TemporaryDirectory() as root:
            analyzer=TftStageAnalyzer(Path(root),Path(root)/'missing.onnx')
            analyzer.detector.status='ready'
            board={'box':[150.,130.,200.,220.],'confidence':.9}
            bench={'box':[10.,10.,30.,80.],'confidence':.9}
            def apply(frame,units):
                self.assertEqual(len(units),2)
                self.assertTrue(all(u['bbox']for u in units))
                for u in units:u.update(championId='model-id',identityMethod='copilot-context-consensus')
                return {'status':'ready','candidates':2,'accepted':2}
            with patch.object(analyzer.detector,'detect',side_effect=[[board],[bench]]),patch.object(analyzer.champion_assist,'apply',side_effect=apply):
                result=analyzer.analyze(np.zeros((1080,1920,3),np.uint8),'3-2')
            self.assertEqual(result['board'][0]['championId'],'model-id')
            self.assertEqual(result['bench'][0]['championId'],'model-id')
            self.assertTrue(all(u['championId']is None for u in result['bench'][1:]))
            self.assertEqual(result['status']['championAssist']['accepted'],2)
            self.assertEqual(result['method'],'unit-onnx+template-similarity+copilot-identity')

    def test_model_forms_map_to_existing_canonical_ids(self):
        for name in ('DA_18_Lux_Coven','DA_Lux18_Blackthorn'):
            self.assertEqual(canonical_id(name),'DA_Lux18_Base')
        self.assertEqual(canonical_id('DA_18_GnarBig'),'DA_18_GnarSmall')
        self.assertEqual(canonical_id('DA_18_EliseSpider'),'DA_18_Elise')
        self.assertEqual(canonical_id('DA_NidaleeCougar18_AD'),'DA_Nidalee18_AP')
        self.assertEqual(canonical_id('DA_18_Rakan'),'DA_18_Rakan')
