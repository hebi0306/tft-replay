"""Run local ONNX on real screenshots; report predictions, not unlabelled accuracy."""
import argparse
import hashlib
import json
import time
from pathlib import Path
import cv2
import numpy as np
from stage_analyzer import TftStageAnalyzer
from board_config import MODEL_PATH, UNIT_CONFIDENCE


def evaluate(images, output, model=MODEL_PATH):
    analyzer = TftStageAnalyzer(model_path=model)
    if analyzer.detector.status != 'ready':
        raise ValueError(analyzer.detector.status)
    output.mkdir(parents=True, exist_ok=True)
    rows = []
    for index, source in enumerate(images):
        frame = cv2.imdecode(np.fromfile(source, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError(f'Invalid screenshot: {source}')
        started = time.perf_counter()
        result = analyzer.analyze(frame, debug_dir=output / f'{index:02d}_{source.stem}')
        row = {'image': str(source.resolve()), 'millisecondsIncludingDebug': round((time.perf_counter()-started)*1000),
               'board': result['unitDetections']['board'], 'bench': result['unitDetections']['bench'],
               'mappedHexes': len(result['board']), 'rejectedPositions': result['rejectedPositions']}
        rows.append(row)
        print(json.dumps(row), flush=True)
    report = {'model': str(Path(model).resolve()), 'sha256': hashlib.sha256(Path(model).read_bytes()).hexdigest(),
              'threshold': UNIT_CONFIDENCE, 'accuracy': None,
              'note': 'Unlabelled real screenshots: scores are model confidence, not precision/recall.', 'images': rows}
    (output / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('images', nargs='+', type=Path)
    parser.add_argument('--output', type=Path, default=Path('capture-build/set18-unit-evaluation'))
    parser.add_argument('--model', type=Path, default=MODEL_PATH)
    args = parser.parse_args()
    evaluate(args.images, args.output, args.model)
