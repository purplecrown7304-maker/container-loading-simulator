export const SUPABASE_URL = 'https://oyxhaeccuuradutspcik.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_dxh4pjf_jPwJYGnbCwqPZA_xtKlBueo';

export const CONTAINER_ADMIN_API_URL = `${SUPABASE_URL}/functions/v1/container-admin-api`;

export function supabasePublicHeaders(extra?: HeadersInit): HeadersInit {
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    ...extra,
  };
}
