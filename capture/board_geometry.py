import math
from analysis import crop
from board_config import BOARD_ROI, BENCH_ROI, HEX_ROWS, HEX_MAX_DISTANCE


def extract_board_region(frame):
    return crop(frame, BOARD_ROI)


def extract_bench_region(frame):
    return crop(frame, BENCH_ROI)


def hex_grid():
    return [{'row': row, 'col': col, 'centerX': x + col * step, 'centerY': y}
            for row, (x, y, step) in enumerate(HEX_ROWS) for col in range(7)]


def nearest_hex(x, y, max_distance=HEX_MAX_DISTANCE):
    if not math.isfinite(x) or not math.isfinite(y):
        return None
    cell = min(hex_grid(), key=lambda c: (c['centerX'] - x)**2 + (c['centerY'] - y)**2)
    if math.hypot(cell['centerX'] - x, cell['centerY'] - y) > max_distance:
        return None
    return {'row': cell['row'], 'col': cell['col']}


def bench_slots():
    x, y, w, h = BENCH_ROI
    return [[x + slot * w / 9, y, w / 9, h] for slot in range(9)]


def box_crop(frame, box):
    height, width = frame.shape[:2]
    x1, y1, x2, y2 = box
    if not all(math.isfinite(v) for v in box) or not (0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height):
        raise ValueError('invalid_unit_box')
    return frame[int(y1):math.ceil(y2), int(x1):math.ceil(x2)]
