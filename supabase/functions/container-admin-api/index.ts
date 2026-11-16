import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleAdminMembersAction } from "../_shared/adminMembersAction.ts";

const ADMIN_ID = "admin";
const BUCKET = "equipment-images";
const ADMIN_HASH_SOURCE = "https://raw.githubusercontent.com/purplecrown7304-maker/container-loading-simulator/main/src/adminAccess.ts";
const SESSION_HOURS = 12;

let cachedAdminHash = "";
let cachedAdminHashUntil = 0;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-session",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function getExpectedAdminHash() {
  if (cachedAdminHash && Date.now() < cachedAdminHashUntil) return cachedAdminHash;
  const response = await fetch(ADMIN_HASH_SOURCE, { headers: { "User-Agent": "container-admin-api" } });
  if (!response.ok) throw new Error("admin_hash_source_unavailable");
  const source = await response.text();
  const match = /ADMIN_PASSWORD_SHA256\s*=\s*['\"]([a-f0-9]{64})['\"]/.exec(source);
  if (!match) throw new Error("admin_hash_not_found");
  cachedAdminHash = match[1];
  cachedAdminHashUntil = Date.now() + 5 * 60 * 1000;
  return cachedAdminHash;
}

async function verifyPassword(adminId: string, password: string) {
  if (adminId.trim().toLowerCase() !== ADMIN_ID || !password) return false;
  const expected = await getExpectedAdminHash();
  return await sha256(password) === expected;
}

function createToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "server_config_missing" }, 500);
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  if (req.method === "GET") {
    const { data, error } = await supabase.from("equipment_visuals").select("equipment_id,public_url,updated_at").order("equipment_id");
    if (error) return json({ error: error.message }, 500);
    return json({ images: Object.fromEntries((data ?? []).map(row => [row.equipment_id, row.public_url])) });
  }

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_request" }, 400);
  } catch { return json({ error: "invalid_json" }, 400); }

  const action = String(body.action ?? "");
  const adminId = String(body.adminId ?? "");
  const adminPassword = String(body.adminPassword ?? "");

  // Member administration never falls back to a password or a body token.
  // The transaction rechecks and locks this server-side session before access.
  if (action === "members") {
    const result = await handleAdminMembersAction(req.headers.get("x-admin-session") ?? "", body,
      (name, args) => supabase.rpc(name, args), sha256);
    return json(result.body, result.status);
  }

  if (action === "logout_session") {
    const token = req.headers.get("x-admin-session") ?? "";
    if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: "admin_auth_required" }, 401);
    const tokenSha256 = await sha256(token);
    const { data, error } = await supabase.from("app_admin_upload_sessions").select("id")
      .eq("token_sha256", tokenSha256).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (error) return json({ error: "admin_members_unavailable" }, 503);
    if (!data) return json({ error: "admin_auth_required" }, 401);
    const { error: deleteError } = await supabase.from("app_admin_upload_sessions").delete().eq("token_sha256", tokenSha256);
    if (deleteError) return json({ error: "admin_members_unavailable" }, 503);
    return json({ ok: true });
  }

  if (action === "session") {
    try {
      if (!await verifyPassword(adminId, adminPassword)) return json({ error: "admin_auth_required" }, 401);
      const sessionToken = createToken();
      const tokenSha256 = await sha256(sessionToken);
      const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
      await supabase.from("app_admin_upload_sessions").delete().lt("expires_at", new Date().toISOString());
      const { error } = await supabase.from("app_admin_upload_sessions").insert({ token_sha256: tokenSha256, expires_at: expiresAt });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, sessionToken, expiresAt });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "admin_session_failed" }, 500);
    }
  }

  const sessionToken = String(req.headers.get("x-admin-session") ?? body.sessionToken ?? "");
  let authorized = false;

  if (sessionToken) {
    const tokenSha256 = await sha256(sessionToken);
    const { data } = await supabase
      .from("app_admin_upload_sessions")
      .select("id")
      .eq("token_sha256", tokenSha256)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    authorized = Boolean(data);
  }

  if (!authorized && adminPassword) {
    try { authorized = await verifyPassword(adminId, adminPassword); } catch { authorized = false; }
  }

  if (!authorized) return json({ error: "admin_auth_required" }, 401);

  if (action === "upload") {
    const equipmentId = String(body.equipmentId ?? "").trim();
    const dataUrl = String(body.dataUrl ?? "");
    if (!equipmentId) return json({ error: "equipment_id_required" }, 400);
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
    if (!match) return json({ error: "invalid_image" }, 400);
    const contentType = match[1];
    const binary = atob(match[2].replace(/\s+/g, ""));
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    if (bytes.byteLength > 12 * 1024 * 1024) return json({ error: "image_too_large" }, 413);
    const ext = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1];
    const safeId = equipmentId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
    const path = `equipment/${safeId}.${ext}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType,
      upsert: true,
      cacheControl: "3600",
    });
    if (uploadError) return json({ error: uploadError.message }, 500);

    const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = `${publicData.publicUrl}?v=${Date.now()}`;
    const { error: dbError } = await supabase.from("equipment_visuals").upsert({
      equipment_id: equipmentId,
      storage_path: path,
      public_url: publicUrl,
      updated_at: new Date().toISOString(),
    }, { onConflict: "equipment_id" });
    if (dbError) return json({ error: dbError.message }, 500);
    return json({ ok: true, equipmentId, publicUrl });
  }

  if (action === "remove") {
    const equipmentId = String(body.equipmentId ?? "").trim();
    if (!equipmentId) return json({ error: "equipment_id_required" }, 400);
    const { data } = await supabase.from("equipment_visuals").select("storage_path").eq("equipment_id", equipmentId).maybeSingle();
    if (data?.storage_path) await supabase.storage.from(BUCKET).remove([data.storage_path]);
    const { error } = await supabase.from("equipment_visuals").delete().eq("equipment_id", equipmentId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, equipmentId });
  }

  return json({ error: "unknown_action" }, 400);
});

