import { afterEach, describe, expect, it } from 'vitest';
import { buildWorkInstructionAddresses, buildWorkInstructionRuns, formatWorkAddress, formatWorkRun, workInstructionLegend } from './workInstructionGrid';
import { buildNumberedZonePlans, buildZoneTable } from './reportZoneGraphics';
import { buildReportZones } from './reportZones';
import { reportFixture } from './reportZones.fixture';
import { buildWorkSequence } from './engine/workSequence';
import { workflowWorkInstruction } from './workflowPresentation';
import { setUiLanguage, uiText } from './uiLanguage';
import { uiMessagesWorkInstructions } from './uiMessagesWorkInstructions';
import type { Placement } from './engine/types';
const box = (x: number, y: number, z = 0, extra: Partial<Placement> = {}): Placement => ({ cargoId: 'A', x, y, z, length: 1, width: 1, height: 1, weightKg: 1, ...extra });
afterEach(() => setUiLanguage('ko'));
function validateRuns(placements: Placement[], selected?: number[]) {
  const addresses = buildWorkInstructionAddresses(placements), runs = buildWorkInstructionRuns(placements, selected);
  expect(runs.flatMap(r => r.indices).sort((a,b)=>a-b)).toEqual((selected ?? placements.map((_,i)=>i)).sort((a,b)=>a-b));
  for (const run of runs) {
    expect(run.quantity).toBe(run.indices.length);
    expect(run.quantity).toBe((run.columnTo - run.columnFrom + 1) * (run.rowTo - run.rowFrom + 1));
    const cells = new Set(run.indices.map(i => `${addresses[i].column}/${addresses[i].row}/${addresses[i].layer}`));
    for (let c = run.columnFrom; c <= run.columnTo; c++) for (let r = run.rowFrom; r <= run.rowTo; r++) expect(cells.has(`${c}/${r}/${run.layer}`)).toBe(true);
    for (const i of run.indices) expect(addresses[i].layer).toBe(run.layer);
  }
  return runs;
}
describe('worker column/row/tier addresses', () => {
  it('counts left to right from the actual +X door camera, then inner to door, bottom to top', () => {
    const ps = [box(0, 0), box(0, 1), box(1, 0), box(1, 1), box(0, .5, 1)];
    expect(buildWorkInstructionAddresses(ps)).toEqual([
      {column:3,row:1,layer:1}, {column:1,row:1,layer:1}, {column:2,row:2,layer:1}, {column:1,row:2,layer:1}, {column:2,row:1,layer:2},
    ]);
    expect(formatWorkAddress({column:2,row:3,layer:4})).toBe('2열 3행 4단');
  });
  it('keeps shuffled inputs, translated origins and sub-micron noise deterministic', () => {
    const ps = [box(0,0), box(0,1), box(1,0), box(0,0,1)];
    const before = buildWorkInstructionAddresses(ps);
    expect(buildWorkInstructionAddresses([...ps].reverse()).reverse()).toEqual(before);
    expect(buildWorkInstructionAddresses(ps.map(p=>({...p,x:p.x+3,y:p.y+2,z:p.z+.15})))).toEqual(before);
    const jitter = [box(0,0,0),box(1,0,.0000009),box(2,0,.0000018)];
    expect(buildWorkInstructionAddresses(jitter)).toEqual([{column:1,row:1,layer:1},{column:1,row:2,layer:1},{column:1,row:3,layer:2}]);
  });
  it('retains floor addresses on sparse upper tiers and does not renumber a missing left-hand box', () => {
    const ps = [box(0,0),box(0,1),box(0,2),box(0,1,1),box(.5,0,2)];
    const a = buildWorkInstructionAddresses(ps);
    expect(a[1]).toMatchObject({column:2,row:1,layer:1});
    expect(a[3]).toEqual({column:2,row:1,layer:2});
    expect(a[4]).toEqual({column:1,row:2,layer:3});
    validateRuns(ps);
  });
  it('compresses only full touching rectangles, preserving holes, mixed sizes and rotations', () => {
    const full = [box(0,0),box(0,1),box(1,0),box(1,1)];
    expect(validateRuns(full)).toHaveLength(1);
    expect(validateRuns(full)[0].quantity).toBe(4);
    for (const ps of [full.slice(0,3), [box(0,0),box(0,2)], [box(0,0),box(0,1,0,{width:.5})], [box(0,0),box(0,1,0,{rotated:true})], [box(0,0),box(.5,1)]]) expect(validateRuns(ps).length).toBeGreaterThan(1);
  });
  it('does not fill missing positions when asked for a subset of a row', () => {
    const ps = [box(0,0),box(0,1),box(0,2)];
    expect(validateRuns(ps,[0,2])).toHaveLength(2);
  });
  it('preserves 895 mixed-orientation cartons and three partial cartons with exact diagram/table mappings', () => {
    const { container,cargo,result } = reportFixture(); const before = JSON.stringify(result);
    const zones = buildReportZones(result.placements);
    for (const zone of zones) validateRuns(result.placements, [...zone.indices]);
    const table = new DOMParser().parseFromString(buildZoneTable(cargo,result.placements,zones),'text/html');
    const diagrams = new DOMParser().parseFromString(buildNumberedZonePlans(container,cargo,result.placements,zones),'text/html');
    const rows = [...table.querySelectorAll('[data-work-run]')];
    expect(rows.reduce((n,row)=>n+Number(row.getAttribute('data-quantity')),0)).toBe(895);
    for (const row of rows) {
      const diagram = diagrams.querySelector(`[data-work-run="${row.getAttribute('data-work-run')}"]`)!;
      expect(diagram).not.toBeNull();
      expect([...diagram.querySelectorAll('[data-placement-index]')].map(el=>Number(el.getAttribute('data-placement-index'))).sort((a,b)=>a-b)).toEqual(row.getAttribute('data-placement-indices')!.split(',').map(Number).sort((a,b)=>a-b));
    }
    expect(diagrams.querySelectorAll('[data-placement-index]')).toHaveLength(895);
    expect(JSON.stringify(result)).toBe(before);
  });
  it('keeps mixed-height and bridging levels explicit instead of pretending every tier has the same boxes', () => {
    const ps = [box(0,0,0,{height:.5}),box(1,0,0,{height:1}),box(0,0,.5,{height:.5}),box(.5,0,1,{length:1.5})];
    const runs = validateRuns(ps);
    expect(runs.map(r=>r.layer)).toEqual([1,1,2,3]);
    expect(workInstructionLegend()).toContain('수직 박스 개수를 뜻하지 않습니다');
  });
  it.each(['ko','en','vi'] as const)('uses the same %s addresses for individual work steps and localized instructions', locale => {
    setUiLanguage(locale); const {container,cargo,result}=reportFixture();
    result.placements = result.placements.slice(0, 12);
    cargo[0].name = '박스 선택';
    const addresses = buildWorkInstructionAddresses(result.placements);
    for (const action of ['LOAD','UNLOAD'] as const) for (const step of buildWorkSequence(container,cargo,result,action)) {
      expect({column:step.column,row:step.row,layer:step.layer}).toEqual(addresses[step.placementIndex]);
      const text = workflowWorkInstruction(step);
      expect(text).toContain(step.cargoId); expect(text).not.toMatch(/X \d|Y \d|Z \d/);
      if(locale!=='ko') expect(text).not.toMatch(/[가-힣]/);
    }
    if(locale!=='ko') expect(formatWorkRun(buildWorkInstructionRuns(result.placements)[0])+workInstructionLegend()).not.toMatch(/[가-힣]/);
    const table = buildZoneTable(cargo,result.placements,buildReportZones(result.placements));
    expect(table).toContain('박스 선택');
  });
  it('translates every parameter exactly once without translating arbitrary user data', () => {
    const params=(s:string)=>[...s.matchAll(/\{\d+\}/g)].map(x=>x[0]).sort();
    for(const [key,pair] of Object.entries(uiMessagesWorkInstructions)) for(const [i,value] of pair.entries()) { expect(params(value),key).toEqual(params(key)); expect(uiText(key,[],i===0?'en':'vi')).toBe(value); }
  });
});
