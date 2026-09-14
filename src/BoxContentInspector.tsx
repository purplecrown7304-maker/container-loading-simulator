import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { CargoItem, ContainerSpec, Placement } from './engine/types';

type PlacementAddress = {
  row: number;
  column: number;
  layer: number;
};

type Props = {
  placement: Placement;
  cargo?: CargoItem;
  container: ContainerSpec;
  address?: PlacementAddress;
  position: { x: number; y: number };
  color: string;
  onClose: () => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function BoxContentInspector({ placement, cargo, container, address, position, color, onClose }: Props) {
  const panelWidth = 360;
  const panelHeight = 570;
  const viewportWidth = typeof window === 'undefined' ? 1200 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight;
  const left = clamp(position.x + 14, 12, Math.max(12, viewportWidth - panelWidth - 12));
  const top = clamp(position.y + 14, 12, Math.max(12, viewportHeight - panelHeight - 12));

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const name = cargo?.boxName || cargo?.name || placement.cargoId;
  const code = cargo?.boxId || cargo?.id || placement.cargoId;
  const cbm = placement.length * placement.width * placement.height;
  const units = Math.max(0, Math.round(cargo?.unitsPerPackage ?? 0));
  const previewUnits = Math.min(units, 24);
  const hasContents = Boolean(cargo?.productName || cargo?.productId || units > 0 || cargo?.contentWeightKg != null);
  const unitWeight = units > 0 && cargo?.contentWeightKg != null ? cargo.contentWeightKg / units : null;

  const mapWidth = 294;
  const mapHeight = 108;
  const px = clamp((placement.x / Math.max(container.length, 0.001)) * mapWidth, 0, mapWidth);
  const py = clamp((placement.y / Math.max(container.width, 0.001)) * mapHeight, 0, mapHeight);
  const pw = clamp((placement.length / Math.max(container.length, 0.001)) * mapWidth, 4, mapWidth - px);
  const ph = clamp((placement.width / Math.max(container.width, 0.001)) * mapHeight, 4, mapHeight - py);

  const chipStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 7px',
    borderRadius: 999,
    background: '#f3f6fa',
    color: '#4d5968',
    fontSize: 11,
    fontWeight: 700,
  } as const;

  const infoCellStyle = {
    padding: '8px 9px',
    border: '1px solid #e6eaf0',
    borderRadius: 9,
    background: '#fafbfd',
    minWidth: 0,
  } as const;

  return createPortal(
    <aside
      role="dialog"
      aria-label={`${name} 박스 정보`}
      onContextMenu={event => event.preventDefault()}
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 10050,
        width: panelWidth,
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: 'calc(100vh - 24px)',
        overflowY: 'auto',
        padding: 14,
        border: '1px solid rgba(213,220,230,.98)',
        borderRadius: 14,
        background: 'rgba(255,255,255,.98)',
        boxShadow: '0 18px 55px rgba(18,35,58,.24)',
        color: '#172033',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <span style={{ width: 12, height: 38, borderRadius: 7, background: color, flex: '0 0 auto' }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#7a8495', marginBottom: 2 }}>BOX INSPECTOR</div>
          <b style={{ display: 'block', fontSize: 16, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{name}</b>
          <span style={{ display: 'block', marginTop: 3, color: '#697586', fontSize: 11.5, overflowWrap: 'anywhere' }}>{code}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="박스 정보 닫기"
          style={{ border: 0, borderRadius: 8, background: '#eef2f7', width: 30, height: 30, cursor: 'pointer', fontSize: 17, color: '#46515f' }}
        >×</button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={chipStyle}>{placement.rotated ? '↻ 90° 회전' : '↔ 기본 방향'}</span>
        {address && <span style={chipStyle}>R{address.row} · C{address.column} · L{address.layer}</span>}
        {cargo?.unloadPriority != null && <span style={chipStyle}>하역순서 {cargo.unloadPriority}</span>}
      </div>

      <section style={{ marginBottom: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <b style={{ fontSize: 12.5 }}>적재공간 미니맵</b>
          <small style={{ color: '#8a94a3', fontSize: 10.5 }}>선택 박스 위치</small>
        </div>
        <div style={{ border: '1px solid #dfe5ed', borderRadius: 10, padding: 8, background: '#f7f9fc' }}>
          <svg viewBox={`0 0 ${mapWidth} ${mapHeight}`} width="100%" height="108" role="img" aria-label="선택 박스 평면 위치">
            <rect x="0" y="0" width={mapWidth} height={mapHeight} rx="6" fill="#eef3f8" stroke="#aeb9c7" strokeWidth="1.5" />
            <line x1={mapWidth - 1} x2={mapWidth - 1} y1="8" y2={mapHeight - 8} stroke="#2b67c9" strokeWidth="3" strokeDasharray="5 4" />
            <text x={mapWidth - 5} y="13" textAnchor="end" fontSize="9" fontWeight="700" fill="#2b67c9">DOOR</text>
            <rect x={px} y={py} width={pw} height={ph} rx="2.5" fill={color} fillOpacity="0.82" stroke="#153453" strokeWidth="1.4" />
          </svg>
        </div>
      </section>

      <section style={{ marginBottom: 13 }}>
        <b style={{ display: 'block', fontSize: 12.5, marginBottom: 7 }}>박스 정보</b>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <div style={infoCellStyle}><small style={{ color: '#7a8495' }}>외형 규격</small><b style={{ display: 'block', marginTop: 2, fontSize: 11.5 }}>{placement.length.toFixed(3)} × {placement.width.toFixed(3)} × {placement.height.toFixed(3)} m</b></div>
          <div style={infoCellStyle}><small style={{ color: '#7a8495' }}>총중량</small><b style={{ display: 'block', marginTop: 2, fontSize: 11.5 }}>{placement.weightKg.toFixed(2)} kg</b></div>
          <div style={infoCellStyle}><small style={{ color: '#7a8495' }}>부피</small><b style={{ display: 'block', marginTop: 2, fontSize: 11.5 }}>{cbm.toFixed(3)} CBM</b></div>
          <div style={infoCellStyle}><small style={{ color: '#7a8495' }}>적층 제한</small><b style={{ display: 'block', marginTop: 2, fontSize: 11.5 }}>{cargo?.maxStackLayers ? `${cargo.maxStackLayers}단` : '미지정'}</b></div>
        </div>
      </section>

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
          <b style={{ fontSize: 12.5 }}>박스 내부 내용물</b>
          {units > 0 && <small style={{ color: '#64748b', fontWeight: 800 }}>{units} EA</small>}
        </div>
        {hasContents ? <>
          <div style={{ border: '1px solid #e1e6ed', borderRadius: 10, padding: 10, background: '#fbfcfe', marginBottom: 8 }}>
            <b style={{ display: 'block', fontSize: 12.5, overflowWrap: 'anywhere' }}>{cargo?.productName || '제품명 미등록'}</b>
            {cargo?.productId && <small style={{ display: 'block', marginTop: 2, color: '#7a8495', overflowWrap: 'anywhere' }}>제품코드 {cargo.productId}</small>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 7, fontSize: 11 }}>
              {cargo?.contentWeightKg != null && <span>내용물 <b>{cargo.contentWeightKg.toFixed(2)} kg</b></span>}
              {unitWeight != null && <span>개당 약 <b>{unitWeight.toFixed(3)} kg</b></span>}
            </div>
          </div>
          {previewUnits > 0 && <div style={{ border: '1px solid #dce3ec', borderRadius: 11, padding: 9, background: '#f6f8fb' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.min(6, Math.max(1, Math.ceil(Math.sqrt(previewUnits))))}, minmax(0, 1fr))`,
              gap: 5,
              minHeight: 54,
            }}>
              {Array.from({ length: previewUnits }, (_, index) => <span
                key={index}
                title={`${index + 1}번째 제품`}
                style={{ height: 25, borderRadius: 5, border: '1px solid rgba(28,63,98,.25)', background: color, opacity: 0.78, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.45)' }}
              />)}
            </div>
            {units > previewUnits && <div style={{ textAlign: 'right', marginTop: 5, fontSize: 10.5, fontWeight: 800, color: '#556273' }}>+ {units - previewUnits} EA</div>}
          </div>}
          <small style={{ display: 'block', marginTop: 6, color: '#8a94a3', fontSize: 10 }}>내용물 개략도는 수량을 시각화한 것으로 실제 박스 내부 좌표 배치를 의미하지 않습니다.</small>
        </> : <div style={{ padding: '12px 10px', borderRadius: 10, background: '#f7f9fc', color: '#6b7685', fontSize: 11.5, lineHeight: 1.5 }}>
          직접 등록된 박스/화물입니다. 연결된 제품명, 수량, 내용물 중량 데이터가 없어 내부 구성은 표시할 수 없습니다.
        </div>}
      </section>
    </aside>,
    document.body,
  );
}
