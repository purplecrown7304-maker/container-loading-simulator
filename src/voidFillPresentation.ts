import type { LoadingResult, VoidFill, VoidFillKind, VoidFillMaterial } from './engine/types';

export const VOID_FILL_DISCLAIMER = '앱 기본값이며 현장 자재로 확인 필요. 실제 자재 강도·정격을 보증하지 않음.';

export const voidFillKindLabel: Record<VoidFillKind, string> = {
  'side-gap': '측면 틈',
  'door-face': '문쪽 끝단',
  'height-step': '높이 단차',
  'row-gap': '행 내부 틈',
  'top-void': '상부 틈',
};

export const voidFillMaterialLabel: Record<VoidFillMaterial, string> = {
  'dunnage-airbag': '던니지 에어백',
  'paper-honeycomb': '종이 허니컴',
  'load-bar': '카고 로드바',
  unresolved: '적용 자재 미확정',
};

export type VoidFillExportRow = {
  id: string;
  gapType: string;
  material: string;
  quantity: number;
  weightKg: number;
  gapM: number;
  voidVolumeM3: number;
  xM: number;
  yM: number;
  zM: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  fixedSupportEligible: 'Y' | 'N';
  note: string;
};

export function voidFillRows(result: LoadingResult): VoidFillExportRow[] {
  return (result.voidFillPlan?.fills ?? []).map(fill => ({
    id: fill.id,
    gapType: voidFillKindLabel[fill.kind],
    material: voidFillMaterialLabel[fill.material],
    quantity: fill.quantity,
    weightKg: Number(fill.weightKg.toFixed(3)),
    gapM: Number(fill.gapM.toFixed(4)),
    voidVolumeM3: Number(fill.voidVolumeM3.toFixed(4)),
    xM: Number(fill.x.toFixed(4)),
    yM: Number(fill.y.toFixed(4)),
    zM: Number(fill.z.toFixed(4)),
    lengthM: Number(fill.length.toFixed(4)),
    widthM: Number(fill.width.toFixed(4)),
    heightM: Number(fill.height.toFixed(4)),
    fixedSupportEligible: fill.fixedSupportEligible ? 'Y' : 'N',
    note: VOID_FILL_DISCLAIMER,
  }));
}

export function voidFillTotal(result: LoadingResult) {
  const plan = result.voidFillPlan;
  return {
    count: plan?.fills.length ?? 0,
    quantity: plan?.fills.reduce((sum, fill) => sum + fill.quantity, 0) ?? 0,
    weightKg: plan?.weightKg ?? 0,
    volumeM3: plan?.volumeM3 ?? 0,
    unresolvedCount: plan?.unresolvedCount ?? 0,
  };
}

export function voidFillMaterialColor(fill: VoidFill) {
  if (!fill.fixedSupportEligible || fill.material === 'unresolved') return '#dc2626';
  if (fill.material === 'dunnage-airbag') return '#7dd3fc';
  if (fill.material === 'paper-honeycomb') return '#d6b276';
  return '#e87924';
}
