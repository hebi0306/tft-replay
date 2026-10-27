"""Fetch public data with Git LFS, avoiding thousands of rate-limited HTTP requests."""
import json
import os
import shutil
import subprocess
from pathlib import Path

REPO = 'Ashen0li/tft-set17-unit-detector-yolo'
REVISION = 'd190d425190e246a7004bab0d3c8905df9bb34e0'
PROJECT = Path(__file__).resolve().parent.parent
ROOT = PROJECT / 'capture' / 'dataset' / 'set17'
CACHE = PROJECT / 'capture-build' / 'set17-source'


if __name__ == '__main__':
    env = {**os.environ, 'GIT_LFS_SKIP_SMUDGE': '1'}
    if not (CACHE / '.git').is_dir():
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['git', 'clone', '--no-checkout', f'https://huggingface.co/datasets/{REPO}', str(CACHE)], check=True, env=env)
    subprocess.run(['git', 'checkout', '--detach', REVISION], cwd=CACHE, check=True, env=env)
    subprocess.run(['git', 'lfs', 'pull'], cwd=CACHE, check=True)
    ROOT.mkdir(parents=True, exist_ok=True)
    for folder in ('images', 'labels'):
        shutil.copytree(CACHE / folder, ROOT / folder, dirs_exist_ok=True)
    for name in ('data.yaml', 'classes.txt', 'manifest.json', 'README.md'):
        shutil.copy2(CACHE / name, ROOT / name)
    (ROOT / 'source.json').write_text(json.dumps({'repo': REPO, 'sha': REVISION}, indent=2), encoding='utf-8')
    print(f'Downloaded {REPO}@{REVISION}. Run audit_unit_dataset.py before training.')
