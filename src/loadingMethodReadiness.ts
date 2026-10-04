import type { LoadingStrategy } from './engine/loadingEngine';
import { palletDestinationFit } from './engine/palletDestination';
import type { GuidedLoadingUnit } from './guidedLoadingUnitState';
import { AUTO_PALLET_TYPE, resolvePalletType, type PalletTypeSelectionState } from './palletTypeSelection';
import { palletRecommendationSignature } from './palletRecommendationInput';
import type { StoredState } from './storage';
import { palletJobSpec } from './palletJobSpecs';

export function loadingMethodBlockReason(confirmed: boolean, strategy: LoadingStrategy | null, mode: GuidedLoadingUnit, input: StoredState, selection: PalletTypeSelectionState) {
  if (!confirmed) return '제품 포장을 확정해야 다음 단계로 갈 수 있습니다.';
  if (!strategy) return '최적화 목표를 선택하세요.';
  if (mode === 'mixed' && input.cargo.some(i=>i.quantity>0 && !i.mixedLoadingMethod)) return '혼합 적재의 품목별 적재 유형을 지정하세요.';
  if (mode !== 'boxes' && !(mode === 'mixed' && input.cargo.every(i=>i.quantity<=0 || i.mixedLoadingMethod==='direct'))) {
    if (selection.selected === AUTO_PALLET_TYPE && (selection.signature !== palletRecommendationSignature(input,strategy,mode) || selection.status !== 'done')) return '팔레트 추천 계산을 기다리거나 사용할 팔레트를 직접 선택하세요.';
    if (selection.selected === AUTO_PALLET_TYPE && !selection.recommendedId) return '추천 가능한 팔레트가 없습니다. 규격·화물 조건을 확인하세요.';
    if (palletDestinationFit(input.container,palletJobSpec(resolvePalletType(selection))).status === 'incompatible') return '수령처 지정 규격에 맞는 팔레트를 선택하세요.';
  }
  return '';
}
