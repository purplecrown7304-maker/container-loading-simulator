import type { ContainerSpec, Placement } from './engine/types';
import type { PhysicsSupport } from './engine/physicsValidation';
import type { SecuringUsage } from './inertiaCertification';

// Visual geometry only. Restraint forces and certification remain owned by the engine.
export type UnityDecoration = { x: number; y: number; z: number; length: number; width: number; height: number; color: string; supportIndex: number; wire?: boolean; modelKey?: string };
export function securingGeometry(container: ContainerSpec, boxes: Placement[], supports: PhysicsSupport[], usage?: SecuringUsage | null): UnityDecoration[] {
  const output: UnityDecoration[] = [];
  if (!usage || !usage.level || !boxes.length) return output;
  const add = (x: number, y: number, z: number, length: number, width: number, height: number, color: string, supportIndex = -1, wire = false, modelKey?: string) => output.push({ x, y, z, length, width, height, color, supportIndex, wire, ...(modelKey ? { modelKey } : {}) });
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
    if (usage.wrappingLengthM > 0) add(p.x - .012, p.y - .012, base, p.length + .024, p.width + .024, height, '#68b9e7', index, true);
    const straps = Math.round(usage.bandingStraps / Math.max(1, supports.length));
    for (let i = 0; i < straps; i++) {
      const x = p.x + p.length * (i + 1) / (straps + 1) - .011;
      add(x, p.y - .022, top, .022, p.width + .044, .022, '#1f2937', index);
      for (const y of [p.y - .022, p.y + p.width]) add(x, y, base, .022, .022, height, '#1f2937', index);
    }
    if (usage.cornerGuards) for (const x of [p.x, p.x + p.length - .035]) for (const y of [p.y, p.y + p.width - .035]) add(x, y, base, .035, .035, height, '#d6b276', index, false, 'corner-guard');
    const mats = Math.round(usage.antiSlipMats / Math.max(1, supports.length));
    for (let i = 0; i < mats; i++) add(p.x + p.length * (i + 1) / (mats + 1) - .12, p.y + p.width * .06, base, .24, p.width * .88, .008, '#334155', index);
  });
  if (!supports.length) {
    for (let i = 0; i < usage.antiSlipMats; i++) add(minX + (maxX - minX) * (i + 1) / (usage.antiSlipMats + 1) - .1, minY, 0, .2, maxY - minY, .012, '#334155');
    for (let i = 0; i < usage.dunnageBlocks; i++) add(minX + (maxX - minX) * (Math.floor(i / 2) + 1) / (Math.ceil(usage.dunnageBlocks / 2) + 1), i % 2 ? Math.min(container.width - .09, maxY) : Math.max(0, minY - .09), 0, .22, .09, .22, '#b78650', -1, false, 'dunnage-block');
  }
  for (let i = 0; i < usage.loadBars; i++) add(i === 0 && usage.loadBars > 1 ? Math.max(0, minX - .06) : Math.min(container.length - .06, maxX), .02 * container.width, Math.min(container.height * .72, Math.max(.55, maxTop * .62)), .06, container.width * .96, .08, '#e87924');
  return output;
}
