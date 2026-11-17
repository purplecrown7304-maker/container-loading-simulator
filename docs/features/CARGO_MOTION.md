# 화물 이동 모듈

`src/motion/CargoMotion.js`는 기존 Three.js 장면의 **표시**만 이동하는 ES 모듈이다.
HTML, UI, 샘플 장면, 렌더러, RAF, 적재 알고리즘을 만들지 않는다. 외부 애니메이션
라이브러리나 CDN 의존성을 추가하지 않는다. 설치된 `three@0.185.1`과 기존
React Three Fiber/Drei/Vite 구조는 유지한다.

## 기존 루프 연결

```js
import { CargoMotion } from './src/motion/CargoMotion.js';
import { damp, damp3 } from './src/motion/damp.js';

const motion = new CargoMotion({ scene, camera, controls, options });
// 앱이 이미 소유한 프레임 콜백에서 render/composer보다 먼저 호출한다.
motion.update(dtSeconds);
```

`dt`는 초 단위다. 음수·비정상 입력은 시간을 진행시키지 않으며 한 번의 갱신은 최대
0.05초다. 숨겨진 탭에서 복귀해도 완료 콜백을 건너뛰지 않는다.
`damp(value, target, tau = 0.1, dt)`와 `damp3(vector, target, tau = 0.1, dt)`는
게이지나 무게중심 **표시**에도 사용할 수 있다. `damp3`는 첫 벡터를 갱신한다.

계획은 `{ units: [{ id, object3D, pose: { x, y, z, ry }, stop }] }`이다.
위치와 yaw는 월드 좌표, 각도는 라디안이다. 포장 전체가 한 `id`면 내부 박스·포장재도
그 단위의 이동을 따라야 한다. 모듈은 `stop`으로 적재 순서를 계산하지 않는다.
호출자가 안전 검사를 통과한 `toPlan.units`를 원하는 적재 순서로 전달한다.

## API

- `switchTruck({ fromRig, toRig, fromPlan, toPlan, dockSlots })`: 후방 문 가까운 화물부터
  대기장으로 이동 → 구차량 출발 → 0.3초 겹쳐 신차량 진입 → 새 계획 순서로 상차한다.
- `replan({ fromPlan, toPlan })`: ID로 비교해 위치·yaw가 바뀐 단위, 추가·제거된 단위만
  이동한다. 결과 `{ moved, added, removed }`는 각각의 **개수**다.
- 두 메서드는 마지막 표시 이동과 카메라가 끝나면 resolve하는 Promise를 반환한다.
  진행 중 새 요청은 기존 순서를 먼저 최종 상태로 마무리한다.
- `flyCameraTo({ position, target, fov, duration })`: 같은 시계에서 구면 보간한다.
  OrbitControls 호환 컨트롤이 없으면 false다. 카메라는 Y-up 및 변환되지 않은 부모를
  전제로 한다. 사용자 입력은 보간을 취소하고 원래 컨트롤 상태를 복원한다.
- `skip()`: 아직 시작하지 않은 다음 단계까지 실행해 최종 좌표·차량 표시를 확정한다.
- `isBusy`: 화물·차량·카메라와 아직 시작하지 않은 순서를 모두 포함한다.
- `on('unitLanded', cb)`: `{ id, phase }`; phase는 `load`, `replan`, `added`, `removed`다.
  차량 교체 중간의 하차에는 발행하지 않는다.
- `on('sequenceDone', cb)`: `{ type, result }`. `on`의 반환 함수로 구독을 해제한다.
- `dispose()`: 현재 작업을 마무리하고 입력·미디어 리스너를 정리한다. 호출자 소유의
  모델·재질·환경맵·렌더러는 폐기하지 않는다. 폐기한 컨트롤러는 재사용하지 않는다.

`Rig`는 `{ root, wheels, wheelRadius, doorPoint, parkX, offX }`다. `doorPoint`만
root 로컬 좌표이며 `parkX`, `offX`는 월드 X 좌표다. 기본 Mesh/Group 어댑터는 화물을
장면으로 분리해 구차량의 출발·숨김 영향을 막고 상차 완료 후 새 차량에 연결한다.
같은 ID는 같은 Object3D를 사용해야 한다. Three.js `Object3D.attach`의 제약상
기본 어댑터는 비균일 월드 스케일·전단이 있는 부모 계층을 변경 전에 거절한다.
그런 계층은 명시적 월드 좌표 어댑터를 사용한다.

`matrixAutoUpdate=false`인 직접 설정 TRS 행렬도 지원한다. 화물은 바인딩할 때 필드를
한 번 동기화하고, 차량은 원래 행렬의 회전·스케일을 유지한 채 이동 성분만 바꾼다.
수동 바퀴 행렬도 회전을 반영한다. 기본 화물 어댑터의 전단·원근·특이 행렬,
직접 관리하는 `matrixWorldAutoUpdate=false` 화물, 이동 차량·바퀴의 수동 월드 행렬은
변경 전에 거절한다. 화물의 직접 관리 월드 행렬은 명시적 어댑터로 연결할 수 있다.

`dockSlots`는 ID → pose Map/객체 또는 계획 인덱스에 맞춘 pose 배열이다. 안정적인
ID Map을 권장한다. 없는 항목은 현재 표시 위치를 사용하며 임의 슬롯을 만들지 않는다.
재계획에 쓰는 대기장과 차량은 `options.dockSlots`, `options.rig`로 전달할 수 있다.

## 옵션과 보간

기본값은 `DEFAULT_MOTION_OPTIONS`에 모여 있다. 시간은 초 단위다.

| 옵션 | 기본값 |
| --- | ---: |
| unloadArc / unloadDuration / unloadStagger | 1.2 / 0.6 / 0.035 |
| leaveDuration / arriveDuration / rigOverlap | 1.2 / 1.4 / 0.3 |
| loadDuration / loadStagger / doorLift | 0.8 / 0.07 / 0.4 |
| replanDuration / replanStagger / replanArc | 0.8 / 0.025 / 0.8 |
| cameraDuration / cameraFrameMargin | 1 / 1.25 |

`onInvalidate`는 demand 렌더 루프에서 다음 프레임을 요청할 때 사용한다.
`reducedMotion: true` 또는 OS `prefers-reduced-motion`은 지속 시간·지연을 0으로 만든다.
실행 중 OS 설정이 바뀌어도 현재 순서를 마무리한다.

화물은 easeInOutCubic, 최단 yaw 회전, 정확한 끝점 스냅을 사용한다. 일반 이동은
거리 비례 사인 arc, 문 경유 표시는 지정된 이차 Bézier 식을 사용한다. `via`는
Bézier **제어점**이다. 곡선이 그 점 자체를 통과하거나 장애물을 피한다는 뜻은 아니다.
표시 애니메이션은 실제 상차 동선·충돌 검증을 대체하지 않는다. 차량 바퀴는 실제
이동 거리 / wheelRadius에 맞춰 회전한다.

## InstancedMesh와 현재 앱

`options.adapter`에 `getPose(id, out)`와 `setPose(id, pose)`를 제공하면 메시 생성·복제·
재부모화를 하지 않는다. `getPose`는 전달된 임시 객체에 x/y/z/ry를 채우고, 두 함수는
ID가 없으면 false를 반환한다. 임시 pose 참조를 보관하지 않는다. 필요한 instanceMatrix,
경계와 선택 매핑 갱신은 앱이 소유한다.

현재 앱은 `ThreeStagingFlights.tsx`에서 이 API를 사용한다. 확정된 수동 상차 및 자동
계산 후 대기장에서 새로 적재된 **실제 포장 단위**를 이동한다. 기존 R3F `useFrame`
안에서 한 번 `update(dt)`하고 같은 인스턴스의 원본 행렬에 표시 delta를 적용한다.
파렛트 받침·내부 박스·밴딩·랩핑·각대가 함께 움직인다. 리소스 인덱스가 바뀌면
ID와 형상을 재확인하며 타임라인을 다시 시작하지 않는다.

화물 ID·수량·규격·포장·채택 좌표·중량·적재율·미적재 사유·인증 상태는 변경하지 않는다.
회수·복원·작업 변경·물리 재생·취소는 정확한 기준 행렬로 복귀한다. 연출 중 측정선은
숨기며 수량은 최종 채택 배치 기준임을 표시한다.

현재 앱의 장비 선택 UI에는 차량 교체 전체 순서를 연결하지 않았다. 모듈의
`switchTruck`은 실제 Three Object3D 기반 단위 테스트로 검증하고, 기존 앱에는 적재
이동 어댑터를 연결했다. 차량 자산과 장비 전환 수명은 기존 소유권을 유지한다.

## 검증

Vitest는 easing·각도 wrap·Bézier 끝점, 같은 ID 중단, 60/144Hz damping 수렴,
차량 바퀴·월드 좌표·콜백, 카메라 중단·컨트롤 복원, 계획 diff,
미래 단계까지 skip, 축소 모션·재진입을 확인한다. 통합 테스트는 실제 포장
인스턴스·저장·인증·수량 불변, 리소스 재생성, StrictMode·오래된 완료 콜백을 검증한다.

최종 브라우저·테스트 실행 결과는 PR에 기록한다. 이 모듈의 FPS나 성능 향상률은
따로 측정하지 않았으며 수치 향상을 주장하지 않는다.
