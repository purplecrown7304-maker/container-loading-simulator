import { describe, expect, it } from 'vitest';
import { analyzeErgonomics } from './ergonomics';
import type { LoadingResult } from './types';

const result: LoadingResult = {
  placements:[
    { cargoId:'LOW', x:0,y:0,z:0,length:1,width:1,height:1,weightKg:5 },
    { cargoId:'HIGH', x:1,y:0,z:1.5,length:1,width:1,height:0.7,weightKg:8 },
    { cargoId:'HEAVY', x:2,y:0,z:0,length:1,width:1,height:1,weightKg:25 },
    { cargoId:'BOTH', x:3,y:0,z:1.4,length:1,width:1,height:0.8,weightKg:30 },
  ], remaining:[], loadedWeightKg:68, usedVolumeM3:4, validationIssues:[], autoCorrections:[],
};

describe('ergonomics analysis',()=>{
  it('flags reach and manual handling threshold exceedances',()=>{
    const risks=analyzeErgonomics(result,{comfortableReachM:2,manualHandlingKg:15});
    expect(risks.map(r=>r.cargoId)).toContain('HIGH');
    expect(risks.map(r=>r.cargoId)).toContain('HEAVY');
    expect(risks.find(r=>r.cargoId==='BOTH')?.level).toBe('high');
    expect(risks.map(r=>r.cargoId)).not.toContain('LOW');
  });
  it('changes risk results when site thresholds change',()=>{
    const strict=analyzeErgonomics(result,{comfortableReachM:1.2,manualHandlingKg:6});
    const loose=analyzeErgonomics(result,{comfortableReachM:3,manualHandlingKg:50});
    expect(strict.length).toBeGreaterThan(loose.length);
    expect(loose).toHaveLength(0);
  });
});
