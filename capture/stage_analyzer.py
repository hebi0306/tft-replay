"""One stabilized-frame analysis per stage. Never fabricates missing model predictions."""
import json
from pathlib import Path
import cv2
from analysis import crop
from board_config import BOARD_ROI, BENCH_ROI, DATA_DIR, MODEL_PATH, STAR_ROI, ITEM_ROIS
from board_geometry import extract_board_region, extract_bench_region, hex_grid, nearest_hex, bench_slots, box_crop
from unit_detector import UnitDetector
from unit_details import UnitDetails
from tft_catalog import TftCatalog
from trait_calculator import calculate_traits


class TftStageAnalyzer:
    def __init__(self, data_dir=DATA_DIR, model_path=MODEL_PATH):
        self.catalog = TftCatalog(Path(data_dir))
        self.detector = UnitDetector(model_path)
        self.details = UnitDetails(self.catalog)

    def analyze(self, frame, stage=None, debug_dir=None):
        directory = Path(debug_dir) if debug_dir is not None else None
        debug_errors = []
        if directory:
            try:
                directory.mkdir(parents=True, exist_ok=True)
            except OSError:
                directory = None
        def save(name, image):
            if directory:
                try:
                    ok, png = cv2.imencode('.png', image)
                    if not ok: raise ValueError('png_failed')
                    (directory / (name + '.png')).write_bytes(png.tobytes())
                except Exception as error:
                    debug_errors.append(type(error).__name__)
        board_region = extract_board_region(frame)
        save('full', frame)
        save('board', board_region)
        bench_region = extract_bench_region(frame)
        save('bench', bench_region)
        status = {'board': self.detector.status,
                  'bench': self.detector.status,
                  'champions': 'ready' if self.details.champions.samples else 'references_missing',
                  'items': 'ready' if all(ITEM_ROIS) and self.details.items.samples else 'calibration_or_references_missing',
                  'stars': 'ready' if STAR_ROI and self.details.stars.samples else 'calibration_or_references_missing'}
        try:
            detections = self.detector.detect(board_region)
        except Exception as error:
            detections = []
            status['board'] = 'detection_failed'
            status['error'] = type(error).__name__
        try:
            bench_detections = self.detector.detect(bench_region)
        except Exception:
            bench_detections = []
            status['bench'] = 'detection_failed'
        detected_slots = {}
        for detection in bench_detections:
            center = (detection['box'][0] + detection['box'][2]) / 2
            slot = min(8, max(0, int(center / bench_region.shape[1] * 9)))
            if slot not in detected_slots or detection['confidence'] > detected_slots[slot]['confidence']:
                detected_slots[slot] = detection
        height, width = frame.shape[:2]
        ox, oy = int(BOARD_ROI[0] * width), int(BOARD_ROI[1] * height)
        cells, rejected = {}, 0
        for detection in detections:
            x1, y1, x2, y2 = detection['box']
            box = [x1 + ox, y1 + oy, x2 + ox, y2 + oy]
            # Tall bench units can protrude into the board ROI; keep clipped boxes raw, not as a board placement.
            if y2 >= board_region.shape[0] - 1:
                rejected += 1
                continue
            cell = nearest_hex((box[0] + box[2]) / (2 * width), (box[1] + box[3]) / (2 * height))
            if cell is None:
                rejected += 1
                continue
            key = (cell['row'], cell['col'])
            if key not in cells or detection['confidence'] > cells[key]['confidence']:
                cells[key] = {**detection, 'box': box, **cell}
        board, bench = [], []
        overlay = frame.copy() if directory else None
        if overlay is not None:
            for detection in detections:
                x1, y1, x2, y2 = detection['box']
                p1, p2 = (int(x1 + ox), int(y1 + oy)), (int(x2 + ox), int(y2 + oy))
                cv2.rectangle(overlay, p1, p2, (100, 100, 255), 1)
                cv2.putText(overlay, f"unit {detection['confidence']:.2f}", (p1[0], max(15, p1[1]-5)),
                            cv2.FONT_HERSHEY_SIMPLEX, .4, (100, 100, 255), 1)
        for index, (_, unit) in enumerate(sorted(cells.items())):
            region = box_crop(frame, unit['box'])
            prefix = f'board_unit_{index:02d}'
            save(prefix, region)
            detail = self.details.analyze(region, lambda name, image: save(prefix + '_' + name, image))
            entry = {**detail, 'row': unit['row'], 'col': unit['col'], 'bbox': unit['box'],
                     'detectionConfidence': unit['confidence']}
            board.append(entry)
            if overlay is not None:
                x1, y1, x2, y2 = map(int, unit['box'])
                cv2.rectangle(overlay, (x1, y1), (x2, y2), (0, 220, 255), 2)
                label = f"unit {unit['confidence']:.2f} ({unit['row']},{unit['col']})"
                cv2.putText(overlay, label, (x1, max(15, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, .4, (0, 220, 255), 1)
        for slot, roi in enumerate(bench_slots()):
            region = crop(frame, roi)
            prefix = f'bench_slot_{slot}'
            save(prefix, region)
            detail = self.details.analyze(region, lambda name, image: save(prefix + '_' + name, image))
            empty = self.details.empty.identify(region)
            detected = detected_slots.get(slot)
            if detected is not None or (detail['championId'] is not None and empty['id'] is None):
                occupancy = 'unit'
            elif empty['id'] == 'empty' and detail['championId'] is None:
                occupancy = 'empty'
            else:
                occupancy = 'unknown'
                detail['championId'] = None
            bbox = None
            if detected:
                bx, by = int(BENCH_ROI[0] * width), int(BENCH_ROI[1] * height)
                x1, y1, x2, y2 = detected['box']
                bbox = [x1 + bx, y1 + by, x2 + bx, y2 + by]
                if overlay is not None:
                    cv2.rectangle(overlay, tuple(map(int, bbox[:2])), tuple(map(int, bbox[2:])), (255, 180, 0), 2)
                    cv2.putText(overlay, f"unit {detected['confidence']:.2f} bench {slot}",
                                (int(bbox[0]), max(15, int(bbox[1])-5)), cv2.FONT_HERSHEY_SIMPLEX, .4, (255, 180, 0), 1)
            bench.append({'slot': slot, 'occupancy': occupancy, **detail, 'bbox': bbox,
                          'detectionConfidence': detected['confidence'] if detected else None})
        traits, complete = calculate_traits(board, self.catalog, status['board'] == 'ready' and rejected == 0)
        if status['board'] != 'ready':
            complete = False
        result = {'schemaVersion': 1, 'stage': stage, 'board': board, 'bench': bench, 'traits': traits,
                  'status': status, 'traitsComplete': complete,
                  'catalogVersion': self.catalog.data.get('version'), 'set': self.catalog.data.get('currentSet'),
                  'method': 'unit-onnx+template-similarity', 'rejectedPositions': rejected,
                  'unitDetections': {'board': detections, 'bench': bench_detections, 'coordinates': 'roi_pixels',
                                     'boardRoi': BOARD_ROI, 'benchRoi': BENCH_ROI},
                  'userCorrections': None}
        if directory:
            for cell in hex_grid():
                center = (int(cell['centerX'] * width), int(cell['centerY'] * height))
                cv2.circle(overlay, center, 5, (100, 240, 100), 1)
            save('detections', overlay)
            try:
                (directory / 'result.json').write_text(json.dumps({**result, 'detections': detections, 'debugErrors': debug_errors}, ensure_ascii=False, indent=2), encoding='utf-8')
            except OSError:
                pass
        return result


if __name__ == '__main__':
    import argparse
    import numpy as np
    parser = argparse.ArgumentParser()
    parser.add_argument('image')
    parser.add_argument('--stage')
    parser.add_argument('--debug-dir')
    args = parser.parse_args()
    frame = cv2.imdecode(np.fromfile(args.image, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        parser.error('Cannot decode image')
    print(json.dumps(TftStageAnalyzer().analyze(frame, args.stage, args.debug_dir), ensure_ascii=False, indent=2))
