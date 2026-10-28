"""Find stable HUD icons in small strips, then return only the adjacent digit ROI."""
from functools import lru_cache
from pathlib import Path
import cv2
import numpy as np
from capture_config import HUD_TRACKING, BASE_WIDTH, BASE_HEIGHT


@lru_cache(maxsize=3)
def icon_template(kind):
    path = Path(__file__).parent / 'assets' / f'hud-{kind}.png'
    if not path.is_file():
        return None
    try:
        return cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    except (OSError, cv2.error):
        return None


def locate_hud(frame, kind):
    config = HUD_TRACKING[kind]
    template = icon_template(kind)
    if template is None:
        return None
    height, width = frame.shape[:2]
    x, y, w, h = config['search']
    strip = frame[round(y*height/BASE_HEIGHT):round((y+h)*height/BASE_HEIGHT),
                  round(x*width/BASE_WIDTH):round((x+w)*width/BASE_WIDTH)]
    if not strip.size:
        return None
    normalized = cv2.resize(strip, (w, h))
    gray = cv2.cvtColor(normalized, cv2.COLOR_BGR2GRAY)
    if kind == 'stage':
        gray = cv2.inRange(cv2.cvtColor(normalized, cv2.COLOR_BGR2HSV), (10,30,100), (40,255,255))
        template = cv2.threshold(template, 100, 255, cv2.THRESH_BINARY)[1]
    gray = cv2.GaussianBlur(gray, (3,3), 0)
    matches = []
    for scale in np.linspace(.75, 1.25, 11):
        tw, th = round(template.shape[1]*scale), round(template.shape[0]*scale)
        icon = cv2.GaussianBlur(cv2.resize(template, (tw, th)), (3,3), 0)
        scores = (1-cv2.matchTemplate(gray, icon, cv2.TM_SQDIFF_NORMED)) if kind == 'stage' else cv2.matchTemplate(gray, icon, cv2.TM_CCOEFF_NORMED)
        _, score, _, (left, top) = cv2.minMaxLoc(scores)
        if score < .85:
            continue
        matches.append((score, left, top, float(scale)))
        # Nearby scale variants are one icon; another spatial peak is ambiguous.
        scores[max(0,top-th//2):top+th//2+1, max(0,left-tw//2):left+tw//2+1] = -1
        _, second, _, (sx, sy) = cv2.minMaxLoc(scores)
        if second >= .85:
            matches.append((second, sx, sy, float(scale)))
    if not matches:
        return None
    score, left, top, scale = max(matches)
    if any(other[0] > score-.04 and abs(other[1]-left)+abs(other[2]-top) > 20 for other in matches):
        return None
    dx, dy, rw, rh = config['digits']
    roi = [(x+left+dx*scale)/BASE_WIDTH, (y+top+dy*scale)/BASE_HEIGHT,
           rw*scale/BASE_WIDTH, rh*scale/BASE_HEIGHT]
    if roi[0] < 0 or roi[1] < 0 or roi[0]+roi[2] > 1 or roi[1]+roi[3] > 1:
        return None
    return {'roi': roi, 'confidence': score, 'scale': scale}
