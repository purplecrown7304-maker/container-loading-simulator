/**
 * Carton material and an ESTIMATED allowable top load (대표 지시 2026-10-08).
 *
 * Estimate only, never a test result: simplified McKee formula
 *   BCT = 5.87 × ECT × √(board thickness × box perimeter)
 * with a representative, conservative ECT and thickness per board grade, divided by a stacking
 * safety factor. Humidity, storage time, print/handholes and box proportions all lower real
 * strength; a measured value entered by the user always takes precedence.
 *
 * Sources for the representative inputs: McKee simplified formula and k = 5.87 (Westpak);
 * flute thickness ranges E 1.3–1.6, B 2.6–3.0, C 3.6–4.2, BC 6.1–6.7 mm (Packaging Strategies);
 * 32 ECT single wall C-flute and 44 ECT double wall (Racklify). Safety factor 5 follows the
 * rulebook's 1/3–1/5 range at the conservative end for sea transport and long storage.
 */
export type CartonMaterial = 'e-flute' | 'b-flute' | 'ac-flute' | 'double-wall' | 'plastic' | 'wood';

const LB_PER_IN_TO_N_PER_M = 175.1268;
const N_TO_KGF = 1 / 9.80665;
export const MCKEE_K = 5.87;
export const CARTON_STACKING_SAFETY_FACTOR = 5;

type MaterialSpec = { label: string; ectLbPerIn?: number; thicknessMm?: number; note: string };

export const CARTON_MATERIALS: Record<CartonMaterial, MaterialSpec> = {
  'e-flute': { label: 'E골 단면', ectLbPerIn: 23, thicknessMm: 1.3, note: '얇은 소형 상자' },
  'b-flute': { label: 'B골 단면', ectLbPerIn: 29, thicknessMm: 2.6, note: '일반 소·중형 상자' },
  'ac-flute': { label: 'A·C골 단면', ectLbPerIn: 32, thicknessMm: 3.6, note: '일반 중형 상자' },
  'double-wall': { label: '이중골 (BA·BC)', ectLbPerIn: 44, thicknessMm: 6.1, note: '중량물·높은 적층' },
  plastic: { label: '플라스틱 상자', note: '제조사 하중표를 직접 입력' },
  wood: { label: '목재 상자', note: '제작 사양에 따라 직접 입력' },
};

export const CARTON_MATERIAL_ORDER: CartonMaterial[] = ['e-flute', 'b-flute', 'ac-flute', 'double-wall', 'plastic', 'wood'];

export function cartonMaterialLabel(material: CartonMaterial | undefined) {
  return material ? CARTON_MATERIALS[material]?.label ?? '-' : '-';
}

export type CartonStrengthEstimate = { bctKg: number; allowableTopLoadKg: number; safetyFactor: number; material: CartonMaterial };

/** Null when the material has no corrugated formula or the footprint is invalid. Outer dimensions in metres. */
export function estimateCartonTopLoad(material: CartonMaterial | undefined, lengthM: number, widthM: number, safetyFactor = CARTON_STACKING_SAFETY_FACTOR): CartonStrengthEstimate | null {
  const spec = material ? CARTON_MATERIALS[material] : undefined;
  if (!material || !spec?.ectLbPerIn || !spec.thicknessMm) return null;
  if (!(lengthM > 0) || !(widthM > 0) || !(safetyFactor >= 1)) return null;
  const perimeterM = 2 * (lengthM + widthM);
  const bctN = MCKEE_K * spec.ectLbPerIn * LB_PER_IN_TO_N_PER_M * Math.sqrt(spec.thicknessMm / 1000 * perimeterM);
  const bctKg = bctN * N_TO_KGF;
  // Rounded down to 0.1 kg so the estimate never exceeds the formula.
  const allowableTopLoadKg = Math.floor(bctKg / safetyFactor * 10) / 10;
  return { bctKg, allowableTopLoadKg, safetyFactor, material };
}
