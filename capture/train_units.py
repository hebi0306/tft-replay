"""Optional training environment only. Nothing is trained or downloaded on app startup."""
import argparse
import os
from pathlib import Path

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--weights', required=True, help='Local YOLOv8/11 detection .pt checkpoint')
    parser.add_argument('--data', default=str(Path(__file__).parent / 'dataset' / 'data.yaml'))
    parser.add_argument('--epochs', type=int, default=50)
    parser.add_argument('--device', default='cpu')
    parser.add_argument('--batch', type=int, default=16)
    parser.add_argument('--name', default='unit')
    args = parser.parse_args()
    if not Path(args.weights).is_file() or args.epochs < 1:
        parser.error('Provide a local checkpoint and positive epoch count')
    local_cache = Path(__file__).resolve().parent.parent / 'capture-build' / 'training-cache'
    local_cache.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault('YOLO_CONFIG_DIR', str(local_cache))
    os.environ.setdefault('MPLCONFIGDIR', str(local_cache / 'matplotlib'))
    os.environ.setdefault('YOLO_AUTOINSTALL', 'false')
    from ultralytics import YOLO
    import tempfile
    import yaml
    dataset = Path(args.data).resolve()
    config = yaml.safe_load(dataset.read_text(encoding='utf-8'))
    if config.get('names') not in ({0: 'unit'}, ['unit']):
        parser.error('Dataset must contain only class 0: unit')
    config['path'] = str(dataset.parent)
    model = YOLO(args.weights)
    with tempfile.TemporaryDirectory() as temporary:
        resolved = Path(temporary) / 'data.yaml'
        resolved.write_text(yaml.safe_dump(config), encoding='utf-8')
        model.train(data=str(resolved), epochs=args.epochs, imgsz=640, device=args.device,
                    batch=args.batch, workers=2, amp=False, seed=17, deterministic=True,
                    project=str(Path(__file__).parent / 'training-runs'), name=args.name)
    trained = YOLO(str(model.trainer.best))
    print(trained.export(format='onnx', imgsz=640, dynamic=False, nms=False, opset=17, simplify=False))
