import { describe, expect, it } from 'vitest';
import { assessManualMove, snapManualCoordinate, supportsOtherPlacement } from './manualPlacement';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';

const container: ContainerSpec = { length: 4, width: 2, height: 2, maxPayloadKg: 1000 };
const cargo: CargoItem[] = [{ id:'A', name:'A', length:1, width:1, height:0.5, weightKg:20, quantity:2, maxStackLayers:3, maxTopLoadKg:100 }];
const source: LoadingResult = {
  placements:[
    { cargoId:'A', x:0,y:0,z:0,length:1,width:1,height:0.5,weightKg:20 },
    { cargoId:'A', x:0,y:0,z:0.5,length:1,width:1,height:0.5,weightKg:20 },
  ], remaining:[], loadedWeightKg:40, usedVolumeM3:1, validationIssues:[],
};

describe('manual placement', () => {
  it('snaps coordinates', () => expect(snapManualCoordinate(1.027,0.05)).toBe(1.05));
  it('locks a lower box supporting another box', () => expect(supportsOtherPlacement(0,source.placements)).toBe(true));
  it('rejects moving a supporting lower box', () => {
    const assessment = assessManualMove(container,cargo,source,0,{x:2,y:0,z:0});
    expect(assessment.valid).toBe(false);
    expect(assessment.reasons.join(' ')).toContain('지지');
  });
  it('allows a top box to move to a safe floor position', () => {
    const assessment = assessManualMove(container,cargo,source,1,{x:2,y:0,z:0});
    expect(assessment.valid).toBe(true);
    expect(assessment.result.placements[1].x).toBe(2);
  });
  it('rejects collision', () => {
    const assessment = assessManualMove(container,cargo,source,1,{x:0,y:0,z:0});
    expect(assessment.valid).toBe(false);
    expect(assessment.reasons.join(' ')).toContain('충돌');
  });
});
