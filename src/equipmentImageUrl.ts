import { readEquipmentImageOverrides } from './equipmentImageOverrides';
import { SUPABASE_URL } from './supabaseConfig';

// A browser may have cached a 404 for a deterministic Storage URL before an
// administrator uploaded that equipment image. Give every page load a fresh
// public URL so anonymous users do not keep seeing the built-in SVG forever.
const PUBLIC_IMAGE_SESSION_REVISION = Date.now().toString(36);

function appendRevision(url: string, revision?: string | number) {
  if (revision === undefined || revision === null || revision === '') return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}sync=${encodeURIComponent(String(revision))}`;
}

/**
 * Resolve an equipment visual from the server-backed override map first.
 * If the map has not finished loading yet, fall back to the deterministic
 * public Storage path used by container-admin-api. Public fallback URLs are
 * cache-busted per page load so a previously cached 404 cannot make the image
 * appear admin-only after the file is uploaded later.
 */
export function resolveEquipmentImageUrl(equipmentId: string, revision?: string | number) {
  const mapped = readEquipmentImageOverrides()[equipmentId];
  if (mapped) return appendRevision(mapped, revision);
  const canonical = `${SUPABASE_URL}/storage/v1/object/public/equipment-images/equipment/${encodeURIComponent(equipmentId)}.webp`;
  const publicRevision = `${PUBLIC_IMAGE_SESSION_REVISION}-${revision ?? 0}`;
  return appendRevision(canonical, publicRevision);
}
