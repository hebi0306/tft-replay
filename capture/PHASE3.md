# 3단계: 보드 분석과 학습 준비

현재는 **Set 17 단일 unit 모델을 학습해 연결한 상태**입니다. 실제 Set 18 화면에서 탐지는 실행되지만 누락·오탐이 있어 보정 학습이 필요합니다. 챔피언 종류·아이템·별 인식 완료 상태는 아닙니다. 학습 결과와 한계는 `SET17_TRAINING.md`를 참고하세요. 설치파일은 만들지 않습니다.

## 동작

- Stage 확정 시 기존 스크린샷과 HP/Gold/Level 기록을 유지합니다.
- 같은 Stage에서 1.5초 후 확보한 프레임을 별도 작업 스레드에서 한 번 분석합니다. 6초 안에 프레임을 얻지 못하거나 작업이 밀리면 상태만 저장합니다.
- `rounds.analysis_json`에 board/bench/traits, 상태, confidence를 저장합니다. 기존 DB는 nullable 열을 추가하며 기존 기록은 보존합니다.
- 모델 없음: `board=[]`, `status.board=model_missing`. 이는 빈 보드를 뜻하지 않습니다. 벤치는 판단 불가 시 `occupancy=unknown`입니다.
- 탐지 가능한 경우 별도 `stage.analysis.png`와 분석 시각을 보관합니다. 원래 라운드 스크린샷과 시점이 다를 수 있습니다.
- 복기 화면의 **보드 분석 상세**에서 JSON을 확인합니다. 보드 재구성 UI는 이번 단계 범위가 아닙니다.

## 정적 데이터 준비 (PowerShell)

```powershell
cd C:\tft
node capture/sync_catalog.mjs --images
```

기존 앱의 정적 데이터 서비스를 재사용합니다. 이름·이미지는 Data Dragon, 특성 연결은 기존 서비스의 보완 데이터를 그대로 사용합니다. Riot API 키는 필요 없습니다. 다운로드 후 분석은 로컬 파일을 사용합니다.

`capture/data/catalog.json`에 현재 Set ID와 champion/item/trait ID가 있습니다. 공식 챔피언 초상화는 `portraits/`, 아이템 이미지는 `items/`에 저장됩니다. **초상화와 게임 속 3D 유닛은 다르므로 초상화를 챔피언 정답 crop으로 자동 등록하지 않습니다.**

## unit 모델 학습

1. 아래 디버그 명령으로 실제 게임 화면의 `board.png`를 추출합니다.
2. 본인 준비 단계 화면에서 유닛 bbox를 직접 라벨링합니다. 클래스는 `0=unit` 하나입니다. 꼬마 전설이·적·배경은 유닛 정답으로 넣지 않습니다.
3. 이미지와 같은 이름의 YOLO txt 라벨을 저장합니다. 각 줄: `0 centerX centerY width height` (이미지 크기에 대한 0~1 비율).
4. `capture/dataset/images/train`, `images/val`, `labels/train`, `labels/val`에 배치합니다. 같은 경기의 인접 프레임을 train/val로 나누지 마세요. 빈 라벨은 실제 유닛 없는 이미지에만 사용합니다.
5. 별도 학습 Python 환경에 Ultralytics와 ONNX export 의존성을 설치하고, 준비한 로컬 YOLOv8/11 detection 체크포인트로 실행합니다.

```powershell
python capture/train_units.py --weights C:\models\yolo11n.pt --epochs 50
```

학습 스크립트는 데이터셋 루트를 data.yaml 위치로 해석합니다. 출력 ONNX를 `capture/models/unit.onnx`로 복사합니다. 앱은 모델을 자동 다운로드하거나 학습하지 않습니다.

지원 모델 계약: float32 입력 `[1,3,640,640]`, 단일 클래스 raw 출력 `[1,5,N]` (xywh + unit score), NMS 미포함. 다른 모델/COCO 모델은 사용하지 않습니다. 학습된 ONNX 모델의 캡처 런타임 로딩과 추론을 확인했습니다.

## 챔피언·별·아이템 참조와 보정

`capture/data/references.example.json`의 구조를 참고하여 `references.json`을 편집합니다. 각 배열 원소는 `{ "id": "catalog의 실제 ID", "file": "crops/파일.png" }` 형식입니다. 기존 items 배열은 유지합니다.

- `champions`: 실제로 이름을 확인한 게임 유닛 crop. 같은 ID에 여러 이미지 가능.
- `items`: sync 명령이 공식 아이콘을 등록합니다.
- `stars`: id는 문자열 `1`, `2`, `3`, 실제 별 표시 crop.
- `emptyBench`: id는 `empty`, 실제 빈 슬롯 crop.

비교는 색상 픽셀 유사도이며 confidence는 정확도 확률이 아닙니다. 기본 유사도 0.92와 차순위 차이 0.06을 모두 만족해야 ID를 확정합니다. 조명·애니메이션·스킨에 따라 실패하므로 낮은 점수는 null로 유지합니다.

`board_config.py`의 BOARD_ROI/BENCH_ROI/HEX_ROWS는 캡처 이미지 비율 좌표입니다. 현재 Hex 중심은 초기값이며 실제 준비 단계 보드에서 검증해야 합니다. 전투 중 이동하는 유닛 위치는 원래 배치 칸과 다릅니다. 현재 전투/관전 상태 자동 판별은 없으므로 그런 화면의 배치 결과를 확정값으로 쓰면 안 됩니다.

STAR_ROI 및 ITEM_ROIS는 **미보정(None)**입니다. 학습 bbox 기준으로 별과 아이템을 포함하도록 crop을 정하고, bbox 내 비율 좌표를 설정해야 합니다. 미보정 상태에서는 null로 저장합니다. 벤치 crop은 비율이 다르므로 별도 검증이 필요합니다.

특성은 보드만 대상으로 동일 championId를 한 번 세며 인식된 상징을 반영합니다. 미확인 챔피언/아이템은 partial 결과로 표시합니다. `traitsComplete`는 구성원 수의 완전성이고 활성 조건 메타데이터가 없으면 active/tier는 null입니다.

설정·모델·참조 변경 후 캡처 서비스를 재시작하세요.

## 오프라인 디버그와 검증

```powershell
cd C:\tft
.capture-venv\Scripts\python.exe capture/stage_analyzer.py capture-build/phase2-preview.png --stage 1-4 --debug-dir capture-build/phase3-check
npm run capture:test
npm test
npm run build
```

출력: full/board/bench, bench 슬롯 crop, 탐지가 있는 경우 unit crop, 보정된 경우 item/star crop, detections.png, result.json. 녹화 옵션의 debug를 켜면 경기 폴더 아래 debug/Stage에도 저장합니다. 디버그 파일에는 실제 게임 화면이 포함되며 Git에서 제외됩니다.

자동 테스트는 합성 입력으로 좌표/NMS/유사도/특성/저장/실패 격리를 검증합니다. 실제 저장된 게임 화면으로는 모델 없음 상태와 crop 출력을 확인했습니다. 실제 탐지 정확도·전투 중 위치·아이템·성급 정확도는 학습 및 보정 후 별도 검증해야 합니다.

참고: [Ultralytics export](https://docs.ultralytics.com/modes/export/), [Riot TFT 정적 데이터](https://developer.riotgames.com/docs/tft/).
