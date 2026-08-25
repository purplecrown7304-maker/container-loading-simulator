export type SecuringMaterialSettings = {
  bandingKgPerM: number;
  cornerGuardKgPerM: number;
  wrappingKgPerM: number;
  antiSlipKgPerEa: number;
  dunnageKgPerEa: number;
  loadBarKgPerEa: number;
};

export const SECURING_MATERIAL_SETTINGS_STORAGE_KEY = 'container-loading-securing-material-settings';
export const SECURING_MATERIAL_SETTINGS_EVENT = 'container-loading:securing-material-settings';

export const defaultSecuringMaterialSettings: SecuringMaterialSettings = {
  bandingKgPerM: 0.025,
  cornerGuardKgPerM: 0.12,
  wrappingKgPerM: 0.018,
  antiSlipKgPerEa: 0.35,
  dunnageKgPerEa: 0.75,
  loadBarKgPerEa: 4.5,
};

function positiveOr(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function normalizeSecuringMaterialSettings(value?: Partial<SecuringMaterialSettings> | null): SecuringMaterialSettings {
  return {
    bandingKgPerM: positiveOr(value?.bandingKgPerM, defaultSecuringMaterialSettings.bandingKgPerM),
    cornerGuardKgPerM: positiveOr(value?.cornerGuardKgPerM, defaultSecuringMaterialSettings.cornerGuardKgPerM),
    wrappingKgPerM: positiveOr(value?.wrappingKgPerM, defaultSecuringMaterialSettings.wrappingKgPerM),
    antiSlipKgPerEa: positiveOr(value?.antiSlipKgPerEa, defaultSecuringMaterialSettings.antiSlipKgPerEa),
    dunnageKgPerEa: positiveOr(value?.dunnageKgPerEa, defaultSecuringMaterialSettings.dunnageKgPerEa),
    loadBarKgPerEa: positiveOr(value?.loadBarKgPerEa, defaultSecuringMaterialSettings.loadBarKgPerEa),
  };
}

export function readSecuringMaterialSettings(): SecuringMaterialSettings {
  if (typeof window === 'undefined') return { ...defaultSecuringMaterialSettings };
  try {
    const raw = window.localStorage.getItem(SECURING_MATERIAL_SETTINGS_STORAGE_KEY);
    return raw ? normalizeSecuringMaterialSettings(JSON.parse(raw) as Partial<SecuringMaterialSettings>) : { ...defaultSecuringMaterialSettings };
  } catch {
    return { ...defaultSecuringMaterialSettings };
  }
}

export function writeSecuringMaterialSettings(settings: SecuringMaterialSettings) {
  if (typeof window === 'undefined') return;
  const normalized = normalizeSecuringMaterialSettings(settings);
  window.localStorage.setItem(SECURING_MATERIAL_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent<SecuringMaterialSettings>(SECURING_MATERIAL_SETTINGS_EVENT, { detail: normalized }));
}
