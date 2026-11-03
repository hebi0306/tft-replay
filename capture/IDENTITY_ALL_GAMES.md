# 모든 기존 경기 참조 보강

## 범위

기록이 있는 4경기의 원본/분석 화면 총 100개를 처리했습니다. 현재 위치 탐지 모델 v6의 저장된 100개 화면 탐지 bbox를 사용했으며, 탐지되지 않은 유닛까지 검증했다는 의미는 아닙니다. 파일 원본과 DB는 수정하지 않았습니다.

기존 인식기로 이름이 반환된 606개 crop은 자동 라벨이 아닌 후보로만 저장했습니다. 종류·경기 조합별 대표 후보 97개를 기존 이름 확인 참조와 나란히 시각 검토했습니다. 몸체와 얼굴·장비·색상이 일치하고 비교에 사용할 수 있는 62개만 추가하고, 잘림/텍스트/다른 유닛/강한 효과로 품질이 낮은 35개는 제외했습니다. 시각 검토 출처를 `assistant_visual_review_against_existing_named_reference`로 남겼습니다. 사용자 직접 확인이라고 기록하지 않았습니다.

참조 241→303장, 종류 65종 유지. 한 경기에서만 참조가 있는 종류 47→38종, 둘 이상의 경기에서 참조가 있는 종류 18→27종입니다. 아직 38종은 새로운 경기에서의 성능을 평가할 근거가 부족합니다.

## 동일한 검사 이미지 비교

보강 전의 241개 이미지를 `capture-build/all-game-identity/frozen-queries.json`으로 고정했습니다. 검사 이미지와 같은 경기의 모든 참조를 제외하고 비교합니다.

- 확정 정답: 35→59개
- 잘못 확정: 0→0개
- 이전 정답이 오답/미확인으로 바뀐 사례: 0개
- 미확인: 206→182개
- 보강 후 다른 경기에 해당 종류 참조가 있는 표본: 127개 중 59개 정답, 68개 미확인
- 다른 경기에 종류 참조가 없는 114개: 모두 미확인
- 별도 모루/구슬/배경 17개: 모두 미확인

보강 후보 선택과 라벨 시각 검토에 기존 자료를 활용했습니다. 이 비교는 고정된 과거 자료에서의 회귀/개선 확인이며 독립적인 새 경기 일반화 정확도가 아닙니다. 추가 참조 자체를 검사 대상으로 늘려 성적을 부풀리지 않았습니다.

## 기능 보존과 비용

65종 모두 자기 참조 연결 검사 통과. 이는 등록 연결 확인이며 정확도 지표가 아닙니다. 아이템/성급/빈 벤치 참조와 임계값은 그대로 유지했습니다. 기존 Stage/HP/Gold/Level 및 스크린샷 저장/조회 통합 검사를 통과했습니다. 평균 비교 시간은 약 46.6ms로 기존 33.4ms보다 증가했습니다. 이번에는 런타임 인식 코드 변경 없이 시각 검토된 참조만 추가했습니다.

전체 100개 화면에서 최종 참조의 실행 여부를 별도로 검사합니다. 그 이름 반환 개수는 정답 라벨이 없는 화면의 정확도로 사용하지 않습니다.

## 결과/재현

- 후보/검토: `capture-build/all-game-identity/`, `capture/dataset/set18/identity-curated/all-game-reviewed/`, `all-game-reviewed-remaining/`
- 고정 검사 평가: `capture-build/identity-all-game-frozen-validation.json`, `verify_all_game_frozen.py`
- 65종 자기 참조 연결 검사: `capture-build/all-game-identity/deployment.json`
- 100개 화면 실행 검사: `capture-build/all-game-final-validation/`, `validate_all100_identity.py`
- 통합 검사: `capture-build/all-game-integration.log`
- 변경 전 참조 백업: `capture-build/references-before-all-game.json`
- 변경 전 라벨 백업: `capture/dataset/set18/identity-curated/expanded.before-all-game.json`

65종 안정 인식 완료로 표시하지 않습니다. 가림, 새로운 자세/스킨, 탐지 누락 및 충분한 경기 간 참조가 없는 종류의 미확인은 남습니다. 앱 완전 종료 후 C:\tft에서 `npm start`로 재시작하면 적용됩니다. 설치파일은 생성하지 않았습니다.
