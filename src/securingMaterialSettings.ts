export type VoidFillMaterialRule = {
  materialId: 'polywoven-airbag' | 'aluminum-shoring-bar';
  label: string;
  unitWeightKg: number;
  /** One unit's nominal cargo-face coverage used only for quantity planning. */
  unitCoverageM2: number;
  /** Applicable void thickness, or installed support span for a door-face bar. */
  minGapM: number;
  maxGapM: number;
  sourceNote: string;
};

export type VoidFillMaterialSettings = {
  sideGap: VoidFillMaterialRule;
  doorFace: VoidFillMaterialRule;
  heightStep: VoidFillMaterialRule;
  rowHole: VoidFillMaterialRule;
  topVoid: VoidFillMaterialRule;
};

export type SecuringMaterialSettings = {
  bandingKgPerM: number;
  cornerGuardKgPerM: number;
  wrappingKgPerM: number;
  antiSlipKgPerEa: number;
  dunnageKgPerEa: number;
  loadBarKgPerEa: number;
  voidFill: VoidFillMaterialSettings;
};

export const SECURING_MATERIAL_SETTINGS_STORAGE_KEY = 'container-loading-securing-material-settings';
export const SECURING_MATERIAL_SETTINGS_EVENT = 'container-loading:securing-material-settings';

const airbag: VoidFillMaterialRule = {
  materialId: 'polywoven-airbag',
  label: '폴리우븐 에어백 48×96in',
  unitWeightKg: 2.72,
  unitCoverageM2: 1.2192 * 2.4384,
  minGapM: 0.1016,
  maxGapM: 0.3048,
  sourceNote: 'Litco 48×96in polywoven dunnage air bag 대표값(제품 6lb, 적용 void 4–12in).',
};
const shoringBar: VoidFillMaterialRule = {
  materialId: 'aluminum-shoring-bar',
  label: '알루미늄 쉬어링 바',
  unitWeightKg: 10,
  // One bar is planned per roughly 0.8m of restrained cargo-face height.
  unitCoverageM2: 2.35 * 0.8,
  minGapM: 2.334,
  maxGapM: 2.598,
  sourceNote: 'Kinedyne HD E/A 알루미늄 쉬어링 빔 대표값(중량 10kg, 길이 약 91.9–102.3in).',
};

export const defaultSecuringMaterialSettings: SecuringMaterialSettings = {
  bandingKgPerM: 0.025,
  cornerGuardKgPerM: 0.12,
  wrappingKgPerM: 0.018,
  antiSlipKgPerEa: 0.35,
  dunnageKgPerEa: 0.75,
  loadBarKgPerEa: 4.5,
  voidFill: {
    sideGap: { ...airbag },
    doorFace: { ...shoringBar },
    heightStep: { ...airbag },
    rowHole: { ...airbag },
    topVoid: { ...airbag },
  },
};

function positiveOr(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function textOr(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeRule(value: Partial<VoidFillMaterialRule> | undefined, fallback: VoidFillMaterialRule): VoidFillMaterialRule {
  const materialId = value?.materialId === 'aluminum-shoring-bar' || value?.materialId === 'polywoven-airbag'
    ? value.materialId : fallback.materialId;
  const minGapM = positiveOr(value?.minGapM, fallback.minGapM);
  const maxGapM = Math.max(minGapM, positiveOr(value?.maxGapM, fallback.maxGapM));
  return {
    materialId,
    label: textOr(value?.label, fallback.label),
    unitWeightKg: positiveOr(value?.unitWeightKg, fallback.unitWeightKg),
    unitCoverageM2: Math.max(1e-6, positiveOr(value?.unitCoverageM2, fallback.unitCoverageM2)),
    minGapM,
    maxGapM,
    sourceNote: textOr(value?.sourceNote, fallback.sourceNote),
  };
}

export function normalizeSecuringMaterialSettings(value?: Partial<SecuringMaterialSettings> | null): SecuringMaterialSettings {
  const defaults = defaultSecuringMaterialSettings;
  return {
    bandingKgPerM: positiveOr(value?.bandingKgPerM, defaults.bandingKgPerM),
    cornerGuardKgPerM: positiveOr(value?.cornerGuardKgPerM, defaults.cornerGuardKgPerM),
    wrappingKgPerM: positiveOr(value?.wrappingKgPerM, defaults.wrappingKgPerM),
    antiSlipKgPerEa: positiveOr(value?.antiSlipKgPerEa, defaults.antiSlipKgPerEa),
    dunnageKgPerEa: positiveOr(value?.dunnageKgPerEa, defaults.dunnageKgPerEa),
    loadBarKgPerEa: positiveOr(value?.loadBarKgPerEa, defaults.loadBarKgPerEa),
    voidFill: {
      sideGap: normalizeRule(value?.voidFill?.sideGap, defaults.voidFill.sideGap),
      doorFace: normalizeRule(value?.voidFill?.doorFace, defaults.voidFill.doorFace),
      heightStep: normalizeRule(value?.voidFill?.heightStep, defaults.voidFill.heightStep),
      rowHole: normalizeRule(value?.voidFill?.rowHole, defaults.voidFill.rowHole),
      topVoid: normalizeRule(value?.voidFill?.topVoid, defaults.voidFill.topVoid),
    },
  };
}

export function readSecuringMaterialSettings(): SecuringMaterialSettings {
  if (typeof window === 'undefined') return normalizeSecuringMaterialSettings(defaultSecuringMaterialSettings);
  try {
    const raw = window.localStorage.getItem(SECURING_MATERIAL_SETTINGS_STORAGE_KEY);
    return raw ? normalizeSecuringMaterialSettings(JSON.parse(raw) as Partial<SecuringMaterialSettings>) : normalizeSecuringMaterialSettings(defaultSecuringMaterialSettings);
  } catch {
    return normalizeSecuringMaterialSettings(defaultSecuringMaterialSettings);
  }
}

export function writeSecuringMaterialSettings(settings: SecuringMaterialSettings) {
  if (typeof window === 'undefined') return;
  const normalized = normalizeSecuringMaterialSettings(settings);
  window.localStorage.setItem(SECURING_MATERIAL_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent<SecuringMaterialSettings>(SECURING_MATERIAL_SETTINGS_EVENT, { detail: normalized }));
}
