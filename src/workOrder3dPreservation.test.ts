import { buildNumberedZone3d } from './reportZone3dDimensions';
import { afterEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { reportFixture } from './reportZones.fixture';
import { buildReportZones } from './reportZones';
import { buildZone3d } from './reportZoneGraphics';
import { buildLoadingReportHtml } from './report';
import { buildWorkInstructionRuns, formatWorkRun, workInstructionLegend } from './workInstructionGrid';
import { setUiLanguage } from './uiLanguage';
const parser = (html: string) => new DOMParser().parseFromString(html.replace(/<link\b[^>]*>/g, ''), 'text/html');
afterEach(() => setUiLanguage('ko'));

it.each(['ko', 'en', 'vi'] as const)('retains the original 3D completed and progress images with exact %s location captions', language => {
  setUiLanguage(language); const {container,cargo,result}=reportFixture(), zones=buildReportZones(result.placements);
  cargo[0].name='한국고객 <제품>';
  const doc=parser(buildLoadingReportHtml(container,cargo,result));
  expect(doc.querySelectorAll('.zone-completed svg')).toHaveLength(1);
  expect(doc.querySelectorAll('.zone-progress article')).toHaveLength(zones.length);
  const clean=(element: Element)=>element.outerHTML;
  expect(clean(doc.querySelector('.zone-completed svg')!)).toBe(clean(parser(buildNumberedZone3d(container,cargo,result.placements,zones)).querySelector('svg')!));
  let total=0;
  zones.forEach((zone,index)=>{
    const card=doc.querySelectorAll('.zone-progress article')[index];
    expect(clean(card.querySelector('svg')!)).toBe(clean(parser(buildNumberedZone3d(container,cargo,result.placements,zones,zone.number)).querySelector('svg')!));
    const captions=[...card.querySelectorAll('[data-3d-work-run]')];
    expect(captions).toHaveLength(buildWorkInstructionRuns(result.placements,zone.indices).length);
    expect(captions.flatMap(node=>node.getAttribute('data-placement-indices')!.split(',').map(Number)).sort((a,b)=>a-b)).toEqual([...zone.indices].sort((a,b)=>a-b));
    total+=captions.reduce((sum,node)=>sum+Number(node.getAttribute('data-quantity')),0);
    expect(card.querySelector('h3')?.textContent).not.toContain(' m');
    if(language!=='ko') expect(card.querySelector('.zone-3d-instructions')?.textContent?.replaceAll('한국고객 <제품>','')).not.toMatch(/[가-힣]/);
  });
  expect(total).toBe(895);
  expect(doc.querySelector('.zone-progress')?.textContent).toContain('한국고객 <제품>');
});

it('matches the baseline 3D geometry and color golden fingerprints', () => {
  const {container,cargo,result}=reportFixture(), zones=buildReportZones(result.placements);
  const fingerprints=[undefined,...zones.map(z=>z.number)].map(active=>{
    const svg=parser(buildZone3d(container,cargo,result.placements,zones,active)).querySelector('svg')!;
    const geometry={viewBox:svg.getAttribute('viewBox'),polygons:[...svg.querySelectorAll('polygon')].map(p=>({attributes:[...p.attributes].map(a=>[a.name,a.value]),parent:[...p.parentElement!.attributes].map(a=>[a.name,a.value])}))};
    return createHash('sha256').update(JSON.stringify(geometry)).digest('hex');
  });
  // Filled from the unchanged ee4cbfa renderer, independently compared before capture.
  expect(fingerprints).toEqual(BASELINE_3D_FINGERPRINTS);
});
const BASELINE_3D_FINGERPRINTS: string[] = ["7c3565310fcf2b0904172facd858676945c00fe579a4593236f18b1d20616070", "66a3e07959075034a4b09e131cf21090e6dcc675fc4bb5695d488e15508ff4f7", "ba19612cae0b7e40ddb35ddf39d6db58dc03fe8d173a99a6ba75bcf60eff1a06", "6d24ae26fbff674f7e6957c5c4b23966b05a8a328d146fd1e810a338548da5d0", "1ced939354a2519e665930398a739188311e6cb61bdc2d502eedfdfc4d68e2ca", "d201da965c952533059c8cec7895584d2ea74e9fff3824c4d2a9989bedfa79f9"];

it.runIf(Boolean(process.env.WORK_3D_PREVIEW_DIR))('exports the exact original 3D renderer for the revised preview', () => {
  const dir=process.env.WORK_3D_PREVIEW_DIR!;mkdirSync(dir,{recursive:true});setUiLanguage('ko');
  const {container,cargo,result}=reportFixture(),zones=buildReportZones(result.placements);
  const pages=[undefined,zones[0],zones.at(-1)!].map(zone=>{
    const filename=zone?`progress-${zone.label}.svg`:'completed.svg';
    const raw=buildNumberedZone3d(container,cargo,result.placements,zones,zone?.number).split('</svg>')[0]+'</svg>';
    writeFileSync(`${dir}/${filename}`,raw.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" font-family="Noto Sans CJK KR" '));
    const rows=zone?buildWorkInstructionRuns(result.placements,zone.indices).map((run,i)=>({marker:`${zone.label}-${i+1}`,location:formatWorkRun(run),id:run.cargoId,quantity:run.quantity,layer:run.layer})):[];
    return {title:zone?`${zone.number} ${zone.label} 구역`:'3D 완료 모습',svg:filename,quantity:zone?.indices.length??result.placements.length,rows};
  });
  writeFileSync(`${dir}/preview-data.json`,JSON.stringify({legend:workInstructionLegend(),pages},null,2));
  for(const language of ['ko','en','vi'] as const){setUiLanguage(language);writeFileSync(`${dir}/work-order-${language}.html`,buildLoadingReportHtml(container,cargo,result));}
  expect(pages).toHaveLength(3);
});
