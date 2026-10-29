# Unit 위치 탐지 v4 — 2026-10-29

현재 `capture/models/unit.onnx`에 적용된 모델은 `set18-location-v4`입니다. 단일 `unit` 클래스 위치 탐지이며 챔피언 이름 분류 모델은 아닙니다.

## 변경 이유와 범위

기존 학습은 하단 보드 crop 위주였으나 앱은 더 넓은 보드 ROI를 입력했습니다. 실제 ROI와 같은 범위의 수동 라벨을 추가해 경기장 장식, 플레이어 캐릭터, 전리품을 배경으로 학습했습니다. 기존 캡처 주기, OCR, 저장, 모델 실패 시 기록을 유지하는 동작, UI는 바꾸지 않았습니다.

- 기존 두 학습 경기에서 전체 보드 ROI 3장과 보정된 벤치 ROI 7장, 총 70개 박스를 추가했습니다. 같은 경기의 다른 crop이므로 새로운 경기 10개로 계산하지 않습니다.
- 실제 자료 전체: 학습 36개 영역 / 167개 박스, 그중 유닛 없는 배경 영역 6개. 원본 Set17 이미지 256장과 반복 혼합한 566개 샘플로 v3에서 12 epoch 학습했습니다.
- 검증 경기와 학습 경기는 분리했습니다. 최신 20261029 경기는 학습에 사용하지 않았습니다.
- confidence 0.65, NMS 0.45를 유지했습니다. best 체크포인트 선택에는 기존 validation만 사용했습니다.

## 동일 조건 비교

confidence 0.65, 일대일 IoU 0.5. TP=정답 박스, FP=잘못된/위치가 충분히 맞지 않는 박스, FN=누락. 이름 식별률이 아닙니다.

|자료|v3 TP / FP / FN|v4 TP / FP / FN|
|---|---|---|
|기존 검증 4개 영역 / 정답 13개|11 / 5 / 2|12 / 4 / 1|
|기존 시험 4개 영역 / 정답 12개|12 / 0 / 0|12 / 0 / 0|
|최신 경기 실제 ROI 4개 영역 / 정답 34개|30 / 4 / 4|31 / 2 / 3|

최신 경기 시험의 보드는 16 TP / 1 FP / 2 FN, 벤치는 15 TP / 1 FP / 1 FN입니다. 전체 정밀도 93.9%, 재현율 91.2%는 **한 경기의 두 프레임에 대한 수치**이며 전체 게임 정확도가 아닙니다. 가림과 무기 포함 박스 경계가 평가에 영향을 줍니다. 이전 시험 자료는 과거 작업에서도 조회한 자료입니다. 최신 시험은 이번 후보의 배포 판단에 사용했으므로 이후 재학습 시 완전히 독립적인 최종 시험으로 재사용하지 않습니다.

## 확인

- 기존 Python 테스트 35개 통과.
- 새 모델로 저장된 실제 2-6/2-7 화면을 재분석하여 별도 테스트 DB에 저장/조회했습니다. Stage, HP80/Gold45/Level4 및 HP74/Gold56/Level4, 스크린샷, board ready를 확인했습니다.
- 원본 사용자 기록 DB/이미지는 변경하지 않았습니다.
- ONNX CPU 로딩 및 입력 계약 확인. 이 PC에서 20회 측정한 ROI당 평균 약 82ms, 최대 85ms였습니다. 게임과 동시에 실행한 FPS 측정은 아닙니다.
- 기존 confidence/박스 로그 유지. 결과 파일에 예측 박스와 confidence를 보존했습니다.
- SHA256: `c0873790f1aa602dd8a7e26c5cf546fdccb620b55fd04ff41a5c4ad1c970e33e`.

## 산출물과 실행

- 현재 모델: `capture/models/unit.onnx`
- v3 백업: `capture/models/unit-v3-backup.onnx`; 원본 Set17 백업도 유지.
- 학습/라벨/분할: `capture/dataset/set18/location-v4/`, `runtime-annotations.json`, `deployment.json`
- 준비/비교 스크립트: `capture-build/prepare_location_v4.py`, `capture-build/compare_location_v4.py`
- 비교 결과/이미지/confidence: `capture-build/set18-location-v4-comparison/`
- 학습 로그: `capture-build/location-v4-training.log`
- 모델 학습 결과: `capture/training-runs/set18-location-v4/weights/best.pt`, `best.onnx`
- 테스트 로그: `capture-build/location-v4-tests.log`, `capture-build/location-v4-integration.log`

```powershell
cd C:\tft
.training-venv\Scripts\python.exe capture/train_units.py --weights capture/training-runs/set18-location-v3/weights/best.pt --data capture/dataset/set18/location-v4/data.yaml --epochs 12 --device 0 --batch 16 --name set18-location-v4
.capture-venv\Scripts\python.exe capture-build/compare_location_v4.py
```

동일 학습 이름으로 재실행하면 다른 출력 폴더가 생성될 수 있으므로 비교 경로를 확인해야 합니다. 모델/데이터는 기존 Git 제외 규칙에 따라 로컬에만 있습니다.

앱을 완전히 종료한 후 `C:\tft`에서 `npm start`로 실행해야 새 모델이 로딩됩니다. 실행 중인 앱/기록은 강제로 종료하지 않았습니다. 설치파일은 만들지 않았습니다.

## 남은 한계

새로운 실시간 경기 검증은 하지 않았습니다. 심한 가림, 새로운 경기장/스킨/배율, 전투 중 겹침에서는 누락/오탐이 남습니다. 상대/중립/본인 유닛의 소속과 챔피언 이름은 이 모델의 학습 대상이 아닙니다. 전체 보드 좌표를 자신의 조합으로 해석할 때는 별도 소속/전투 상태 구분이 필요합니다.
