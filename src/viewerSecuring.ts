import type { ContainerSpec, LoadingResult, Placement } from './engine/types';
import { voidFillDrawnIn3D, voidFillMaterialColor } from './voidFillPresentation';
import type { ViewerSupport } from './viewerSceneProtocol';
import type { SecuringUsage } from './inertiaCertification';
import { palletBandingSegments } from './palletBanding';

// Visual geometry only. Restraint forces and certification remain owned by the engine.
export type ViewerDecoration = { x: number; y: number; z: number; length: number; width: number; height: number; color: string; supportIndex: number; wire?: boolean; modelKey?: string; wrapping?: true };
export function securingGeometry(container: ContainerSpec, source: LoadingResult | Placement[], supports: ViewerSupport[], usage?: SecuringUsage | null): ViewerDecoration[] {
  const result = Array.isArray(source) ? undefined : source;
  const boxes = Array.isArray(source) ? source : source.placements;
  const output: ViewerDecoration[] = [];
  const add = (x: number, y: number, z: number, length: number, width: number, height: number, color: string, supportIndex = -1, wire = false, modelKey?: string, wrapping?: true) => output.push({ x, y, z, length, width, height, color, supportIndex, wire, ...(modelKey ? { modelKey } : {}), ...(wrapping ? { wrapping } : {}) });
  for (const fill of result?.voidFillPlan?.fills ?? []) {
    // Planned materials only. A void without one is listed in the results, not drawn.
    if (!voidFillDrawnIn3D(fill)) continue;
    add(fill.x, fill.y, fill.z, fill.length, fill.width, fill.height, voidFillMaterialColor(fill), -1,
      false, fill.material === 'dunnage-airbag' ? 'dunnage-airbag' : undefined);
  }
  if (!boxes.length) return output;
  const securing = usage?.level ? usage : undefined;
  const minX = Math.min(...boxes.map(p => p.x)), maxX = Math.max(...boxes.map(p => p.x + p.length));
  const minY = Math.min(...boxes.map(p => p.y)), maxY = Math.max(...boxes.map(p => p.y + p.width));
  const maxTop = Math.max(...boxes.map(p => p.z + p.height));
  supports.forEach((p, index) => {
    const inside = (b: { x: number; y: number; length: number; width: number }) => {
      const overlap = Math.max(0, Math.min(b.x + b.length, p.x + p.length) - Math.max(b.x, p.x)) * Math.max(0, Math.min(b.y + b.width, p.y + p.width) - Math.max(b.y, p.y));
      return overlap >= b.length * b.width * .55;
    };
    const ceiling = Math.min(Infinity, ...supports.filter(s => s.z > p.z + 1e-6 && inside(s)).map(s => s.z));
    const load = boxes.filter(b => b.z >= p.z + p.height - 1e-6 && b.z < ceiling - 1e-6 && inside(b));
    if (!load.length) return;
    const base = p.z + p.height, top = Math.max(...load.map(b => b.z + b.height)), height = top - base;
    if (p.visualPackaging?.wrapping === true || (securing?.wrappingLengthM ?? 0) > 0) add(p.x - .012, p.y - .012, base, p.length + .024, p.width + .024, height, '#68b9e7', index, true, undefined, true);
    const sourceStraps = p.visualPackaging?.bandingStraps;
    const preservedStraps = typeof sourceStraps === 'number' && [0, 2, 3, 4].includes(sourceStraps) ? sourceStraps : 0;
    const straps = Math.max(preservedStraps, Math.min(4, Math.max(0, Math.round((securing?.bandingStraps ?? 0) / Math.max(1, supports.length)))));
    for (const band of palletBandingSegments({ ...p, z: base, height }, straps)) {
      add(band.x, band.y, band.z, band.length, band.width, band.height, '#1f2937', index);
    }
    if (p.visualPackaging?.cornerGuards === true || (securing?.cornerGuards ?? 0) > 0) for (const x of [p.x, p.x + p.length - .035]) for (const y of [p.y, p.y + p.width - .035]) add(x, y, base, .035, .035, height, '#d6b276', index, false, 'corner-guard');
    const mats = Math.round((securing?.antiSlipMats ?? 0) / Math.max(1, supports.length));
    for (let i = 0; i < mats; i++) add(p.x + p.length * (i + 1) / (mats + 1) - .12, p.y + p.width * .06, base, .24, p.width * .88, .008, '#334155', index);
  });
  if (!securing) return output;
  if (!supports.length) {
    for (let i = 0; i < securing.antiSlipMats; i++) add(minX + (maxX - minX) * (i + 1) / (securing.antiSlipMats + 1) - .1, minY, 0, .2, maxY - minY, .012, '#334155');
    for (let i = 0; i < securing.dunnageBlocks; i++) add(minX + (maxX - minX) * (Math.floor(i / 2) + 1) / (Math.ceil(securing.dunnageBlocks / 2) + 1), i % 2 ? Math.min(container.width - .09, maxY) : Math.max(0, minY - .09), 0, .22, .09, .22, '#b78650', -1, false, 'dunnage-block');
  }
  for (let i = 0; i < securing.loadBars; i++) add(i === 0 && securing.loadBars > 1 ? Math.max(0, minX - .06) : Math.min(container.length - .06, maxX), .02 * container.width, Math.min(container.height * .72, Math.max(.55, maxTop * .62)), .06, container.width * .96, .08, '#e87924');
  return output;
}
