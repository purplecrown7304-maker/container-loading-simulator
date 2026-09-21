# 브라우저 Unity 적재 시뮬레이터

Unity 6000.6.2f1 WebGL 빌드와 기존 React/TypeScript 물류 앱을 연결했습니다.

## 실행

- 이 폴더에서 `pnpm install`, `pnpm dev --host 127.0.0.1 --port 4173` 실행.
- 브라우저에서 http://127.0.0.1:4173 열기.
- 배포용 파일: `pnpm build` 후 `dist/` 전체를 정적 서버의 루트에 배치.
- 이미 완성된 Unity 빌드가 `public/unity-viewer/`에 포함되어 있으므로 앱 실행에 Editor는 필요 없습니다.
- HTML 파일을 직접 더블클릭하는 file:// 방식은 사용하지 않습니다.

## Unity 프로젝트 수정

Unity Hub에서 이 폴더 안 `unity/`를 프로젝트로 추가합니다. Editor 6000.6.2f1과 WebGL Build Support를 사용합니다.
PowerShell에서 `./scripts/build-unity.ps1` 실행 시 C# 컴파일과 WebGL 출력을 갱신합니다. 이후 웹 앱의 `pnpm build`를 다시 실행합니다.
빌드 스크립트는 이 버전의 알려진 Bee 재실행 오류가 발생할 때에만 1회 다시 시도합니다.

## 적용 기능

- 적재공간 선택 화면: 규격 기반 Unity 공간 모델, 바닥 격자·벽면 골·문쪽 표시.
- 박스 직접 적재 화면: 기존 엔진 배치 표시, 입체/상단/문쪽/측면 시점, 마우스 회전·확대·이동, 터치 회전·두 손가락 확대.
- 실제 박스 클릭 → 품목·규격·중량·회전 여부 표시. 기존 선택 이벤트와 양방향 연결.
- 높이 필터와 적재 순서 재생·일시정지·수동 순서 탐색.
- 등록 색상 유지, 규칙 위반 박스 빨간색 표시.
- Unity 실패 시 기존 Three.js 보기로 전환. 박스 화면의 `기존 3D·무게분포`로 기존 상세 분석에 접근 가능.

## 계산과 화면의 역할

좌표는 기존 TypeScript 적재 엔진에서 계산합니다. Unity로 전달할 때 길이/폭/높이와 X/Y/Z 값을 그대로 보존하며 Unity에서 엔진 Z를 수직 Y축으로 변환합니다. 화면에서 보이는 박스 간 틈은 시각적 구분용 1% 축소이며 계산 결과를 바꾸지 않습니다.
Unity 뷰어에는 별도의 자동 적재나 물리 PASS 판정이 없습니다. 기존 적재 규칙·Rapier·작업지시서 인증을 사용합니다. 시점·높이·재생 조작은 인증을 무효화하지 않습니다.
재생은 계산된 배치 배열 순서를 보여주며 현장 반입 동선이나 지게차 이동을 검증하는 기능은 아닙니다.
이번 Unity 적용 범위는 장비의 직육면체 유효 적재공간과 DIRECT BOX 뷰어입니다. 팔레트 전용 상세 뷰어와 보강재/무게분포 분석은 기존 화면을 유지합니다. 임의 CAD 모델이나 탱크 내부 곡면 충돌 계산은 추가하지 않았습니다.

## 브라우저와 배포

Unity 실행에 WebGL 2가 필요합니다. 테스트는 Chromium의 데스크톱/모바일 에뮬레이션과 Codex 앱 브라우저에서 진행했습니다. 실제 iPhone/Safari 기기 성능은 이번 검증 범위에 포함되지 않습니다.
Unity 런타임 파일은 약 16 MB(압축 전)이며 최초 로딩 시간이 있습니다. 현재 빌드는 별도 압축 헤더 없이 실행되도록 Unity 자체 압축을 껐습니다. 정적 서버의 HTTP 전송 압축은 추가 적용 가능합니다. `.wasm`은 `application/wasm` 타입으로 제공합니다.

## 주요 파일

- `unity/Assets/CargoViewer.cs`: 모델·카메라·선택·재생
- `unity/Assets/Plugins/WebGL/BrowserBridge.jslib`: Unity → 웹 메시지
- `unity/Assets/Editor/WebBuild.cs`: 반복 가능한 웹 빌드
- `public/unity-viewer/host.html`: Unity iframe 호스트
- `src/UnityLoadingViewer.tsx`: 웹 조작 패널과 양방향 연결
- `src/unityProtocol.ts`: 계산 결과 직렬화

## 검증

Unity WebGL 빌드 성공. 타입 검사·아키텍처·웹 프로덕션 빌드·번들 검사 통과. 단위/회귀 테스트 387개 통과.
Unity E2E 데스크톱/모바일 2개: 실제 12개 화물 로딩, Unity 응답 확인, 박스 클릭, 시점 전환, 재생, 높이 조작 중 인증 유지 검증 통과.

기존 흐름 및 Unity 로딩 실패 복구 E2E 12개도 통과했습니다. 총 브라우저 시나리오 14개 통과.
