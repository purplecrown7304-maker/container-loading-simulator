# Open-source research for enterprise cartonization

조사일: 2026-08-27

이 문서는 기업 제품 포장/컨테이너 적재 기능을 고도화하면서 GitHub에서 조사한 오픈소스와 실제 채택 범위를 기록한다. 라이선스가 불명확한 코드는 프로젝트에 복사하지 않는다.

## 1. enzoruiz/3dbinpacking

- Repository: `enzoruiz/3dbinpacking`
- Language: Python
- License: MIT
- Purpose: 3D bin packing
- 채택 판단: **알고리즘 아이디어 참고**
- 참고한 개념:
  - 배치된 물체의 모서리/면에서 다음 배치 후보점을 만드는 pivot/extreme-point 방식
  - 여러 회전 후보를 비교하는 휴리스틱
  - 결정적 정렬을 사용한 반복 가능한 배치
- 프로젝트 반영 방식:
  - Python 런타임이나 원본 라이브러리를 의존성으로 추가하지 않는다.
  - 기존 TypeScript `mixedCartonPacker`에 자체 구현한 extreme-point 후보, 접촉면/occupied-bounds 평가, 다중 결정적 정렬 휴리스틱을 사용한다.
  - 원본 소스 코드를 복사하지 않았다.

## 2. google/or-tools

- Repository: `google/or-tools`
- Language: C++ 중심, 다중 언어 바인딩
- License: Apache-2.0
- Purpose: Operations Research / combinatorial optimization
- 채택 판단: **조합최적화 설계 아이디어 참고**
- 참고한 개념:
  - 제약을 만족하는 후보 집합에서 여러 목적함수를 비교하는 방식
  - 시설/규격 수를 줄이면서 서비스 가능한 항목을 커버하는 set-cover/facility-location 계열 사고방식
  - 단일 점수 하나로만 결정하지 않고 Pareto 후보를 남기는 방식
- 프로젝트 반영 방식:
  - 네이티브 OR-Tools/Python 서비스를 추가하지 않는다.
  - 브라우저 단독 실행을 유지하기 위해 `commonCartonFamilyOptimizer`와 `enterprisePackagingScenarioSearch`에 소규모 결정적 탐색을 자체 구현한다.
  - 원본 소스 코드를 복사하지 않았다.

## 3. cartonpilot/cartonpilot-node

- Repository: `cartonpilot/cartonpilot-node`
- Language: TypeScript
- License: MIT
- Purpose: CartonPilot 3D bin-packing/cartonization REST API SDK
- 특징: 타입이 있는 단건/배치 최적화, box set/catalog SKU, 비용 목적함수, 비동기 batch/webhook 지원
- 채택 판단: **직접 의존성 미도입 / API 설계 비교용**
- 이유:
  - 실제 최적화가 외부 REST API와 API key에 의존한다.
  - 현재 프로젝트는 기업 제품/박스 치수 데이터를 외부 서비스로 보내지 않고 브라우저에서 독립 계산하는 구조를 우선한다.
  - 외부 API 장애·요금·쿼터가 적재 설계 가용성을 좌우하지 않도록 한다.
- 참고한 개념:
  - 대량 주문/제품의 batch 최적화 UX
  - fewest-parcels / lowest-cost처럼 목적을 분리해 설명하는 방식
  - 저장된 box set와 product catalog를 재사용하는 기업 워크플로

## 4. juanLude/container_packing

- Repository: `juanLude/container_packing`
- Language: TypeScript / React / Three.js
- GitHub 설명: 컨테이너 3D packing, heuristic/brute-force, utilization visualization
- License: GitHub 저장소 메타데이터에서 명시 라이선스 확인되지 않음
- 채택 판단: **코드 사용 금지 / 개념 비교만**
- 이유: 명시 라이선스가 없는 공개 저장소는 소스 재사용 권한을 전제로 할 수 없다.

## 5. 기타 검색 후보

GitHub 검색에서 아래 계열도 확인했다.

- `AouladLahceneOussama/3D-bin-packing`
- `raviolishipping/bin-packing-3d`

현재 구현에 직접 의존성을 추가할 이유가 충분하지 않아 채택하지 않았다. 향후 특정 알고리즘 공백이 생길 때 라이선스와 유지보수 상태를 다시 확인한다.

## 프로젝트 원칙

1. 브라우저 단독 실행을 우선해 Python/네이티브 최적화 서비스 의존성을 만들지 않는다.
2. 기업 제품/박스 데이터를 외부 cartonization API로 전송하지 않는 로컬 계산을 기본값으로 한다.
3. 외부 휴리스틱을 그대로 복사하기보다 현재 안전 제약에 맞춘 TypeScript 순수 구현을 사용한다.
4. 결정성(determinism)을 유지해 같은 입력이 같은 포장/적재 결과를 내도록 한다.
5. 제품 방향, 파손주의, 완충여유, 박스 총중량, 상부하중, 컨테이너 payload 같은 현장 제약을 최적화 점수보다 우선한다.
6. 라이선스가 불분명한 저장소의 코드는 복사/변형/번들하지 않는다.
7. 향후 외부 패키지를 직접 도입할 경우 `package.json`, NOTICE/라이선스 문서, 배포물의 의무사항을 함께 검토한다.
