import { describe, expect, it } from 'vitest';
import { auditLoading } from './loadingAudit';
import { unloadingObstructions } from './operationalQuality';
import { fillUnloadingTrenches } from './trenchFilling';
import type { CargoItem, ContainerSpec, Placement } from './types';

const container: ContainerSpec = { length: 2, width: 1, height: 2, maxPayloadKg: 10_000 };
const box = { length: 0.2, width: 0.2, height: 0.2, weightKg: 10, maxTopLoadKg: 1000, maxStackLayers: 10 };
// Door is +X. Higher unloadPriority = unloaded later = deeper in the container.
const cargo: CargoItem[] = [
  { id: 'DEEP', name: 'Deep stop', ...box, quantity: 25, unloadPriority: 3 },
  { id: 'MID', name: 'Small middle stop', ...box, quantity: 5, unloadPriority: 2 },
  { id: 'FRONT', name: 'Door stop', ...box, quantity: 30, unloadPriority: 1 },
];

function column(cargoId: string, x: number, y: number, tiers: number): Placement[] {
  return Array.from({ length: tiers }, (_, tier) => ({ cargoId, x, y, z: tier * 0.2, length: 0.2, width: 0.2, height: 0.2, weightKg: 10 }));
}

/** DEEP wall | one-tier MID trench | FRONT wall, plus a FRONT peak row at the door. */
function trenchLayout() {
  const placements: Placement[] = [];
  for (let row = 0; row < 5; row += 1) {
    placements.push(...column('DEEP', 0, row * 0.2, 5));
    placements.push(...column('MID', 0.2, row * 0.2, 1));
    placements.push(...column('FRONT', 0.4, row * 0.2, 5));
  }
  placements.push(...column('FRONT', 0.6, 0, 5));
  return placements;
}

function topAt(placements: Placement[], x: number, y: number) {
  return Math.max(0, ...placements.filter(p => Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6).map(p => p.z + p.height));
}

describe('unloading trench filling', () => {
  it('fills a one-carton trench between two tall stop walls without breaking any rule', () => {
    const input = trenchLayout();
    expect(auditLoading(container, cargo, input)).toEqual([]);
    expect(unloadingObstructions(cargo, input)).toBe(0);

    const output = fillUnloadingTrenches(container, cargo, input);

    expect(output).toHaveLength(input.length);
    for (const item of cargo) {
      expect(output.filter(p => p.cargoId === item.id)).toHaveLength(input.filter(p => p.cargoId === item.id).length);
    }
    expect(auditLoading(container, cargo, output)).toEqual([]);
    expect(unloadingObstructions(cargo, output)).toBe(0);
    const trenchTops = [0, 0.2, 0.4, 0.6, 0.8].map(y => topAt(output, 0.2, y));
    expect(Math.min(...trenchTops)).toBeGreaterThan(0.2 + 1e-6);
    // Only door-stop cartons may sit on the middle stop; never a later (deeper) stop.
    const lifted = output.filter(p => Math.abs(p.x - 0.2) < 1e-6 && p.z > 1e-6);
    expect(lifted.length).toBeGreaterThan(0);
    expect(lifted.every(p => p.cargoId === 'FRONT')).toBe(true);
  });

  it('refuses moves that would put a later stop on top of an earlier one', () => {
    // Swap roles: the tall walls are the latest stop, so no donor may sit on the trench.
    const late: CargoItem[] = cargo.map(item => item.id === 'FRONT' ? { ...item, unloadPriority: 3 } : item.id === 'DEEP' ? { ...item, unloadPriority: 4 } : item);
    const input = trenchLayout().filter(p => !(p.cargoId === 'FRONT' && p.x > 0.5));
    const before = unloadingObstructions(late, input);
    const output = fillUnloadingTrenches(container, late, input);
    expect(unloadingObstructions(late, output)).toBeLessThanOrEqual(before);
    expect(output.filter(p => Math.abs(p.x - 0.2) < 1e-6 && p.z > 1e-6)).toEqual([]);
  });

  it('leaves a flat layout untouched', () => {
    const flat = [0, 0.2, 0.4].flatMap(x => [0, 0.2].flatMap(y => column('FRONT', x, y, 3)));
    expect(fillUnloadingTrenches(container, cargo, flat)).toEqual(flat);
  });
});
