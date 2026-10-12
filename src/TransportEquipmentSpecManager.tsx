import { equipmentDisplayText } from './transportEquipmentPresentation';
import { useUiMessage } from './useUiMessage';
import { uiText, uiLocale, useUiLanguage } from './uiLanguage';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  TRANSPORT_EQUIPMENT,
  TRANSPORT_EQUIPMENT_EVENT,
  readTransportEquipment,
  selectTransportEquipment,
  getTransportEquipment,
  type TransportCategory,
  type TransportEquipment,
} from './transportEquipment';
import {
  TRANSPORT_EQUIPMENT_SPEC_OVERRIDES_EVENT,
  applyTransportEquipmentSpecOverride,
  readTransportEquipmentSpecOverrides,
  removeTransportEquipmentSpecOverride,
  sameTransportEquipmentSpec,
  setTransportEquipmentSpecOverride,
  type TransportEquipmentSpecOverride,
} from './transportEquipmentSpecOverrides';
import './transport-equipment-spec-manager.css';

export const OPEN_TRANSPORT_EQUIPMENT_SPEC_MANAGER_EVENT = 'container-loading:open-transport-equipment-spec-manager';

export function openTransportEquipmentSpecManager() {
  window.dispatchEvent(new Event(OPEN_TRANSPORT_EQUIPMENT_SPEC_MANAGER_EVENT));
}

function draftFrom(item: TransportEquipment): TransportEquipmentSpecOverride {
  return {
    length: item.length,
    width: item.width,
    height: item.height,
    maxPayloadKg: item.maxPayloadKg,
    floorLoadLimitKgPerM2: item.floorLoadLimitKgPerM2,
    doorWidth: item.doorWidth,
    doorHeight: item.doorHeight,
  };
}

function equipmentById(id: string) {
  return getTransportEquipment(id) ?? (readTransportEquipment().id === id ? readTransportEquipment() : TRANSPORT_EQUIPMENT[0]);
}

function patchSelectorCards() {
  const overrides = readTransportEquipmentSpecOverrides();
  document.querySelectorAll<HTMLElement>('.transport-equipment-card[data-equipment-id]').forEach(card => {
    const id = card.dataset.equipmentId ?? '';
    const base = equipmentById(id);
    if (!base) return;
    const item = overrides[id] ? applyTransportEquipmentSpecOverride(base) : base;
    const spec = card.querySelector<HTMLElement>('.transport-equipment-spec');
    const payload = card.querySelector<HTMLElement>('.transport-equipment-payload');
    const specText = `${item.length.toFixed(2)} × ${item.width.toFixed(2)} × ${item.height.toFixed(2)} m`;
    const payloadText = item.requiresSpecification && !item.maxPayloadKg ? uiText('허용중량 · 실차 등록 필요') : uiText("적재 {0} kg", [item.maxPayloadKg.toLocaleString(uiLocale())]);
    if (spec && spec.textContent !== specText) spec.textContent = specText;
    if (payload && payload.textContent !== payloadText) payload.textContent = payloadText;
  });
}

export default function TransportEquipmentSpecManager() {
  const language = useUiLanguage();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<TransportCategory>('container');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('40-high-cube');
  const [draft, setDraft] = useState<TransportEquipmentSpecOverride>(() => draftFrom(applyTransportEquipmentSpecOverride(equipmentById('40-high-cube'))));
  const [message, setMessage] = useUiMessage('');
  const [revision, setRevision] = useState(0);
  const applyingOverride = useRef(false);

  const selectedBase = equipmentById(selectedId);
  const selectedResolved = applyTransportEquipmentSpecOverride(selectedBase);
  const overrides = readTransportEquipmentSpecOverrides();
  const hasOverride = Boolean(overrides[selectedId]);

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return TRANSPORT_EQUIPMENT
      .filter(item => item.category === category)
      .map(applyTransportEquipmentSpecOverride)
      .filter(item => !needle || `${item.id} ${equipmentDisplayText(item, 'name')} ${item.shortName} ${equipmentDisplayText(item, 'name')} ${equipmentDisplayText(item, 'shortName')}`.toLowerCase().includes(needle));
  }, [category, query, open, revision, language]);

  useEffect(() => {
    const openManager = () => {
      const current = applyTransportEquipmentSpecOverride(readTransportEquipment());
      setCategory(current.category);
      setSelectedId(current.id);
      setDraft(draftFrom(current));
      setQuery('');
      setMessage('');
      setOpen(true);
    };
    window.addEventListener(OPEN_TRANSPORT_EQUIPMENT_SPEC_MANAGER_EVENT, openManager);
    return () => window.removeEventListener(OPEN_TRANSPORT_EQUIPMENT_SPEC_MANAGER_EVENT, openManager);
  }, []);

  useEffect(() => {
    const syncOverride = (event: Event) => {
      if (applyingOverride.current) return;
      const current = (event as CustomEvent<TransportEquipment>).detail ?? readTransportEquipment();
      const resolved = applyTransportEquipmentSpecOverride(current);
      if (sameTransportEquipmentSpec(current, resolved)) return;
      applyingOverride.current = true;
      try {
        selectTransportEquipment(resolved);
      } finally {
        window.setTimeout(() => { applyingOverride.current = false; }, 0);
      }
    };
    const refresh = () => {
      setRevision(value => value + 1);
      patchSelectorCards();
      const current = readTransportEquipment();
      const resolved = applyTransportEquipmentSpecOverride(current);
      if (!sameTransportEquipmentSpec(current, resolved)) selectTransportEquipment(resolved);
    };
    window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, syncOverride);
    window.addEventListener(TRANSPORT_EQUIPMENT_SPEC_OVERRIDES_EVENT, refresh);
    const observer = new MutationObserver(patchSelectorCards);
    observer.observe(document.body, { childList: true, subtree: true });
    patchSelectorCards();
    refresh();
    return () => {
      observer.disconnect();
      window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, syncOverride);
      window.removeEventListener(TRANSPORT_EQUIPMENT_SPEC_OVERRIDES_EVENT, refresh);
    };
  }, []);

  useEffect(() => { patchSelectorCards(); }, [language]);

  const choose = (item: TransportEquipment) => {
    setSelectedId(item.id);
    setDraft(draftFrom(item));
    setMessage('');
  };

  const update = (key: keyof TransportEquipmentSpecOverride, raw: string) => {
    const value = raw.trim() === '' && (key === 'doorWidth' || key === 'doorHeight') ? undefined : Number(raw);
    setDraft(current => ({ ...current, [key]: value }));
  };

  const save = () => {
    try {
      setTransportEquipmentSpecOverride(selectedId, draft);
      const updated = applyTransportEquipmentSpecOverride(selectedBase);
      if (readTransportEquipment().id === selectedId) selectTransportEquipment(updated);
      setDraft(draftFrom(updated));
      setMessage(() => uiText("{0} 규격을 저장했습니다. 적재공간 선택과 실제 계산에 같은 값이 적용됩니다.", [equipmentDisplayText(updated, 'shortName')]));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '규격을 저장하지 못했습니다.');
    }
  };

  const reset = () => {
    removeTransportEquipmentSpecOverride(selectedId);
    const registrationRequired = selectedBase.requiresSpecification && !(selectedBase.maxPayloadKg > 0 && selectedBase.floorLoadLimitKgPerM2 > 0);
    if (!registrationRequired && readTransportEquipment().id === selectedId) selectTransportEquipment(selectedBase);
    setDraft(draftFrom(selectedBase));
    setMessage(() => registrationRequired ? uiText('기본 템플릿으로 복원했습니다. 허용중량과 바닥하중을 다시 등록하세요. 현재 계획의 실차 규격은 유지됩니다.') : uiText("{0} 규격을 기본값으로 복원했습니다.", [equipmentDisplayText(selectedBase, 'shortName')]));
  };

  if (!open) return null;

  return <div className="transport-spec-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
    <section className="transport-spec-dialog" role="dialog" aria-modal="true" aria-label={uiText("차량 규격 관리")}>
      <header>
        <div><span>EQUIPMENT MASTER</span><h2>{uiText("차량 규격 관리")}</h2><p>{uiText("적재공간에 등록된 컨테이너·트럭의 실제 계산 규격을 수정합니다.")}</p></div>
        <button type="button" onClick={() => setOpen(false)}>{uiText("닫기")}</button>
      </header>

      <div className="transport-spec-tabs">
        <button type="button" className={category === 'container' ? 'active' : ''} onClick={() => setCategory('container')}>{uiText("컨테이너")}</button>
        <button type="button" className={category === 'truck' ? 'active' : ''} onClick={() => setCategory('truck')}>{uiText("트럭")}</button>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder={uiText("유형명 검색")} />
      </div>

      <div className="transport-spec-layout">
        <div className="transport-spec-list">
          {list.map(item => <button type="button" key={item.id} className={item.id === selectedId ? 'active' : ''} onClick={() => choose(item)}>
            <b>{equipmentDisplayText(item, 'name')}</b><span>{item.length.toFixed(3)} × {item.width.toFixed(3)} × {item.height.toFixed(3)}m</span><small>{readTransportEquipmentSpecOverrides()[item.id] ? uiText('수정 규격') : uiText('기본 규격')}</small>
          </button>)}
        </div>

        <div className="transport-spec-editor">
          <div className="transport-spec-selected"><b>{equipmentDisplayText(selectedResolved, 'name')}</b><span>{selectedResolved.id}</span>{hasOverride && <em>{uiText("수정됨")}</em>}</div>
          <div className="transport-spec-fields">
            <label>{uiText("내부 길이(m)")}<input type="number" min="0.1" step="0.001" value={draft.length} onChange={event => update('length', event.target.value)} /></label>
            <label>{uiText("내부 폭(m)")}<input type="number" min="0.1" step="0.001" value={draft.width} onChange={event => update('width', event.target.value)} /></label>
            <label>{uiText("내부 높이(m)")}<input type="number" min="0.1" step="0.001" value={draft.height} onChange={event => update('height', event.target.value)} /></label>
            <label>{uiText("최대 적재중량(kg)")}<input type="number" min="1" step="10" value={draft.maxPayloadKg} onChange={event => update('maxPayloadKg', event.target.value)} /></label>
            <label>{uiText("바닥 허용하중(kg/m²)")}<input type="number" min="1" step="10" value={draft.floorLoadLimitKgPerM2} onChange={event => update('floorLoadLimitKgPerM2', event.target.value)} /></label>
            <label>{uiText("도어 폭(m)")}<input type="number" min="0" step="0.001" value={draft.doorWidth ?? ''} onChange={event => update('doorWidth', event.target.value)} placeholder={uiText("해당 없음")} /></label>
            <label>{uiText("도어 높이(m)")}<input type="number" min="0" step="0.001" value={draft.doorHeight ?? ''} onChange={event => update('doorHeight', event.target.value)} placeholder={uiText("해당 없음")} /></label>
          </div>
          <div className="transport-spec-summary"><span>{uiText("계산 용적")}</span><b>{(draft.length * draft.width * draft.height).toFixed(2)} m³</b></div>
          <div className="transport-spec-actions"><button type="button" className="primary" onClick={save}>{uiText("규격 저장")}</button><button type="button" onClick={reset} disabled={!hasOverride}>{uiText("기본 규격 복원")}</button></div>
          {message && <p className="transport-spec-message">{message}</p>}
        </div>
      </div>
    </section>
  </div>;
}
