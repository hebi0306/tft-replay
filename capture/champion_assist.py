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

    def _views(self, frame, box, scale):
        x1, y1, x2, y2 = box
        center_x = (x1 + x2) / 2
        foot_y = y2 - .05 * (y2 - y1)
        width, height = round(180 * scale), round(205 * scale)
        left = round(center_x - 90 * scale)
        tops = [round(foot_y + (delta - 165) * scale) for delta in (0, 10, -10)]
        if left < 0 or left + width > 1920 or min(tops) < 0 or max(tops) + height > 1080:
            return []
        views = []
        for top in tops:
            patch = frame[top:top+height, left:left+width]
            if scale != 1:
                patch = cv2.resize(patch, (180, 205))
            rgb = cv2.cvtColor(patch, cv2.COLOR_BGR2RGB).astype(np.float32).transpose(2, 0, 1) / 255
            value = np.concatenate([rgb, self.anchor[None]], 0)
            value = cv2.resize(value.transpose(1, 2, 0), (224, 224)).transpose(2, 0, 1)
            value[:3] = (value[:3] - self.mean) / self.std
            views.append(value)
        return views

    def _predict(self, frame, candidates, scale, threshold):
        targets, batch = [], []
        for unit, box in candidates:
            views = self._views(frame, box, scale)
            if views:
                targets.append(unit)
                batch.extend(views)
        predictions = []
        for start in range(0, len(batch), 12):
            tensor = np.stack(batch[start:start+12])
            logits = self.session.run(None, {self.input_name: tensor})[0]
            if logits.shape != (len(tensor), len(self.ids)) or not np.isfinite(logits).all():
                raise ValueError('invalid_champion_output')
            probabilities = np.exp(logits - logits.max(-1, keepdims=True))
            probabilities /= probabilities.sum(-1, keepdims=True)
            predictions.extend((self.ids[int(p.argmax())], float(p.max())) for p in probabilities)
        accepted = []
        for i, unit in enumerate(targets):
            views = predictions[i*3:i*3+3]
            champion_id = views[0][0]
            if champion_id and all(key == champion_id and score >= threshold for key, score in views):
                scores = [score for _, score in views]
                accepted.append((unit, champion_id, scores))
        return len(targets), accepted

    def apply(self, frame, units):
        summary = {'status': self.status, 'candidates': 0, 'accepted': 0}
        if self.session is None:
            return summary
        if (frame.ndim != 3 or frame.shape[2] != 3 or self.current_set != 18
                or frame.shape[0] < 720 or frame.shape[1] * 9 != frame.shape[0] * 16):
            return {**summary, 'status': 'unsupported_frame'}
        height, width = frame.shape[:2]
        scale = 1920 / width
        if scale != 1:
            frame = cv2.resize(frame, (1920, 1080), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR)
        candidates = []
        try:
            for unit in units:
                box = unit.get('bbox')
                if unit.get('championId') or box is None or (unit.get('detectionConfidence') or 0) < UNIT_CONFIDENCE:
                    continue
                x1, y1, x2, y2 = box
                if not np.isfinite(box).all() or not (0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height):
                    continue
                candidates.append((unit, [value * scale for value in box]))
            summary['candidates'], accepted = self._predict(frame, candidates, 1, .9 if scale == 1 else .95)
            # A tighter crop can exclude a neighboring unit without relaxing the confidence gate.
            retry = []
            if scale == 1 and summary['candidates']:
                assigned = {id(unit) for unit, _, _ in accepted}
                try:
                    _, retry = self._predict(frame, [(unit, box) for unit, box in candidates if id(unit) not in assigned], .85, .9)
                except Exception:
                    pass
            for results, method in ((accepted, 'copilot-context-consensus'), (retry, 'copilot-tight-context-consensus')):
                for unit, champion_id, scores in results:
                    confidence = min(scores)
                    unit.update(championId=champion_id, confidence=confidence, identityMethod=method,
                                identityModelConfidence=confidence, identityModelScores=scores)
                    summary['accepted'] += 1
        except Exception:
            summary['status'] = 'inference_failed'
        return summary
