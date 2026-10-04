import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { auditAIdentity, createRetainedPackingChecks, packWithARules } from './loadSimAdapter';
import type { ContainerSpec, CargoItem, Placement } from './types';

const container:ContainerSpec={length:12.03,width:2.35,height:2.69,maxPayloadKg:26500,rules:{version:'a-v1',equipmentId:'40hc',kind:'container',access:['rear'],door:{w:2340,h:2580},tareKg:3900,floorLineLoadKgPerM:4500,source:'benchmark'}};
const box:CargoItem={id:'box',name:'Box',length:.4,width:.3,height:.2,weightKg:5,quantity:100,maxStackLayers:8,maxTopLoadKg:50};
const p=(id:string,x:number,y:number,z:number):Placement=>({cargoId:'box',unitId:id,x,y,z,length:.4,width:.3,height:.2,weightKg:5,orientation:'LWH'});

describe('retained A constraints without repeated identity graph construction',()=>{
  it('matches full audits including rejected candidates, shared support and cumulative stack limits',()=>{
    const cargo=[{...box,maxStackLayers:3,maxTopLoadKg:12}], checker=createRetainedPackingChecks(container,cargo), ps:Placement[]=[];
    let rejected=0;
    for(let i=0;i<120;i++){
      const candidate=p(`u${i}`,(i%8)*.3,(Math.floor(i/8)%3)*.3,Math.floor(i/24)*.2);
      const valid=auditAIdentity(container,cargo,[...ps,candidate]).length===0;
      expect(checker.check(candidate)).toBe(valid);
      if(valid && i%7!==0){checker.commit(candidate);ps.push(candidate);} else rejected++;
    }
    expect(ps.length).toBeGreaterThan(20);
    expect(rejected).toBeGreaterThan(20);
    for(const candidate of [ps[0],{...p('bad',0,0,0),weightKg:99},{...p('missing',0,0,0),cargoId:'missing'}]){
      expect(checker.check(candidate)).toBe(false);
      expect(auditAIdentity(container,cargo,[...ps,candidate]).length).toBeGreaterThan(0);
    }
  });

  it('keeps quantity checks without stack limits and isolates separate passes',()=>{
    const cargo=[{...box,quantity:1,maxStackLayers:undefined,maxTopLoadKg:undefined}];
    const checker=createRetainedPackingChecks(container,cargo), first=p('first',0,0,0), second=p('second',1,0,0);
    expect(checker.check(first)).toBe(true);checker.commit(first);
    expect(checker.check(second)).toBe(false);
    expect(createRetainedPackingChecks(container,cargo).check(second)).toBe(true);
  });

  it('preserves the complete pre-optimization 100-carton result including IDs and warnings',()=>{
    const result=packWithARules(container,[box]);
    expect(result.placements).toHaveLength(100);
    expect(createHash('sha256').update(JSON.stringify(result)).digest('hex')).toBe('fb54259458aaea4ac7864edb9e4fe6d67fc9d77ab420d41a47d8a77f5eace055');
  });

  it('preserves the full mixed-SKU search result with distinct dimensions, loads and layer limits',()=>{
    const cargo:CargoItem[]=[
      {id:'a',name:'A',length:.4,width:.3,height:.2,weightKg:5,quantity:100,maxStackLayers:4,maxTopLoadKg:30},
      {id:'b',name:'B',length:.5,width:.35,height:.25,weightKg:8,quantity:100,maxStackLayers:6,maxTopLoadKg:45},
    ];
    const result=packWithARules(container,cargo);
    expect(result.placements).toHaveLength(200);
    expect(createHash('sha256').update(JSON.stringify(result)).digest('hex')).toBe('30b024043eb7f1a0f893b5203a14fb2f0cbc4e33f951c67e2485488669064fec');
  });
});
