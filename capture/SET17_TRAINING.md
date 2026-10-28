# Set 17 unit 기본 모델

## 실행 결과 (2026-10-28)

- YOLO11n / unit 1개 클래스 / 640px / batch 16 / 10 epochs / GTX 1070.
- 학습 4,716장·16,220 boxes, 검증 524장·1,794 boxes. 전체 5,240장 해시가 원본 revision과 일치하고 train/val 동일 파일 중복은 0개.
- 검증 precision 0.99777, recall 0.99889, mAP50 0.99499, mAP50–95 0.94422. **Set 17 합성 검증 점수이며 Set 18 정확도가 아닙니다.**
- `capture/models/unit.onnx` 연결 완료. 입력 `[1,3,640,640]`, 출력 `[1,5,8400]`, CPU ONNX Runtime 로딩 `ready`.
- 모델 SHA256: `987cf927bbe7a227bb504dea65590f6f55a70f49053045cd120d62ed706ee53f`.

실제로 저장된 Set 18 화면 4장에 confidence 0.65 기준으로 실행했습니다. 아래 개수는 **예측 박스 개수**이며 정답 개수나 정확도가 아닙니다.

| 화면 | 보드 ROI 탐지 | 벤치 ROI 탐지 | confidence 범위 |
| --- | ---: | ---: | --- |
| 1-4 (`phase2-preview`) | 1 | 1 | 0.726–0.878 |
| 2-4 회전초밥 (`phase2-current`) | 8 | 0 | 0.652–0.825 |
| 2-6 | 3 | 0 | 0.730–0.905 |
| 2-7 | 4 | 0 | 0.719–0.767 |

시각 검수에서 실제 유닛 일부를 찾았지만 **벤치·겹친 유닛 누락이 많고 회전초밥의 아이템 표시 오탐**이 확인됐습니다. 현재 모델은 기본 학습 결과로 보존하며 실사용 정확도 확보에는 Set 18 fine-tuning이 필요합니다. 회전초밥·전투·상대 유닛을 자동 구별하지 못하므로 Hex 매핑은 확정 배치가 아닙니다. 보드 경계에서 잘린 박스는 raw 로그에만 남기고 배치에서는 제외합니다.

실시간 게임을 새로 실행한 테스트는 하지 않았습니다. 저장된 실제 프레임을 사용한 통합 검사에서는 2-6 HP80/Gold45/Level4, 2-7 HP74/Gold56/Level4와 스크린샷·unit 분석 결과를 함께 저장하고 다시 읽는 데 성공했습니다. Python 테스트 29개와 Node 테스트 24개가 통과했습니다.

상세 JSON/이미지: `capture-build/set18-unit-evaluation/`. 통합 저장 검사: `capture-build/set17-integration/result.json`. 앱의 소스 실행(`npm start`)에서 재시작하면 새 모델을 읽습니다. 이전에 만든 설치 앱은 이 소스 경로의 모델을 자동으로 읽지 않습니다.

## 데이터 출처

https://huggingface.co/datasets/Ashen0li/tft-set17-unit-detector-yolo

revision: `d190d425190e246a7004bab0d3c8905df9bb34e0`

합성 보드와 modelviewer 렌더 이미지로 구성된 단일 클래스 `unit` 데이터입니다. 챔피언 이름 분류용이 아닙니다. 원본 README와 source.json을 `dataset/set17`에 함께 보존합니다. 저장소 라이선스는 `other`로 표시돼 있으며 공개 다운로드 가능 여부와 별개로 재배포/상용 허용을 확인한 것은 아닙니다.

## 재현

기존 `.capture-venv`와 별도로 `.training-venv`를 사용합니다. GTX 1070에서 확인한 CUDA 환경은 PyTorch 2.6.0+cu124 / torchvision 0.21.0입니다.

```powershell
cd C:\tft
.capture-venv\Scripts\python.exe -m venv .training-venv
.training-venv\Scripts\python.exe -m pip install torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124
.training-venv\Scripts\python.exe -m pip install --no-cache-dir -r capture/requirements-training.txt
.capture-venv\Scripts\python.exe capture/download_set17.py
.training-venv\Scripts\python.exe capture/audit_unit_dataset.py capture/dataset/set17
.training-venv\Scripts\python.exe capture/train_units.py --weights capture/models/yolo11n.pt --data capture/dataset/set17/data.yaml --device 0 --batch 16 --epochs 10 --name set17-base
```

초기 체크포인트 `yolo11n.pt`는 Ultralytics 공식 assets v8.3.0 release 파일입니다. 원본 체크포인트를 unit.onnx로 바꾸어 쓰지 않습니다. 학습된 best.pt에서 고정 입력 `[1,3,640,640]`, 출력 `[1,5,N]` ONNX를 내보낸 뒤 런타임 검증을 거쳐 `capture/models/unit.onnx`에 연결합니다.

결과와 곡선은 `capture/training-runs/<실행 이름>/`, 실제 이미지 검증은 `capture-build/set18-unit-evaluation/`에 저장합니다. 이미지·가중치·학습 환경은 Git에서 제외됩니다.

## 실제 화면 검증

```powershell
.capture-venv\Scripts\python.exe capture/evaluate_units.py capture-build/phase2-preview.png capture-build/phase2-current.png
```

각 이미지의 board/bench bbox와 confidence를 report.json 및 표준 출력에 기록합니다. 결과 폴더의 detections.png로 위치를 확인합니다. 정답 라벨 없는 실제 화면에서는 precision/recall을 산출하지 않습니다. Confidence를 정확도로 해석하면 안 됩니다.

앱 기록에서도 `[Unit detections]` 로그에 ROI 기준 bbox와 confidence가 남습니다. 같은 결과는 라운드의 analysis.unitDetections에도 저장됩니다. unit 검출 자체와 championId 식별은 별개이며 championId는 참조가 없으면 null입니다. 벤치에서도 모델이 유닛을 찾으면 이름을 몰라도 occupancy=unit으로 기록합니다. 탐지하지 못했다고 빈 슬롯으로 확정하지 않습니다.

모델 누락/로드 실패 시 기존 기록은 유지됩니다. 모델 연결 후 앱을 재시작해야 합니다. 설치파일을 만들 필요는 없습니다.

## Set 18 fine-tuning

`dataset/set18/images/train`, `images/val`, `labels/train`, `labels/val`에 직접 검수한 동일 클래스 0 라벨을 추가합니다. 같은 경기의 이미지는 한 split에만 넣고, 최종 평가용 경기는 학습에서 제외합니다. 자동 예측 결과를 검수 없이 정답으로 쓰지 마세요.

`dataset/fine_tune.example.yaml`로 Set 17 원본과 Set 18 자료를 함께 학습할 수 있습니다. `--weights`에는 Set 17 학습의 best.pt를 지정합니다. 합친 검증 점수와 별도로 Set 18만의 결과를 확인해야 합니다. 원본 Set 17 파일과 split은 덮어쓰지 않습니다.
