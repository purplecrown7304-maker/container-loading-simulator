# Load Studio · UX/UI 리디자인

2026-09-22. 기존 물류 적재 시뮬레이터의 웹 UI를 밝고 절제된 디자인으로 정리했습니다.

## 적용 내용

- 밝은 회색 배경, 흰색 카드, 얇은 테두리, 일관된 곡률과 파란 강조색.
- Load Studio 헤더와 SVG 아이콘, 6단계 작업 메뉴, 현재 단계 표시.
- 데스크톱의 단계 메뉴 / 작업 공간 / 작업 요약 3열 구성. 태블릿·모바일에서는 화면 폭에 맞춰 재배치.
- 실제 선택 장비와 규격, 중량, 사용률을 보여주는 요약 카드.
- Unity 캔버스의 시점 버튼, 활성 시점 표시, 높이 단면, 적재 순서 조작 패널.
- 이전 단계 버튼, 선택 제품·수량 유지, 단계 전환 시 스크롤 복원.
- 좁은 작업 공간에서 제품 표를 카드로 전환. 키보드 포커스와 모션 감소 설정 반영.
- 동일 장비 갱신 때 반복되던 변경 알림 제거. 장비 변경 후 결과 상태도 기존 인증 무효화와 동기화.

스타일은 `tokens.css` 및 기존 기능별 CSS에 통합했습니다. 별도의 임시 override 파일은 추가하지 않았습니다. 이번 디자인 작업은 적재 엔진의 안전 제약과 인증 기준을 변경하지 않습니다.

## 실행

Node.js와 pnpm이 있는 환경에서 이 폴더를 열고 실행합니다.

```powershell
pnpm install
pnpm dev --host 127.0.0.1 --port 4173
```

브라우저 주소는 `http://127.0.0.1:4173/`입니다. `start-local.ps1`도 사용할 수 있습니다.
배포용 산출물은 `dist/`에 포함되어 있습니다. 정적 HTTP 서버에서 제공해야 하며, HTML 파일을 직접 더블클릭하는 방식은 지원하지 않습니다.

Unity 실행 파일과 소스는 모두 포함되어 있습니다. Unity 편집·재빌드 방법과 모델 적용 범위는 `UNITY-README.md`에 설명했습니다.

## 검증 범위

Chromium 데스크톱 및 Pixel 7 에뮬레이션으로 제품 선택 → 포장 → 전략 선택 → 자동 적재 → 결과까지 확인했습니다. Unity 시점·높이·재생·박스 선택, 이전 단계의 수량 보존, 모바일 배치, Unity 실패 시 대체 뷰어도 검증했습니다.
실제 iPhone/Safari 기기의 성능·터치 조작 검증은 포함되지 않습니다.

검증 명령:

```powershell
pnpm test
pnpm typecheck
pnpm check:architecture
pnpm build
pnpm check:bundle
pnpm exec playwright test e2e/smoke.spec.ts e2e/unity-viewer.spec.ts e2e/loading-space.spec.ts --workers=1
```

React/TypeScript 코드, Unity 프로젝트, 이미 빌드된 Unity WebGL 파일, 웹 배포 파일을 ZIP에 포함합니다. `node_modules`와 Unity 캐시는 제외합니다.
