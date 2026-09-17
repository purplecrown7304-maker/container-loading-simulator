# Pre-deploy status

이 문서는 `ux/review-improvements-20260916` 브랜치가 프로덕션 배포 직전까지 준비되었는지 판단하는 릴리스 게이트입니다.

## 현재 범위

- UX/UI 분석 보고서 기반 레이아웃/가독성/모바일 사용성 개선
- 제품 선택/포장 내부 스크롤과 고정형 작업 표면
- 적재 방식 선택과 자동 적재 실행 설정 요약
- React 상태 기반 가이드 단계/3D Viewer 전환
- 박스/파렛트 가이드 적재 유형 중앙 상태
- 자동 적재 원형 진행 게이지와 ETA 추정
- 결과 핵심 수치 우선 노출과 미적재 목록 bounded scroll
- CSS 소유권 정리 및 임시 override 제거
- Supabase 영구 저장 구조는 기존 main의 정책을 그대로 유지

## 의도적으로 변경하지 않은 것

- DIRECT BOX / PALLET 적재 알고리즘
- 충돌, 지지율, 최대 적층단, 상부 허용중량, 최대 적재중량 등 하드 안전 제약
- 물리/관성 판정 임계값
- Supabase 데이터 모델과 인증 정책
- 프로덕션 배포 설정

## 자동 회귀 방지

`scripts/check-architecture.mjs`에서 다음 퇴행을 차단합니다.

- 삭제된 임시 UX CSS 및 구형 workspace/panel 레이아웃 복원
- Bridge 컴포넌트의 React DOM 탐색/조작
- 가이드 단계 상태를 DOM MutationObserver로 역산하는 구조
- 단계별 Viewer/Stage 표시를 CSS `display:none/block!important`로 다시 전환
- 적재 유형을 숨겨진 `.mode-tabs` 클릭으로 프록시하는 구조
- 자동 적재 진행 게이지/ETA 표시 제거
- 관련 CSS에 8~10px 초소형 폰트 재도입
- 모바일 6단계 rail, 44px CTA, 제품/미적재 목록 bounded scroll 퇴행

## 배포 승인 조건

아래 두 명령이 동일 커밋에서 모두 성공해야 합니다.

```bash
npm run verify:predeploy
npm run test:e2e
```

`npm run verify:predeploy` 포함 항목:

1. `vitest run`
2. TypeScript `tsc --noEmit`
3. architecture check
4. Vite production build
5. bundle-size check

`npm run test:e2e`는 Playwright 전체 E2E입니다.

## CI 준비

`.github/workflows/ci.yml`은 2026-09 릴리스 후보 검증 기준으로 정리했습니다.

- `pull_request` → `main` 검증 트리거
- 수동 `workflow_dispatch` 유지
- `npm install --legacy-peer-deps --no-fund --no-audit` 사용 (현재 저장소에는 lockfile 없음)
- `npm audit --audit-level=high`
- `npm run verify:predeploy`
- Chromium 설치 후 `npm run test:e2e`
- 성공 시 production `dist` artifact 업로드
- 동일 PR의 오래된 CI는 concurrency로 취소

이 변경은 애플리케이션 프로덕션 배포를 수행하지 않습니다.

## 2026-09-17 배포 전 보완

- `0e7b29d`의 [CI #230](https://github.com/purplecrown7304-maker/container-loading-simulator/actions/runs/35179469330)은 단위 테스트 344개, TypeScript, architecture, production build, bundle-size, 보안 audit을 통과했습니다.
- 해당 CI의 브라우저 테스트는 34개 중 33개 성공, 모바일 장비 선택창 재열기/닫기 1개 실패였습니다. 상단 메뉴가 닫기 버튼의 클릭을 가로챘습니다.
- 장비 선택창 backdrop의 z-index를 기존 workspace dialog와 동일한 5000으로 맞췄습니다. 전역 헤더(3200)와 하단 작업바(3900)보다 앞에서 표시됩니다.
- 실패했던 브라우저 테스트를 제외하거나 강제 클릭으로 우회하지 않고 그대로 유지합니다.
- 수정 후 로컬 `npm run verify:predeploy` 통과: 단위 테스트 344개 / 106개 파일, TypeScript, architecture, production build, bundle-size. `npm audit --audit-level=high`도 통과했습니다.

이 문서의 로컬 결과만으로 병합하지 않습니다. 수정 커밋의 전체 브라우저 테스트를 포함한 최신 CI 결과는 [PR #65](https://github.com/purplecrown7304-maker/container-loading-simulator/pull/65)에서 확인하며, 동일 커밋의 모든 필수 검증이 성공한 뒤 main 병합과 프로덕션 배포를 진행합니다. 최종 배포 결과는 병합 커밋의 Vercel 상태와 운영 사이트에서 확인합니다.

현재 PR의 Vercel 상태가 실패로 보이더라도 target이 `upgradeToPro=build-rate-limit`이면 코드 빌드 실패가 아니라 Vercel build-rate-limit 차단으로 구분합니다.

## 릴리스 규칙

1. 테스트가 실패하면 배포하지 않습니다.
2. 테스트를 통과한 정확한 commit SHA를 배포 대상으로 고정합니다.
3. 배포 직전 `main`과의 차이를 다시 확인합니다.
4. 배포 후에는 새 기능을 바로 추가하지 않고 로그인/데이터 동기화/제품 선택/포장/적재 방식/자동 적재/결과/작업지시서 순서로 smoke test를 먼저 수행합니다.
5. 기존 브라우저 데이터는 Supabase migration이 실제 실행되어 서버 저장을 확인하기 전 임의 삭제하지 않습니다.
6. Vercel quota/rate-limit 상태와 애플리케이션 compile/test 실패를 같은 원인으로 취급하지 않습니다.
