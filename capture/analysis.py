"""Local ROI OCR. Stage logic is independent of optional numeric analysis."""
import re


def normalized_roi(value):
    if not isinstance(value, list) or len(value) != 4 or any(type(n) not in (int, float) for n in value):
        raise ValueError('invalid_region')
    x, y, w, h = value
    if not (0 <= x < 1 and 0 <= y < 1 and 0 < w <= 1 - x and 0 < h <= 1 - y):
        raise ValueError('invalid_region')
    return value


def crop(frame, roi):
    x, y, w, h = normalized_roi(roi)
    height, width = frame.shape[:2]
    return frame[int(y * height):max(int((y + h) * height), int(y * height) + 1),
                 int(x * width):max(int((x + w) * width), int(x * width) + 1)]


def parse_stage(text):
    text = re.sub(r'\s+', '', text).replace('–', '-').replace('—', '-')
    # Reject letters and ambiguous unseparated numbers instead of guessing.
    return text if re.fullmatch(r'[1-9]-[1-7]', text) else None


class StageTracker:
    def __init__(self):
        self.previous = None
        self.candidate = None
        self.count = 0

    def observe(self, stage):
        if not stage or (self.previous and stage <= self.previous):
            self.candidate, self.count = None, 0
            return None
        # Reject implausible stage jumps; normal 2-3 -> 2-5 is allowed.
        if self.previous and int(stage[0]) > int(self.previous[0]) + 1:
            self.candidate, self.count = None, 0
            return None
        self.count = self.count + 1 if stage == self.candidate else 1
        self.candidate = stage
        return stage if self.count >= 3 else None

    def commit(self, stage):
        self.previous = stage
        self.candidate, self.count = None, 0


class TftImageAnalyzer:
    def __init__(self):
        from rapidocr_onnxruntime import RapidOCR
        self.ocr = RapidOCR(intra_op_num_threads=1, inter_op_num_threads=1)

    def detect_stage(self, frame, roi):
        import cv2
        from capture_config import STAGE_ROIS
        # Round-bar length shifts the label between these two calibrated positions.
        candidates = [roi] + [r for r in STAGE_ROIS if r != roi] if roi in STAGE_ROIS else [roi]
        for candidate in candidates:
            region = crop(frame, candidate)
            gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
            enlarged = cv2.resize(gray, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
            results, _ = self.ocr(enlarged, use_det=False, use_cls=False)
            for text, confidence in results or []:
                stage = parse_stage(text)
                if stage and confidence >= 0.75:
                    return stage
        return None

    def detect_stat(self, frame, kind, roi, debug=None):
        from capture_config import STAT_CONFIG
        from stat_detector import parse_stat, preprocess_stat
        if roi is None:
            if debug is not None: debug.update(raw=[], parsed=None, error='roi_not_configured')
            return None
        region = crop(frame, roi)
        processed = preprocess_stat(region, kind)
        if debug is not None: debug.update(roi=region, processed=processed, raw=[], parsed=None)
        results, _ = self.ocr(processed, use_det=False, use_cls=False)
        if debug is not None: debug['raw'] = [{'text': text, 'confidence': float(score)} for text, score in results or []]
        value = None
        if results and len(results) == 1:
            text, score = results[0]
            if score >= STAT_CONFIG[kind]['confidence']:
                value = parse_stat(text, kind)
        if debug is not None: debug['parsed'] = value
        return value

    def detect_level(self, frame, roi, debug=None):
        return self.detect_stat(frame, 'level', roi, debug)

    def detect_gold(self, frame, roi, debug=None):
        return self.detect_stat(frame, 'gold', roi, debug)

    def detect_health(self, frame, roi, debug=None):
        if roi == 'auto':
            from health_detector import health_roi
            roi = health_roi(frame)
            if debug is not None: debug['trackedRoi'] = roi
            if roi is None:
                if debug is not None: debug.update(raw=[], parsed=None, error='health_badge_not_found')
                return None
        return self.detect_stat(frame, 'health', roi, debug)

    def analyze_stats(self, frame, rois, debug=False):
        from capture_config import STAT_CONFIG
        values, details = {}, {}
        for kind in STAT_CONFIG:
            detail = {}
            try:
                values[kind] = getattr(self, 'detect_' + kind)(frame, rois[kind], detail if debug else None)
            except Exception as error:
                values[kind] = None
                detail.update(parsed=None, error=type(error).__name__)
            if debug: details[kind] = detail
        return values, details

    def detect_board_units(self, frame):
        return None

    def detect_items(self, frame):
        return None
