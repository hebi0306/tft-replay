> 이전 모델 기록입니다. 현재 적용 모델과 검증 결과는 LOCATION_DETECTION_V4.md를 참고하세요.

# 위치 탐지 보정 적용 — 2026-10-29

현재 소스 앱 모델은 `capture/models/unit.onnx`의 **set18-location-v3**이다. 단일 `unit` 위치 탐지이며 챔피언 종류 분류 학습은 하지 않았다. 이전 모델은 `capture/models/unit-set17-backup.onnx`에 보존했다. 설치파일은 생성하지 않았다.

## 변경

- 최근 경기 `20261028_111813_83765cfb2f60`에서 벤치 49개, 보드 10개 박스를 수동 검수해 추가했다.
- 기존 실제 화면 자료와 합쳐 20개 영역/97개 박스. 모루·보상 구슬·골드 효과·꼬마 전설이·이름표의 유닛 없는 영역 6개를 추가했다.
- 원본 Set17 학습 이미지 256장과 실제 영역을 혼합하고, v1에서 15 epoch(v2), v2에서 배경 예시를 포함해 8 epoch(v3) 추가 학습했다. 반복 샘플링은 새로운 원본 이미지 수로 세지 않았다.
- 벤치 ROI의 좌우 경계를 기준 해상도 1920에서 x=360..1440으로 보정했다. 기존 넓은 영역을 9등분하면 인접한 두 유닛이 같은 슬롯에 들어가 하나가 누락됐다. 해상도에 비례해 적용하며 720p/1080p/1440p의 9개 위치 회귀 테스트를 추가했다.
- Stage/HP/Gold/Level 코드, 챔피언 참조, 원본 DB와 이미지에는 이번 작업으로 변경하지 않았다. 기존 미커밋 OCR 수정은 유지했다.

## 검증

confidence 0.65 및 일대일 IoU 0.5 기준, 동일한 라벨 crop으로 비교했다. 유닛 박스의 정확도이며 챔피언 이름 식별률이 아니다.

|자료|적용 전 Set17 모델|v3|
|---|---|---|
|검증: 다른 경기의 4개 영역, 13개 정답|TP2 / FP2 / FN11|TP11 / FP5 / FN2|
|별도 시험: 또 다른 경기의 4개 영역, 12개 정답|TP2 / FP1 / FN10|TP12 / FP0 / FN0|
|학습: 26개 영역, 97개 정답|TP9 / FP12 / FN88|TP97 / FP0 / FN0|

검증 자료는 체크포인트 선택에 사용했다. 시험 자료는 학습 및 체크포인트 선택에서 제외했으나 후보 비교 과정에서 반복 조회했고, 같은 경기의 가까운 두 프레임만 포함한다. 수가 매우 적어 전체 경기/챔피언/스킨/해상도에 대한 정확도로 일반화할 수 없다. 검증 오탐은 직전 v2의 7개에서 5개로 줄었지만 **최초 모델의 2개보다는 많다**. 유닛 누락을 줄이는 대신 여전히 오탐이 존재한다.

앱의 전체 보드/벤치 ROI로 재분석하면 보상 구슬·경기장 장식 오탐이 남는다. 하단 보드 crop의 높은 학습 점수는 전체 보드의 완전한 탐지를 의미하지 않는다. 상대/중립 유닛과 본인 유닛의 소속도 구별하지 못한다.

기록의 1-7 벤치는 기존 0개 탐지에서 새 모델+슬롯 보정 후 9개 별도 슬롯 저장으로 개선됐다. **이 프레임은 학습 자료**이므로 독립 검증 결과로 보지 않는다. 기존 기록을 덮어쓰지 않고 복사된 분석 결과로 확인했다.

- Python 테스트 35개 통과. 기존 ROI에서는 새 회귀 테스트가 슬롯 8개로 실패하고 보정 후 9개로 통과했다.
- 저장된 실제 2-6/2-7 이미지로 Stage/HP/Gold/Level/스크린샷/unit 결과를 별도 테스트 DB에 저장하고 재조회했다. HP80/45골드/4레벨, HP74/56골드/4레벨 유지 및 모델 ready 확인.
- ONNX 입력 `[1,3,640,640]`, 단일 클래스 출력 계약 유지. CPU 로딩 확인.
- SHA256: `e03f22292ba3fdaa325463e9e83346042ddb8cc5ee2cd686eebed3219349a0df`.

## 산출물 / 재현

- 데이터/라벨/분할: `capture/dataset/set18/v2/`.
- 새 라벨: `new-annotations.json`, `negative-annotations.json`, `test-annotations.json`.
- 실행 설정: `data.yaml`, `data-negatives.yaml`와 학습 이미지 목록. 동일 파일이 train/val/test 사이에 없음을 확인했다. 학습/검증/시험 경기 ID가 분리돼 있다.
- 준비 스크립트: `capture-build/prepare_location_v2.py`, `prepare_location_test.py`, `prepare_location_negatives.py`.
- 비교 스크립트: `capture-build/compare_location_v3.py`. 모델 교체 후 재실행 시 base 경로를 `capture/models/unit-set17-backup.onnx`로 지정해야 한다.
- 결과: `capture-build/set18-location-v3-comparison/report.json`와 시각 검수 이미지.
- 실제 ROI 검사: `capture-build/location-v3-runtime/`, 슬롯 보정 후 결과 `capture-build/location-v3-bench-fixed/`.
- 모델: `capture/training-runs/set18-location-v3/weights/best.pt`, `best.onnx`.
- 학습 로그: `capture-build/set18-location-v2-training.log`, `set18-location-v3-training.log`.

```powershell
cd C:\tft
.training-venv\Scripts\python.exe capture/train_units.py --weights capture/training-runs/set18-location-v2/weights/best.pt --data capture/dataset/set18/v2/data-negatives.yaml --device 0 --batch 16 --epochs 8 --name set18-location-v3
```

중복 실행 이름은 새 폴더에 저장될 수 있다. 모델/학습자료는 기존 Git 제외 규칙을 따른다. 배포 정보는 `capture/dataset/set18/v2/deployment.json`에 보존했다.

## 실행

앱을 완전히 종료한 뒤 `C:\tft`에서 `npm start`로 실행하면 새 모델과 벤치 보정이 적용된다. 이미 실행 중인 캡처 서비스는 모델을 다시 로딩해야 한다. 이전 설치 앱은 수정되지 않았다. 새 실시간 경기를 통한 검증은 아직 하지 않았다.

