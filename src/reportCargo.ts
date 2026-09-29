import { cargoColor } from './cargoColors';
import type { CargoItem } from './engine/types';
import { readShipmentInstructionSnapshot } from './shipmentInstruction';

/** A report identity keeps partial cartons with their product, without guessing arbitrary IDs. */
export function reportCargoCatalog(cargo: CargoItem[]) {
  const snapshot = readShipmentInstructionSnapshot(cargo);
  return new Map(cargo.map(item => {
    const line = snapshot?.lines.find(line => item.id === line.cargoId || item.id === `${line.cargoId}-PARTIAL`);
    const base = cargo.find(other => `${other.id}-PARTIAL` === item.id);
    const partial = Boolean(base || (line?.packagingMode === 'box' && line.partialUnits && (item.id.endsWith('-PARTIAL') || line.productQuantity < line.unitsPerBox)));
    const code = line?.productId ?? item.productId ?? (base?.id ?? item.id);
    return [item.id, { code, name: line?.productName ?? item.productName ?? item.name, partial, color: cargoColor(base?.id ?? item.id, base?.displayColor ?? item.displayColor) }];
  }));
}

export type ReportCargoCatalog = ReturnType<typeof reportCargoCatalog>;
