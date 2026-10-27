"""Conservative template similarity for labelled crops/icons, not a calibrated probability."""
from pathlib import Path
import cv2
import numpy as np
from board_config import MATCH_CONFIDENCE, MATCH_MARGIN


def signature(image):
    if image is None or image.size == 0:
        return None
    data = cv2.resize(image, (48, 48), interpolation=cv2.INTER_AREA).astype(np.float32).reshape(-1)
    data -= data.mean()
    norm = float(np.linalg.norm(data))
    return data / norm if norm > 1 else None


class ReferenceMatcher:
    def __init__(self, entries=(), root=None):
        self.samples = []
        if root is None:
            return
        root = Path(root).resolve()
        for entry in entries:
            file = (root / entry['file']).resolve()
            if not file.is_relative_to(root):
                raise ValueError('reference_path_outside_data')
            image = cv2.imdecode(np.fromfile(file, dtype=np.uint8), cv2.IMREAD_COLOR) if file.is_file() else None
            value = signature(image)
            if value is not None:
                self.samples.append((entry['id'], value))

    def identify(self, image):
        query = signature(image)
        if query is None or not self.samples:
            return {'id': None, 'confidence': 0.0}
        scores = {}
        for key, reference in self.samples:
            scores[key] = max(scores.get(key, 0), float(np.clip(reference @ query, 0, 1)))
        ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        key, confidence = ranked[0]
        runner_up = ranked[1][1] if len(ranked) > 1 else 0
        accepted = confidence >= MATCH_CONFIDENCE and confidence - runner_up >= MATCH_MARGIN
        return {'id': key if accepted else None, 'confidence': confidence}
