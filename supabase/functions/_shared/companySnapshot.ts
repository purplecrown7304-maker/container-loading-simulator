// Shared JSON boundary: does not run or weaken any loading/physics rule.
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown, min = 0) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= 1e9;
const date = (v: unknown) => typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v));
const keys = new Set(['schemaVersion','mode','capturedAt','container','cargo','result','equipment','recordedVerification']);

function safeJson(value: unknown, depth = 0): boolean {
  if (depth > 40) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 100_000;
  if (Array.isArray(value)) return value.length <= 100_000 && value.every(item => safeJson(item, depth + 1));
  return record(value) && Object.entries(value).every(([key, item]) =>
    !/password|token|secret|authorization|api.?key|session|^__proto__$|^constructor$|^prototype$/i.test(key)
    && safeJson(item, depth + 1));
}

export function validCompanySnapshot(value: unknown): boolean {
  if (!record(value) || value.schemaVersion !== 1 || !['boxes','pallets'].includes(String(value.mode)) || !date(value.capturedAt)
    || Object.keys(value).some(key => !keys.has(key)) || !safeJson(value) || new TextEncoder().encode(JSON.stringify(value)).length > 3_500_000) return false;
  const container = value.container;
  if (!record(container) || !['length','width','height'].every(key => finite(container[key], 0.001)) || !finite(container.maxPayloadKg, 0.001)) return false;
  if (!Array.isArray(value.cargo) || value.cargo.length === 0 || value.cargo.length > 10_000) return false;
  const demand = new Map<string, number>();
  for (const item of value.cargo) {
    if (!record(item) || typeof item.id !== 'string' || !item.id || item.id.length > 200 || demand.has(item.id)
      || typeof item.name !== 'string' || item.name.length > 500
      || !['length','width','height'].every(key => finite(item[key], 0.001)) || !finite(item.weightKg)
      || !Number.isSafeInteger(item.quantity) || !finite(item.quantity) || Number(item.quantity) > 10_000_000) return false;
    demand.set(item.id, Number(item.quantity));
  }
  if (value.equipment !== undefined && (!record(value.equipment) || typeof value.equipment.id !== 'string' || typeof value.equipment.name !== 'string')) return false;
  if (value.recordedVerification !== undefined && (!record(value.recordedVerification)
    || !['passed','failed','review'].includes(String(value.recordedVerification.status)) || !date(value.recordedVerification.testedAt))) return false;
  if (value.result === undefined) return value.recordedVerification === undefined;
  const result = value.result;
  if (!record(result) || !Array.isArray(result.placements) || !Array.isArray(result.remaining) || !Array.isArray(result.validationIssues)
    || !finite(result.loadedWeightKg) || !finite(result.usedVolumeM3)) return false;
  const accounted = new Map<string, number>();
  const units = new Set<string>();
  for (const placement of result.placements) {
    if (!record(placement) || typeof placement.cargoId !== 'string' || !demand.has(placement.cargoId)
      || !['x','y','z','weightKg'].every(key => finite(placement[key]))
      || !['length','width','height'].every(key => finite(placement[key], 0.001))) return false;
    if (placement.unitId !== undefined) {
      if (typeof placement.unitId !== 'string' || !placement.unitId || units.has(placement.unitId)) return false;
      units.add(placement.unitId);
    }
    accounted.set(placement.cargoId, (accounted.get(placement.cargoId) ?? 0) + 1);
  }
  for (const waiting of result.remaining) {
    if (!record(waiting) || typeof waiting.cargoId !== 'string' || !demand.has(waiting.cargoId)
      || !Number.isSafeInteger(waiting.quantity) || !finite(waiting.quantity) || typeof waiting.reason !== 'string') return false;
    accounted.set(waiting.cargoId, (accounted.get(waiting.cargoId) ?? 0) + Number(waiting.quantity));
  }
  return [...demand].every(([id, quantity]) => (accounted.get(id) ?? 0) === quantity);
}

export function companyErrorStatus(message: string): number {
  if (message === 'company_forbidden' || message === 'company_self_review') return 403;
  if (message === 'company_conflict') return 409;
  if (['company_invalid','company_invite_invalid','company_review_required'].includes(message)) return 400;
  return 503;
}
