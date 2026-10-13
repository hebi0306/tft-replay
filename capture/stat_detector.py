import re
from collections import Counter
from capture_config import STAT_CONFIG


def parse_stat(text, kind):
    text = text.strip()
    patterns = {
        'health': r'(\d{1,3})\s*%?',
        'gold': r'(\d{1,3})\s*[Gg]?',
        'level': r'(?:(?:Lv\.?|LEVEL)\s*)?(\d{1,2})(?:\s*레벨)?',
    }
    match = re.fullmatch(patterns[kind], text, re.IGNORECASE)
    if not match:
        return None
    value = int(match[1])
    low, high = STAT_CONFIG[kind]['range']
    return value if low <= value <= high else None


def majority_stats(samples):
    values = {}
    for kind in STAT_CONFIG:
        counts = Counter(sample.get(kind) for sample in samples if sample.get(kind) is not None)
        winner = counts.most_common(1)
        values[kind] = winner[0][0] if winner and winner[0][1] >= 2 else None
    return values


def preprocess_stat(region, kind):
    import cv2
    gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
    enlarged = cv2.resize(gray, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    mode = STAT_CONFIG[kind]['preprocess']
    if mode == 'contrast':
        return cv2.createCLAHE(clipLimit=2.0, tileGridSize=(4, 4)).apply(enlarged)
    if mode == 'threshold':
        return cv2.threshold(enlarged, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    return enlarged
