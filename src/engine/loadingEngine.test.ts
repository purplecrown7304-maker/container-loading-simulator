import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import { pack } from '../load-sim';
import { containerToLoadSimSpace, expandCargoToLoadSim, packResultToLoadingResult } from '../rule-engine/loadSimAdapter';
import { validateExistingWithLoadSim } from '../rule-engine/loadSimEngine';
import type { CargoItem, ContainerSpec } from './types';
const container: ContainerSpec = { length: 2, width: 1, height: 1, maxPayloadKg: 1000 };
const cargo = (patch: Partial<CargoItem> = {}): CargoItem => ({ id: 'A', name: 'A', length: .4, width: .3, height: .2, weightKg: 10, quantity: 4, maxStackLayers: 4, ...patch });
const cases: Array<[string, ContainerSpec, CargoItem[]]> = [
  ['ordinary',container,[cargo()]],
  ['payload',{...container,maxPayloadKg:25},[cargo()]],
  ['exact-fit rejected by A margins',{length:1,width:1,height:1,maxPayloadKg:100},[cargo({length:1,width:1,height:1,quantity:1})]],
  ['six orientations',{length:.7,width:.45,height:.35,maxPayloadKg:100},[cargo({length:.5,width:.3,height:.4,quantity:1})]],
  ['explicit no rotation',{length:.7,width:.45,height:.35,maxPayloadKg:100},[cargo({length:.5,width:.3,height:.4,quantity:1,allowRotation:false})]],
  ['two stops',container,[cargo({id:'FIRST',unloadPriority:1}),cargo({id:'LAST',unloadPriority:2})]],
  ['temperature hard failure',container,[cargo({id:'COLD',tempZone:'cold',quantity:1}),cargo({id:'WARM',tempZone:'warm',quantity:1})]],
  ['CG offset',container,[cargo({cgOffsetM:{l:.05,w:0,h:0}})]],
];
describe('A pack is the sole loading algorithm', () => {
  it.each(cases)('%s matches direct A source and conserves every SKU', (_label, space, rows) => {
    const expanded = expandCargoToLoadSim(rows);
    const source = packResultToLoadingResult(pack(expanded.items, containerToLoadSimSpace(space)), expanded.context);
    const actual = loadContainer(space, rows, { publish:false });
    expect(actual.placements).toEqual(source.placements);
    expect(actual.loadedWeightKg).toBe(source.loadedWeightKg);
    expect(actual.validationIssues).toEqual(validateExistingWithLoadSim(space, rows, actual.placements).validationIssues);
    for (const row of rows) expect(actual.placements.filter(p=>p.cargoId===row.id).length + actual.remaining.filter(r=>r.cargoId===row.id).reduce((n,r)=>n+r.quantity,0)).toBe(row.quantity);
    expect(actual.ruleEngine).toBe('load-sim');
    expect(loadContainer(space, rows, { publish:false })).toEqual(actual);
  });
  it('does not let former UI strategy labels activate a retired solver', () => {
    const normal = loadContainer(container,[cargo()],{publish:false});
    for (const strategy of ['capacity','stability','unloading'] as const) expect(loadContainer(container,[cargo()],{strategy,publish:false})).toEqual(normal);
  });
});
