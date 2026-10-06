export type SecuringMaterialSettings = {
  bandingKgPerM: number;
  cornerGuardKgPerM: number;
  wrappingKgPerM: number;
  antiSlipKgPerEa: number;
  dunnageKgPerEa: number;
  loadBarKgPerEa: number;
  /** Void-fill planning defaults. These are editable field values, not certified ratings. */
  voidAirBagKgPerEa: number;
  voidAirBagFaceAreaM2: number;
  voidAirBagMinGapM: number;
  voidAirBagMaxGapM: number;
  voidHoneycombKgPerM3: number;
  voidHoneycombModuleVolumeM3: number;
  voidHoneycombMinGapM: number;
  voidHoneycombMaxGapM: number;
  voidDoorBarMinSpanM: number;
  voidDoorBarMaxSpanM: number;
  voidDoorBarCoverageHeightM: number;
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
  // AW-0912 planning reference: 0.59 kg, 0.9 x 1.2 m face, 0.10-0.45 m void.
  voidAirBagKgPerEa: 0.59,
  voidAirBagFaceAreaM2: 1.08,
  voidAirBagMinGapM: 0.10,
  voidAirBagMaxGapM: 0.45,
  // Paper honeycomb is modeled as cut-to-fit planning modules. Density is an app
  // default and must be replaced by the actual site material before dispatch.
  voidHoneycombKgPerM3: 25,
  voidHoneycombModuleVolumeM3: 0.05,
  voidHoneycombMinGapM: 0.012,
  voidHoneycombMaxGapM: 1.20,
  // Door-face load bar geometry is a planning constraint, not a strength rating.
  voidDoorBarMinSpanM: 2.261,
  voidDoorBarMaxSpanM: 2.642,
  voidDoorBarCoverageHeightM: 1.20,
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
    voidAirBagKgPerEa: positiveOr(value?.voidAirBagKgPerEa, defaultSecuringMaterialSettings.voidAirBagKgPerEa),
    voidAirBagFaceAreaM2: positiveOr(value?.voidAirBagFaceAreaM2, defaultSecuringMaterialSettings.voidAirBagFaceAreaM2),
    voidAirBagMinGapM: positiveOr(value?.voidAirBagMinGapM, defaultSecuringMaterialSettings.voidAirBagMinGapM),
    voidAirBagMaxGapM: positiveOr(value?.voidAirBagMaxGapM, defaultSecuringMaterialSettings.voidAirBagMaxGapM),
    voidHoneycombKgPerM3: positiveOr(value?.voidHoneycombKgPerM3, defaultSecuringMaterialSettings.voidHoneycombKgPerM3),
    voidHoneycombModuleVolumeM3: positiveOr(value?.voidHoneycombModuleVolumeM3, defaultSecuringMaterialSettings.voidHoneycombModuleVolumeM3),
    voidHoneycombMinGapM: positiveOr(value?.voidHoneycombMinGapM, defaultSecuringMaterialSettings.voidHoneycombMinGapM),
    voidHoneycombMaxGapM: positiveOr(value?.voidHoneycombMaxGapM, defaultSecuringMaterialSettings.voidHoneycombMaxGapM),
    voidDoorBarMinSpanM: positiveOr(value?.voidDoorBarMinSpanM, defaultSecuringMaterialSettings.voidDoorBarMinSpanM),
    voidDoorBarMaxSpanM: positiveOr(value?.voidDoorBarMaxSpanM, defaultSecuringMaterialSettings.voidDoorBarMaxSpanM),
    voidDoorBarCoverageHeightM: positiveOr(value?.voidDoorBarCoverageHeightM, defaultSecuringMaterialSettings.voidDoorBarCoverageHeightM),
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
