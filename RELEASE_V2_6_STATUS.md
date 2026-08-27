# v2.6.0 Release Status

기준일: 2026-08-27

## 현재 상태

- 엔진 기능 개발: 완료 단계
- DIRECT BOX 핵심 규칙 회귀 테스트: 반영
- PALLET 핵심 규칙 회귀 테스트: 반영
- Vercel buildCommand: `npm run verify:predeploy`로 복구
- Production 배포: 미완료

## 현재 배포 차단 원인

GitHub commit status에서 Vercel이 `build-rate-limit`으로 실패하고 있다.
현재 확인된 실패는 애플리케이션 코드 오류가 아니라 Vercel 빌드 실행 한도에 의한 차단이다.

따라서 진단용으로 축소했던 Vercel typecheck/build 명령은 제거하고, 전체 사전 검증 명령을 다시 사용한다.

```bash
npm run verify:predeploy
```

## v2.6.0에서 잠근 핵심 적재 규칙

### DIRECT BOX

1. SKU별 총 CBM 내림차순
2. 총중량 내림차순
3. 개당중량 내림차순
4. 컨테이너 안쪽부터 동일 SKU 완성 세로 스택 우선
5. 완성 스택을 만들지 못하는 잔량은 순수 SKU 구역에 낮은 더미로 남기지 않음
6. 잔량은 순수 SKU 최종 경계보다 문쪽의 혼합 구역에서만 적재
7. 형상 후처리가 완성 세로 스택을 해체하거나 혼합 화물을 다시 안쪽으로 이동시키지 않음

### PALLET

1. 품목별 총 물량중량 내림차순
2. 총 CBM 내림차순
3. 개당중량 내림차순
4. 1차 적재는 동일 SKU 유지
5. 전체 순수 적재 후에만 consolidation / mixed fallback 수행
6. 새 팔레트 자중 때문에 미적재된 잔량은 기존 팔레트 빈 공간에 안전하게 들어가는 경우 마지막 혼합 단계에서 재검사
7. 팔레트 위 화물 점유영역 중앙정렬
8. 설정된 `maxStackLevels`는 후보 상한으로 사용하되 실제 컨테이너 높이·상부하중·면적지지를 모두 통과해야 다단 적층
9. 각대/랩핑 등 활성 포장재의 예약 중량과 높이를 최대중량/천장 검사에 포함
10. 실제 컨테이너 슬롯이 없는 팔레트는 원점 중복 배치하지 않고 미적재 반환

## Production 승인 전에 반드시 통과할 명령

```bash
npm install
npm audit --audit-level=high
npm run verify:predeploy
npx playwright install chromium
npm run test:e2e
```

## 추가 현장 검증

- 실제 현장 박스 데이터 20종 이상
- 실제 40ft 적재 사례 3건 이상 비교
- DIRECT BOX / PALLET 각각 3D 육안 검토
- 모바일 390x844에서 주요 버튼/가로 스크롤 확인
- 관성 인증 PASS 후 작업지시서/Excel 좌표 일치 확인

## 주의

관성 시뮬레이션과 자동 적재 결과는 내부 계획/비교 도구이며 실제 운송 안전 인증을 대체하지 않는다.
