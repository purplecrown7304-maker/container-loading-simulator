# Production Deployment

## 1. v2.5.0 Release gate

Production 배포 전에 반드시 `PREDEPLOY_V2_5.md`를 완료하고 자동 검증 성공 기록을 남깁니다.

필수 명령:

```bash
npm install
npm audit --audit-level=high
npm run verify:predeploy
npx playwright install chromium
npm run test:e2e
```

브라우저 환경까지 준비된 경우 다음 명령으로 한 번에 실행할 수 있습니다.

```bash
npm run verify:full
```

`verify:predeploy` 필수 통과 항목:

- Vitest 전체 회귀 테스트
- TypeScript strict 검사
- Vite production build
- 초기 JS 번들 예산 검사

추가 필수 조건:

- DIRECT BOX / PALLET 최종 관성 인증 게이트 수동 확인
- 작업지시서 및 Excel 출력 수량 일치 확인
- 모바일 390px 전후 가로 overflow 없음
- PR이 최신 `main` 기준 mergeable 상태
- blocking review/thread 없음

> **실제 자동 검증 성공 기록이 없으면 main 병합 및 Production 배포를 진행하지 않습니다.**

## 2. 2026년 8월 CI 운영

GitHub Actions Billing 제한 때문에 2026년 8월 `.github/workflows/ci.yml`은 `workflow_dispatch` 수동 실행 전용입니다.

수동 CI는 다음 순서로 실행합니다.

1. 의존성 설치
2. 설치 버전 기록
3. `npm audit --audit-level=high`
4. `npm run verify:predeploy`
5. Chromium 설치
6. Playwright smoke test
7. `container-loading-simulator-v2.5.0-dist` 아티팩트 업로드

2026년 9월 Actions 사용이 가능해지면 `push` / `pull_request` 자동 트리거를 복구합니다.

## 3. Vercel 배포

저장소 루트의 `vercel.json` 설정을 사용합니다.

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- SPA fallback: 앱 경로를 `index.html`로 rewrite
- `/assets/*`: 장기 immutable cache
- `/index.html`: 즉시 재검증 cache

권장 운영:

- `main` → Production
- feature/PR branch → Preview

현재 계정에서 `build-rate-limit`가 발생한 경우 코드를 실패로 단정하지 말고 외부 배포 제한으로 기록합니다. 단, rate limit이 해소되고 실제 Production build가 가능한 상태를 확인하기 전에는 릴리스를 완료 처리하지 않습니다.

## 4. 배포 직전 체크

- [ ] `PREDEPLOY_V2_5.md` 완료
- [ ] `npm audit --audit-level=high` 성공
- [ ] `npm run verify:predeploy` 성공
- [ ] `npm run test:e2e` 성공
- [ ] PR head SHA 기록
- [ ] 직전 정상 Production SHA/Deployment 기록
- [ ] Vercel build-rate-limit 해소 확인
- [ ] Production용 환경변수 누락 없음

## 5. 배포 후 smoke test

1. 첫 화면 정상 표시
2. 샘플 데이터 복원
3. DIRECT BOX 자동 적재
4. 결과 보기 전에 관성 인증 게이트가 열리는지 확인
5. 관성 3종 PASS 후에만 결과가 열리는지 확인
6. PALLET 모드 전환 및 자동 적재
7. 팔레트 관성 인증에서 전체 이동 / 화물 상대 미끄럼 / 팔레트 상대 이동 / 기울기 확인
8. 3D 보조자재 시각화 확인
9. 박스 작업지시서 출력 확인
10. 팔레트 작업지시서 P/C/단수 및 결속 순서 확인
11. Excel 내보내기와 `보조자재`, `관성보강이력`, `관성안전지표`, 팔레트 `팔레트별결속` 시트 확인
12. 저장/불러오기 확인
13. 모바일 390px 전후에서 가로 스크롤 및 버튼 잘림 확인
14. 적재안을 수정한 뒤 기존 관성 PASS가 재사용되지 않는지 확인

## 6. 실제 현장 적용 전 별도 검증

시뮬레이터의 기하학적 적재 가능 여부와 내부 관성 PASS는 실제 운송 안전 인증과 동일하지 않습니다. 아래 항목은 회사/제품별 실측값과 현장 기준으로 별도 검증합니다.

- 박스 압축강도 및 습도·보관기간에 따른 강도 저하
- 팔레트 규격, 파손 상태 및 허용하중
- 컨테이너 바닥 집중하중
- 차량/컨테이너 축중 및 운송사 제한
- 밴딩·각대·랩핑·미끄럼방지재·블로킹재·고정바 규격과 정격
- 문 개방 시 화물 전도 방지
- 작업자의 인체공학적 취급 높이와 작업 절차

## 7. 롤백

Vercel에서는 직전 정상 Deployment를 Promote/rollback 기준으로 사용합니다. 기타 정적 호스팅에서는 직전 성공 CI의 `container-loading-simulator-v2.5.0-dist` 아티팩트로 되돌립니다.

Production 배포 전에 반드시 직전 정상 commit SHA를 기록합니다. 이상 발생 시 기능별 핫픽스를 Production에서 직접 누적하지 말고 Git 커밋 단위로 롤백 또는 수정 PR을 생성합니다.
