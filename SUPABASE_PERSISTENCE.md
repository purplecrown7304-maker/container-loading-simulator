# Supabase persistence

컨테이너 적재 시뮬레이터는 **Supabase를 유일한 영구 데이터 저장소(source of truth)** 로 사용합니다. 브라우저 `localStorage`는 영구 저장소로 사용하지 않습니다.

## 저장 원칙

회원으로 로그인한 상태에서 생성·수정되는 운영 데이터는 회원 UUID 기준으로 `public.loading_member_data`에 저장합니다.

- 회사 제품 목록
- 개인 박스 목록
- 제품 선택 및 출하 수량
- 포장 플래너 상태와 설정
- 현재 작업의 컨테이너/차량 및 화물 상태
- 저장된 작업 계획
- 사용자 차량 규격
- 안전 점검 상태
- 적재 방식/화면 설정 등 기존 `container-loading*` 애플리케이션 상태

`loading_member_data.app_state`는 기존 브라우저 저장 키를 계정별 JSON 문서로 보관해 현재 UI와의 호환성을 유지합니다. `planner_state`와 `personal_boxes`는 제품·박스 도메인 호환 필드로 함께 유지합니다.

## 브라우저 저장소 처리

앱은 React 렌더링 전에 Supabase 상태를 불러옵니다. 이후 `window.localStorage`는 실제 브라우저 디스크가 아니라 **메모리 전용 Storage shim**으로 교체됩니다. 기존 코드가 `localStorage.setItem()`을 호출하더라도 브라우저 디스크에는 저장되지 않으며, 변경된 메모리 상태가 Supabase로 자동 전송됩니다.

예전 버전의 `localStorage` 데이터가 남아 있는 기존 컴퓨터에서는 다음 순서로 1회 이전합니다.

1. 현재 로그인 회원에게 속하는 기존 데이터만 읽습니다.
2. 이전 이름 기반 사용자 키를 현재 회원 UUID 범위로 변환합니다.
3. Supabase에 저장합니다.
4. 서버 저장 성공 후 기존 `container-loading*` localStorage 키를 삭제합니다.

관리자·게스트·다른 회원의 scoped 데이터는 현재 회원 데이터로 섞지 않습니다.

로그아웃 상태에서는 영구 저장을 하지 않고 메모리에서만 동작합니다. 영구 보관이 필요한 데이터는 회원 로그인 상태에서 Supabase에 저장되어야 합니다.

## 인증 세션

로그인 세션 토큰과 현재 탭의 작업자 표시는 업무 데이터가 아니라 인증 자격 증명이므로 `sessionStorage`에만 일시 보관합니다. 브라우저를 완전히 닫으면 사라지며, 제품·박스·작업계획 같은 영구 데이터와 분리됩니다.

- `public.loading_members`: 회원 계정
- `public.loading_member_sessions`: 서버 세션
- `public.loading_member_data`: 회원별 영구 애플리케이션 데이터

회원 인증과 데이터 읽기/쓰기는 `container-member-api` Edge Function을 통해 수행합니다. 브라우저에는 Supabase service-role 키를 전달하지 않습니다.

## 장비 이미지

장비 이미지는 JSON 상태에 중복 저장하지 않고 Supabase Storage와 메타데이터 테이블을 사용합니다.

- Storage bucket: `equipment-images`
- metadata table: `public.equipment_visuals`
- upload/delete: `container-admin-api`

기존 이미지 localStorage 키는 새 app_state 대상에서 제외하며, 장비 이미지 마이그레이션 로직이 Supabase Storage 업로드 성공 후 제거합니다.

## 보안 경계

`loading_members`, `loading_member_sessions`, `loading_member_data`, `app_admin_credentials`는 RLS가 활성화되어 있고 공개 쓰기 정책이 없습니다. 회원 데이터는 `container-member-api`가 opaque 회원 세션을 다시 검증한 뒤 service-role로만 접근합니다.
