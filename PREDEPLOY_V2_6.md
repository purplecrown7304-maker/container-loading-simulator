# v2.6.0 Pre-deploy Gate

이 문서는 `v2.6.0` Production 반영 전 최종 게이트입니다.

## 1. 자동 검증

```bash
npm install
npm audit --audit-level=high
npm run verify:predeploy
npx playwright install chromium
npm run test:e2e
```

필수 회귀 테스트에는 아래 시나리오가 포함되어야 합니다.

- `directBoxTailRegression.test.ts`: 미완성 동일 SKU 잔량이 문쪽 최종 혼합구역에 남는지 확인
- `directBoxDeterministicPriorityRegression.test.ts`: 동률 화물도 코드순으로 결정되어 입력 행 순서에 흔들리지 않는지 확인
- `directBoxOversizeRegression.test.ts`: 컨테이너보다 큰 박스를 잘못된 좌표로 강제 적재하지 않는지 확인
- `inputPreflight.test.ts`: 0/음수/비정수 입력과 중복 SKU 병합·충돌 거절 확인
- `directBoxInputPreflightRegression.test.ts`: DIRECT BOX 생산 경로에서 입력 사전검증이 실제 적용되는지 확인
- `palletInputPreflightRegression.test.ts`: PALLET 생산 경로에서 입력 사전검증과 잘못된 팔레트 설정 fail-closed 확인
- `fortyFootTwentySkuRegression.test.ts`: 표준 40ft / 20 SKU 합성 현장형 데이터의 안전성과 입력순서 결정성 확인
- `palletMixedPayloadRegression.test.ts`: 새 팔레트 자중 때문에 보류된 잔량의 최종 혼합 재사용과 포장재 중량 경계 확인
- `palletBoxTopLoadRegression.test.ts`: 팔레트 내부 박스의 단일/누적 상부 허용중량 확인
- `palletOptimizationStackDepthRegression.test.ts`: 4단 이상 팔레트 적층 후보 선택 확인
- `palletAdaptiveStackDepthRegression.test.ts`: 관성 자동보정에서도 4단 이상 후보 유지 확인
- `palletLaneCenteringRegression.test.ts`: 표준 40ft 2열 중앙정렬과 중심선 중량 중립 처리 확인

## 2. 공통 입력 사전검증

- [ ] SKU 코드 공백/빈 값은 좌표 생성 전에 제외된다.
- [ ] 박스 길이·폭·높이·중량은 0보다 큰 유한한 값만 허용한다.
- [ ] 수량과 최대 적층단은 1 이상의 정수만 허용한다.
- [ ] 상부 허용중량은 0 이상의 유한한 값만 허용한다.
- [ ] 동일 SKU + 동일 물리조건의 여러 행은 수량을 합산한다.
- [ ] 동일 SKU + 서로 다른 치수·중량·적층조건은 마지막 행으로 덮어쓰지 않고 해당 SKU 전체를 미적재 처리한다.
- [ ] 컨테이너 규격/최대중량이 잘못되면 DIRECT BOX / PALLET 모두 좌표를 하나도 만들지 않는다.
- [ ] 팔레트 규격·자중·최대하중·최대 적층단·포장재 수치가 잘못되면 PALLET은 fail-closed 처리한다.

## 3. DIRECT BOX 적재 규칙

- [ ] SKU별 총 CBM → 총중량 → 개당중량 → 코드순으로 안쪽부터 적재된다.
- [ ] 같은 SKU는 허용 높이까지 완성된 세로 스택을 우선 만든다.
- [ ] 완성 스택을 만들 수 없는 잔량은 순수 SKU 구역에 낮은 더미로 남지 않는다.
- [ ] 모든 잔량 혼합적재는 순수 SKU 블록의 최종 경계보다 문쪽에서만 시작한다.
- [ ] 후처리 형상 보정이 완성 세로 스택을 해체하지 않는다.
- [ ] 후처리 형상 보정이 혼합 박스를 다시 컨테이너 안쪽으로 이동시키지 않는다.
- [ ] 최대 적층단·상부 허용중량·컨테이너 최대중량·지지·경계·충돌 조건을 모두 지킨다.

## 4. PALLET 적재 규칙

- [ ] 품목별 총 물량중량 → 총 CBM → 개당중량 → 코드순으로 처리한다.
- [ ] 1차 적재에서는 동일 SKU 팔레트를 유지한다.
- [ ] 혼합은 전체 순수 적재 뒤 팔레트 수를 실제로 줄일 수 있을 때만 수행한다.
- [ ] 순수 SKU용 새 팔레트의 자중 때문에 최대중량을 넘는 경우, 기존 팔레트 빈 공간에 안전하게 들어가는 잔량은 최종 혼합 단계에서 재사용한다.
- [ ] 위 최종 혼합 재사용 후에도 팔레트 자중과 활성화 가능한 포장재 예약중량을 포함한 컨테이너 최대중량을 넘지 않는다.
- [ ] 팔레트 내부 박스 적층도 `maxTopLoadKg` 단일/누적 상부하중 제한을 지킨다.
- [ ] 팔레트 위 화물 점유영역의 중심이 팔레트 중심과 일치한다.
- [ ] 표준 40ft 폭에서 1.1m 팔레트 2열은 남는 폭을 좌우 동일하게 분배한다.
- [ ] 정확히 컨테이너 중심선에 놓인 팔레트는 좌우 imbalance 어느 쪽에도 전량 가산하지 않는다.
- [ ] 팔레트/화물 오버행이 없다.
- [ ] 설정된 `maxStackLevels`를 넘지 않는다.
- [ ] UI → 전역 최적화 → 관성 자동보정 → 기본 엔진이 동일한 최대 적층단 값을 사용하고 4~7단 설정을 임의로 3단으로 낮추지 않는다.
- [ ] 실제 컨테이너 높이·상부 허용중량·팔레트 면적 지지 조건을 모두 통과한 경우에만 다단 적층한다.
- [ ] 컨테이너 최대중량에는 팔레트 자중과 활성화 가능한 포장재 예약중량이 포함된다.

## 5. 관성 인증 / 작업지시서

- [ ] DIRECT BOX / PALLET 모두 최종 결과 전에 관성 인증을 거친다.
- [ ] 출발 가속 / 급정거 / 급회전 3종 PASS 전 작업지시서가 생성되지 않는다.
- [ ] 적재 좌표나 보조자재 설정 변경 시 이전 PASS가 무효화된다.
- [ ] 작업지시서와 Excel의 적재 좌표·수량·보조자재 수량이 현재 인증 결과와 일치한다.

## 6. UI / 모바일

- [ ] 1366px 이상 데스크톱에서 주요 패널과 3D가 겹치지 않는다.
- [ ] 390×844 모바일에서 가로 스크롤이 발생하지 않는다.
- [ ] 박스/팔레트 모드 전환 후 결과와 3D가 즉시 갱신된다.
- [ ] 팔레트 최대 적층단 4~7 설정이 실행 후에도 3단으로 되돌아가지 않는다.
- [ ] 결과/관성/작업지시서 버튼이 모바일에서도 눌린다.

## 7. Production 승인 조건

- [ ] Vercel Production build 성공
- [ ] `npm run verify:predeploy` 성공 기록 확보
- [ ] Playwright E2E 성공 기록 확보
- [ ] DIRECT BOX 회귀 시나리오 통과
- [ ] PALLET 회귀 시나리오 통과
- [ ] 40ft / 20 SKU 합성 스트레스 회귀 통과
- [ ] 실제 현장 박스 데이터 20종 이상으로 최종 검토
- [ ] 실제 40ft 적재 사례 3건 이상과 비교 검토

> 합성 20 SKU 회귀는 알고리즘 회귀 방지용이며 실제 현장 데이터 검토를 대체하지 않습니다.
>
> 관성 PASS와 자동 배치는 시뮬레이터 내부 비교/계획 결과이며 실제 운송 안전 인증을 대체하지 않습니다.
