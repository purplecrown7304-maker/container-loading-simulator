import { CanvasTexture, DoubleSide, LinearFilter, LinearMipmapLinearFilter, MeshBasicMaterial, SRGBColorSpace } from 'three';
import type { ThreeComparisonPlan } from './threeComparisonSceneState';

type LabelEntry = { texture: CanvasTexture; material: MeshBasicMaterial; refs: number };
const cache = new Map<string, LabelEntry>();
let fontsReady: Promise<unknown> | undefined;

/** The same canvas dimensions, typography and content as Unity host labels.js. */
export async function acquireComparisonLabels(plan: ThreeComparisonPlan) {
  fontsReady ??= document.fonts?.load('600 28px Pretendard') ?? Promise.resolve();
  await fontsReady;
  const materials = new Map<string, MeshBasicMaterial>();
  const keys: string[] = [];
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    for (const key of keys) {
      const entry = cache.get(key);
      if (!entry || --entry.refs > 0) continue;
      entry.material.dispose(); entry.texture.dispose(); cache.delete(key);
    }
  };
  try {
  for (const box of plan.placements) {
    if (materials.has(box.cargoId)) continue;
    const content = [box.color, box.labelCode || box.cargoId, box.labelTitle || box.cargoId, box.labelDetail || `${box.weightKg} kg`, box.labelSize || `${box.length} × ${box.width} × ${box.height} m`];
    const key = JSON.stringify(content);
    let entry = cache.get(key);
    if (!entry) {
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Carton label canvas is unavailable');
      ctx.fillStyle = '#fffef9'; ctx.fillRect(0, 0, 512, 256);
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, 506, 250);
      ctx.fillStyle = box.color || '#2563eb'; ctx.fillRect(8, 8, 12, 240);
      const line = (text: string, y: number, size: number, weight = 600) => {
        ctx.fillStyle = '#172b42'; ctx.font = `${weight} ${size}px Pretendard, sans-serif`;
        let value = text;
        while (ctx.measureText(value).width > 452 && value.length > 1) value = value.slice(0, -1);
        if (value !== text) value = value.slice(0, -1) + '…';
        ctx.fillText(value, 30, y, 454);
      };
      line(content[1], 52, 34, 700); line(content[2], 103, 32, 700);
      line(content[3], 165, 29); line(content[4], 213, 26);
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 4;
      texture.minFilter = LinearMipmapLinearFilter; texture.magFilter = LinearFilter;
      const material = new MeshBasicMaterial({ map: texture, side: DoubleSide, toneMapped: false });
      entry = { texture, material, refs: 0 };
      cache.set(key, entry);
    }
    entry.refs++; keys.push(key); materials.set(box.cargoId, entry.material);
  }
  } catch (error) { release(); throw error; }
  return { materials, release };
}
