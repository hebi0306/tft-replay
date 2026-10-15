"""Locate the enlarged gold HP badge; OCR remains limited to its digits."""
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=2)
def badge_template(name='health-badge.png'):
    import cv2
    image = cv2.imread(str(Path(__file__).parent / 'assets' / name), 0)
    if image is None:
        raise ValueError('health_template_missing')
    return image


def health_roi(frame):
    import cv2
    import numpy as np
    from capture_config import HEALTH_TRACKING, BASE_WIDTH, BASE_HEIGHT
    height, width = frame.shape[:2]
    x, y, w, h = HEALTH_TRACKING['search_pixels']
    # Normalize only the scoreboard strip, not the entire frame.
    strip = frame[round(y * height / BASE_HEIGHT):round((y + h) * height / BASE_HEIGHT),
                  round(x * width / BASE_WIDTH):round((x + w) * width / BASE_WIDTH)]
    if strip.size == 0:
        return None
    strip = cv2.resize(strip, (w, h), interpolation=cv2.INTER_LINEAR)
    mask = cv2.inRange(cv2.cvtColor(strip, cv2.COLOR_BGR2HSV),
                       HEALTH_TRACKING['gold_min'], HEALTH_TRACKING['gold_max'])
    matches = []
    for name, digits_width in HEALTH_TRACKING['templates']:
        template = badge_template(name)
        # Ignore scenery outside the badge; keep the outline and dark inner triangle.
        inside = np.zeros(template.shape, dtype=np.uint8)
        cv2.fillConvexPoly(inside, np.array([[2, 24], [26, 1], [26, 47]]), 255)
        errors = cv2.matchTemplate(mask, template, cv2.TM_SQDIFF, mask=inside)
        scores = 1 - errors / (255 * 255 * cv2.countNonZero(inside))
        _, score, _, (left, top) = cv2.minMaxLoc(scores)
        if score < HEALTH_TRACKING['confidence']:
            continue
        scores[max(0, top - 20):top + 21, max(0, left - 12):left + 13] = -1
        if cv2.minMaxLoc(scores)[1] >= HEALTH_TRACKING['confidence']:
            return None
        matches.append((score, left, top, digits_width))
    if not matches:
        return None
    _, left, top, rw = max(matches)
    if any(abs(other[2] - top) > 20 for other in matches):
        return None
    dx, dy, _, rh = HEALTH_TRACKING['digits_pixels']
    return [(x + left + dx) / BASE_WIDTH, (y + top + dy) / BASE_HEIGHT,
            rw / BASE_WIDTH, rh / BASE_HEIGHT]
