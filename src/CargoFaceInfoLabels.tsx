import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ContainerSpec, Placement } from './engine/types';

function makeInfoTexture(sample: Placement, displayName?: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 420;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(255,255,255,.98)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 14;
  ctx.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 72px sans-serif';
  ctx.fillText((displayName || sample.cargoId).slice(0, 18), canvas.width / 2, 92);

  ctx.fillStyle = '#334155';
  ctx.font = '700 45px sans-serif';
  ctx.fillText(
    `${Math.round(sample.length * 1000)}×${Math.round(sample.width * 1000)}×${Math.round(sample.height * 1000)} mm`,
    canvas.width / 2,
    205,
  );

  ctx.fillStyle = '#1d4ed8';
  ctx.font = '800 48px sans-serif';
  ctx.fillText(
    `${sample.weightKg.toFixed(sample.weightKg % 1 ? 1 : 0)} kg · ${(sample.length * sample.width * sample.height).toFixed(3)} CBM`,
    canvas.width / 2,
    320,
  );

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function LabelMaterial({ texture }: { texture: THREE.Texture }) {
  return (
    <meshBasicMaterial
      map={texture}
      toneMapped={false}
      transparent
      side={THREE.DoubleSide}
      depthTest
      depthWrite={false}
      polygonOffset
      polygonOffsetFactor={-8}
      polygonOffsetUnits={-8}
    />
  );
}

export function CargoFaceInfoLabels({
  placements,
  container,
  scale,
  displayName,
  verticalOffset = 0,
}: {
  placements: Placement[];
  container: ContainerSpec;
  scale: number;
  displayName?: string;
  verticalOffset?: number;
}) {
  const sample = placements[0];
  const texture = useMemo(
    () => (sample ? makeInfoTexture(sample, displayName) : null),
    [displayName, sample?.cargoId, sample?.length, sample?.width, sample?.height, sample?.weightKg],
  );

  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;

  return (
    <group>
      {placements.flatMap((box, index) => {
        const cx = (box.x + box.length / 2) * scale - container.length * scale / 2;
        const cy = (box.z + box.height / 2) * scale + verticalOffset;
        const cz = (box.y + box.width / 2) * scale - container.width * scale / 2;
        const length = box.length * scale;
        const width = box.width * scale;
        const height = box.height * scale;
        const faceHeight = Math.max(0.055, height * 0.76);
        const longFaceWidth = Math.max(0.09, length * 0.88);
        const shortFaceWidth = Math.max(0.09, width * 0.88);
        const gap = 0.012;

        return [
          <mesh key={`${box.cargoId}-${index}-front`} position={[cx, cy, cz + width / 2 + gap]} renderOrder={30}>
            <planeGeometry args={[longFaceWidth, faceHeight]} />
            <LabelMaterial texture={texture} />
          </mesh>,
          <mesh key={`${box.cargoId}-${index}-back`} position={[cx, cy, cz - width / 2 - gap]} rotation={[0, Math.PI, 0]} renderOrder={30}>
            <planeGeometry args={[longFaceWidth, faceHeight]} />
            <LabelMaterial texture={texture} />
          </mesh>,
          <mesh key={`${box.cargoId}-${index}-right`} position={[cx + length / 2 + gap, cy, cz]} rotation={[0, Math.PI / 2, 0]} renderOrder={30}>
            <planeGeometry args={[shortFaceWidth, faceHeight]} />
            <LabelMaterial texture={texture} />
          </mesh>,
          <mesh key={`${box.cargoId}-${index}-left`} position={[cx - length / 2 - gap, cy, cz]} rotation={[0, -Math.PI / 2, 0]} renderOrder={30}>
            <planeGeometry args={[shortFaceWidth, faceHeight]} />
            <LabelMaterial texture={texture} />
          </mesh>,
        ];
      })}
    </group>
  );
}
