import UnityLoadingViewer from './UnityLoadingViewer';
import { useMemo } from 'react';
import { cargoColor } from './cargoColors';
import type { CargoItem, ContainerSpec, Placement } from './engine/types';
import './product-packaging-preview.css';

type Props = { container: ContainerSpec; cargo: CargoItem[] };
type PreviewBox = {
  key: string;
  cargo: CargoItem;
  placement: Placement;
  color: string;
};

function floorPreview(container: ContainerSpec, cargo: CargoItem[]) {
  const placed: PreviewBox[] = [];
  let x = 0.04;
  let y = 0.04;
  let rowLength = 0;
  let shown = 0;
  const requested = cargo.reduce((sum, item) => sum + item.quantity, 0);

  outer: for (const item of cargo) {
    for (let index = 0; index < item.quantity; index += 1) {
      const length = Math.min(item.length, container.length);
      const width = Math.min(item.width, container.width);
      const height = Math.min(item.height, container.height);
      if (y + width > container.width - 0.04) {
        x += rowLength + 0.04;
        y = 0.04;
        rowLength = 0;
      }
      if (x + length > container.length - 0.04) break outer;
      placed.push({
        key: `${item.id}-${index}`,
        cargo: item,
        placement: {
          cargoId: item.id,
          x,
          y,
          z: 0,
          length,
          width,
          height,
          weightKg: item.weightKg,
        },
        color: cargoColor(item.id, item.displayColor),
      });
      y += width + 0.025;
      rowLength = Math.max(rowLength, length);
      shown += 1;
      if (shown >= 240) break outer;
    }
  }
  return { placed, shown, requested };
}

export default function ProductPackagingPreview3D({ container, cargo }: Props) {
  const preview = useMemo(() => floorPreview(container, cargo), [container, cargo]);
  const result = useMemo(() => ({ placements: preview.placed.map(box => box.placement), remaining: [], validationIssues: [], usedVolumeM3: preview.placed.reduce((sum, box) => sum + box.placement.length * box.placement.width * box.placement.height, 0), loadedWeightKg: preview.placed.reduce((sum, box) => sum + box.placement.weightKg, 0) }), [preview]);
  return <section className="product-packaging-preview">
    <div className="product-packaging-preview-head"><div><b>포장 완료 바닥 미리보기</b><span>최종 적재 전, 선택한 포장 박스를 적재공간 바닥에 1단으로 펼쳐 확인합니다.</span></div><strong>{preview.shown.toLocaleString()} / {preview.requested.toLocaleString()} BOX·EA 표시</strong></div>
    <div className="product-packaging-canvas">
      <UnityLoadingViewer container={container} result={result} cargo={cargo} preview title="포장 완료 바닥 배치" />
      <div className="product-packaging-canvas-legend"><span>드래그: 회전</span><span>휠: 확대/축소</span><span>박스 클릭: 제품 정보</span></div>
    </div>
    {preview.shown < preview.requested && <p className="product-packaging-overflow">바닥에 한 번에 펼칠 수 있는 수량을 초과했습니다. 화면에는 {preview.shown.toLocaleString()}개만 표시하며 실제 자동 적재 단계에서는 전체 {preview.requested.toLocaleString()}개를 계산합니다.</p>}
  </section>;
}
