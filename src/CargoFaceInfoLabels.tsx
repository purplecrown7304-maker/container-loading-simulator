import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { CargoItem, ContainerSpec, Placement } from './engine/types';

export const CARTON_VISUAL_SCALE = 0.985;

type ProductLabelInfo = Pick<CargoItem, 'productId' | 'productName' | 'unitsPerPackage' | 'contentWeightKg'>;

function makeInfoTexture(sample: Placement, displayName?: string, productInfo?: ProductLabelInfo) {
  const canvas = document.createElement('canvas');
  canvas.width = 820;
  canvas.height = 500;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 14;
  ctx.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const hasProduct = Boolean(productInfo?.productId || productInfo?.productName);
  if (hasProduct) {
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 64px sans-serif';
    ctx.fillText((productInfo?.productName || displayName || sample.cargoId).slice(0, 20), canvas.width / 2, 78);

    ctx.fillStyle = '#334155';
    ctx.font = '800 40px sans-serif';
    const code = productInfo?.productId || sample.cargoId;
    const units = Math.max(1, productInfo?.unitsPerPackage ?? 1);
    ctx.fillText(`${code} · ${units} EA/BOX`, canvas.width / 2, 170);

    ctx.fillStyle = '#475569';
    ctx.font = '700 38px sans-serif';
    ctx.fillText(
      `${Math.round(sample.length * 1000)}×${Math.round(sample.width * 1000)}×${Math.round(sample.height * 1000)} mm`,
      canvas.width / 2,
      277,
    );

    const contentWeight = productInfo?.contentWeightKg ?? sample.weightKg;
    ctx.fillStyle = '#1d4ed8';
    ctx.font = '800 43px sans-serif';
    ctx.fillText(
      `제품 총중량 ${contentWeight.toFixed(contentWeight % 1 ? 1 : 0)} kg · ${(sample.length * sample.width * sample.height).toFixed(3)} CBM`,
      canvas.width / 2,
      395,
    );
  } else {
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 72px sans-serif';
    ctx.fillText((displayName || sample.cargoId).slice(0, 18), canvas.width / 2, 105);

    ctx.fillStyle = '#334155';
    ctx.font = '700 45px sans-serif';
    ctx.fillText(
      `${Math.round(sample.length * 1000)}×${Math.round(sample.width * 1000)}×${Math.round(sample.height * 1000)} mm`,
      canvas.width / 2,
      245,
    );

    ctx.fillStyle = '#1d4ed8';
    ctx.font = '800 48px sans-serif';
    ctx.fillText(
      `${sample.weightKg.toFixed(sample.weightKg % 1 ? 1 : 0)} kg · ${(sample.length * sample.width * sample.height).toFixed(3)} CBM`,
      canvas.width / 2,
      385,
    );
  }

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
      transparent={false}
      opacity={1}
      side={THREE.FrontSide}
      depthTest
      depthWrite
      polygonOffset
      polygonOffsetFactor={-2}
      polygonOffsetUnits={-2}
    />
  );
}

export function CargoFaceInfoLabels({
  placements,
  container,
  scale,
  displayName,
  productInfo,
  verticalOffset = 0,
  bodyScale = CARTON_VISUAL_SCALE,
}: {
  placements: Placement[];
  container: ContainerSpec;
  scale: number;
  displayName?: string;
  productInfo?: ProductLabelInfo;
  verticalOffset?: number;
  bodyScale?: number;
}) {
  const sample = placements[0];
  const texture = useMemo(
    () => (sample ? makeInfoTexture(sample, displayName, productInfo) : null),
    [
      displayName,
      productInfo?.productId,
      productInfo?.productName,
      productInfo?.unitsPerPackage,
      productInfo?.contentWeightKg,
      sample?.cargoId,
      sample?.length,
      sample?.width,
      sample?.height,
      sample?.weightKg,
    ],
  );

  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;

  return (
    <group>
      {placements.flatMap((box, index) => {
        const cx = (box.x + box.length / 2) * scale - container.length * scale / 2;
        const cy = (box.z + box.height / 2) * scale + verticalOffset;
        const cz = (box.y + box.width / 2) * scale - container.width * scale / 2;

        const length = box.length * scale * bodyScale;
        const width = box.width * scale * bodyScale;
        const height = box.height * scale * bodyScale;
        const faceHeight = height * 0.68;
        const longFaceWidth = length * 0.82;
        const shortFaceWidth = width * 0.82;
        const surfaceOffset = Math.max(0.00025, scale * 0.00045);

        return [
          <mesh
            key={`${box.cargoId}-${index}-front`}
            position={[cx, cy, cz + width / 2 + surfaceOffset]}
            renderOrder={40}
            frustumCulled={false}
          >
            <planeGeometry args={[longFaceWidth, faceHeight]} />
            <LabelMaterial texture={texture} />
          </mesh>,
          <mesh
            key={`${box.cargoId}-${index}-back`}
            position={[cx, cy, cz - width / 2 - surfaceOffset]}
            rotation={[0, Math.PI, 0]}
            renderOrder={40}
            frustumCulled={false}
          >
            <planeGeometry args={[longFaceWidth, faceHeight]} />
            <LabelMaterial texture={texture} />
          </mesh>,
          <mesh
            key={`${box.cargoId}-${index}-right`}
            position={[cx + length / 2 + surfaceOffset, cy, cz]}
            rotation={[0, Math.PI / 2, 0]}
            renderOrder={40}
            frustumCulled={false}
          >
            <planeGeometry args={[shortFaceWidth, faceHeight]} />
            <LabelMaterial texture={texture} />
          </mesh>,
          <mesh
            key={`${box.cargoId}-${index}-left`}
            position={[cx - length / 2 - surfaceOffset, cy, cz]}
            rotation={[0, -Math.PI / 2, 0]}
            renderOrder={40}
            frustumCulled={false}
          >
            <planeGeometry args={[shortFaceWidth, faceHeight]} />
            <LabelMaterial texture={texture} />
          </mesh>,
        ];
      })}
    </group>
  );
}
