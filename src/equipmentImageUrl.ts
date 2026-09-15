import { readEquipmentImageOverrides } from './equipmentImageOverrides';
import { SUPABASE_URL } from './supabaseConfig';

function appendRevision(url: string, revision?: string | number) {
  if (revision === undefined || revision === null || revision === '') return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}sync=${encodeURIComponent(String(revision))}`;
}

/**
 * Resolve an equipment visual from the server-backed override map first.
 * If the map has not finished loading yet, fall back to the deterministic
 * public Storage path used by container-admin-api. The image element handles
 * a missing object by falling back to the built-in SVG.
 */
export function resolveEquipmentImageUrl(equipmentId: string, revision?: string | number) {
  const mapped = readEquipmentImageOverrides()[equipmentId];
  if (mapped) return appendRevision(mapped, revision);
  const canonical = `${SUPABASE_URL}/storage/v1/object/public/equipment-images/equipment/${encodeURIComponent(equipmentId)}.webp`;
  return appendRevision(canonical, revision);
}
