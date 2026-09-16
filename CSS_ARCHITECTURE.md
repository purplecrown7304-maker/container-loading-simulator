# CSS Architecture and UX Ownership

이 문서는 UX/UI 개선 과정에서 스타일 규칙이 여러 파일에 겹쳐 쌓이면서 다시 레이아웃 충돌이 생기는 것을 막기 위한 유지보수 기준입니다.

## 1. 기본 원칙

- 기능 스타일은 가능한 한 해당 기능의 CSS 파일이 소유합니다.
- 임시 `ux-review-*.css` 계층은 소유권 이전을 완료했으므로 제거했습니다.
- 새로운 UX 전용 override CSS 파일을 추가하지 않습니다.
- 새 UX 규칙은 처음부터 해당 기능 CSS 또는 공용 토큰에 넣습니다.
- 적재 알고리즘, 물리 검증, Supabase 상태 모델을 CSS 수정과 섞지 않습니다.
- 단계에 따라 컴포넌트를 보여주거나 숨기는 판단은 CSS가 아니라 React 상태/렌더링이 소유합니다.

## 2. 스타일 소유권

### 전역 토큰
- `src/tokens.css`
- 폰트 크기, 공통 색상, 컨트롤 높이, z-index 계층의 기준입니다.
- 보조 텍스트는 `--font-2xs`(11px)보다 작게 만들지 않습니다.

### 가이드 작업 흐름
- `src/guided-workflow.css`
- `src/guided-workflow-v2.css`
- `src/guided-loading-strategy.css`
- `src/guided-loading-unit.css`
- `src/guided-result-tabs-enhancer.css`
- `src/guidedWorkflowState.ts`

단계 표시, 제품 선택, 제품 포장, 적재 방식, 자동 적재, 결과 확인의 기본 스타일과 단계 상태를 이 그룹이 소유합니다.

세부 소유권:
- 전체 가이드 shell 비율, 모바일 6단계 rail, 키보드 focus, 하단 CTA, 제품 검색 결과 스크롤/고정 헤더: `guided-workflow-v2.css`
- 적재 전략 카드/전략 반응형/모션 감소: `guided-loading-strategy.css`
- 박스·파렛트 적재 유형 카드/자동 적재 상태 배지: `guided-loading-unit.css`
- 결과 탭, 핵심 결과 지표, 미적재 목록 스크롤, 결과 반응형: `guided-result-tabs-enhancer.css`
- 가이드 활성 여부/현재 단계/3D Viewer 렌더 정책과 DOM 호환 미러: `guidedWorkflowState.ts`
- 실제 단계 발행: `GuidedWorkflowShell.tsx`
- 실제 대시보드 3D Viewer mount/unmount: `App.tsx`

`GuidedWorkflowShell`은 현재 단계를 `publishGuidedWorkflowState()`로 직접 발행합니다. `guidedWorkflowState.ts`가 `data-guided-workflow` / `data-guided-step`을 호환용 DOM 미러로 갱신하므로 개별 컴포넌트가 dataset을 직접 쓰지 않습니다.

### 박스 / 파렛트 기본 모드
- `src/mode.css`
- `.mode-tabs`와 기본 박스/파렛트 모드 선택 표현을 소유합니다.

### 3D 뷰어
- `src/reference-viewer.css`
- 뷰어 조작 버튼, 선택 정보, 간격 표시, 오버레이 위치를 소유합니다.
- 같은 모서리에 두 개 이상의 독립 오버레이를 배치하지 않습니다.
- 가이드 단계에서 Viewer를 표시할지 여부는 이 CSS가 결정하지 않습니다.

### 적재공간 선택
- `src/transport-equipment.css`
- `src/transport-equipment-selection-ux.css`

적재공간 카드, 선택 모달, 내부 스크롤, 경고, 모바일 탐색을 소유합니다.
`transport-equipment-scroll-fix.css`는 통합 후 제거되었으며 다시 만들지 않습니다.

### 박스/차량/안전점검 도구
- `src/workspace-tools.css`
- 모달은 `고정된 외곽 크기 + 내부 본문 스크롤`을 기본으로 합니다.

## 3. !important 규칙

기존 코드에 남은 `!important`는 한 번에 제거하지 않습니다. 기존 헤더/레이아웃 일부가 load order에 의존하는 부분이 있기 때문입니다.

새로운 규칙은 다음 기준을 따릅니다.

1. 기능 CSS에서 selector 구조로 해결할 수 있으면 `!important`를 사용하지 않습니다.
2. 기존 `!important` 제거는 해당 화면의 데스크톱/태블릿/모바일 회귀 확인과 함께 진행합니다.
3. 단순히 마지막에 더 강한 selector를 하나 더 추가하는 방식으로 문제를 덮지 않습니다.
4. `data-guided-step`에 따라 `.viewer-card` 또는 `.guided-stage-panel`을 `display:none/block!important`로 전환하지 않습니다.
5. 현재 단계는 React 렌더링으로 결정하고 CSS는 배치/표현만 담당합니다.

## 4. 반응형 기준

- Desktop: 1180px 이상
- Tablet: 761~1179px
- Mobile: 760px 이하
- Small mobile: 460px 이하

가이드 작업 단계는 현재 6단계이므로 모바일 step rail도 항상 6개 기준이어야 합니다.
적재공간 모달과 가이드 UI도 760px 기준을 공유합니다.

## 5. 접근성 기준

- 일반 보조 텍스트는 최소 `--font-2xs`(11px)를 사용합니다.
- 모바일 주요 버튼/선택 컨트롤은 최소 44px 터치 높이를 사용합니다.
- 작은 보조 버튼도 가능한 경우 `--control-height-sm`(32px) 이상을 확보합니다.
- `:focus-visible` 상태를 제거하지 않습니다.
- 모션이 필수가 아니면 `prefers-reduced-motion`에서 비활성화합니다.

## 6. 구조 정리 순서

완료한 단계:

1. 3D Viewer, Workspace, 적재공간 선택의 임시 override를 기능 CSS로 이동
2. 제품 목록, mode tabs, 모바일 6단계 rail, 적재 유형/전략 규칙을 기능 CSS로 이동
3. 가이드 shell, 결과 핵심 지표, 결과 목록, 하단 CTA 규칙을 기능 CSS로 이동
4. `ux-review-improvements.css`, `ux-review-phase2.css`와 import 제거
5. 현재 `App.tsx` 렌더 구조를 점검해 구형 `.workspace` / `.panel` wrapper를 더 이상 사용하지 않는 것을 확인
6. `.workspace`, `.panel`, `.left-panel`, `.right-panel` 재도입을 architecture check에서 차단
7. `styles.css`의 구형 workspace/panel 규칙과 관련 반응형 잔재 제거
8. `styles.css`의 10px 보조 텍스트를 `--font-2xs`(11px)로 올리고 inspector 보조 버튼에 32px 최소 높이 적용
9. 중앙 `guidedWorkflowState.ts` 추가, `GuidedLoadingUnitEnhancer`의 독립 단계 MutationObserver 제거
10. `App.tsx`가 중앙 상태를 구독해 3D Viewer를 가이드 자동 적재 5단계에서만 React로 mount
11. 단계별 Viewer/Stage `display:none/block!important` 전환 제거
12. 제품/포장 보조 텍스트를 최소 11px로 통일
13. `GuidedWorkflowShell`이 `publishGuidedWorkflowState()`로 현재 단계를 직접 발행하고 unmount 시 상태를 종료하도록 전환
14. Shell의 `document.documentElement.dataset.guided*` 직접 쓰기를 제거하고 architecture check로 재도입 차단

다음 단계:

1. `GuidedLoadingUnitEnhancer`의 적재 유형 선택 UI를 body portal + 좌표 측정 방식에서 `LoadingStrategyStage` 내부 React 구성으로 이동
2. 적재 유형 상태도 DOM의 `.mode-tabs` 클릭 프록시 대신 명시적 React 상태/이벤트 경계로 이전
3. `guidedWorkflowState.ts`의 dataset MutationObserver를 제거하고 DOM dataset을 완전한 출력 미러로 축소
4. 남은 중복 `!important`와 상충 반응형 규칙을 단계적으로 축소

## 7. 자동 검사

`scripts/check-architecture.mjs`가 다음을 검사합니다.

- Bridge 컴포넌트의 React DOM 직접 탐색/조작 금지
- `GuidedWorkflowShell`이 중앙 상태를 직접 발행하고 dataset을 직접 쓰지 않음
- `GuidedLoadingUnitEnhancer`가 중앙 가이드 상태를 사용
- `App.tsx`가 `shouldRenderGuidedViewer()` 정책으로 Viewer를 렌더링
- `data-guided-step` CSS가 `.viewer-card` / `.guided-stage-panel` display를 다시 제어하지 않음
- 토큰화 CSS에 8~10px 폰트 재도입 금지
- 삭제된 임시/구형 CSS와 selector 재도입 금지
- 모바일 6단계 step rail, 제품 목록 bounded scroll, 44px CTA 유지
- 미적재 목록 bounded scroll과 핵심 결과 3개 지표 강조 유지

이 검사는 `npm run verify:predeploy`의 기존 architecture check에 포함됩니다.
