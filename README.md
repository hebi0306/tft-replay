# TFT Replay · Windows

TFT 경기 화면을 자동으로 기록하고 라운드별로 복기하는 Windows x64 데스크톱 앱입니다. 경기와 설정은 사용자 PC에 저장됩니다. 이 배포판은 로컬 기록을 사용하며 Riot 전적 조회와 계정 감지 기능을 제외합니다. 팀 빌더와 일부 아이콘은 공개 정적 데이터에서 이미지를 가져올 수 있습니다.

## 개발 PC에서 실행

Node.js 22.12 이상과 Python 3.12 x64를 준비한 뒤 프로젝트 루트에서 실행합니다.

```powershell
npm ci
npm run capture:setup
npm run release:verify
npm test
npm run capture:test
npm start
```

## Windows 배포

`npm run package`는 Python 워커, OCR·ONNX 모델, 참조 자료를 묶고 `release/`에 NSIS 설치 파일을 생성합니다. 설치한 PC에는 Node.js와 Python을 별도로 설치할 필요가 없습니다. 서명되지 않은 설치 파일은 Windows에서 경고가 표시될 수 있습니다.

GitHub 저장소에서 `.github/workflows/windows.yml`은 PR과 푸시 때 테스트를 실행합니다. 배포할 커밋에 버전 태그를 푸시하면 빌드와 패키지 자체 검사를 거쳐 GitHub Releases에 설치 파일이 올라갑니다.

```powershell
git tag v1.0.0
git push origin v1.0.0
```

Git 저장소로 올릴 때는 `capture/models/`의 두 ONNX 파일과 `capture/data/`의 카탈로그·인식 참조 자료를 함께 포함합니다. 모델을 바꿀 때는 `capture/models/release-sha256.json`도 갱신합니다. 공개 릴리스 전에 [보조 모델 라이선스](capture/models/champion-identity-LICENSE.md)와 학습 모델·참조 자료의 재배포 조건을 확인하세요. 사용자 기록과 환경변수 파일은 배포에 포함되지 않습니다.

[캡처 설정과 사용 방법](capture/README.md)
