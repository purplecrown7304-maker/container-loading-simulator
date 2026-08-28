import { useEffect, useMemo, useState } from 'react';
import {
  CONTAINER_EQUIPMENT,
  OPEN_TRANSPORT_SELECTOR_EVENT,
  TRUCK_EQUIPMENT,
  createCustomEquipment,
  findMatchingEquipment,
  readTransportEquipment,
  selectTransportEquipment,
  type EquipmentGeometry,
  type TransportCategory,
  type TransportEquipment,
  useTransportEquipment,
} from './transportEquipment';

const FIELD_LABELS = {
  length: '길이(m)',
  width: '폭(m)',
  height: '높이(m)',
  maxPayloadKg: '최대중량',
  floorLoadLimitKgPerM2: '바닥 허용하중(kg/m²)',
} as const;

type EditableSpec = {
  length: number;
  width: number;
  height: number;
  maxPayloadKg: number;
  floorLoadLimitKgPerM2: number;
};

function nativeValueSetter(input: HTMLInputElement, value: number) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) return false;
  setter.call(input, String(value));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function findDashboardInput(labelText: string) {
  const labels = Array.from(document.querySelectorAll('.dashboard-left .dashboard-card:first-child label'));
  for (const label of labels) {
    const normalized = (label.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!normalized.startsWith(labelText)) continue;
    const input = label.querySelector('input');
    if (input instanceof HTMLInputElement) return input;
  }
  return null;
}

function readDashboardSpec(): EditableSpec | null {
  const read = (key: keyof typeof FIELD_LABELS) => Number(findDashboardInput(FIELD_LABELS[key])?.value);
  const result = {
    length: read('length'),
    width: read('width'),
    height: read('height'),
    maxPayloadKg: read('maxPayloadKg'),
    floorLoadLimitKgPerM2: read('floorLoadLimitKgPerM2'),
  };
  return Object.values(result).every(value => Number.isFinite(value) && value > 0) ? result : null;
}

function applyToDashboard(spec: TransportEquipment) {
  const values: EditableSpec = {
    length: spec.length,
    width: spec.width,
    height: spec.height,
    maxPayloadKg: spec.maxPayloadKg,
    floorLoadLimitKgPerM2: spec.floorLoadLimitKgPerM2,
  };
  let applied = 0;
  (Object.keys(values) as Array<keyof EditableSpec>).forEach(key => {
    const input = findDashboardInput(FIELD_LABELS[key]);
    if (input && nativeValueSetter(input, values[key])) applied += 1;
  });
  return applied === Object.keys(values).length;
}

function EquipmentIcon({ geometry, truck }: { geometry: EquipmentGeometry; truck: boolean }) {
  if (geometry === 'tank') return <svg viewBox="0 0 180 100" aria-hidden="true"><rect x="20" y="22" width="140" height="58" rx="2" className="eq-line"/><rect x="36" y="30" width="108" height="42" rx="21" className="eq-fill"/><circle cx="55" cy="78" r="5" className="eq-dark"/><circle cx="125" cy="78" r="5" className="eq-dark"/></svg>;
  if (geometry === 'platform') return <svg viewBox="0 0 180 100" aria-hidden="true"><path d="M20 64 L145 46 L160 55 L36 76 Z" className="eq-fill"/><path d="M20 64 L145 46 L160 55 L36 76 Z M32 73v9m116-28v10" className="eq-line"/></svg>;
  if (geometry === 'flat-rack') return <svg viewBox="0 0 180 100" aria-hidden="true"><path d="M28 68 L145 50 L156 58 L40 77 Z" className="eq-fill"/><path d="M28 68V30l13 5v42M145 50V18l11 5v35M28 68 L145 50 L156 58 L40 77 Z" className="eq-line"/></svg>;
  if (truck) return <svg viewBox="0 0 200 100" aria-hidden="true"><path d="M72 28h105v48H72z" className="eq-fill"/><path d="M23 52l18-25h31v49H23z" className="eq-fill"/><path d="M23 52h49V27H41L23 52zm49-24h105v48H72V28z" className="eq-line"/><circle cx="52" cy="78" r="9" className="eq-wheel"/><circle cx="151" cy="78" r="9" className="eq-wheel"/><circle cx="52" cy="78" r="4" className="eq-fill"/><circle cx="151" cy="78" r="4" className="eq-fill"/>{geometry === 'reefer-truck' && <text x="120" y="58" className="eq-snow">❄</text>}{geometry === 'jumbo-truck' && <path d="M121 28v48" className="eq-line"/>}</svg>;
  return <svg viewBox="0 0 180 100" aria-hidden="true"><path d="M26 35l96-18 34 9v49L59 88 26 73z" className="eq-fill"/><path d="M26 35l96-18 34 9-97 18-33-9zm0 0v38l33 15V44m97-18v49L59 88" className="eq-line"/>{geometry !== 'open-top' && <path d="M59 44l97-18" className="eq-line"/>}{geometry === 'reefer' && <text x="110" y="62" className="eq-snow">❄</text>}{geometry === 'bulk' && <><circle cx="92" cy="31" r="5" className="eq-dark"/><circle cx="118" cy="27" r="5" className="eq-dark"/></>}</svg>;
}

function EquipmentCard({ item, active, onSelect }: { item: TransportEquipment; active: boolean; onSelect: (value: TransportEquipment) => void }) {
  return <button type="button" className={`transport-equipment-card ${active ? 'active' : ''}`} onClick={() => onSelect(item)}>
    <span className="transport-equipment-card-name">{item.name}</span>
    <EquipmentIcon geometry={item.geometry} truck={item.category === 'truck'} />
    <span className="transport-equipment-spec">{item.length.toFixed(2)} × {item.width.toFixed(2)} × {item.height.toFixed(2)} m</span>
    <span className="transport-equipment-payload">적재 {item.maxPayloadKg.toLocaleString()} kg</span>
  </button>;
}

function editable(item: TransportEquipment): EditableSpec {
  return { length: item.length, width: item.width, height: item.height, maxPayloadKg: item.maxPayloadKg, floorLoadLimitKgPerM2: item.floorLoadLimitKgPerM2 };
}

export default function TransportEquipmentSelector() {
  const selected = useTransportEquipment();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<TransportCategory>(selected.category);
  const [custom, setCustom] = useState<EditableSpec>(() => editable(selected));
  const [message, setMessage] = useState('');
  const list = useMemo(() => category === 'container' ? CONTAINER_EQUIPMENT : TRUCK_EQUIPMENT, [category]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ category?: TransportCategory }>).detail;
      const nextCategory = detail?.category ?? readTransportEquipment().category;
      setCategory(nextCategory);
      setCustom(editable(readTransportEquipment()));
      setMessage('');
      setOpen(true);
    };
    window.addEventListener(OPEN_TRANSPORT_SELECTOR_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TRANSPORT_SELECTOR_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const onDashboardChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.closest('.dashboard-left .dashboard-card:first-child')) return;
      window.setTimeout(() => {
        const values = readDashboardSpec();
        if (!values) return;
        const match = findMatchingEquipment(values.length, values.width, values.height, values.maxPayloadKg);
        if (match) selectTransportEquipment(match);
        else selectTransportEquipment(createCustomEquipment(readTransportEquipment().category, values));
      }, 0);
    };
    document.addEventListener('change', onDashboardChange, true);
    return () => document.removeEventListener('change', onDashboardChange, true);
  }, []);

  const choose = (item: TransportEquipment) => {
    if (item.id.startsWith('custom-')) {
      setCustom(editable(item));
      setCategory(item.category);
      setMessage('사용자 규격을 입력한 뒤 적용하세요.');
      return;
    }
    if (!applyToDashboard(item)) {
      setMessage('대시보드 컨테이너 입력칸을 찾지 못했습니다. 화면을 새로고침한 뒤 다시 적용하세요.');
      return;
    }
    selectTransportEquipment(item);
    setCustom(editable(item));
    setMessage(item.specializedCargo ? `${item.shortName}은 특수화물 전용 장비입니다. 박스 적재 결과는 참고용입니다.` : `${item.shortName} 규격을 현재 적재계획에 적용했습니다.`);
  };

  const applyCustom = () => {
    const values = custom;
    if (!Object.values(values).every(value => Number.isFinite(value) && value > 0)) {
      setMessage('길이·폭·높이·적재중량·바닥하중을 모두 0보다 크게 입력하세요.');
      return;
    }
    const item = createCustomEquipment(category, values);
    if (!applyToDashboard(item)) {
      setMessage('대시보드 입력칸을 찾지 못했습니다.');
      return;
    }
    selectTransportEquipment(item);
    setMessage(`${item.shortName} 사용자 규격을 적용했습니다.`);
  };

  if (!open) return null;
  return <div className="transport-selector-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
    <section className="transport-selector-modal" role="dialog" aria-modal="true" aria-labelledby="transport-selector-title">
      <header className="transport-selector-head">
        <div><span>TRANSPORT EQUIPMENT</span><h2 id="transport-selector-title">컨테이너 및 트럭 유형</h2><p>장비를 선택하면 현재 제품/박스 목록은 유지하고 적재공간 규격과 최대 적재중량만 즉시 바꿉니다.</p></div>
        <button type="button" onClick={() => setOpen(false)}>닫기</button>
      </header>

      <div className="transport-category-tabs" role="tablist">
        <button type="button" className={category === 'container' ? 'active' : ''} onClick={() => setCategory('container')}>▥ 컨테이너</button>
        <button type="button" className={category === 'truck' ? 'active' : ''} onClick={() => setCategory('truck')}>▰ 트럭</button>
      </div>

      <div className="transport-equipment-grid">
        {list.map(item => <EquipmentCard key={item.id} item={item} active={selected.id === item.id} onSelect={choose} />)}
      </div>

      {(selected.id.startsWith('custom-') || message.includes('사용자 규격')) && <section className="transport-custom-editor">
        <h3>{category === 'container' ? 'CUSTOM CONTAINER' : 'CUSTOM TRUCK'} 규격</h3>
        <div>
          <label>내부 길이(m)<input type="number" min="0.1" step="0.01" value={custom.length} onChange={e => setCustom(v => ({ ...v, length: Number(e.target.value) }))} /></label>
          <label>내부 폭(m)<input type="number" min="0.1" step="0.01" value={custom.width} onChange={e => setCustom(v => ({ ...v, width: Number(e.target.value) }))} /></label>
          <label>내부 높이(m)<input type="number" min="0.1" step="0.01" value={custom.height} onChange={e => setCustom(v => ({ ...v, height: Number(e.target.value) }))} /></label>
          <label>최대 적재중량(kg)<input type="number" min="1" step="100" value={custom.maxPayloadKg} onChange={e => setCustom(v => ({ ...v, maxPayloadKg: Number(e.target.value) }))} /></label>
          <label>바닥 허용하중(kg/m²)<input type="number" min="1" step="100" value={custom.floorLoadLimitKgPerM2} onChange={e => setCustom(v => ({ ...v, floorLoadLimitKgPerM2: Number(e.target.value) }))} /></label>
        </div>
        <button type="button" className="transport-apply-custom" onClick={applyCustom}>사용자 규격 적용</button>
      </section>}

      <footer className="transport-selector-foot">
        <div><b>현재 선택: {selected.shortName}</b><span>{selected.length.toFixed(3)} × {selected.width.toFixed(3)} × {selected.height.toFixed(3)}m · {selected.maxPayloadKg.toLocaleString()}kg</span></div>
        <div><span>{selected.sourceLabel}</span><small>실제 장비 제원은 제조사·연식·국가별 허용중량에 따라 달라질 수 있으므로 출하 전 실제 장비 데이터를 확인하세요.</small></div>
      </footer>
      {message && <p className="transport-selector-message" role="status">{message}</p>}
    </section>
  </div>;
}
