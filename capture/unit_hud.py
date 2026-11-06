"""Screen-space rank badges and equipped items. Unknown ownership stays unknown."""
import json
from pathlib import Path
import cv2
import numpy as np
from reference_matcher import ReferenceMatcher


class UnitHud:
    def __init__(self, catalog):
        self.badges = []
        root = catalog.root / 'unit-hud'
        manifest = root / 'references.json'
        if manifest.is_file():
            for row in json.loads(manifest.read_text(encoding='utf-8')):
                file = (root / row['file']).resolve()
                if not file.is_relative_to(root.resolve()):
                    raise ValueError('hud_reference_outside_data')
                image = cv2.imdecode(np.fromfile(file, np.uint8), 1) if file.is_file() else None
                if image is not None:
                    mask = np.zeros(image.shape[:2], np.uint8)
                    polygons = {1: [(1,9),(6,4),(13,4),(13,14),(6,14)],
                                2: [(2,13),(13,2),(20,9),(20,22),(13,22)],
                                3: [(2,13),(12,4),(24,4),(24,22),(12,22)]}
                    cv2.fillPoly(mask, [np.array(polygons[row['star']], np.int32)], 255)
                    self.badges.append((row, image, mask))
        # Different sets reuse identical art; restrict IDs to the captured set.
        prefix = f"TFTSet{catalog.data.get('currentSet')}/"
        entries = [v for v in catalog.references.get('items', [])
                   if v['id'].startswith(prefix) and v['id'] in catalog.items]
        self.items = ReferenceMatcher(entries, catalog.root, threshold=.85, margin=.12)

        item_manifest = root / 'items.json'
        if item_manifest.is_file():
            references = [v for v in json.loads(item_manifest.read_text(encoding='utf-8')) if v['id'] in catalog.items]
            self.items.samples.extend(ReferenceMatcher(references, root).samples)
        self.item_ids, vectors = [], []
        for key, reference in self.items.samples:
            value = reference.reshape(48,48,3)[:36].ravel().copy()
            value -= value.mean()
            norm = np.linalg.norm(value)
            if norm > 0:
                self.item_ids.append(key)
                vectors.append(value / norm)
        self.item_vectors = np.stack(vectors) if vectors else None

    def identify_item(self, patch):
        result = self.items.identify(patch)
        if result['id'] or not self.items.samples:
            return result
        # Counters cover the lower quarter of equipped icons.
        query = cv2.resize(patch, (48, 48)).astype(np.float32)[:36].ravel()
        query -= query.mean()
        norm = np.linalg.norm(query)
        if norm < 1:
            return result
        query /= norm
        scores = {}
        if self.item_vectors is None:
            return result
        for key, score in zip(self.item_ids, np.einsum('ij,j->i', self.item_vectors, query)):
            scores[key] = max(scores.get(key, -1), float(score))
        ranked = sorted(scores.items(), key=lambda pair: -pair[1])
        if ranked and ranked[0][1] >= .85 and (len(ranked)<2 or ranked[0][1]-ranked[1][1] >= .18):
            return {'id': ranked[0][0], 'confidence': ranked[0][1]}
        return result

    def detect(self, frame):
        scale = frame.shape[1] / 1920
        image = cv2.resize(frame, (1920, round(frame.shape[0] / scale)))
        # shortcut: standard TFT HUD scale; other HUD scales need additional badge references.
        top, bottom = int(image.shape[0] * .20), int(image.shape[0] * .78)
        region = image[top:bottom]
        candidates = []
        for row, badge, mask in self.badges:
            if region.shape[0] < badge.shape[0]:
                continue
            scores = cv2.matchTemplate(region, badge, cv2.TM_CCOEFF_NORMED, mask=mask)
            scores[~np.isfinite(scores)] = -1
            for _ in range(40):
                _, score, _, (x, y) = cv2.minMaxLoc(scores)
                if score < .90:
                    break
                h, w = badge.shape[:2]
                scores[max(0,y-12):y+13, max(0,x-24):x+25] = -1
                y += top
                candidates.append({'star': row['star'], 'score': score,
                                   'x': x, 'y': y, 'width': w,
                                   'itemX': x+row['itemOffset'][0],
                                   'itemY': y+row['itemOffset'][1]})
        headers = []
        for candidate in sorted(candidates, key=lambda v: -v['score']):
            if not any(abs(v['x']-candidate['x']) < 25 and abs(v['y']-candidate['y']) < 15 for v in headers):
                headers.append(candidate)
        return image, headers, scale

    def apply(self, frame, units, save=lambda *_: None):
        if not self.badges:
            return
        image, headers, scale = self.detect(frame)
        choices = {}
        for i, unit in enumerate(units):
            if not unit.get('bbox'):
                continue
            x1,y1,x2,y2 = np.array(unit['bbox']) / scale
            candidates = []
            for j,h in enumerate(headers):
                # Health bar center is about 35 px to the right of its badge.
                dx = abs(h['x']+h['width']+30-(x1+x2)/2)
                dy = y1-h['y']
                if dx <= 42 and -20 <= dy <= 90 and h['y'] < y2-25:
                    candidates.append((dx+abs(dy-15)*.35, j))
            candidates.sort()
            if candidates and (len(candidates)==1 or candidates[1][0]-candidates[0][0] >= 15):
                choices[i] = candidates[0]
        observations = []
        owners = {j:i for i, (_,j) in choices.items() if sum(v[1] == j for v in choices.values()) == 1}
        for j, h in enumerate(headers):
            i = owners.get(j)
            unit = {}
            unit['star'], unit['starConfidence'] = h['star'], h['score']
            unit['hudMethod'] = 'rank-badge-template-experimental'
            unit['hudBbox'] = [h['x']*scale,h['y']*scale,(h['x']+h['width']+70)*scale,(h['itemY']+26)*scale]
            details = []
            for slot in range(3):
                best = {'id': None, 'confidence': 0.0}
                best_crop = None
                for dy in (-1,0,1):
                    for dx in (-1,0,1):
                        x,y = h['itemX']+slot*26+dx,h['itemY']+dy
                        if x<0 or y<0 or x+24>image.shape[1] or y+24>image.shape[0]:
                            continue
                        patch = image[y:y+24,x:x+24]
                        result = self.identify_item(patch)
                        if result['id'] and result['confidence'] > best['confidence']:
                            best, best_crop = result, patch
                if best_crop is not None:
                    save(f'unit_{i}_item_{slot}', best_crop)
                details.append({'itemId': best['id'], 'confidence': best['confidence']})
            unit['itemDetails'] = details
            unit['items'] = [v['itemId'] for v in details]
            # Keep visible HUD evidence even when the body or hex could not be assigned.
            bar = image[h['y']+5:h['y']+12, h['x']+h['width']:h['x']+h['width']+65]
            friendly = bool(bar.size and np.count_nonzero((bar[:,:,1]>120) & (bar[:,:,1]>bar[:,:,2]*1.3) & (bar[:,:,1]>bar[:,:,0]*1.3)) >= 35)
            observation = {**unit, 'unitIndex': i, 'ownership': 'friendly' if friendly else 'unknown',
                           'positionVerified': False}
            observations.append(observation)
            if i is not None:
                units[i].update(unit)
        return observations
