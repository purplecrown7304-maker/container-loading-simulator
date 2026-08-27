# v2.6.0 Release Status

기준일: 2026-08-27

## 현재 상태

- 엔진 기능 개발: 완료 단계
- DIRECT BOX 핵심 규칙 회귀 테스트: 반영
- PALLET 핵심 규칙 회귀 테스트: 반영
- 입력 사전검증 / Excel 입력 안전 규칙: 반영
- 팔레트 중앙정렬 COG / 좌우 편차 정합성: 반영
- 최종 관성 PASS ↔ 결과창 ↔ 작업지시서 ↔ Excel 정합성 잠금: 반영
- 현장형 Playwright 게이트 회귀: 반영
- Vercel buildCommand: `npm run verify:predeploy`로 복구
- Production 배포: 미완료

## 현재 배포 차단 원인

GitHub commit status에서 Vercel이 `build-rate-limit`으로 실패하고 있다.
현재 확인된 최신 실패는 애플리케이션 코드 검증 이전의 Vercel 빌드 실행 한도 차단이다.

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
8. 중앙정렬로 COG가 바뀌면 `lateralImbalanceKg`도 같은 배치 기준으로 즉시 재계산
9. 컨테이너 중심선 팔레트는 기본 최적화와 관성 재배치 모두 좌/우 어느 쪽에도 전량 가산하지 않음
10. 설정된 `maxStackLevels`는 1~7단 후보 상한으로 사용하되 실제 컨테이너 높이·상부하중·면적지지를 모두 통과해야 다단 적층
11. 결과창에서 다른 팔레트 값을 수정해도 4~7단 설정을 임의로 3단으로 낮추지 않음
12. 각대/랩핑 등 활성 포장재의 예약 중량과 높이를 최대중량/천장 검사에 포함
13. 실제 컨테이너 슬롯이 없는 팔레트는 원점 중복 배치하지 않고 미적재 반환

## 최종 승인 체인 잠금

- 최종 결과/작업지시서/Excel은 일반 Rapier 후보 점수가 아니라 현재 적재안의 관성 3종 PASS만 인정한다.
- 인증 서명 모델은 `restraint-v4-certified-export`다.
- 서명은 컨테이너/좌표/팔레트 지지체/보조자재 설정뿐 아니라 SKU명·규격·중량·수량·적층 제한·상부 허용중량·회전정책·하역순서·미적재 정보까지 묶는다.
- `maxTopLoadKg=0`과 `undefined(제한 없음)`은 서로 다른 인증 조건이다.
- `certifiedExport.ts`를 공통 최종 출력 identity gate로 사용한다.
- DIRECT BOX 작업지시서와 Excel은 전달받은 결과가 PASS와 맞는 것만으로 부족하고, 현재 live PhysicsTarget까지 같은 서명이어야 한다.
- PALLET 작업지시서와 Excel은 live PhysicsTarget ↔ PASS ↔ PalletSnapshot 세 객체가 같은 물리 배치를 나타내야 한다.
- PalletSnapshot의 팔레트 길이·폭·높이·최대 적층단도 실제 인증 결과와 일치해야 한다.
- 결과창에서 팔레트 규격/중량/최대 적층단을 바꾸는 순간 기존 PASS를 동기적으로 폐기하고 최종 결과창을 닫는다.
- 변경된 팔레트 결과는 결과 보기를 다시 실행해 관성 3종을 재통과해야 한다.
- 팔레트 작업지시서에 남아 있던 2~3단 고정 표현은 최대 7단 구조와 맞게 상단 팔레트 일반 표현으로 변경했다.

## 입력 안전 보강

- 엔진 공통 preflight에서 잘못된 치수·중량·수량·적층조건을 fail-closed 처리한다.
- 동일 SKU의 동일 규격 행은 수량 합산, 상충 규격 행은 전체 거절한다.
- Excel도 엔진과 동일하게 동일 SKU·동일 안전조건 행은 수량을 합산하고, 상충 조건이면 활성 SKU 전체를 거절한다.
- 0수량 중복 행은 비활성 행으로 취급해 활성 SKU의 물리조건 충돌을 만들지 않는다.
- Excel 입력은 0kg 박스, 소수 수량, 소수 적층단/하역순서를 거절한다.
- Excel의 상부 허용중량 `0kg`을 제한 없음으로 바꾸지 않고 그대로 보존한다.
- 수량 `0`은 비활성 SKU로 유지한다.

## 이번 하드닝 회귀

- `palletAdaptiveCenterlineRegression.test.ts`: 관성 후보 중심선 중량 중립
- `palletCenteringBalanceRegression.test.ts`: 중앙정렬 후 COG/좌우 편차 재계산
- `excelImportSafety.test.ts`: Excel 동일 SKU 합산·상충 규격 거절·0수량 중복 처리
- `resultsPalletSpecRegression.test.ts`: 결과창 팔레트 최대 적층단 4~7 유지
- `certifiedExport.test.ts`: stale DIRECT 결과, stale PALLET Snapshot, 팔레트 표시 규격/적층한도 mismatch 거절
- `e2e/smoke.spec.ts`: 인증 전 Excel 차단, 결과창 7단 범위, 팔레트 조건 변경 후 결과창 폐쇄/재인증 요구

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
- 인증 후 화물/팔레트 조건을 바꿨을 때 모든 최종 산출물이 즉시 다시 잠기는지 확인

## 주의

관성 시뮬레이션과 자동 적재 결과는 내부 계획/비교 도구이며 실제 운송 안전 인증을 대체하지 않는다.
