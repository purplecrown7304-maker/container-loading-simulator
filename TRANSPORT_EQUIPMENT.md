# Transport Equipment Catalog

컨테이너/트럭 장비 선택 기능의 운영 기준입니다.

## 적용 원칙

- 장비 프리셋을 선택하면 현재 제품/박스 목록은 유지하고 적재공간의 길이·폭·높이·최대 적재중량·바닥 허용하중을 변경합니다.
- 장비 변경 즉시 기존 관성 인증은 무효화되며 새 장비 규격으로 자동 적재를 다시 실행해야 합니다.
- 사용자가 메인 규격을 직접 수정하면 알려진 프리셋과 일치할 경우 해당 장비로, 아니면 `CUSTOM CONTAINER`/`CUSTOM TRUCK`으로 취급합니다.
- 선택 장비는 브라우저에 저장되어 새로고침 후에도 복원됩니다.
- 기업 제품→박스 최적화도 현재 선택 장비의 L/W/H/최대 적재중량을 공유합니다.

## 컨테이너 프리셋

| ID | 표시명 | 내부/작업공간 L×W×H (m) | 대표 payload (kg) | 비고 |
|---|---|---:|---:|---|
| 20-standard | 20' STANDARD | 5.900 × 2.352 × 2.395 | 28,130 | 일반 드라이 |
| 40-standard | 40' STANDARD | 12.032 × 2.352 × 2.395 | 28,750 | 일반 드라이 |
| 40-high-cube | 40' HIGH-CUBE | 12.032 × 2.350 × 2.700 | 28,600 | 기본 HC |
| 45-high-cube | 45' HIGH-CUBE | 13.556 × 2.352 × 2.700 | 27,700 | HC |
| 20-open-top | 20' OPEN TOP | 5.895 × 2.350 × 2.340 | 30,050 | 상부 개방 |
| 40-open-top | 40' OPEN TOP | 12.029 × 2.350 × 2.344 | 28,450 | 상부 개방 |
| 20-flatrack | 20' FLATRACK | 5.638 × 2.438 × 2.233 | 42,100 | 측면/상부 개방 |
| 40-flatrack | 40' FLATRACK | 11.652 × 2.347 × 2.265 | 49,100 | 측면/상부 개방 |
| 20-flatrack-collapsible | 20' FLATRACK COLLAPSIBLE | 6.058 × 2.438 × 2.600 | 42,100 | 접이식 대표 작업 한계 |
| 40-flatrack-collapsible | 40' FLATRACK COLLAPSIBLE | 12.192 × 2.245 × 2.700 | 49,100 | 접이식 대표 작업 한계 |
| 20-platform | 20' PLATFORM | 6.058 × 2.438 × 2.700 | 42,100 | 벽/천장 없음 |
| 40-platform | 40' PLATFORM | 12.192 × 2.245 × 2.700 | 49,100 | 벽/천장 없음 |
| 20-reefer | 20' REFRIGERATED | 5.450 × 2.280 × 2.159 | 29,140 | 냉동/냉장 |
| 40-reefer | 40' REFRIGERATED | 11.599 × 2.290 × 2.425 | 29,580 | 냉동/냉장 HC 대표값 |
| 20-bulk | 20' BULK | 5.900 × 2.350 × 2.390 | 28,000 | 특수화물 전용, 일반 박스 엔진 차단 |
| 20-tank | 20' TANK | 5.900 × 2.350 × 2.390 | 26,000 | 액체/가스 전용, 일반 박스 엔진 차단 |
| custom-container | CUSTOM CONTAINER | 사용자 입력 | 사용자 입력 | 현장 실측/승인값 |

## 트럭 프리셋

| ID | 표시명 | 작업공간 L×W×H (m) | 대표 payload (kg) | 비고 |
|---|---|---:|---:|---|
| tautliner | TAUTLINER (CURTAINSIDER) | 13.620 × 2.480 × 2.700 | 32,800 | 측면 커튼 적재 |
| refrigerated-truck | REFRIGERATED TRUCK | 13.310 × 2.480 × 2.600 | 31,000 | 냉장/냉동 |
| isotherm-truck | ISOTHERM TRUCK | 13.310 × 2.480 × 2.600 | 30,000 | 단열차량 대표값 |
| mega-trailer | MEGA-TRAILER | 13.620 × 2.480 × 2.940 | 32,800 | 대용적, 측면/상부 적재 |
| jumbo | JUMBO | 15.400 × 2.480 × 3.000 | 23,000 | 120m³급 대표값을 연속공간으로 근사 |
| custom-truck | CUSTOM TRUCK | 사용자 입력 | 사용자 입력 | 차량등록증/실측값 |

## 3D 표시

- Standard / High Cube / Custom: 폐쇄형 장비 shell
- Open Top: 천장 제거
- Flat Rack: 바닥 + 양 끝 프레임
- Platform: 바닥 deck만 표시
- Reefer: 냉동기 유닛 표시
- Bulk: 상부 투입구 표시
- Tank: ISO 프레임 + 원통 탱크 표시
- Curtainsider / Mega / Jumbo: 트레일러 shell 및 측면 구조 표시
- Refrigerated / Isotherm Truck: 단열/냉동 트레일러 shell 표시

## OOG 및 특수장비 안전정책

Open Top, Flat Rack, Platform 장비는 실제 운송에서 규격 외(OOG) 화물을 취급할 수 있지만, OOG 허용량은 선사·항만·육상운송·결박계획마다 다릅니다. 따라서 현재 엔진은 카드의 입력 폭/높이를 **보수적 작업 한계**로 사용하며 무제한 돌출을 자동 허용하지 않습니다. 실제 승인 OOG 치수를 알고 있는 경우 `CUSTOM` 규격으로 현장 승인 한계를 입력합니다.

Tank와 Bulk는 일반 박스/팔레트 적재 엔진 대상이 아닙니다. 선택은 가능하지만 일반화물 자동적재·결과·작업지시서 실행을 차단합니다.

## 제원 출처 기준

프리셋은 Hapag-Lloyd, Maersk, DSV 등 공개 장비 사양의 대표값을 기준으로 구성했습니다. 실제 장비는 제조사, 소유사, 연식, 국가별 도로규정, 선사별 tare/payload에 따라 달라질 수 있습니다. 출하 작업지시 확정 전에는 실제 배차/반입 장비의 CSC plate, 차량등록증 또는 운송사 제공 spec을 최종 기준으로 사용해야 합니다.
