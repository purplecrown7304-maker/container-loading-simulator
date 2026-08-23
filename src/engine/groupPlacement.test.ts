import { describe, expect, it } from 'vitest';
import { assessGroupMove, groupSupportsOutside, selectPlacementGroup } from './groupPlacement';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';

const container: ContainerSpec = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 28000 };
const cargo: CargoItem[] = [
  { id:'A', name:'A', length:1, width:1, height:1, weightKg:100, quantity:3, maxStackLayers:3, maxTopLoadKg:500 },
  { id:'B', name:'B', length:1, width:1, height:1, weightKg:80, quantity:1, maxStackLayers:3, maxTopLoadKg:500 },
];

function baseResult(): LoadingResult {
  return {
    placements:[
      { cargoId:'A', x:0, y:0, z:0, length:1, width:1, height:1, weightKg:100 },
      { cargoId:'A', x:0, y:1, z:0, length:1, width:1, height:1, weightKg:100 },
      { cargoId:'A', x:1, y:0, z:0, length:1, width:1, height:1, weightKg:100 },
    ],
    remaining:[], loadedWeightKg:300, usedVolumeM3:3, validationIssues:[], autoCorrections:[],
  };
}

describe('group placement', () => {
  it('selects cargo, row, and layer groups from the anchor', () => {
    const source = baseResult();
    expect(selectPlacementGroup(source,container,0,'cargo')).toEqual([0,1,2]);
    expect(selectPlacementGroup(source,container,0,'row')).toEqual([0,1]);
    expect(selectPlacementGroup(source,container,0,'layer')).toEqual([0,1,2]);
  });

  it('moves a whole row while preserving relative spacing', () => {
    const source = baseResult();
    const indices = selectPlacementGroup(source,container,0,'row');
    const assessment = assessGroupMove(container,cargo,source,indices,{x:2,y:0,z:0});
    expect(assessment.valid).toBe(true);
    expect(assessment.result.placements[0].x).toBeCloseTo(2);
    expect(assessment.result.placements[1].x).toBeCloseTo(2);
    expect(assessment.result.placements[1].y - assessment.result.placements[0].y).toBeCloseTo(1);
  });

  it('blocks a group that supports cargo outside the selection', () => {
    const source = baseResult();
    source.placements.push({ cargoId:'B', x:0, y:0, z:1, length:1, width:1, height:1, weightKg:80 });
    expect(groupSupportsOutside([0,1],source.placements)).toBe(true);
    const assessment = assessGroupMove(container,cargo,source,[0,1],{x:1,y:0,z:0});
    expect(assessment.valid).toBe(false);
    expect(assessment.reasons.join(' ')).toContain('상부 화물');
  });

  it('supports signed five-centimeter movement deltas', () => {
    const source = baseResult();
    const assessment = assessGroupMove(container,cargo,source,[2],{x:-0.95,y:0,z:0});
    expect(assessment.delta.x).toBeCloseTo(-0.95);
    expect(assessment.result.placements[2].x).toBeCloseTo(0.05);
  });
});
