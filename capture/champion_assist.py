"""Optional Set 18 context classifier; never replaces an existing champion identity."""
import json
from pathlib import Path
import cv2
import numpy as np
from board_config import UNIT_CONFIDENCE


def canonical_id(name):
    if name.startswith('DA_18_Lux_') or name.startswith('DA_Lux18_'):
        return 'DA_Lux18_Base'
    return {'DA_18_EliseSpider': 'DA_18_Elise', 'DA_18_GnarBig': 'DA_18_GnarSmall',
            'DA_NidaleeCougar18_AD': 'DA_Nidalee18_AP'}.get(name, name)


class ChampionAssist:
    def __init__(self, catalog, path):
        self.session, self.status = None, 'model_missing'
        self.current_set = catalog.data.get('currentSet')
        path = Path(path)
        if not path.is_file():
            return
        try:
            import onnxruntime as ort
            meta = json.loads(path.with_suffix('.json').read_text(encoding='utf-8'))['identity']
            classes = meta['classes']
            if (meta['size'] != [224, 224] or meta['in_ch'] != 4 or not classes
                    or any(not isinstance(name, str) for name in classes) or len(set(classes)) != len(classes)):
                raise ValueError('unsupported_champion_metadata')
            self.mean = np.asarray(meta['mean'], np.float32).reshape(3, 1, 1)
            self.std = np.asarray(meta['std'], np.float32).reshape(3, 1, 1)
            if not np.isfinite(self.mean).all() or not np.isfinite(self.std).all() or np.any(self.std <= 0):
                raise ValueError('invalid_champion_normalization')
            ids = {key.rsplit('/', 1)[-1]: key for key in catalog.champions}
            self.ids = [ids.get(canonical_id(name)) for name in classes]
            options = ort.SessionOptions()
            options.intra_op_num_threads = 2
            options.inter_op_num_threads = 1
            session = ort.InferenceSession(str(path), sess_options=options, providers=['CPUExecutionProvider'])
            inputs = session.get_inputs()
            if len(inputs) != 1 or inputs[0].shape[1:] != [4, 224, 224] or inputs[0].type != 'tensor(float)':
                raise ValueError('unsupported_champion_input')
            self.input_name = inputs[0].name
            yy, xx = np.mgrid[:205, :180]
            self.anchor = np.exp(-((xx - 90)**2 + (yy - 165)**2) / 200).astype(np.float32)
            self.session, self.status = session, 'ready'
        except Exception:
            self.session, self.status = None, 'model_invalid'

    def apply(self, frame, units):
        summary = {'status': self.status, 'candidates': 0, 'accepted': 0}
        if self.session is None:
            return summary
        # shortcut: other resolutions/sets are unvalidated; keep the original identity path there.
        if frame.shape != (1080, 1920, 3) or self.current_set != 18:
            return {**summary, 'status': 'unsupported_frame'}
        candidates, batch = [], []
        try:
            for unit in units:
                box = unit.get('bbox')
                if unit.get('championId') or box is None or unit.get('detectionConfidence', 0) < UNIT_CONFIDENCE:
                    continue
                x1, y1, x2, y2 = box
                if not np.isfinite(box).all() or not (0 <= x1 < x2 <= 1920 and 0 <= y1 < y2 <= 1080):
                    continue
                left = round((x1 + x2) / 2 - 90)
                top = round(y2 - .05 * (y2 - y1) - 165)
                if left < 0 or left + 180 > 1920 or top - 10 < 0 or top + 215 > 1080:
                    continue
                for delta in (0, 10, -10):
                    patch = frame[top+delta:top+delta+205, left:left+180]
                    rgb = cv2.cvtColor(patch, cv2.COLOR_BGR2RGB).astype(np.float32).transpose(2, 0, 1) / 255
                    value = np.concatenate([rgb, self.anchor[None]], 0)
                    value = cv2.resize(value.transpose(1, 2, 0), (224, 224)).transpose(2, 0, 1)
                    value[:3] = (value[:3] - self.mean) / self.std
                    batch.append(value)
                candidates.append(unit)
            summary['candidates'] = len(candidates)
            predictions = []
            for start in range(0, len(batch), 12):
                tensor = np.stack(batch[start:start+12])
                logits = self.session.run(None, {self.input_name: tensor})[0]
                if logits.shape != (len(tensor), len(self.ids)) or not np.isfinite(logits).all():
                    raise ValueError('invalid_champion_output')
                probabilities = np.exp(logits - logits.max(-1, keepdims=True))
                probabilities /= probabilities.sum(-1, keepdims=True)
                predictions.extend((self.ids[int(p.argmax())], float(p.max())) for p in probabilities)
            # Do not mutate any result until every inference batch has passed validation.
            for i, unit in enumerate(candidates):
                views = predictions[i*3:i*3+3]
                champion_id = views[0][0]
                if champion_id and all(key == champion_id and score >= .9 for key, score in views):
                    confidence = min(score for _, score in views)
                    unit.update(championId=champion_id, confidence=confidence,
                                identityMethod='copilot-context-consensus', identityModelConfidence=confidence,
                                identityModelScores=[score for _, score in views])
                    summary['accepted'] += 1
        except Exception:
            summary['status'] = 'inference_failed'
        return summary
