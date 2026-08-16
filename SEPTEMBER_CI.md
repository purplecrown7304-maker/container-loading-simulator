# September CI Reactivation

2026년 8월에는 GitHub Actions Billing 제한 때문에 워크플로를 수동 실행 전용으로 유지한다.

## 9월 재활성화 절차
1. GitHub Billing & plans에서 Actions 사용 가능 상태 확인
2. `.github/workflows/ci.yml`의 `on:`에 다음을 복원

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:
```

3. main 브랜치에 문서 전용 커밋 1건 push
4. CI에서 아래 단계가 모두 Green인지 확인
   - Install dependencies
   - Record dependency versions
   - Security audit
   - Run engine tests
   - Build
   - Check initial bundle budget
   - Install Chromium for E2E
   - Run browser smoke tests
   - Upload production build
5. 실패 시 코드 문제와 Billing/runner 문제를 구분해서 처리
6. 최초 완전 Green 커밋 SHA와 dist artifact ID를 Notion 개발일지에 기록

## 현재 준비된 자동 검증
- 엔진 회귀 테스트
- 작업지시서 HTML 안전/출력 테스트
- Playwright 데스크톱 Chromium smoke test
- Playwright Pixel 7 모바일 smoke test
- npm high 이상 취약점 감사
- TypeScript + Vite production build
- 초기 JS 800 KiB 상한
- production `dist` artifact 생성

## 운영 원칙
9월 CI 재가동 전까지는 GitHub Actions 실패 여부를 개발 완료 조건으로 사용하지 않는다. 대신 코드 변경 시 테스트 파일과 MANUAL_QA.md를 함께 갱신한다.
