import { useEffect, useRef, useState } from 'react';
import {
  OPEN_TRANSPORT_SELECTOR_EVENT,
  TRANSPORT_EQUIPMENT_EVENT,
  readTransportEquipment,
  selectTransportEquipment,
  type TransportEquipment,
  useTransportEquipment,
} from './transportEquipment';

const DASHBOARD_FIELDS = [
  ['길이(m)', 'length'],
  ['폭(m)', 'width'],
  ['높이(m)', 'height'],
  ['최대중량', 'maxPayloadKg'],
  ['바닥 허용하중(kg/m²)', 'floorLoadLimitKgPerM2'],
] as const;

function sameEquipment(a: TransportEquipment, b: TransportEquipment) {
  return a.id === b.id
    && a.category === b.category
    && Math.abs(a.length - b.length) < 0.0001
    && Math.abs(a.width - b.width) < 0.0001
    && Math.abs(a.height - b.height) < 0.0001
    && Math.abs(a.maxPayloadKg - b.maxPayloadKg) < 0.1
    && Math.abs(a.floorLoadLimitKgPerM2 - b.floorLoadLimitKgPerM2) < 0.1;
}

function findDashboardInput(labelText: string) {
  const labels = Array.from(document.querySelectorAll('.dashboard-left .dashboard-card:first-child label'));
  for (const label of labels) {
    const text = (label.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text.startsWith(labelText)) continue;
    const input = label.querySelector('input');
    if (input instanceof HTMLInputElement) return input;
  }
  return null;
}

function setNativeInput(input: HTMLInputElement, value: number) {
  if (Math.abs(Number(input.value) - value) < 0.0001) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) return;
  setter.call(input, String(value));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function restoreDashboardEquipment(equipment: TransportEquipment) {
  const values = {
    length: equipment.length,
    width: equipment.width,
    height: equipment.height,
    maxPayloadKg: equipment.maxPayloadKg,
    floorLoadLimitKgPerM2: equipment.floorLoadLimitKgPerM2,
  };
  DASHBOARD_FIELDS.forEach(([label, key]) => {
    const input = findDashboardInput(label);
    if (input) setNativeInput(input, values[key]);
  });
}

function isExplicitEquipmentControl(target: Element) {
  return Boolean(target.closest('.transport-equipment-card, .transport-apply-custom'));
}

function isExplicitDashboardSpecChange(target: Element) {
  return Boolean(target.closest('.dashboard-left .dashboard-card:first-child'));
}

function isUnsupportedGeneralCargoAction(target: Element) {
  const button = target.closest('button');
  if (!(button instanceof HTMLButtonElement)) return false;
  const label = (button.textContent ?? '').replace(/\s+/g, ' ').trim();
  return button.classList.contains('primary-action')
    || label.includes('물리 최적 자동 적재')
    || label.includes('적재 최적화')
    || label.includes('작업 지시서')
    || label.includes('작업지시서')
    || label.includes('결과 보기');
}

export default function TransportEquipmentSafetyGuard() {
  const equipment = useTransportEquipment();
  const [blocked, setBlocked] = useState(false);
  const acceptedEquipment = useRef<TransportEquipment>(readTransportEquipment());
  const explicitChangeUntil = useRef(0);
  const restoring = useRef(false);

  useEffect(() => {
    const allowExplicitChange = (event: Event) => {
      if (!event.isTrusted) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (isExplicitEquipmentControl(target) || (event.type === 'change' && isExplicitDashboardSpecChange(target))) {
        explicitChangeUntil.current = performance.now() + 1500;
      }
    };

    const onEquipmentChanged = (event: Event) => {
      const next = (event as CustomEvent<TransportEquipment>).detail ?? readTransportEquipment();
      if (!next) return;
      if (restoring.current) return;
      if (sameEquipment(next, acceptedEquipment.current)) return;

      if (performance.now() <= explicitChangeUntil.current) {
        acceptedEquipment.current = { ...next };
        explicitChangeUntil.current = 0;
        return;
      }

      // 적재 실패, 재배치, 물리검증, 저장 동기화 등 프로그램 내부 동작은
      // 사용자가 선택한 컨테이너/차량을 바꾸지 못한다.
      const previous = { ...acceptedEquipment.current };
      restoring.current = true;
      restoreDashboardEquipment(previous);
      selectTransportEquipment(previous);
      queueMicrotask(() => { restoring.current = false; });
    };

    document.addEventListener('click', allowExplicitChange, true);
    document.addEventListener('change', allowExplicitChange, true);
    window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, onEquipmentChanged);
    return () => {
      document.removeEventListener('click', allowExplicitChange, true);
      document.removeEventListener('change', allowExplicitChange, true);
      window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, onEquipmentChanged);
    };
  }, []);

  useEffect(() => {
    if (!equipment.specializedCargo) {
      setBlocked(false);
      return;
    }
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !isUnsupportedGeneralCargoAction(target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setBlocked(true);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [equipment]);

  if (!blocked || !equipment.specializedCargo) return null;
  return <div className="transport-specialized-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setBlocked(false); }}>
    <section className="transport-specialized-dialog" role="alertdialog" aria-modal="true" aria-labelledby="transport-specialized-title">
      <span>SPECIALIZED EQUIPMENT</span>
      <h2 id="transport-specialized-title">{equipment.shortName}은 일반 박스 적재 대상이 아닙니다.</h2>
      <p>{equipment.note ?? '이 장비는 특수화물 전용입니다.'}</p>
      <p>현재 박스/팔레트 엔진으로 임의 계산하거나 일반화물 작업지시서를 발행하지 않습니다. 장비 변경은 사용자가 직접 선택할 때만 적용됩니다.</p>
      <div>
        <button type="button" onClick={() => { setBlocked(false); window.dispatchEvent(new CustomEvent(OPEN_TRANSPORT_SELECTOR_EVENT, { detail: { category: equipment.category } })); }}>장비 선택</button>
        <button type="button" onClick={() => setBlocked(false)}>닫기</button>
      </div>
    </section>
  </div>;
}
