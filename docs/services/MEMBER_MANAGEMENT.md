# 관리자 회원관리

관리자 계정 메뉴와 전체 메뉴의 **데이터 · 관리 → 회원 관리**에서 회원 목록,
이름·이메일 검색, 상태 필터, 페이지 이동, 이름 수정, 이용 중지·재개를 제공합니다.
한국어·영어·베트남어를 지원합니다. 회원의 이메일·비밀번호·역할과 저장된 작업
데이터는 이 화면에서 변경하지 않습니다.

## 권한과 데이터 경계

- 기존 `container-admin-api`의 `session` 동작으로 발급한 관리자 세션을 사용합니다.
  브라우저의 기존 role 플래그만 있는 세션은 재로그인이 필요합니다.
- 관리자 토큰은 탭의 `sessionStorage`에만 보관합니다. 회원관리 API는
  `x-admin-session` 헤더만 받고 비밀번호·본문 토큰·클라이언트 역할은 권한으로
  사용하지 않습니다. 서버 RPC가 세션 만료·폐기를 다시 확인합니다.
- `loading_admin_member_action`은 `SECURITY INVOKER`이며 `service_role`만 실행합니다.
  기존 RLS는 유지합니다. 서비스 키는 Edge Function 환경에만 존재합니다.
- 목록은 이름·이메일·상태·가입일·수정일·최근 로그인만 반환하며 25개씩 조회합니다.
  검색은 최대 100자의 리터럴 부분 문자열입니다.
- 수정 시 `updated_at`을 비교하고 회원 행을 잠급니다. 다른 변경과 충돌하면
  409를 반환합니다. 상태 변경과 회원 세션 삭제는 한 트랜잭션입니다. 중지·재개
  양쪽에서 세션을 폐기하므로 중지 이전 토큰을 재활성화하지 않습니다.
- 관리자 세션 만료 시 열린 회원관리 데이터를 비우고 재로그인을 안내합니다.
  관리 API의 15초 제한 시간 초과 후에는 새로고침으로 실제 저장 상태를 확인합니다.

## API

`POST /functions/v1/container-admin-api`, 기존 publishable `apikey`와
`x-admin-session: <opaque token>`을 사용합니다.

| 동작 | 본문 | 응답 데이터 |
| --- | --- | --- |
| 목록 | `action: members`, `op: list`, `q`, `status: all/active/suspended`, `page`, `pageSize: 25` | `members`, `total`, `page`, `pageSize` |
| 수정 | `action: members`, `op: update`, `memberId`, `displayName`, `status`, `expectedUpdatedAt` | `member` |
| 관리자 로그아웃 | `action: logout_session` | `ok: true` |

인증 실패는 401, 입력 오류는 400, 없는 회원은 404, 수정 충돌은 409,
인프라 오류는 내부 세부사항 없이 503을 반환합니다. 기존 장비 이미지 조회·업로드·삭제
동작은 유지합니다. 회원 로그인 API와 적재 엔진에는 변경이 없습니다.

## 반영 순서

구현·검증과 운영 반영은 별도입니다. 프로젝트 운영 규칙에 따른 승인 후 진행합니다.

1. 대상 프로젝트가 `src/supabaseConfig.ts`와 일치하는지 확인합니다.
2. 새 migration `20261116052106_loading_admin_member_management.sql`만 적용합니다.
   기존 회원·관리자 세션 테이블은 이미 존재해야 합니다. 과거 migration이나 seed를
   재실행하지 않습니다.
3. `container-admin-api/index.ts`와 `_shared/adminMembersAction.ts`를 함께 배포합니다.
   기존처럼 gateway `verify_jwt = false`를 유지하고 함수 내부의 opaque 관리자
   세션 검증을 사용합니다. 신규 환경 비밀값은 필요하지 않습니다.
4. 프런트엔드를 반영하고 관리자 재로그인 후 회원관리 진입을 확인합니다.
   관리자 권한이 없는 회원·게스트에게 메뉴가 보이지 않는지, 인증되지 않은
   직접 요청이 거절되는지 확인합니다.

Supabase CLI 3.1.0에서 대상과 대기 중인 migration을 확인하는 명령:

```powershell
pnpm dlx supabase@3.1.0 db push --remote=oyxhaeccuuradutspcik --dry-run --skip-vault
```

관리자 API는 전체 함수 일괄 배포나 `--prune` 없이 이 함수만 배포합니다.

```powershell
pnpm dlx supabase@3.1.0 functions deploy container-admin-api --remote=oyxhaeccuuradutspcik --use-api --no-verify-jwt
```

## 검증

2026-11-16 운영 프로젝트 `oyxhaeccuuradutspcik`에 위 migration을 적용하고
`container-admin-api` 버전 4를 배포했습니다. migration 파일의 버전은 실제
운영 이력과 일치시켰습니다. RPC는 `service_role`에만 실행을 허용하며,
인증 없는 실제 회원관리 HTTP 요청의 401 응답을 확인했습니다.

`adminMembers.database.test.ts`는 실제 PostgreSQL WASM(PGlite)에 합성 회원·세션을
만들어 RLS, 실행 권한, 검색·페이지, 정보 노출, 변경 충돌, 세션 폐기와 실패 시
전체 롤백을 검증합니다. 운영 DB나 실제 회원 레코드를 이용하지 않습니다.
API 경계·브라우저 토큰·권한별 메뉴·세션 만료·관리 화면은 관련 단위 테스트로
검증합니다. Edge Function은 Deno 타입 검사 대상입니다.
