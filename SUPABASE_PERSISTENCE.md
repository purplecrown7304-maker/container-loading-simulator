# Supabase persistence

컨테이너 적재 시뮬레이터의 운영 데이터 중 장비 이미지와 회원 계정 정보를 Supabase에 영구 저장합니다.

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

Member signup/login is handled by the `container-member-api` Edge Function. Passwords are stored only as salted PBKDF2-SHA256 hashes. Browser sessions contain only an opaque server session token and basic cached display information. Existing name-scoped browser data is copied into the new member UUID scope at the first successful server login or signup when the old local member profile is still present.

## Security boundary

`loading_members`, `loading_member_sessions`, and `app_admin_credentials` have RLS enabled and no public policies. They are accessed only by Edge Functions using the server-side service role. `equipment_visuals` exposes read-only metadata to the public; writes remain server-only.
