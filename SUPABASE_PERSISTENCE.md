# Supabase persistence

컨테이너 적재 시뮬레이터의 운영 데이터 중 장비 이미지, 회원 계정, 회원별 제품·박스 목록을 Supabase에 영구 저장합니다.

## 장비 이미지

- Storage bucket: `equipment-images`
- metadata table: `public.equipment_visuals`
- public clients can read the final image URL.
- upload/delete operations run through the `container-admin-api` Edge Function and re-check the administrator credential on the server.
- the Supabase service-role key is never shipped to the browser.
- legacy browser image keys are read during migration:
  - `container-loading-equipment-visual-images-v1`
  - `container-loading:equipment-image-overrides:v1`
- a legacy image is removed from browser storage only after the server upload succeeds.

## 회원 정보

This Supabase project is shared with other applications, so the loading simulator does not reuse the shared `auth.users` triggers or the unrelated `public.profiles` / `public.users` domain tables.

The loading simulator uses isolated server-only tables:

- `public.loading_members`
- `public.loading_member_sessions`
- `public.loading_member_data`

Member signup/login is handled by the `container-member-api` Edge Function. Passwords are stored only as salted PBKDF2-SHA256 hashes. Browser sessions contain only an opaque server session token and basic cached display information. Existing name-scoped browser data is copied into the new member UUID scope at the first successful server login or signup when the old local member profile is still present.

## 회원별 제품·박스 동기화

`public.loading_member_data` stores two account-scoped JSON documents:

- `planner_state`: 회사 제품 목록, 포장 플래너 설정, 등록 박스 정보
- `personal_boxes`: 사용자가 직접 등록·엑셀 업로드·명시적으로 승인한 개인 박스 목록

The browser keeps a local cache for speed, but the member UUID in Supabase is the cross-device identity. The `MemberCloudDataBridge` uploads changes after product/box edits and downloads the server copy after login, session restore, reconnect, or returning to the tab.

Initial migration is deliberately conservative:

- If the cloud row does not exist and the current browser already has real product/box data, that browser seeds the cloud row once.
- If the cloud row already exists, an empty new computer downloads the cloud row and never overwrites it with an empty cache.
- Local edits made while offline are marked dirty and uploaded when connectivity returns, including intentional full-list deletions.

## Security boundary

`loading_members`, `loading_member_sessions`, `loading_member_data`, and `app_admin_credentials` have RLS enabled and no public policies. They are accessed only by Edge Functions using the server-side service role. The member API re-validates the opaque member session before every `get_data` / `save_data` operation. `equipment_visuals` exposes read-only metadata to the public; writes remain server-only.
