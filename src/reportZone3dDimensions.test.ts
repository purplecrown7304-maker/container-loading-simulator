import { afterEach, expect, it } from 'vitest';
import { reportFixture } from './reportZones.fixture';
import { buildReportZones } from './reportZones';
import { buildZone3d } from './reportZoneGraphics';
import { buildNumberedZone3d } from './reportZone3dDimensions';
import { setUiLanguage } from './uiLanguage';
import { workOrder3dDimensions } from './workOrder3dDimensions';
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
afterEach(() => setUiLanguage('ko'));
it.each(['ko', 'en', 'vi'] as const)('preserves every original 3D face while adding in-bounds, actual %s count dimensions', locale => {
  setUiLanguage(locale);
  const { container, cargo, result } = reportFixture(), zones = buildReportZones(result.placements);
  const before = JSON.stringify(result);
  for (const active of [undefined, ...zones.map(zone => zone.number)]) {
    const base = parse(buildZone3d(container, cargo, result.placements, zones, active));
    const doc = parse(buildNumberedZone3d(container, cargo, result.placements, zones, active));
    const summary = workOrder3dDimensions(result.placements, active === undefined ? undefined : zones[active - 1].indices)!;
    const originalFaces = (document: Document) => [...document.querySelectorAll('polygon')].map(p => [p.outerHTML, p.parentElement?.tagName === 'g' ? [...p.parentElement.attributes].map(a => [a.name, a.value]) : []]);
    expect(originalFaces(doc)).toEqual(originalFaces(base));
    const arrows = [...doc.querySelectorAll('[data-count-axis]')];
    expect(arrows.map(a => Number(a.getAttribute('data-count')))).toEqual([summary.rows, summary.columns, summary.layers]);
    expect(doc.querySelector('[data-work-order-count-dimensions]')?.getAttribute('data-quantity')).toBe(String(summary.quantity));
    const [x, y, width, height] = doc.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number);
    for (const element of doc.querySelectorAll('[data-label-bounds]')) {
      const [left, top, right, bottom] = element.getAttribute('data-label-bounds')!.split(' ').map(Number);
      expect(left).toBeGreaterThan(x); expect(top).toBeGreaterThan(y);
      expect(right).toBeLessThan(x + width); expect(bottom).toBeLessThan(y + height);
    }
    for (const element of doc.querySelectorAll('[data-dimension-line]')) {
      const [x1,y1,x2,y2]=element.getAttribute('d')!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      const axis=element.getAttribute('data-dimension-line');
      if(axis==='row'){expect(x2).toBeGreaterThan(x1);expect(y2).toBeGreaterThan(y1);}
      if(axis==='column'){expect(x2).toBeLessThan(x1);expect(y2).toBeGreaterThan(y1);}
      if(axis==='layer'){expect(x2).toBe(x1);expect(y2).toBeLessThan(y1);}
    }
    if(locale!=='ko') expect(doc.body.textContent).not.toMatch(/[가-힣]/);
    expect(doc.body.textContent).not.toMatch(/NaN|Infinity|undefined/);
  }
  expect(JSON.stringify(result)).toBe(before);
});
it('annotates only the current zone, not previous gray cargo or global address endpoints', () => {
  const { container, cargo, result } = reportFixture(), zones = buildReportZones(result.placements);
  const a=parse(buildNumberedZone3d(container,cargo,result.placements,zones,1));
  const e=parse(buildNumberedZone3d(container,cargo,result.placements,zones,5));
  expect([...a.querySelectorAll('[data-count-axis] text')].map(n=>n.textContent)).toEqual(['8행','18열','2단']);
  expect([...e.querySelectorAll('[data-count-axis] text')].map(n=>n.textContent)).toEqual(['최대 1행','최대 10열','2단']);
  expect(e.querySelector('[data-work-order-count-dimensions]')?.getAttribute('data-quantity')).toBe('19');
  expect(e.querySelector('.zone-count-legend')?.textContent).toContain('빈칸');
});
