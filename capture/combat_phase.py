"""Read the preparation/combat transition from the visible TFT HUD."""
import re
import cv2
import numpy as np
from hud_detector import locate_hud


def combat_phase(frame, ocr):
    if getattr(frame, 'ndim', 0) != 3 or frame.shape[2] != 3:
        return None, None
    height, width = frame.shape[:2]
    if width < 960 or height < 540:
        return None, None

    def hud(x, y, w, h):
        patch = frame[round(y*height/1080):round((y+h)*height/1080),
                      round(x*width/1920):round((x+w)*width/1920)]
        return cv2.resize(patch, (w, h))

    # shortcut: visual phase cues are calibrated on the existing 16:9 TFT HUD.
    top = hud(700, 0, 610, 62)
    hsv = cv2.cvtColor(top, cv2.COLOR_BGR2HSV)
    cyan = cv2.inRange(hsv[34:53], (84, 75, 150), (101, 255, 255))
    # The combat timer is a horizontal cyan bar directly below the stage HUD.
    if np.max(np.count_nonzero(cyan, axis=1)) >= 120:
        return 'combat', None

    # A visible shop HUD is required. Carousel and modal selection can obscure it.
    if not locate_hud(frame, 'gold'):
        return None, None
    button = cv2.cvtColor(hud(1490, 949, 140, 26), cv2.COLOR_BGR2HSV)
    active = cv2.inRange(button, (98, 60, 64), (122, 255, 255))
    if np.count_nonzero(active) / active.size > .45:
        return 'manual', None

    # Search the right of the clock, before the expand arrow, on the standard HUD.
    timer = top[5:30, 487:519]
    clock = top[9:26, 470:487]
    if ocr is None or np.max(clock) < 145:
        return None, None
    gray = cv2.cvtColor(timer, cv2.COLOR_BGR2GRAY)
    for text, confidence in (ocr(cv2.resize(gray, None, fx=3, fy=3), use_det=False, use_cls=False)[0] or []):
        if confidence >= .85 and re.fullmatch(r'[0-9]{1,2}', text.strip()):
            seconds = int(text)
            if 0 <= seconds <= 90:
                return 'planning', seconds
    return None, None
