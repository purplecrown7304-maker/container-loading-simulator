import type { CargoItem, CargoOrientation } from './types';

export const ALL_ORIENTATIONS: CargoOrientation[] = ['LWH','WLH','LHW','HLW','WHL','HWL'];
export const UPRIGHT_ORIENTATIONS: CargoOrientation[] = ['LWH','WLH'];

export function allowedCargoOrientations(item: CargoItem): CargoOrientation[] {
  const type = item.cargoType ?? 'carton';
  if (item.allowRotation === false) return ['LWH'];
  if (item.thisSideUp || type !== 'carton') return UPRIGHT_ORIENTATIONS;
  return ALL_ORIENTATIONS;
}

export function orientedCargoSize(item: CargoItem, orientation: CargoOrientation) {
  const pick = (axis: string) => axis === 'L' ? item.length : axis === 'W' ? item.width : item.height;
  return { length: pick(orientation[0]), width: pick(orientation[1]), height: pick(orientation[2]) };
}

export function orientationFromPlacement(item: CargoItem, length: number, width: number, height: number): CargoOrientation | null {
  for (const orientation of allowedCargoOrientations(item)) {
    const size = orientedCargoSize(item, orientation);
    if (Math.abs(size.length - length) <= 1e-6 && Math.abs(size.width - width) <= 1e-6 && Math.abs(size.height - height) <= 1e-6) return orientation;
  }
  return null;
}

export function isForkliftCargo(item: CargoItem) {
  const type = item.cargoType ?? 'carton';
  return type === 'pallet' || type === 'machine' || type === 'drum' || type === 'roll';
}
