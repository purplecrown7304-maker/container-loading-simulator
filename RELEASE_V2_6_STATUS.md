# v2.6.0 Release Status

기준일: 2026-08-27

## 현재 상태

- 엔진 기능 개발: 완료 단계
- DIRECT BOX 핵심 규칙 회귀 테스트: 반영
- PALLET 핵심 규칙 회귀 테스트: 반영
- 입력 사전검증 / Excel 입력 안전 규칙: 반영
- 최종 관성 PASS ↔ 작업지시서/Excel 정합성 잠금: 반영
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

## 최종 승인 체인 잠금

- 최종 작업지시서/Excel은 일반 Rapier 후보 점수가 아니라 현재 적재안의 관성 3종 PASS만 인정한다.
- 인증 서명 모델을 `restraint-v4-certified-export`로 올렸다.
- 서명은 컨테이너/좌표/팔레트 지지체/보조자재 설정뿐 아니라 SKU명·규격·중량·수량·적층 제한·상부 허용중량·회전정책·하역순서·미적재 정보까지 묶는다.
- `maxTopLoadKg=0`과 `undefined(제한 없음)`은 서로 다른 인증 조건이다.
- PalletSnapshot이 현재 PhysicsTarget의 인증 서명으로 재구성되지 않으면 기존 PASS를 폐기한다.
- 팔레트 출력 좌표가 인증된 배치와 다른 상태에서 작업지시서/Excel로 이어지는 것을 차단한다.

## 입력 안전 보강

- 엔진 공통 preflight에서 잘못된 치수·중량·수량·적층조건을 fail-closed 처리한다.
- 동일 SKU의 동일 규격 행은 수량 합산, 상충 규격 행은 전체 거절한다.
- Excel 입력도 0kg 박스, 소수 수량, 소수 적층단/하역순서를 거절한다.
- Excel의 상부 허용중량 `0kg`을 제한 없음으로 바꾸지 않고 그대로 보존한다.
- 수량 `0`은 비활성 SKU로 유지한다.

## Production 승인 전에 반드시 통과할 명령

```bash
npm install
npm audit --audit-level=high
npm run verify:predeploy
npx playwright install chromium
npm run test:e2e
```

현재 환경에서는 위 명령의 성공 기록을 확보하지 못했으므로 테스트 통과로 표시하지 않는다.

## 추가 현장 검증

- 실제 현장 박스 데이터 20종 이상
- 실제 40ft 적재 사례 3건 이상 비교
- DIRECT BOX / PALLET 각각 3D 육안 검토
- 모바일 390x844에서 주요 버튼/가로 스크롤 확인
- 관성 인증 PASS 후 작업지시서/Excel 좌표·수량·보조자재 일치 확인

## 주의

관성 시뮬레이션과 자동 적재 결과는 내부 계획/비교 도구이며 실제 운송 안전 인증을 대체하지 않는다.
