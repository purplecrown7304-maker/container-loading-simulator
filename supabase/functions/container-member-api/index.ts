import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const PASSWORD_ITERATIONS = 180000;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const MAX_DATA_BYTES = 5 * 1024 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomHex(bytesLength: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(bytesLength));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function hexBytes(value: string) {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2) throw new Error("invalid_hex");
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function passwordHash(password: string, saltHex: string, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexBytes(saltHex), iterations, hash: "SHA-256" },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, "0")).join("");
}

function bearer(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function publicMember(row: { id: string; email: string; display_name: string; status: string }) {
  return { id: row.id, email: row.email, displayName: row.display_name, status: row.status };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "server_config_missing" }, 500);
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const nowIso = new Date().toISOString();
  await db.from("loading_member_sessions").delete().lt("expires_at", nowIso);

  const token = bearer(req);
  let authenticatedMember: { id: string; email: string; display_name: string; status: string } | null = null;
  let tokenHash = "";
  if (token) {
    tokenHash = await sha256(token);
    const { data: session } = await db
      .from("loading_member_sessions")
      .select("member_id,expires_at")
      .eq("token_hash", tokenHash)
      .gt("expires_at", nowIso)
      .maybeSingle();
    if (session) {
      const { data: member } = await db
        .from("loading_members")
        .select("id,email,display_name,status")
        .eq("id", session.member_id)
        .maybeSingle();
      if (member?.status === "active") authenticatedMember = member;
    }
  }

  if (req.method === "GET") {
    if (!authenticatedMember) return json({ error: "member_auth_required" }, 401);
    await db.from("loading_member_sessions").update({ last_seen_at: nowIso }).eq("token_hash", tokenHash);
    const { data: session } = await db.from("loading_member_sessions").select("expires_at").eq("token_hash", tokenHash).maybeSingle();
    return json({ ok: true, member: publicMember(authenticatedMember), expiresAt: session?.expires_at });
  }

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_DATA_BYTES) return json({ error: "payload_too_large" }, 413);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
    if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_DATA_BYTES) return json({ error: "payload_too_large" }, 413);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const action = String(body.action ?? "");

  if (action === "signup") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const displayName = String(body.displayName ?? "").trim();
    const password = String(body.password ?? "");
    if (!email.includes("@") || email.length > 254) return json({ error: "invalid_email" }, 400);
    if (!displayName || displayName.length > 60) return json({ error: "invalid_display_name" }, 400);
    if (password.length < 8 || password.length > 200) return json({ error: "weak_password" }, 400);
    const { data: existing } = await db.from("loading_members").select("id").eq("email", email).maybeSingle();
    if (existing) return json({ error: "email_already_registered" }, 409);

    const salt = randomHex(16);
    const hash = await passwordHash(password, salt, PASSWORD_ITERATIONS);
    const { data: member, error } = await db.from("loading_members").insert({
      email,
      display_name: displayName,
      password_salt: salt,
      password_hash: hash,
      password_iterations: PASSWORD_ITERATIONS,
      last_login_at: nowIso,
    }).select("id,email,display_name,status").single();
    if (error || !member) return json({ error: error?.message ?? "member_create_failed" }, 500);

    const sessionToken = randomHex(32);
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
    const { error: sessionError } = await db.from("loading_member_sessions").insert({
      token_hash: await sha256(sessionToken), member_id: member.id, expires_at: expiresAt,
    });
    if (sessionError) return json({ error: sessionError.message }, 500);
    return json({ ok: true, token: sessionToken, expiresAt, member: publicMember(member) });
  }

  if (action === "login") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const { data: member } = await db
      .from("loading_members")
      .select("id,email,display_name,status,password_salt,password_hash,password_iterations")
      .eq("email", email)
      .maybeSingle();
    if (!member || member.status !== "active") return json({ error: "invalid_credentials" }, 401);
    const actual = await passwordHash(password, member.password_salt, member.password_iterations);
    if (actual !== member.password_hash) return json({ error: "invalid_credentials" }, 401);

    const sessionToken = randomHex(32);
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
    const { error: sessionError } = await db.from("loading_member_sessions").insert({
      token_hash: await sha256(sessionToken), member_id: member.id, expires_at: expiresAt,
    });
    if (sessionError) return json({ error: sessionError.message }, 500);
    await db.from("loading_members").update({ last_login_at: nowIso, updated_at: nowIso }).eq("id", member.id);
    return json({ ok: true, token: sessionToken, expiresAt, member: publicMember(member) });
  }

  if (action === "logout") {
    if (tokenHash) await db.from("loading_member_sessions").delete().eq("token_hash", tokenHash);
    return json({ ok: true });
  }

  if (!authenticatedMember) return json({ error: "member_auth_required" }, 401);
  await db.from("loading_member_sessions").update({ last_seen_at: nowIso }).eq("token_hash", tokenHash);

  if (action === "get_data") {
    const { data, error } = await db
      .from("loading_member_data")
      .select("planner_state,personal_boxes,app_state,schema_version,updated_at")
      .eq("member_id", authenticatedMember.id)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ ok: true, exists: false, data: null });
    return json({
      ok: true,
      exists: true,
      data: {
        plannerState: data.planner_state ?? null,
        personalBoxes: Array.isArray(data.personal_boxes) ? data.personal_boxes : [],
        appState: isRecord(data.app_state) ? data.app_state : {},
        schemaVersion: Number(data.schema_version) || 1,
        updatedAt: data.updated_at,
      },
    });
  }

  if (action === "save_data") {
    const plannerState = body.plannerState == null || isRecord(body.plannerState) ? body.plannerState ?? null : null;
    const personalBoxes = Array.isArray(body.personalBoxes) ? body.personalBoxes : [];
    const appState = isRecord(body.appState) ? body.appState : {};
    const schemaVersion = Number.isInteger(body.schemaVersion) && Number(body.schemaVersion) > 0 ? Number(body.schemaVersion) : 1;
    const { data, error } = await db.from("loading_member_data").upsert({
      member_id: authenticatedMember.id,
      planner_state: plannerState,
      personal_boxes: personalBoxes,
      app_state: appState,
      schema_version: schemaVersion,
      updated_at: nowIso,
    }, { onConflict: "member_id" }).select("updated_at").single();
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, updatedAt: data?.updated_at ?? nowIso });
  }

  return json({ error: "unknown_action" }, 400);
});
