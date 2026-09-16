# CSS Architecture and UX Ownership

이 문서는 UX/UI 개선 과정에서 스타일 규칙이 여러 파일에 겹쳐 쌓이면서 다시 레이아웃 충돌이 생기는 것을 막기 위한 유지보수 기준입니다.

## 1. 기본 원칙

- 기능 스타일은 가능한 한 해당 기능의 CSS 파일이 소유합니다.
- `ux-review-improvements.css`, `ux-review-phase2.css`는 현재 UX 개선 이행을 위한 임시 정리 계층입니다.
- 새로운 UX 전용 override CSS 파일을 추가하지 않습니다.
- 새 규칙이 안정화되면 해당 기능 CSS로 이동하고 review CSS 규칙은 줄입니다.
- 적재 알고리즘, 물리 검증, Supabase 상태 모델을 CSS 수정과 섞지 않습니다.

## 2. 스타일 소유권

### 전역 토큰
- `src/tokens.css`
- 폰트 크기, 공통 색상, 컨트롤 높이, z-index 계층의 기준입니다.
- 10px 미만 신규 폰트는 금지합니다.

### 가이드 작업 흐름
- `src/guided-workflow.css`
- `src/guided-workflow-v2.css`
- `src/guided-loading-strategy.css`
- `src/guided-loading-unit.css`
- `src/guided-result-tabs-enhancer.css`

단계 표시, 제품 선택, 제품 포장, 적재 방식, 자동 적재, 결과 확인의 기본 스타일은 이 그룹이 소유합니다.

### 3D 뷰어
- `src/reference-viewer.css`
- 뷰어 조작 버튼, 선택 정보, 간격 표시, 오버레이 위치를 소유합니다.
- 같은 모서리에 두 개 이상의 독립 오버레이를 배치하지 않습니다.

### 적재공간 선택
- `src/transport-equipment.css`
- `src/transport-equipment-selection-ux.css`
- `src/transport-equipment-scroll-fix.css`

적재공간 카드, 선택 모달, 경고, 모바일 탐색을 소유합니다.

### 박스/차량/안전점검 도구
- `src/workspace-tools.css`
- 모달은 `고정된 외곽 크기 + 내부 본문 스크롤`을 기본으로 합니다.

### UX Review 이행 계층
- `src/ux-review-improvements.css`
- `src/ux-review-phase2.css`

현재 보고서 기반 개선을 안전하게 적용하기 위한 마지막 보정 계층입니다.
새로운 세 번째 review CSS를 만들지 않습니다.

## 3. !important 규칙

기존 코드에 남은 `!important`는 한 번에 제거하지 않습니다. 기존 가이드 단계 표시와 뷰어 노출이 load order에 의존하는 부분이 있기 때문입니다.

새로운 규칙은 다음 기준을 따릅니다.

1. `ux-review-phase2.css`에는 새 `!important`를 추가하지 않습니다.
2. 기능 CSS에서 selector 구조로 해결할 수 있으면 `!important`를 사용하지 않습니다.
3. 기존 `!important` 제거는 해당 화면의 데스크톱/태블릿/모바일 회귀 확인과 함께 진행합니다.
4. 단순히 마지막에 더 강한 selector를 하나 더 추가하는 방식으로 문제를 덮지 않습니다.

## 4. 반응형 기준

- Desktop: 1180px 이상
- Tablet: 761~1179px
- Mobile: 760px 이하
- Small mobile: 460px 이하

가이드 작업 단계는 현재 6단계이므로 모바일 step rail도 항상 6개 기준이어야 합니다.

## 5. 접근성 기준

- 일반 보조 텍스트는 최소 11px 토큰을 우선합니다.
- 모바일 주요 버튼/선택 컨트롤은 최소 44px 터치 높이를 사용합니다.
- `:focus-visible` 상태를 제거하지 않습니다.
- 모션이 필수가 아니면 `prefers-reduced-motion`에서 비활성화합니다.

## 6. 구조 정리 순서

다음 순서로 CSS 부채를 줄입니다.

1. review CSS에서 검증된 규칙을 소유 기능 CSS로 이동
2. 중복 selector 제거
3. 실제 JSX/TSX에서 사용되지 않는 구형 selector 확인
4. `styles.css`의 구형 `.workspace` / `.panel` 계열은 전체 저장소 사용 여부를 확인한 뒤 제거
5. 단계 표시를 CSS 강제 display 전환에서 React 상태 기반 렌더링으로 바꾸는 작업은 별도 리팩터링으로 진행

## 7. 자동 검사

`scripts/check-architecture.mjs`가 다음을 검사합니다.

- Bridge 컴포넌트의 React DOM 직접 탐색/조작 금지
- 이미 토큰화한 CSS에 8~10px 폰트 재도입 금지
- UX review CSS의 10px 미만 신규 폰트 금지
- `ux-review-phase2.css`의 신규 `!important` 금지
- review CSS import 순서 고정
- review override 파일을 2개보다 늘리지 않음
- 모바일 6단계 step rail 유지

이 검사는 `npm run verify:predeploy`의 기존 architecture check에 포함됩니다.
