import { describe, expect, it } from 'vitest';
import { canPlace, checkOverlap, createPackingChecks } from './validate';
import { DEFAULT_CONFIG } from './presets';
import type { Placement, Space } from './types';

const space: Space = {id:'checks',kind:'container',inner:{l:6000,w:2400,h:2400},maxPayload:1000,tare:0,access:['rear'],floorLineLoad:400};
const place = (id: string,x: number,y: number,z: number,extra: Partial<Placement['item']> = {}): Placement => ({
  item:{id,type:'carton',dims:{l:500,w:400,h:300},weight:10,maxTopLoad:60,maxTopPressure:300,...extra},pos:{x,y,z},orientation:'LWH',
});

describe('append-only A candidate checks', () => {
  it('returns the same ordered overlap pairs for every selected index', () => {
    const ps=Array.from({length:8},(_,i)=>place(`p${i}`,i*50,0,0));
    const all=checkOverlap(ps,DEFAULT_CONFIG);
    for(let i=0;i<ps.length;i++) expect(checkOverlap(ps,DEFAULT_CONFIG,i)).toEqual(all.filter(v=>v.itemIds.includes(`p${i}`)));
    for(const i of [-1,99,NaN,1.5]) expect(checkOverlap(ps,DEFAULT_CONFIG,i)).toEqual([]);
  });
  it('matches full reconstruction across accepted and rejected contacts, loads and unload paths', () => {
    const cfg = {...DEFAULT_CONFIG,strictUnloadOrder:true};
    const checks = createPackingChecks(space,cfg), committed: Placement[] = [];
    let accepted=0, rejected=0;
    for (let i=0;i<180;i++) {
      const p = place(`p${i}`, (i%7)*500, (Math.floor(i/7)%4)*400, Math.floor(i/28)*300,
        {stopSeq: i%3+1, weight: i%5+1, maxTopLoad:20, maxTier:4});
      if (i%9===0) p.pos.x+=100; // partial support and collision cases
      const expected=canPlace(committed,p,space,cfg);
      expect(checks.check(p)).toEqual(expected);
      expect(checks.check(p)).toEqual(expected); // checking does not commit
      if (expected.length) rejected++;
      else if (i%11!==0) { checks.commit(p); committed.push(p); accepted++; }
    }
    expect(accepted).toBeGreaterThan(10);
    expect(rejected).toBeGreaterThan(10);
  });

  it('retains tolerance contacts, shared support, cumulative load and pressure errors', () => {
    const cfg={...DEFAULT_CONFIG};
    const checks=createPackingChecks(space,cfg), committed: Placement[]=[];
    const cases=[
      place('left',0,0,0,{maxTopLoad:25}),
      place('right',500,0,0,{maxTopLoad:25}),
      place('bridge',250,0,304.9,{weight:20}),
      place('top',250,0,604.9,{weight:40}),
      place('thin',2000,0,0,{dims:{l:500,w:400,h:6}}),
      place('thin2',2000,0,6,{dims:{l:500,w:400,h:1},maxTopLoad:1}),
      place('heavy',3000,0,0,{weight:300}),
      place('floating',4000,0,301),
    ];
    for(const p of cases) {
      const expected=canPlace(committed,p,space,cfg);
      expect(checks.check(p)).toEqual(expected);
      if(!expected.length){checks.commit(p);committed.push(p);}
    }
    expect(committed.map(p=>p.item.id)).toContain('bridge');
    expect(committed.map(p=>p.item.id)).not.toContain('top');
  });
});
