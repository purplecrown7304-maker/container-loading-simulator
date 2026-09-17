# CSS Architecture and UX Ownership

이 문서는 UX/UI 개선 과정에서 스타일 규칙이 여러 파일에 겹쳐 쌓이면서 다시 레이아웃 충돌이 생기는 것을 막기 위한 유지보수 기준입니다.

## 1. 기본 원칙

- 기능 스타일은 가능한 한 해당 기능의 CSS 파일이 소유합니다.
- 임시 `ux-review-*.css` 계층은 소유권 이전을 완료했으므로 제거했습니다.
- 새로운 UX 전용 override CSS 파일을 추가하지 않습니다.
- 새 UX 규칙은 처음부터 해당 기능 CSS 또는 공용 토큰에 넣습니다.
- 적재 알고리즘, 물리 검증, Supabase 상태 모델을 CSS 수정과 섞지 않습니다.
- 단계에 따라 컴포넌트를 보여주거나 숨기는 판단은 CSS가 아니라 React 상태/렌더링이 소유합니다.
- 데이터가 없는 UI를 그럴듯하게 보이게 하기 위해 안전 판정이나 적재 결과를 임의로 생성하지 않습니다.

## 2. 스타일 및 상태 소유권

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
- `src/guidedLoadingUnitState.ts`

단계 표시, 제품 선택, 제품 포장, 적재 방식, 자동 적재, 결과 확인의 기본 스타일과 단계 상태를 이 그룹이 소유합니다.

세부 소유권:
- 전체 가이드 shell 비율, 모바일 6단계 rail, 키보드 focus, 하단 CTA, 제품 검색 결과 스크롤/고정 헤더: `guided-workflow-v2.css`
- 적재 전략 카드/전략 반응형/모션 감소: `guided-loading-strategy.css`
- 박스·파렛트 적재 유형 카드/자동 적재 실행 설정 확인: `guided-loading-unit.css`
- 적재 유형의 실제 상태 원본: `guidedLoadingUnitState.ts`
- 결과 탭, 핵심 결과 지표, 미적재 목록 스크롤, 결과 반응형: `guided-result-tabs-enhancer.css`
- 가이드 활성 여부/현재 단계/3D Viewer 렌더 정책과 DOM 호환 미러: `guidedWorkflowState.ts`
- 실제 단계 발행: `GuidedWorkflowShell.tsx`
- 실제 대시보드 3D Viewer mount/unmount와 적재 유형 적용: `App.tsx`

`GuidedWorkflowShell`은 현재 단계를 `publishGuidedWorkflowState()`로 발행합니다. `guidedWorkflowState.ts`의 외부 store가 상태 원본이며 `data-guided-workflow` / `data-guided-step`은 기존 CSS 호환을 위한 출력 미러일 뿐입니다. DOM attribute를 관찰해 React 상태를 역산하지 않습니다.

적재 유형도 `guidedLoadingUnitState.ts`의 외부 store가 원본입니다. `GuidedLoadingUnitEnhancer`는 숨겨진 `.mode-tabs` 버튼을 클릭해 App 상태를 우회하지 않고, `App.tsx`가 같은 store를 구독해 `boxes` / `pallets` 모드를 직접 적용합니다.

### 자동 적재 진행 표시
- `src/loading-progress.css`
- `src/App.tsx`

DIRECT BOX 자동 적재 중 후보 계산과 Rapier 물리검증 진행률을 원형 게이지로 표시하고, 관측된 경과시간/진행률로 남은 시간을 추정합니다. ETA는 확정 시간이 아니라 진행 중 갱신되는 추정값으로만 표시합니다.

5단계 진입 전에는 `guided-loading-unit.css`의 실행 설정 확인 바에서 `적재 유형 + 적재 전략 + 선택 제품 수량`을 보여 줍니다.

### 박스 / 파렛트 기본 모드
- `src/mode.css`
- 일반 대시보드의 `.mode-tabs` 표현을 소유합니다.
- 가이드 적재 유형 상태의 원본으로 사용하지 않습니다.

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
- 진행 상태는 색만으로 전달하지 않고 퍼센트/문구를 함께 표시합니다.

## 6. 완료된 구조 정리

1. 3D Viewer, Workspace, 적재공간 선택의 임시 override를 기능 CSS로 이동
2. 제품 목록, mode tabs, 모바일 6단계 rail, 적재 유형/전략 규칙을 기능 CSS로 이동
3. 가이드 shell, 결과 핵심 지표, 결과 목록, 하단 CTA 규칙을 기능 CSS로 이동
4. `ux-review-improvements.css`, `ux-review-phase2.css`와 import 제거
5. 구형 `.workspace` / `.panel` wrapper 및 관련 CSS 제거와 재도입 방지
6. `styles.css`의 초소형 보조 텍스트를 최소 11px 토큰으로 통일
7. 중앙 `guidedWorkflowState.ts` 추가 후 DOM observer 기반 단계 역산 제거
8. `App.tsx`가 중앙 상태를 구독해 3D Viewer를 가이드 자동 적재 5단계에서만 React로 mount
9. 단계별 Viewer/Stage `display:none/block!important` 전환 제거
10. `GuidedWorkflowShell`이 `publishGuidedWorkflowState()`로 현재 단계를 직접 발행
11. 적재 유형을 `guidedLoadingUnitState.ts`로 분리하고 `App.tsx`가 직접 구독
12. `GuidedLoadingUnitEnhancer`의 숨겨진 `.mode-tabs` 클릭 프록시와 화면 좌표/스크롤 추적 제거
13. 적재 유형 선택 UI를 전략 단계의 정상 문서 흐름 안으로 이동
14. 팔레트 3D Viewer unmount 뒤에도 결과 snapshot store를 통해 결과 단계가 데이터를 유지하도록 보완
15. `uiEvents.ts`가 `data-guided-step` 대신 중앙 workflow state로 5단계 자동 적재 동기화를 판단하도록 수정
16. DIRECT BOX 자동 적재에 원형 진행 게이지와 ETA 추정 표시 추가
17. 가이드 적재 유형/Viewer 정책에 단위 테스트와 architecture guard 추가

## 7. 자동 검사

`scripts/check-architecture.mjs`가 다음을 검사합니다.

- Bridge 컴포넌트의 React DOM 직접 탐색/조작 금지
- `GuidedWorkflowShell`이 중앙 상태를 직접 발행하고 dataset을 직접 쓰지 않음
- `guidedWorkflowState.ts`가 DOM MutationObserver를 다시 사용하지 않음
- `GuidedLoadingUnitEnhancer`가 중앙 가이드/적재유형 상태를 사용
- 적재 유형 enhancer가 `.mode-tabs` DOM 클릭 프록시를 다시 만들지 않음
- 화면 좌표를 계속 측정하는 `ResizeObserver/getBoundingClientRect/scroll` 방식 재도입 금지
- `App.tsx`가 `shouldRenderGuidedViewer()` 정책과 `useGuidedLoadingUnit()`을 사용
- `uiEvents.ts`가 DOM dataset 대신 중앙 상태를 사용
- `data-guided-step` CSS가 `.viewer-card` / `.guided-stage-panel` display를 다시 제어하지 않음
- 토큰화 CSS에 8~10px 폰트 재도입 금지
- 삭제된 임시/구형 CSS와 selector 재도입 금지
- 모바일 6단계 step rail, 제품 목록 bounded scroll, 44px CTA 유지
- 자동 적재 원형 진행 게이지와 ETA 피드백 유지
- 미적재 목록 bounded scroll과 핵심 결과 3개 지표 강조 유지

이 검사는 `npm run verify:predeploy`의 architecture check에 포함됩니다.

## 8. 배포 직전 필수 게이트

코드 정리가 끝났더라도 아래 명령을 실행해 모두 통과하기 전에는 배포하지 않습니다.

```bash
npm run verify:predeploy
npm run test:e2e
```

`verify:predeploy`는 단위 테스트, TypeScript typecheck, architecture check, production build, bundle-size check를 순서대로 실행합니다. E2E까지 통과한 커밋만 배포 후보로 취급합니다.
