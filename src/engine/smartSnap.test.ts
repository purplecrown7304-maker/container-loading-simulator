import { describe, expect, it } from 'vitest';
import { findBestSmartSnap } from './smartSnap';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';

const container: ContainerSpec = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 28000 };
const cargo: CargoItem[] = [{ id:'A', name:'A', length:1, width:1, height:1, weightKg:100, quantity:2, maxStackLayers:3, maxTopLoadKg:500 }];

function result(): LoadingResult {
  return {
    placements:[
      { cargoId:'A', x:0, y:0, z:0, length:1, width:1, height:1, weightKg:100 },
      { cargoId:'A', x:1, y:0, z:0, length:1, width:1, height:1, weightKg:100 },
    ],
    remaining:[], loadedWeightKg:200, usedVolumeM3:2, validationIssues:[], autoCorrections:[],
  };
}

describe('smart snap', () => {
  it('finds a valid nearby aligned position instead of an overlapping raw point', () => {
    const snap = findBestSmartSnap(container,cargo,result(),1,{x:0.3,y:0,z:0});
    expect(snap).not.toBeNull();
    expect(snap?.position.x).toBeGreaterThanOrEqual(1);
  });

  it('prefers valid compact candidates and returns a reason', () => {
    const snap = findBestSmartSnap(container,cargo,result(),1,{x:2.08,y:0.03,z:0});
    expect(snap).not.toBeNull();
    expect(snap?.position.x).toBeCloseTo(1,1);
    expect(snap?.reason).toBeTruthy();
  });

  it('returns null when selected placement does not exist', () => {
    expect(findBestSmartSnap(container,cargo,result(),99,{x:0,y:0,z:0})).toBeNull();
  });
});
