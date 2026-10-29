"""Phase 3 calibration. Coordinates are relative to the captured game image."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / 'models' / 'unit.onnx'
DATA_DIR = ROOT / 'data'
STABILIZE_SECONDS = 1.5
MAX_WAIT_SECONDS = 6.0
# Include bodies above the front-row cell centers; y=.31 cut off real units.
BOARD_ROI = [0.20, 0.22, 0.62, 0.43]
# Calibrated slot edges x=360..1440 at 1920px; a wider crop merges adjacent slot assignments.
BENCH_ROI = [0.1875, 0.65, 0.5625, 0.12]
# shortcut: initial own-side geometry; calibrate these centers for the arena/camera before trusting positions.
HEX_ROWS = [(0.300, 0.365, 0.072), (0.273, 0.445, 0.077),
            (0.275, 0.525, 0.081), (0.245, 0.605, 0.086)]
HEX_MAX_DISTANCE = 0.045
MODEL_SIZE = 640
UNIT_CONFIDENCE = 0.65
NMS_IOU = 0.45
MATCH_CONFIDENCE = 0.92
MATCH_MARGIN = 0.06
# Relative to a unit bounding box. Unknown until calibrated on labelled game crops.
STAR_ROI = None
ITEM_ROIS = [None, None, None]
