# TFT Replay

실제 Riot 경기 최종 결과와 독립된 simulated Replay를 보여주는 **OW-Electron 기반 Windows 데스크톱 앱**입니다. Riot API 키는 앱에 포함하지 않고 외부 backend에만 보관합니다.

## External backend

```text
TFT Replay app → HTTPS backend → Riot Games API
```

`backend/.env`에만 `RIOT_API_KEY`를 설정합니다. renderer, Electron main process, Windows package, 사용자 앱 설정에는 Riot 키를 넣지 마세요.

```sh
cp backend/.env.example backend/.env
# backend/.env에 RIOT_API_KEY 설정
npm run backend
```

로컬 app은 `.env.development`의 `VITE_API_BASE_URL=http://localhost:8080`을 사용합니다. Render/Railway/AWS/VPS 배포 전 `.env.production`의 URL을 실제 HTTPS backend URL로 바꾼 뒤 `npm run package`를 실행하세요. Demo data 모드는 backend 없이도 유지됩니다.

Backend endpoints: `GET /health`, `GET /api/riot/account`, `GET /api/riot/matches/:puuid?count=10`, `GET /api/riot/match/:matchId`. CORS는 `backend/.env`의 `ALLOWED_ORIGINS`만 허용하며, Electron의 Origin 없는 요청은 허용합니다. 429 응답은 `RATE_LIMITED`와 `Retry-After`를 반환합니다.

Render에서는 backend 디렉터리를 Dockerfile 경로로 지정하고 `RIOT_API_KEY`, `ALLOWED_ORIGINS` 환경변수를 설정하세요. Railway와 AWS도 동일한 Dockerfile 및 환경변수를 사용합니다.

## 데스크톱 실행

Node.js 22.12+에서 프로젝트 폴더를 열고 실행하세요. `.env`가 없다면 `.env.example`을 복사하고 서버 전용 `RIOT_API_KEY`를 설정합니다. 기존 `.env`는 덮어쓰지 마세요. 키에 `VITE_` 접두사를 붙이지 않습니다.

```sh
npm install
npm start
```

`npm start`와 `npm run dev`는 OW-Electron 앱 창을 엽니다. React renderer와 loopback API 서버는 앱 내부에서만 시작되며, 브라우저 주소창은 표시되지 않습니다. 창 기본 크기는 1400×900, 최소 크기는 1100×700입니다.

Windows installer 빌드 명령은 다음과 같습니다.

```sh
npm run package
```

이 명령은 공식 `@overwolf/ow-electron-builder`를 사용합니다. 현재 `overwolf.requireSigning: false`로 unsigned installer도 생성합니다. 배포판에서는 `.env`를 포함하지 않습니다. 설치 후 Riot 키는 `%APPDATA%\\TFT Replay\\.env`에 `RIOT_API_KEY=...`로 넣으세요. 개발 실행은 프로젝트 루트 `.env`를 사용합니다. unsigned 배포판에서는 Overwolf GEP package가 로드되지 않지만, Riot API와 Mock Replay는 그대로 실행됩니다.

`npm run web`은 로컬 프록시를 단독으로 점검하는 용도입니다. 최종 사용자 실행 방식이 아닙니다.

```sh
npm test
npm run build
npm run package
```

## 데스크톱 구조

```text
OW-Electron main process (desktop/electron/main.cjs)
  → loopback-only local server (desktop/appServer.js)
  → React/Vite renderer (dist/)
  → Riot API
```

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`를 사용합니다. React renderer는 Node API나 Riot API 키에 접근하지 못하고, 기존 상대 경로 `/api/...` 요청만 loopback proxy에 보냅니다. BrowserRouter는 local server의 SPA fallback으로 Home, Match Detail, Replay 경로를 유지합니다.

`package.json`의 `overwolf.packages: ["gep"]`는 미래 GEP 사용 준비만 합니다. 이 프로토타입은 GEP 호출·구독을 하지 않으며, 현재 Mock GEP → Adapter → Replay UI 흐름을 그대로 유지합니다.

앱 아이콘은 `frontend/assets/icon.ico`의 임시 TFT Replay 아이콘입니다. 디자인이 확정되면 같은 경로의 `.ico` 파일만 교체하면 됩니다.

## 화면과 사용 흐름

- `/`: Riot ID 검색으로 최근 실제 경기 최대 10개를 표시합니다. Demo data 모드는 기존 가상 경기 5개를 표시합니다.
- `/match/:id`: 실제 최종 순위·레벨·골드·피해량·마지막 라운드·시간·유닛·아이템·특성. 실제 조합에는 보드 위치나 대기석을 만들지 않습니다.
- `/replay/:id`: Stage 2~6의 25개 라운드. 왼쪽 목록 또는 타임라인으로 이동하며 보드, 위치, 별, 아이템, 대기석, 경제, 승패, 연승/연패, 변화 기록을 확인합니다.
- Play는 1.5초마다 진행하고 마지막 라운드에서 정지합니다. 직접 라운드를 선택하면 일시정지합니다. 마지막 라운드에는 결과와 이동 버튼이 표시되며 Play again으로 다시 시작할 수 있습니다.
- 챔피언에 마우스를 올리면 이름·별·전체 아이템 이름을 확인할 수 있습니다.
- **Data Sources**: 실제 Riot 정보, simulated Replay 정보, 향후 GEP 수집 계획과 post-game 전용 목적을 영어로 설명합니다. Close, Esc, 배경 클릭으로 닫을 수 있습니다.

## 주요 파일

- `frontend/src/`: React 화면, Riot 조회 클라이언트, mock Replay 데이터와 스타일.
- `frontend/assets/`: 앱 아이콘과 정적 에셋.
- `backend/index.js`, `backend/riotProxy.js`: Riot API 키를 보관하는 외부 백엔드.
- `desktop/electron/main.cjs`, `desktop/appServer.js`: Windows 데스크톱 앱 실행기와 내부 정적 파일 서버.
- `tests/`: 프론트 데이터 변환과 백엔드 프록시 검사.
- `tests/data.test.js`, `tests/riot.test.js`, `tests/replay.test.js`: 데모 무결성, Riot 프록시·변환, 어댑터·Changes 검사.

## Mock 범위

실제 데이터: Riot ID/PUUID, 최근 경기 목록, 경기 메타데이터, 최종 순위·레벨·골드·피해량·유닛·아이템·특성. 이름과 이미지는 기존 Data Dragon 매핑을 사용합니다. 일치하는 정적 데이터가 없으면 Unknown 표시가 유지됩니다.

Mock 데이터: 모든 라운드별 보드·좌표·대기석·별·아이템 변화·HP·Gold·Level·승패·연승/연패. 실제 Riot 경기와 무관한 별도 데모 기록이며 영상 Replay가 아닙니다. 실제 Overwolf GEP 수집은 연결하지 않았습니다.

## GEP Adapter와 Snapshot

현재 입력은 **앱 자체의 전체 상태 캡처 형식**이며, 공식 Overwolf 이벤트 JSON 형식이라고 가정하지 않습니다. 모든 현재 입력의 source는 `mock`입니다.

```js
{
  source: 'mock', stage: '3-2', round: 2,
  level: 6, hp: 78, gold: 32, result: 'WIN', streak: 3,
  board: [{ id: 'ashe-instance-1', name: 'Ashe', starLevel: 2,
    position: { row: 2, col: 4 }, items: ['Giant Slayer'] }],
  bench: [{ id: 'jax-instance-1', name: 'Jax', starLevel: 1,
    benchPosition: 7, items: [] }],
  traits: [{ name: 'Bastion', count: 4 }]
}
```

좌표는 0부터 시작합니다: row 0~3, col 0~6, benchPosition 0~8. ID는 챔피언 종류나 슬롯이 아닌 유닛 인스턴스 식별자입니다.

`mapGepDataToReplayRound(data, previousRound)`는 `stage: 3`, `round: 2`, `star: 2`, `position: row * 7 + col`로 기존 UI 형식에 맞춥니다. benchPosition은 그대로 보존하며 빈 대기석 슬롯도 유지합니다. source·level·hp·gold·result·streak·traits와 자동 생성한 changes가 공통 Snapshot에 포함됩니다.

```text
mockGepData → adaptGepRecording → mapGepDataToReplayRound
                                   ↓
                        compareReplaySnapshots → changes
                                   ↓
                          Replay Snapshot → ReplayPage
```

Changes는 **기록상 직전 라운드**와 비교합니다. 사용자가 타임라인을 건너뛰거나 뒤로 이동해도 같은 라운드의 변화 기록은 같습니다. 유닛 추가·제거, 별 상승, 아이템 추가(동일 아이템의 추가 복사본 포함), 레벨 변화, HP 감소를 표시합니다. 첫 라운드는 `Replay started`, 변화가 없으면 `No significant changes.`입니다. 단순 골드 등락이나 위치 변경은 목록을 길게 만들지 않도록 생략합니다.

향후 연결 지점은 `src/data/mockReplay.js`에서 제공하는 replay.rounds입니다. 실제 GEP 수집기는 **지원되는 자기 플레이어 이벤트**를 누적해 위 전체 상태를 만든 뒤 `gepAdapter.js`에 넘깁니다. 수집 이벤트의 파싱·단위·좌표 변환, 안정적인 인스턴스 ID, 누락 데이터 처리, 저장과 실제 경기 연결은 그때 구현해야 합니다. 현재 어댑터를 공식 raw 이벤트에 바로 연결할 수 있다는 뜻은 아닙니다. 실제 기록은 `source: 'gep'`로 구분하고 게임 종료 후 복기에만 사용합니다.

배포 시 BrowserRouter의 직접 경로 접근을 위해 호스팅에서 모든 앱 경로를 index.html로 보내는 SPA fallback 설정이 필요합니다.

## 이 환경에서의 검증

- `npm test`: 11개 테스트 통과. 기존 Riot 프록시 및 데이터 변환 검사 포함.
- `npm run build`: 성공.
- 실제 Riot ID 검색 → 10개 경기 표시 → Match Detail → Mock Replay 진입 확인.
- 라운드 이동에 따른 보드·대기석 슬롯·HP·Gold·Level 변경, Changes 자동 생성, 뒤로 이동 후 동일 Changes 유지 확인.
- Data Sources 열기, Close 및 Esc 닫기, 자동 재생의 마지막 라운드 정지 확인. 브라우저 콘솔 오류 없음.
- `npm start`: OW-Electron 런타임과 main process까지 실행 확인. 이 자동화 환경에서는 Overwolf crashpad 연결 제한으로 창 프로세스가 종료되어 화면 자동 검증은 할 수 없었습니다. 일반 Windows 데스크톱에서는 `npm start`가 앱 창을 엽니다.
- `npm run package`: renderer build와 OW-Electron Windows unpacked 단계까지 완료했습니다. 공식 builder는 `OW_CLI_EMAIL`, `OW_CLI_API_KEY`, `OW_BUILD_KEY`가 없으면 GEP package가 포함된 배포판의 서명을 의도적으로 중단합니다. Overwolf Console credential 및 코드 서명 인증서를 설정한 뒤 같은 명령으로 NSIS installer를 생성할 수 있습니다.
- npm run dev는 Vite 시작 후 이 실행 환경의 상위 사용자 폴더 읽기 제한으로 의존성 사전 번들링이 실패했습니다. 개발 서버의 정상 동작은 이 환경에서 확인하지 못했습니다. 일반 로컬 터미널에서 실행하거나, 검증된 빌드 미리보기(`npm run preview`)를 사용할 수 있습니다.
- Vite 설정은 runner 방식으로 읽습니다. 재빌드 시 폴더 삭제 제한을 피하도록 emptyOutDir를 false로 설정했습니다. 배포용 파일을 준비할 때는 이전 dist의 오래된 파일을 정리하세요.

## 이번 심사용 프로토타입 보완 파일

수정: `src/App.jsx`, `src/data/matches.js`, `src/data/mockReplay.js`, `src/components/Board.jsx`, `src/components/ReplayPanels.jsx`, `tests/data.test.js`, `README.md`.

신규: `src/services/gepAdapter.js`, `src/utils/replayDiff.js`, `src/components/DataSources.jsx`, `src/components/dataSources.css`, `tests/replay.test.js`.

기존 Riot API 서비스·프록시·검색 hook·정적 데이터 매퍼·라우팅 경로는 변경하지 않았습니다. 신규 의존성도 추가하지 않았습니다.
