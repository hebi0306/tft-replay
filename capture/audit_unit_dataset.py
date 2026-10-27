"""Check image/label pairs and single-class YOLO boxes before training."""
import argparse
import hashlib
import json
import math
from pathlib import Path


def parse_labels(text):
    boxes = []
    for line in text.splitlines():
        if not line.strip():
            continue
        values = [float(v) for v in line.split()]
        if len(values) != 5 or values[0] != 0 or not all(math.isfinite(v) for v in values):
            raise ValueError('Expected class 0 and four finite coordinates')
        _, x, y, w, h = values
        if not (0 <= x <= 1 and 0 <= y <= 1 and 0 < w <= 1 and 0 < h <= 1):
            raise ValueError('Invalid normalized box')
        if x-w/2 < -1e-5 or y-h/2 < -1e-5 or x+w/2 > 1.00001 or y+h/2 > 1.00001:
            raise ValueError('Box extends beyond image')
        boxes.append(values)
    return boxes


def audit(root):
    from PIL import Image
    result, fingerprints = {}, {}
    for split in ('train', 'val'):
        images = sorted((root / 'images' / split).glob('*.jpg'))
        if not images:
            raise ValueError(f'No {split} images')
        boxes, empty, hashes = 0, 0, set()
        for image in images:
            label = root / 'labels' / split / (image.stem + '.txt')
            values = parse_labels(label.read_text(encoding='utf-8'))
            with Image.open(image) as decoded:
                decoded.verify()
            boxes += len(values)
            empty += not values
            hashes.add(hashlib.sha256(image.read_bytes()).hexdigest())
        result[split] = {'images': len(images), 'boxes': boxes, 'empty': empty}
        fingerprints[split] = hashes
    result['identicalTrainValImages'] = len(fingerprints['train'] & fingerprints['val'])
    if result['identicalTrainValImages']:
        raise ValueError('Identical images cross the train/val split')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('root', type=Path)
    args = parser.parse_args()
    result = audit(args.root)
    (args.root / 'audit.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))
