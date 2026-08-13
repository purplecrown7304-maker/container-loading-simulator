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

## 2. 배포 파일

CI가 생성한 `container-loading-simulator-dist` 아티팩트의 `dist` 내용을 정적 호스팅 루트에 배포합니다.

이 프로젝트는 클라이언트 단일 페이지 앱이며 현재 브라우저 `localStorage`를 사용합니다. 서버 DB 연결 전에는 사용자·기기 간 데이터가 자동 공유되지 않습니다.

## 3. 배포 후 smoke test

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

## 4. 현장 적용 전 별도 검증

시뮬레이터의 기하학적 적재 가능 여부와 실제 운송 안전성은 동일하지 않습니다. 아래 기준은 회사/제품별 실측값으로 검증해야 합니다.

- 박스 압축강도 및 습도·보관기간에 따른 강도 저하
- 팔레트 규격, 파손 상태 및 허용하중
- 컨테이너 바닥 집중하중
- 축중 및 운송사 제한
- 랩핑·밴딩·각대·완충재 고정 기준
- 문 개방 시 화물 전도 방지
- 작업자의 인체공학적 취급 높이와 작업 절차

## 5. 롤백

배포 후 문제가 발생하면 직전 성공 CI의 `container-loading-simulator-dist` 아티팩트로 되돌립니다. 코드 변경은 GitHub 커밋 단위로 추적합니다.
