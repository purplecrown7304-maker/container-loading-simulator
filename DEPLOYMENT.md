# Production Deployment

## 1. Release gate

배포 전 `main`의 최신 GitHub Actions CI가 모두 성공해야 합니다.

필수 통과 항목:

- 의존성 설치
- `npm audit --audit-level=high`
- Vitest 전체 회귀 테스트
- TypeScript + Vite production build
- 초기 JS 번들 800 KiB 상한 검사
- `container-loading-simulator-dist` 아티팩트 생성

## 2. Vercel 권장 배포

저장소 루트의 `vercel.json`에 다음 항목이 포함되어 있습니다.

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- SPA fallback: 모든 앱 경로를 `index.html`로 rewrite
- `/assets/*`: 장기 immutable cache
- `/index.html`: 즉시 재검증 cache

Vercel Dashboard에서 **New Project → Import Git Repository → `purplecrown7304-maker/container-loading-simulator`** 순서로 연결하면 됩니다. 연결 후 `main` push는 Production 배포, 다른 브랜치/PR은 Preview 배포로 운영하는 것을 권장합니다.

현재 Vercel 계정에서 이 저장소용 프로젝트가 아직 생성되지 않은 경우, 기존 다른 프로젝트에 덮어쓰지 말고 반드시 새 프로젝트로 가져옵니다.

## 3. 기타 정적 호스팅

CI가 생성한 `container-loading-simulator-dist` 아티팩트의 `dist` 내용을 정적 호스팅 루트에 배포합니다.

이 프로젝트는 클라이언트 단일 페이지 앱이며 현재 브라우저 `localStorage`를 사용합니다. 서버 DB 연결 전에는 사용자·기기 간 데이터가 자동 공유되지 않습니다.

## 4. 배포 후 smoke test

1. 첫 화면이 정상 표시되는지 확인
2. 박스만 적재 실행
3. 팔레트 사용 모드 전환 및 실행
4. 3D 회전/확대/축소 조작
5. 박스 등록·수정·삭제
6. 저장 후 불러오기
7. Excel 양식 다운로드
8. Excel 전체 교체 업로드 후 새로고침 없이 즉시 반영
9. Excel 병합 업로드
10. 모바일 폭에서 모드 전환과 3D 터치 조작
11. 미적재 사유·중량·CBM·품질 점수 표시 확인
12. 전체 초기화 버튼에서 확인창 표시
13. 브라우저 개발도구에서 강제 렌더링 오류 발생 시 Error Boundary 복구 화면 확인

## 5. 현장 적용 전 별도 검증

시뮬레이터의 기하학적 적재 가능 여부와 실제 운송 안전성은 동일하지 않습니다. 아래 기준은 회사/제품별 실측값으로 검증해야 합니다.

- 박스 압축강도 및 습도·보관기간에 따른 강도 저하
- 팔레트 규격, 파손 상태 및 허용하중
- 컨테이너 바닥 집중하중
- 축중 및 운송사 제한
- 랩핑·밴딩·각대·완충재 고정 기준
- 문 개방 시 화물 전도 방지
- 작업자의 인체공학적 취급 높이와 작업 절차

## 6. 롤백

Vercel에서는 직전 정상 Deployment를 Promote/rollback 기준으로 사용합니다. 기타 정적 호스팅에서는 직전 성공 CI의 `container-loading-simulator-dist` 아티팩트로 되돌립니다. 코드 변경은 GitHub 커밋 단위로 추적합니다.
