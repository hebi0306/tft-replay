# Set 18 실제 화면 추가 학습 — 2026-10-28

## 결과와 현재 적용 상태

Set 17 기본 체크포인트에서 10 epoch 추가 학습하고 ONNX로 내보냈다. **후보 모델만 생성했으며 `capture/models/unit.onnx`는 교체하지 않았다.** 실제 런타임 영역 검사에서 아이템 모루와 경기장 장식을 유닛으로 오인하는 문제가 남아 있다. Stage/HP/Gold/Level 저장 코드와 원본 경기 DB/스크린샷은 이 학습에서 변경하지 않았다.

| 검증 지표 | 기존 모델 | 추가 학습 후보 |
|---|---:|---:|
| 맞게 찾은 박스 (13개 중) | 2 | 11 |
| 오탐 | 2 | 7 |
| 누락 | 11 | 2 |
| Precision | 0.500 | 0.611 |
| Recall | 0.154 | 0.846 |

앱과 같은 confidence 0.65, IoU 0.5로 일대일 매칭했다. **다른 경기의 선택된 영역 4장·13개 박스만 사용한 작은 검증 세트**이며 checkpoint 선택에도 사용했으므로 독립 최종 테스트나 Set 18 전체 정확도를 의미하지 않는다. 전체 화면/실시간 게임의 정확도 수치가 아니다.

## 데이터와 검수

- 학습 원본: `20261028_044235_4c8ba88d141e`의 1-4, 1-6, 2-3, 2-7, 3-2 분석 스크린샷.
- 비교적 구분 가능한 하단 보드/벤치 8개 crop, 38개 unit 박스를 이미지로 직접 검수했다. 자동 탐지 결과를 정답으로 복사하지 않았다.
- 검증 원본: 별도 경기 `20261015_091254_c840bb88f6f5`의 2-6, 2-7, 4개 crop/13개 박스. 경기 단위 분리, train/val 동일 파일 없음.
- 보이는 몸체와 무기를 둘러싼 단일 클래스 박스. 체력바·아이템 아이콘·그림자·꼬마 전설이는 제외. crop 경계에서 잘린 몸체는 박스도 잘랐다. 전체 보드의 완전한 라벨링이 아니며 모든 21개 라운드를 검수한 것은 아니다.
- Set 17 원본에서 seed 17로 256장을 선택하고 실제 학습 crop 8장을 12회씩 샘플링해 혼합했다. 중복 샘플링은 새로운 이미지 수로 계산하지 않는다.
- 실제 화면이 적고 한 경기의 유사한 배치가 반복된다. 새로운 경기와 모루/장식 같은 오탐 대상의 별도 학습 자료가 더 필요하다. 검증 이미지를 학습으로 옮겨 점수를 높이지 않는다.

## 로컬 산출물

- `capture/dataset/set18/annotations.json`: 원본 경로, 수동 박스 좌표, 경기별 split, 출력 crop 정보.
- `capture/dataset/set18/images`, `labels`, `review`: YOLO 이미지/라벨/시각 검수 결과.
- `capture/dataset/set18/audit.json`, `experiment.json`: 라벨 검사 및 모델 비교 요약.
- `capture/dataset/set18/data.yaml`, `train-mixed.txt`: 실제 사용한 학습 설정.
- `capture/training-runs/set18-reviewed-v1/weights/best.pt`, `best.onnx`: 후보 모델.
- ONNX SHA256: `3b5946f893d519b247577bf00502e03159ff97bb2c8654aa0d45a5d72fffcf9a`.
- `capture-build/set18-comparison/report.json`: 이미지별 TP/FP/FN 및 confidence.
- `capture-build/set18-runtime-v1/`: 앱의 보드/벤치 ROI로 실제 저장 화면 3장을 검사한 결과. 정답 라벨이 없어 정확도 산출은 하지 않았다.
- `capture-build/prepare_set18_reviewed.py`, `compare_set18_models.py`: 준비/검증 재현 스크립트.

이미지·라벨·모델·로컬 실험 결과는 기존 Git 제외 규칙을 따른다. 설치파일은 생성하지 않았다.

## 재실행

```powershell
cd C:\tft
.capture-venv\Scripts\python.exe capture-build/prepare_set18_reviewed.py
.capture-venv\Scripts\python.exe capture/audit_unit_dataset.py capture/dataset/set18
.training-venv\Scripts\python.exe capture/train_units.py --weights capture/training-runs/set17-base/weights/best.pt --data capture/dataset/set18/data.yaml --device 0 --batch 16 --epochs 10 --name set18-reviewed-v1
.capture-venv\Scripts\python.exe capture-build/compare_set18_models.py
```

같은 학습 이름이 이미 존재하면 Ultralytics가 새 폴더 이름을 붙일 수 있다. 비교 스크립트의 후보 경로도 실제 출력에 맞춰야 한다.

## 챔피언 종류 인식: 사용자 확인 라벨 등록 완료

사용자가 16개 이미지의 이름을 확인했고, 모두 현재 Set 18 catalog ID로 연결했다. `capture/dataset/set18/identity-review/identities.json`에 원본 좌표, 한국어 이름, championId/apiId와 사용자 확인 출처를 보존한다.

실제 crop 16개를 `capture/data/crops/set18-confirmed/`에 복사하고 기존 `references.json`의 champions 배열에 등록했다. items/stars/emptyBench 배열은 유지했고 이전 파일은 `capture-build/references-before-confirmed-identities.json`에 보존했다. 기존 ReferenceMatcher의 유사도 0.92 및 차순위 차이 0.06 기준을 그대로 사용하며 미달 시 ID는 null이다. 캡처 서비스를 재시작하면 참조를 읽는다.

등록 검사는 같은 참조 이미지를 다시 입력했을 때 16/16 ID가 일치하고 단색 입력은 unknown임을 확인했다. 이는 연결 확인이지 독립 인식 정확도 평가가 아니다. Python 34개 테스트가 통과했다. 종류별 한 장씩이므로 별도의 신경망 분류 모델은 아직 학습하지 않았으며, 다른 경기/각도/애니메이션의 검증과 추가 라벨이 필요하다. 단일 unit ONNX 후보와 현재 앱의 위치 탐지 모델은 이번 이름 등록에서 변경하지 않았다.

이름: 1 어스름늑대, 2 조약돌, 3 불타는 묘목, 4 라칸, 5 다이애나, 6 레오나, 7 자야, 8 케일, 9 바루스, 10 코부코, 11 돌거북, 12 바위 게, 13 심술두꺼비, 14 타릭, 15 감시자, 16 알리스타.
