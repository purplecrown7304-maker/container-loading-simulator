import type { CargoItem, ContainerSpec, LoadingResult } from '../engine/types';
import type { TransportEquipment } from '../transportEquipment';

export async function exportUx3Workbook(container: ContainerSpec, equipment: TransportEquipment, cargo: CargoItem[], result: LoadingResult) {
  const XLSX = await import('xlsx');
  const loadedByCargo = new Map<string, number>();
  result.placements.forEach(item => loadedByCargo.set(item.cargoId, (loadedByCargo.get(item.cargoId) ?? 0) + 1));

  const summary = [
    ['항목', '값'],
    ['운송장비', equipment.shortName],
    ['내부길이(m)', container.length],
    ['내부폭(m)', container.width],
    ['내부높이(m)', container.height],
    ['최대적재중량(kg)', container.maxPayloadKg],
    ['적재수량(EA)', result.placements.length],
    ['적재중량(kg)', result.loadedWeightKg],
    ['사용용적(m3)', result.usedVolumeM3],
    ['미적재수량(EA)', result.remaining.reduce((sum, item) => sum + item.quantity, 0)],
    ['비고', '무게중심/관성 평가는 경고·품질 항목이며 작업지시서 생성 차단 조건이 아님'],
  ];

  const cargoRows = cargo.map(item => {
    const loaded = loadedByCargo.get(item.id) ?? 0;
    return {
      코드: item.id,
      품명: item.name,
      요청수량: item.quantity,
      적재수량: loaded,
      미적재수량: Math.max(0, item.quantity - loaded),
      길이_m: item.length,
      폭_m: item.width,
      높이_m: item.height,
      개당중량_kg: item.weightKg,
      최대적층단: item.maxStackLayers ?? '',
      상부허용중량_kg: item.maxTopLoadKg ?? '',
      회전허용: item.allowRotation !== false ? 'Y' : 'N',
    };
  });

  const placementRows = result.placements.map((item, index) => ({
    No: index + 1,
    코드: item.cargoId,
    X_m: item.x,
    Y_m: item.y,
    Z_m: item.z,
    길이_m: item.length,
    폭_m: item.width,
    높이_m: item.height,
    중량_kg: item.weightKg,
    회전: item.rotated ? '90도' : '기본',
  }));

  const remainingRows = result.remaining.length
    ? result.remaining.map(item => ({ 코드: item.cargoId, 수량: item.quantity, 사유: item.reason }))
    : [{ 코드: '-', 수량: 0, 사유: '미적재 화물 없음' }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), '요약');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(cargoRows), '품목별');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(placementRows), '배치좌표');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(remainingRows), '미적재');
  XLSX.writeFile(workbook, `loading-result-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
