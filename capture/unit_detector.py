"""One-class YOLOv8/11 ONNX detection, CPU only, no model downloads."""
from pathlib import Path
import cv2
import numpy as np
from board_config import MODEL_PATH, MODEL_SIZE, UNIT_CONFIDENCE, NMS_IOU


def decode_detections(output, scale, padding, size, threshold=UNIT_CONFIDENCE):
    values = np.asarray(output)
    # Explicitly require raw xywh + one unit score, not COCO or end-to-end outputs.
    if values.ndim != 3 or values.shape[0] != 1 or values.shape[1] != 5:
        raise ValueError('unsupported_unit_model_output')
    if not np.isfinite(values).all():
        raise ValueError('invalid_unit_model_output')
    width, height = size
    boxes, scores = [], []
    for cx, cy, w, h, score in values[0].T:
        if not threshold <= score <= 1 or w <= 0 or h <= 0:
            continue
        x1, y1 = max(0., (cx - w / 2 - padding[0]) / scale), max(0., (cy - h / 2 - padding[1]) / scale)
        x2, y2 = min(width, (cx + w / 2 - padding[0]) / scale), min(height, (cy + h / 2 - padding[1]) / scale)
        if x2 > x1 and y2 > y1:
            boxes.append([float(x1), float(y1), float(x2 - x1), float(y2 - y1)])
            scores.append(float(score))
    keep = cv2.dnn.NMSBoxes(boxes, scores, threshold, NMS_IOU)
    return [{'box': [boxes[i][0], boxes[i][1], boxes[i][0] + boxes[i][2], boxes[i][1] + boxes[i][3]],
             'confidence': scores[i]} for i in np.asarray(keep).reshape(-1)[:28]]


class UnitDetector:
    def __init__(self, path=MODEL_PATH):
        self.path, self.session, self.status = Path(path), None, 'model_missing'
        if not self.path.is_file():
            return
        try:
            import onnxruntime as ort
            options = ort.SessionOptions()
            options.intra_op_num_threads = options.inter_op_num_threads = 1
            self.session = ort.InferenceSession(str(self.path), sess_options=options, providers=['CPUExecutionProvider'])
            inputs = self.session.get_inputs()
            if len(inputs) != 1 or inputs[0].shape != [1, 3, MODEL_SIZE, MODEL_SIZE] or inputs[0].type != 'tensor(float)':
                raise ValueError('unsupported_unit_model_input')
            self.input_name = inputs[0].name
            self.status = 'ready'
        except Exception:
            self.session, self.status = None, 'model_invalid'

    def detect(self, region):
        if self.session is None:
            return []
        height, width = region.shape[:2]
        scale = MODEL_SIZE / max(width, height)
        rw, rh = round(width * scale), round(height * scale)
        left, top = (MODEL_SIZE - rw) // 2, (MODEL_SIZE - rh) // 2
        image = np.full((MODEL_SIZE, MODEL_SIZE, 3), 114, np.uint8)
        image[top:top + rh, left:left + rw] = cv2.resize(region, (rw, rh))
        tensor = image[:, :, ::-1].transpose(2, 0, 1)[None].astype(np.float32) / 255
        output = self.session.run(None, {self.input_name: tensor})
        return decode_detections(output[0], scale, (left, top), (width, height))
