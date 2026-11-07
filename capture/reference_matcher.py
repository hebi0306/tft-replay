"""Conservative template similarity for labelled crops/icons, not a calibrated probability."""
from pathlib import Path
import cv2
import numpy as np
from board_config import MATCH_CONFIDENCE, MATCH_MARGIN
from champion_features import features, compare


def signature(image):
    if image is None or image.size == 0:
        return None
    data = cv2.resize(image, (48, 48), interpolation=cv2.INTER_AREA).astype(np.float32).reshape(-1)
    data -= data.mean()
    norm = float(np.linalg.norm(data))
    return data / norm if norm > 1 else None


def body_colors(image):
    # The central body carries more identity information than the health bar or floor.
    patch = cv2.resize(image, (40, 40), interpolation=cv2.INTER_AREA)[6:36, 6:34]
    lab = cv2.cvtColor(patch, cv2.COLOR_BGR2LAB)
    parts = []
    for region in (lab, lab[:15], lab[15:]):
        hist = cv2.calcHist([region], [0, 1, 2], None, [6, 8, 8],
                            [0, 256, 0, 256, 0, 256]).ravel()
        parts.append(np.sqrt(hist / hist.sum()))
    return np.concatenate(parts) / np.sqrt(np.float32(len(parts)))


def body_shape(image):
    resized = cv2.resize(image, (48, 64), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    descriptor = cv2.HOGDescriptor((48, 64), (16, 16), (8, 8), (8, 8), 9)
    value = descriptor.compute(gray).ravel()
    return value / max(float(np.linalg.norm(value)), 1e-9)


class ReferenceMatcher:
    def __init__(self, entries=(), root=None, threshold=MATCH_CONFIDENCE, margin=MATCH_MARGIN, align=False):
        self.threshold, self.margin = threshold, margin
        self.align = align
        self.samples = []
        self.feature_samples = []
        self.palette_ids = []
        self.palettes = None
        self.shapes = None
        shapes = []
        palettes = []
        if root is None:
            return
        root = Path(root).resolve()
        for entry in entries:
            file = (root / entry['file']).resolve()
            if not file.is_relative_to(root):
                raise ValueError('reference_path_outside_data')
            image = cv2.imdecode(np.fromfile(file, dtype=np.uint8), cv2.IMREAD_COLOR) if file.is_file() else None
            value = signature(image)
            if align and value is not None:
                value = cv2.GaussianBlur(cv2.resize(image, (48, 48)).astype(np.float32), (3, 3), 0)[4:44, 4:44]
                if np.linalg.norm(value - value.mean(axis=(0, 1), keepdims=True)) <= 1:
                    value = None
            if value is not None:
                if align:
                    value = tuple(cv2.resize(value, (size, size)) for size in (36, 40, 44))
                self.samples.append((entry['id'], value))
                if align:
                    self.feature_samples.append((entry['id'], features(image)))
                    self.palette_ids.append(entry['id'])
                    palettes.append(body_colors(image))
                    shapes.append(body_shape(image))
        if palettes:
            self.palettes = np.stack(palettes)
            self.shapes = np.stack(shapes)

    def identify(self, image):
        query = signature(image)
        if query is None or not self.samples:
            return {'id': None, 'confidence': 0.0}
        scores = {}
        if self.align:
            query = cv2.GaussianBlur(cv2.resize(image, (48, 48)).astype(np.float32), (3, 3), 0)
        for key, reference in self.samples:
            # shortcut: tolerate small crop shifts/scales; poses/occlusion need more verified references.
            score = max(cv2.matchTemplate(query, template, cv2.TM_CCOEFF_NORMED).max() for template in reference) if self.align else reference @ query
            scores[key] = max(scores.get(key, 0), float(np.clip(score, 0, 1)))
        ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        key, confidence = ranked[0]
        runner_up = ranked[1][1] if len(ranked) > 1 else 0
        accepted = confidence >= self.threshold and confidence - runner_up >= self.margin
        if accepted or not self.align:
            return {'id': key if accepted else None, 'confidence': confidence}
        query_features = features(image)
        support = {}
        for candidate, reference in self.feature_samples:
            support[candidate] = max(support.get(candidate, 0), compare(query_features, reference))
        ranked_support = sorted(support.items(), key=lambda item: item[1], reverse=True)
        if ranked_support:
            candidate, count = ranked_support[0]
            second = ranked_support[1][1] if len(ranked_support) > 1 else 0
            if count >= 8 and count - second >= 3:
                # Keep pixel similarity separate from geometric support; neither is a probability.
                return {'id': candidate, 'confidence': scores.get(candidate, 0.0),
                        'method': 'body-feature-geometry', 'inliers': count}
        if self.palettes is not None:
            similarities = np.einsum('ij,j->i', self.palettes, body_colors(image))
            best = int(np.argmax(similarities))
            candidate = self.palette_ids[best]
            palette_score = float(similarities[best])
            runner_up = max((value for other, value in zip(self.palette_ids, similarities)
                             if other != candidate), default=0.0)
            if (palette_score >= .85 and palette_score - runner_up >= .12
                    and scores[candidate] >= .50):
                return {'id': candidate, 'confidence': scores[candidate],
                        'method': 'body-color-distribution', 'paletteScore': palette_score}
        if self.shapes is not None and len(set(self.palette_ids)) > 1:
            shape_scores = np.einsum('ij,j->i', self.shapes, body_shape(image))
            color_scores = np.einsum('ij,j->i', self.palettes, body_colors(image))
            combined = {}
            for candidate, shape_score, color_score in zip(self.palette_ids, shape_scores, color_scores):
                if shape_score >= .75:
                    score = float(.75 * shape_score + .25 * color_score)
                    combined[candidate] = max(combined.get(candidate, 0), score)
            ranking = sorted(combined.items(), key=lambda item: -item[1])
            if ranking:
                candidate, score = ranking[0]
                runner_up = ranking[1][1] if len(ranking) > 1 else 0
                if score >= .82 and score - runner_up >= .05:
                    return {'id': candidate, 'confidence': scores.get(candidate, 0.0),
                            'method': 'body-shape-color', 'shapeScore': score}
        return {'id': None, 'confidence': confidence}
