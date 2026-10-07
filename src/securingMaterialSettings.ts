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
  voidDoorBarKgPerEa: number;
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
  // AW Packaging AW-0912 product data: 0.59 kg, 900 x 1200 mm face, 100-450 mm void.
  // Planning defaults only; actual pressure/strength follows the material manufacturer.
  voidAirBagKgPerEa: 0.59,
  voidAirBagFaceAreaM2: 1.08,
  voidAirBagMinGapM: 0.10,
  voidAirBagMaxGapM: 0.45,
  // Kraft-paper honeycomb is a cut-to-fit planning fallback. A measured hollow kraft
  // honeycomb reference is about 40 kg/m3; the app limits the default to 12-100 mm gaps.
  // Module volume is only quantity rounding, not a certified product size.
  voidHoneycombKgPerM3: 40,
  voidHoneycombModuleVolumeM3: 0.01,
  voidHoneycombMinGapM: 0.012,
  voidHoneycombMaxGapM: 0.10,
  // JahooPak JPCBS103 product data: 2261-2642 mm adjustable span, 5.1 kg net weight.
  // Coverage height is an app planning spacing, not a load rating.
  voidDoorBarKgPerEa: 5.1,
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
    voidDoorBarKgPerEa: positiveOr(value?.voidDoorBarKgPerEa, defaultSecuringMaterialSettings.voidDoorBarKgPerEa),
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
