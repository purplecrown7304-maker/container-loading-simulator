import { describe, expect, it } from 'vitest';
import { defaultPalletSpec, packOnPallets } from './palletOptimization';
import { absorbSparsePallets, palletTopLayerFill, type PalletLoad } from './palletPacking';
import { validatePlacements } from './constraints';
import { hasAdequateSupport } from './support';
import { canPlaceByStackingRules } from './stacking';
import type { CargoItem, ContainerSpec, Placement } from './types';

const container: ContainerSpec = { length: 4, width: 2, height: 2.4, maxPayloadKg: 5000 };
const spec = { ...defaultPalletSpec, length: 1, width: 1, height: .1, maxStackLevels: 1 };
const box = (patch: Partial<CargoItem> = {}): CargoItem => ({ id: 'A', name: 'A', length: .5, width: .5, height: .2, weightKg: 10, quantity: 9, maxStackLayers: 9, maxTopLoadKg: 500, allowRotation: false, ...patch });
const counts = (cargo: CargoItem[], result: ReturnType<typeof packOnPallets>) => Object.fromEntries(cargo.map(item => [item.id, result.placements.filter(p => p.cargoId === item.id).length + result.remaining.filter(p => p.cargoId === item.id).reduce((n, p) => n + p.quantity, 0)]));

function expectSafe(space: ContainerSpec, cargo: CargoItem[], pallet: typeof spec, result: ReturnType<typeof packOnPallets>) {
  const map = new Map(cargo.map(item => [item.id, item]));
  expect(validatePlacements(space, result.placements)).toEqual([]);
  expect(counts(cargo, result)).toEqual(Object.fromEntries(cargo.map(item => [item.id, item.quantity])));
  expect(result.totalPalletizedWeightKg).toBeLessThanOrEqual(space.maxPayloadKg + 1e-6);
  for (const load of result.pallets) {
    expect(load.cargoWeightKg).toBeLessThanOrEqual(pallet.maxLoadKg + 1e-6);
    const base = { x: load.x, y: load.y, z: load.z + load.height, length: load.length, width: load.width };
    const placed: Placement[] = [];
    for (const p of [...load.cargoPlacements].sort((a,b) => a.z - b.z)) {
      expect(hasAdequateSupport(p, placed, base)).toBe(true);
      expect(canPlaceByStackingRules(map.get(p.cargoId)!, p, placed, map)).toBe(true);
      placed.push(p);
    }
  }
}

describe('regular top tiers below 50% move to a final mixed pallet (#97)', () => {
  it.each(['capacity', 'stability', 'unloading'] as const)('%s: takes the entire sparse tier off, even when another pallet is needed', strategy => {
    const cargo = [box()];
    const result = packOnPallets(container, cargo, spec, strategy);
    expect(result.palletCount).toBe(2);
    expect(result.placements).toHaveLength(9);
    expect(result.pallets.filter(p => !p.isMixedTail).map(p => p.cargoPlacements.length)).toEqual([8]);
    expect(result.pallets.filter(p => p.isMixedTail).map(p => p.cargoPlacements.length)).toEqual([1]);
    expectSafe(container, cargo, spec, result);
    expect(packOnPallets(container, cargo, spec, strategy)).toEqual(result);
  });

  it('keeps a tier at exactly 50% and moves one just below it', () => {
    const exact = packOnPallets(container, [box({ quantity: 10 })], spec);
    expect(exact.palletCount).toBe(1);
    expect(palletTopLayerFill(exact.pallets[0])).toBe(.5);
    const below = packOnPallets(container, [box({ width: .49, quantity: 10 })], spec);
    expect(below.palletCount).toBe(2);
    expect(below.pallets.filter(p => p.isMixedTail)[0].cargoPlacements).toHaveLength(2);
  });

  it('can configure the threshold without changing declared physical limits', () => {
    expect(packOnPallets(container, [box()], { ...spec, minTopLayerFillRatio: .25 }).palletCount).toBe(1);
    expect(packOnPallets(container, [box()], { ...spec, minTopLayerFillRatio: 0 }).palletCount).toBe(1);
    expect(packOnPallets(container, [box()], { ...spec, minTopLayerFillRatio: 1.1 }).remaining[0].reason).toContain('최상단 최소충전율');
  });

  it('preserves quantity as waiting when extra pallet weight cannot fit', () => {
    const cargo = [box()];
    const space = { ...container, maxPayloadKg: 120 };
    const result = packOnPallets(space, cargo, spec);
    expect(result.remaining.reduce((n, p) => n + p.quantity, 0)).toBeGreaterThan(0);
    expect(result.remaining.some(p => p.reason.includes('최상단 최소충전율'))).toBe(true);
    expectSafe(space, cargo, spec, result);
  });

  it('keeps candidate stack limits and reports waiting when an extra base has no legal position', () => {
    const cargo = [box()];
    const stacked = packOnPallets(container, cargo, { ...spec, maxStackLevels: 2 });
    expect(stacked.maxUsedStackLevel).toBeLessThanOrEqual(stacked.optimization.selectedStackTarget);
    const space = { ...container, length: 1, width: 1 };
    const result = packOnPallets(space, cargo, spec);
    expect(result.placements).toHaveLength(8);
    expect(result.remaining).toMatchObject([{ cargoId: 'A', quantity: 1 }]);
    expect(result.remaining[0].reason).toContain('최상단 최소충전율');
    expectSafe(space, cargo, spec, result);
  });

  it('never mixes different unloading stops or loops on weight-limited single tiers', () => {
    const cargo = [box({ id:'A',quantity:1,unloadPriority:1,weightKg:100 }),box({ id:'B',quantity:1,unloadPriority:2,weightKg:100 })];
    const limited = { ...spec, maxLoadKg:100 };
    const result = packOnPallets(container,cargo,limited,'unloading');
    expect(result.palletCount).toBe(2);
    for (const load of result.pallets) expect(new Set(load.cargoPlacements.map(p => p.cargoId)).size).toBe(1);
    expectSafe(container,cargo,limited,result);
  });

  it('collects a large shipment’s horns with its existing unfinished floor pallet', () => {
    // Synthetic same-size packaging case, not an export of the user's live shipment.
    const quantities=[350,300,150,92,3], weights=[17,16,15,14,1];
    const cargo=quantities.map((quantity,i)=>box({id:String.fromCharCode(65+i),length:.235,width:.13,height:.265,weightKg:weights[i],quantity,maxStackLayers:10,maxTopLoadKg:100}));
    const space={length:5.9,width:2.352,height:2.395,maxPayloadKg:28130};
    const pallet={...defaultPalletSpec,height:.12,tareWeightKg:6,maxLoadKg:1000};
    const result=packOnPallets(space,cargo,pallet);
    expect(result.placements).toHaveLength(895);
    expect(result.remaining).toEqual([]);
    expect(result.palletCount).toBe(15);
    const tails=result.pallets.filter(p=>p.isMixedTail);
    expect(tails).toHaveLength(1);
    expect(new Set(tails[0].cargoPlacements.map(p=>p.cargoId)).size).toBe(3);
    expect(tails[0].cargoPlacements).toHaveLength(36);
    for(const load of result.pallets.filter(p=>!p.isMixedTail)) expect(palletTopLayerFill(load)).toBeGreaterThanOrEqual(.5);
    expectSafe(space,cargo,pallet,result);
  });

  it('tries a permitted rotation in a lower gap before placing on an upper surface', () => {
    const pallet={...defaultPalletSpec,length:1.3,width:.9,height:.15};
    const cargo=[box({id:'BASE',length:.7,width:.9,height:.4,weightKg:80,quantity:1}),box({id:'TAIL',length:.6,width:.4,height:.4,weightKg:10,quantity:1,allowRotation:true})];
    const load=(index:number, p:Placement):PalletLoad=>({palletIndex:index,x:0,y:0,z:0,stackColumn:index,stackLevel:1,length:1.3,width:.9,height:.15,cargoPlacements:[p],cargoWeightKg:p.weightKg,totalWeightKg:p.weightKg+25,packagingWeightKg:0,packagingExtraHeightM:0,cornerGuardsUsed:false,wrappingUsed:false,centerOfGravity:{x:.65,y:.45,z:.3}});
    const base=load(1,{cargoId:'BASE',x:.6,y:0,z:.15,length:.7,width:.9,height:.4,weightKg:80});
    const tail=load(2,{cargoId:'TAIL',x:0,y:0,z:.15,length:.6,width:.4,height:.4,weightKg:10});
    const result=absorbSparsePallets([base,tail],cargo,pallet,{...container,width:.9},'capacity',2);
    expect(result.removed).toBe(1);
    const moved=result.pallets[0].cargoPlacements.find(p=>p.cargoId==='TAIL')!;
    expect(moved.z).toBe(.15);
    expect(moved.rotated).toBe(true);
  });
});
