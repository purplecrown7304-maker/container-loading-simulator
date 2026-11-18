import { afterEach, describe, expect, it } from 'vitest';
import { operationalErrors, setOperationalValidationReuseForTests, validateOperationalLoading } from './operationalValidator';
import type { CargoItem, ContainerSpec, Placement } from './types';

const box = (patch: Partial<Placement> = {}): Placement => ({
  cargoId: 'A', x: 1.5, y: .5, z: 0, length: 1, width: 1, height: .5, weightKg: 100, ...patch,
});
const item: CargoItem = {
  id: 'A', name: 'A', length: 1, width: 1, height: .5, weightKg: 100, quantity: 10,
  maxTopLoadKg: 500, maxStackLayers: 5, allowRotation: true,
};
const container: ContainerSpec = { length: 4, width: 2, height: 2, maxPayloadKg: 1000 };

describe('load-sim operational validator adapter', () => {
  it('accepts a centered floor load and reports securing gaps as warnings only', () => {
    const findings = validateOperationalLoading(container, [item], [box()]);
    expect(operationalErrors(findings)).toEqual([]);
    expect(findings.some(finding => finding.code === 'REAR_GAP' && finding.severity === 'warning')).toBe(true);
  });

  it('enforces 80% support and center-of-gravity support', () => {
    const placements = [
      box({ x: 1.5, y: .5, z: 0 }),
      box({ x: 2.05, y: .5, z: .5 }),
    ];
    const codes = operationalErrors(validateOperationalLoading(container, [item], placements)).map(finding => finding.code);
    expect(codes).toContain('INSUFFICIENT_SUPPORT');
  });

  it('uses pallet supports as physical support surfaces', () => {
    const cargo = [{ ...item, length: .5, width: .5, height: .3, weightKg: 20 }];
    const placements = [{ cargoId: 'A', x: 1.75, y: .75, z: .15, length: .5, width: .5, height: .3, weightKg: 20 }];
    const supports = [{ id: 'PALLET-1', x: 1.45, y: .45, z: 0, length: 1.1, width: 1.1, height: .15, weightKg: 25 }];
    const codes = operationalErrors(validateOperationalLoading(container, cargo, placements, supports)).map(finding => finding.code);
    expect(codes).not.toContain('FLOATING');
    expect(codes).not.toContain('INSUFFICIENT_SUPPORT');
  });

  it('flags reversed rear-door unload order', () => {
    const cargo = [
      { ...item, id: 'FIRST', unloadPriority: 1 },
      { ...item, id: 'LATER', unloadPriority: 2 },
    ];
    const placements: Placement[] = [
      { ...box(), cargoId: 'FIRST', x: .5 },
      { ...box(), cargoId: 'LATER', x: 2 },
    ];
    const codes = operationalErrors(validateOperationalLoading(container, cargo, placements)).map(finding => finding.code);
    expect(codes).toContain('UNLOAD_BLOCKED');
  });

  it('flags excessive longitudinal center-of-gravity offset', () => {
    const findings = validateOperationalLoading(container, [item], [box({ x: 0 })]);
    expect(operationalErrors(findings).map(finding => finding.code)).toContain('CG_LONGITUDINAL');
  });

  it('uses known equipment door dimensions when the container matches the catalog', () => {
    const hc: ContainerSpec = { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600 };
    const tallItem: CargoItem = { ...item, id: 'TALL', height: 2.65, width: 1, length: 1, quantity: 1 };
    const placement: Placement = { cargoId: 'TALL', x: 5.5, y: .675, z: 0, length: 1, width: 1, height: 2.65, weightKg: 100 };
    const codes = operationalErrors(validateOperationalLoading(hc, [tallItem], [placement])).map(finding => finding.code);
    expect(codes).toContain('DOOR_NOT_PASSABLE');
  });

  it('rejects 70% support and a 1.4 mm vertical gap like the final audit', () => {
    const supportCodes = operationalErrors(validateOperationalLoading(container,[item],[box(),box({x:1.8,z:.5})])).map(f => f.code);
    expect(supportCodes).toContain('INSUFFICIENT_SUPPORT');
    const gapCodes = operationalErrors(validateOperationalLoading(container,[item],[box(),box({z:.5014})])).map(f => f.code);
    expect(gapCodes).toContain('FLOATING');
  });

  it('uses the same conservative full transmitted load as candidate and final checks', () => {
    const cargo = [{...item,id:'BASE',length:.5,weightKg:10,maxTopLoadKg:60}, {...item,id:'BRIDGE',weightKg:100}];
    const placements = [
      box({cargoId:'BASE',length:.5,weightKg:10}),
      box({cargoId:'BASE',x:2,length:.5,weightKg:10}),
      box({cargoId:'BRIDGE',z:.5,weightKg:100}),
    ];
    const topLoad = validateOperationalLoading(container,cargo,placements).filter(f => f.code === 'TOP_LOAD_EXCEEDED');
    expect(topLoad).toHaveLength(2);
    expect(topLoad.map(f => f.value)).toEqual([100,100]);
  });

  it('counts shared descendants once per supporting box', () => {
    const cargo = [{...item,id:'BASE',weightKg:10,maxTopLoadKg:25},
      {...item,id:'MID',length:.5,weightKg:10,maxTopLoadKg:20}, {...item,id:'TOP',weightKg:10}];
    const placements = [
      box({cargoId:'BASE',weightKg:10}),
      box({cargoId:'MID',z:.5,length:.5,weightKg:10}),
      box({cargoId:'MID',x:2,z:.5,length:.5,weightKg:10}),
      box({cargoId:'TOP',z:1,weightKg:10}),
    ];
    const topLoad = validateOperationalLoading(container,cargo,placements).filter(f => f.code === 'TOP_LOAD_EXCEEDED');
    expect(topLoad).toHaveLength(1);
    expect(topLoad[0].value).toBe(30);
  });

  it('enforces a lower SKU maximum layer count across mixed stacks', () => {
    const cargo = [{...item,id:'BASE',maxStackLayers:2},{...item,id:'UPPER'}];
    const placements = [box({cargoId:'BASE'}),box({cargoId:'UPPER',z:.5}),box({cargoId:'UPPER',z:1})];
    expect(validateOperationalLoading(container,cargo,placements).some(f => f.code === 'STACK_LIMIT' && f.placementIndexes.includes(0))).toBe(true);
  });

  it('also enforces 80% support for an elevated pallet deck', () => {
    const cargo = [{...item,length:.7}];
    const placements = [box({length:.7,z:.1})];
    const supports = [
      {id:'LOWER-PALLET',x:1.5,y:.5,z:0,length:1,width:1,height:.1,weightKg:5},
      {id:'UPPER-PALLET',x:1.5,y:.5,z:.6,length:1,width:1,height:.1,weightKg:5},
    ];
    const failures = operationalErrors(validateOperationalLoading(container,cargo,placements,supports));
    expect(failures.some(f => f.code === 'INSUFFICIENT_SUPPORT' && f.message.includes('UPPER-PALLET') && Math.abs((f.value ?? 0)-.7)<1e-9)).toBe(true);
  });

  it('unloads empty early-stop pallet decks with their cargo instead of flagging them as floating', () => {
    const space = {...container,width:1,unloadingPolicy:'strict' as const};
    const cargo = [{...item,id:'EARLY',unloadPriority:1},{...item,id:'LATE',unloadPriority:2}];
    const placements = [box({cargoId:'EARLY',x:2,y:0,z:.1}),box({cargoId:'EARLY',x:2,y:0,z:.7}),
      box({cargoId:'LATE',x:0,y:0,z:.1})];
    const support = (id:string,x:number,z:number)=>({id,x,y:0,z,length:1,width:1,height:.1,weightKg:5});
    const findings = validateOperationalLoading(space,cargo,placements,[support('EARLY-LOWER',2,0),support('EARLY-UPPER',2,.6),support('LATE-DECK',0,0)]);
    expect(findings.filter(f=>f.code.startsWith('AFTER_STOP_'))).toEqual([]);
  });

  it('still rejects later-stop pallet cargo stranded above an unloaded early-stop carton', () => {
    const space = {...container,width:1,unloadingPolicy:'soft' as const};
    const cargo = [{...item,id:'EARLY',unloadPriority:1},{...item,id:'LATE',unloadPriority:2}];
    const placements = [box({cargoId:'EARLY',x:1.5,y:0,z:0}),box({cargoId:'LATE',x:1.5,y:0,z:.6})];
    const supports = [{id:'LATE-DECK',x:1.5,y:0,z:.5,length:1,width:1,height:.1,weightKg:5}];
    const findings = validateOperationalLoading(space,cargo,placements,supports);
    expect(findings).toContainEqual(expect.objectContaining({
      code:'AFTER_STOP_FLOATING',
      severity:'warning',
      message:expect.stringContaining('LATE-DECK'),
    }));
    expect(operationalErrors(findings).some(f=>f.code.startsWith('AFTER_STOP_'))).toBe(false);
  });
});

describe('reuse of a finished validation for identical input', () => {
  afterEach(() => setOperationalValidationReuseForTests(true));
  const wide: ContainerSpec = { length: 12, width: 2.4, height: 2.6, maxPayloadKg: 28000 };
  const small: CargoItem = { ...item, length: .5, width: .5, height: .3, weightKg: 10, quantity: 400 };
  // 22 × 4 × 3 = 264 cartons: above the reuse threshold, stacked three high from the inner wall.
  const grid = () => Array.from({ length: 264 }, (_, i): Placement => ({
    cargoId: 'A', x: Math.floor(i / 12) * .5, y: (Math.floor(i / 3) % 4) * .5 + .2, z: (i % 3) * .3,
    length: .5, width: .5, height: .3, weightKg: 10,
  }));
  const reference = (...args: Parameters<typeof validateOperationalLoading>) => {
    setOperationalValidationReuseForTests(false);
    const findings = validateOperationalLoading(...args);
    setOperationalValidationReuseForTests(true);
    return findings;
  };

  it('returns the same findings as a fresh computation, as independent copies', () => {
    const placements = grid();
    const expected = reference(wide, [small], placements);
    const first = validateOperationalLoading(wide, [small], placements);
    const second = validateOperationalLoading(wide, [small], grid());
    expect(first).toEqual(expected);
    expect(second).toEqual(expected);
    expect(second).not.toBe(first);
    // A caller that edits its findings must not change what the next caller receives.
    first.forEach(finding => { finding.severity = 'error'; finding.placementIndexes.push(-1); });
    first.length = 0;
    expect(validateOperationalLoading(wide, [small], placements)).toEqual(expected);
  });

  it('never returns an earlier verdict after any input changed, including an in-place edit', () => {
    const placements = grid();
    expect(operationalErrors(validateOperationalLoading(wide, [small], placements)).map(f => f.code)).not.toContain('OVERLAP');
    // The same array object, edited in place: one carton now sits inside its neighbour.
    placements[5].x = placements[17].x + .1; placements[5].y = placements[17].y; placements[5].z = placements[17].z;
    const edited = validateOperationalLoading(wide, [small], placements);
    expect(edited).toEqual(reference(wide, [small], placements));
    expect(operationalErrors(edited).map(f => f.code)).toContain('OVERLAP');

    const base = grid();
    validateOperationalLoading(wide, [small], base);
    const light = { ...wide, maxPayloadKg: 1000 };
    expect(operationalErrors(validateOperationalLoading(light, [small], base)).map(f => f.code)).toContain('PAYLOAD_EXCEEDED');
    const strict = [{ ...small, maxStackLayers: 2 }];
    expect(validateOperationalLoading(wide, strict, base)).toEqual(reference(wide, strict, base));
    expect(validateOperationalLoading(wide, [small], base, [], { approvedDirectBox: true }))
      .toEqual(reference(wide, [small], base, [], { approvedDirectBox: true }));
    const deck = [{ id: 'DECK', x: 0, y: .2, z: 0, length: 1, width: 1, height: .01, weightKg: 5 }];
    expect(validateOperationalLoading(wide, [small], base, deck)).toEqual(reference(wide, [small], base, deck));
  });

  it('computes directly when a value is not finite', () => {
    const placements = grid();
    placements[0].weightKg = Number.NaN;
    expect(validateOperationalLoading(wide, [small], placements)).toEqual(reference(wide, [small], placements));
  });

  it('does not mix up a non-finite setting with an empty one (JSON writes both as null)', () => {
    const base = grid();
    // Each pair serializes to the same text. The references are computed first (the helper
    // empties the reuse store), then the pairs run back to back with reuse switched on.
    const containers: ContainerSpec[] = [{ ...wide, floorLoadLimitKgPerM2: Number.NaN }, { ...wide, floorLoadLimitKgPerM2: null as unknown as number }];
    const rows: CargoItem[] = [
      { ...small, maxTopLoadKg: Number.POSITIVE_INFINITY }, { ...small, maxTopLoadKg: null as unknown as number },
      { ...small, maxStackLayers: Number.NaN }, { ...small, maxStackLayers: null as unknown as number },
    ];
    const unlimited: ContainerSpec = { ...wide, maxPayloadKg: Number.POSITIVE_INFINITY };
    const expectedContainers = containers.map(spec => reference(spec, [small], base));
    const expectedRows = rows.map(row => reference(wide, [row], base));
    const expectedUnlimited = reference(unlimited, [small], base);
    containers.forEach((spec, index) => expect(validateOperationalLoading(spec, [small], base)).toEqual(expectedContainers[index]));
    rows.forEach((row, index) => expect(validateOperationalLoading(wide, [row], base)).toEqual(expectedRows[index]));
    // An unlimited payload validates; a missing payload figure fails inside the computation.
    // The second call must reach that computation instead of receiving the first verdict.
    expect(validateOperationalLoading(unlimited, [small], base)).toEqual(expectedUnlimited);
    const missing = { ...wide, maxPayloadKg: null as unknown as number };
    expect(() => validateOperationalLoading(missing, [small], base)).toThrow(TypeError);
  });
});