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

## 현재 검증 상태

- 코드/테스트/architecture guard 작성: 완료
- GitHub Draft PR 구성: 완료
- `npm run verify:predeploy` 실제 실행: 미실행
- `npm run test:e2e` 실제 실행: 미실행
- `main` 병합: 미실행
- Vercel 프로덕션 배포: 미실행

현재 연결 환경에서는 GitHub 저장소를 로컬 clone할 네트워크가 없고 GitHub Actions workflow도 수동 실행 전용이므로, 실제 명령을 실행하지 않은 상태에서 통과했다고 간주하지 않습니다.

## 릴리스 규칙

1. 테스트가 실패하면 배포하지 않습니다.
2. 테스트를 통과한 정확한 commit SHA를 배포 대상으로 고정합니다.
3. 배포 직전 `main`과의 차이를 다시 확인합니다.
4. 배포 후에는 새 기능을 바로 추가하지 않고 로그인/데이터 동기화/제품 선택/포장/적재 방식/자동 적재/결과/작업지시서 순서로 smoke test를 먼저 수행합니다.
5. 기존 브라우저 데이터는 Supabase migration이 실제 실행되어 서버 저장을 확인하기 전 임의 삭제하지 않습니다.
