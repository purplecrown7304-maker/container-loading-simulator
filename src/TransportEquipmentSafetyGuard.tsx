import { useEffect, useRef, useState } from 'react';
import {
  OPEN_TRANSPORT_SELECTOR_EVENT,
  TRANSPORT_EQUIPMENT,
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

const EXPLICIT_CUSTOM_STORAGE_KEY = 'container-loading:explicit-custom-equipment-v1';

type PendingExplicitChange =
  | { kind: 'known'; equipment: TransportEquipment; until: number }
  | { kind: 'custom'; until: number }
  | null;

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

function closestKnownEquipment(candidate: TransportEquipment) {
  const known = TRANSPORT_EQUIPMENT.filter(item => !item.id.startsWith('custom-') && item.category === candidate.category);
  if (!known.length) return null;

  const score = (item: TransportEquipment) => {
    const length = Math.abs(item.length - candidate.length) / Math.max(0.1, item.length);
    const width = Math.abs(item.width - candidate.width) / Math.max(0.1, item.width);
    const height = Math.abs(item.height - candidate.height) / Math.max(0.1, item.height);
    const payload = Math.abs(item.maxPayloadKg - candidate.maxPayloadKg) / Math.max(1000, item.maxPayloadKg);
    const floor = Math.abs(item.floorLoadLimitKgPerM2 - candidate.floorLoadLimitKgPerM2) / Math.max(500, item.floorLoadLimitKgPerM2);
    return length * 4 + width * 4 + height * 4 + payload + floor;
  };

  return [...known].sort((a, b) => score(a) - score(b))[0] ?? null;
}

function equipmentFromCard(target: Element) {
  const card = target.closest('.transport-equipment-card');
  if (!card) return null;
  const name = card.querySelector('.transport-equipment-card-name')?.textContent?.trim();
  if (!name) return null;
  return TRANSPORT_EQUIPMENT.find(item => item.name === name) ?? null;
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
  const pendingExplicit = useRef<PendingExplicitChange>(null);
  const restoring = useRef(false);

  useEffect(() => {
    // 과거 자동 동기화 버그로 Custom Container/Truck가 저장된 경우 복구한다.
    // Custom은 사용자가 직접 '사용자 규격 적용'을 눌렀다는 표식이 있을 때만 유지한다.
    const initial = readTransportEquipment();
    const explicitlyCustom = window.localStorage.getItem(EXPLICIT_CUSTOM_STORAGE_KEY) === '1';
    if (initial.id.startsWith('custom-') && !explicitlyCustom) {
      const recovered = closestKnownEquipment(initial);
      if (recovered) {
        acceptedEquipment.current = { ...recovered };
        restoring.current = true;
        window.setTimeout(() => {
          restoreDashboardEquipment(recovered);
          selectTransportEquipment(recovered);
          queueMicrotask(() => { restoring.current = false; });
        }, 0);
      }
    }

    const markExplicitChange = (event: Event) => {
      if (!event.isTrusted) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      const customApply = target.closest('.transport-apply-custom');
      if (customApply) {
        pendingExplicit.current = { kind: 'custom', until: performance.now() + 2000 };
        window.localStorage.setItem(EXPLICIT_CUSTOM_STORAGE_KEY, '1');
        return;
      }

      const cardEquipment = equipmentFromCard(target);
      if (cardEquipment) {
        if (cardEquipment.id.startsWith('custom-')) {
          // Custom 카드는 편집 화면만 여는 단계이므로 아직 장비 변경으로 인정하지 않는다.
          pendingExplicit.current = null;
          return;
        }
        pendingExplicit.current = { kind: 'known', equipment: cardEquipment, until: performance.now() + 2000 };
        window.localStorage.removeItem(EXPLICIT_CUSTOM_STORAGE_KEY);
        return;
      }

      if (event.type === 'change' && isExplicitDashboardSpecChange(target)) {
        pendingExplicit.current = { kind: 'custom', until: performance.now() + 2000 };
        window.localStorage.setItem(EXPLICIT_CUSTOM_STORAGE_KEY, '1');
      }
    };

    const restoreAccepted = () => {
      const previous = { ...acceptedEquipment.current };
      restoring.current = true;
      restoreDashboardEquipment(previous);
      selectTransportEquipment(previous);
      queueMicrotask(() => { restoring.current = false; });
    };

    const onEquipmentChanged = (event: Event) => {
      const next = (event as CustomEvent<TransportEquipment>).detail ?? readTransportEquipment();
      if (!next || restoring.current) return;
      if (sameEquipment(next, acceptedEquipment.current)) return;

      const pending = pendingExplicit.current;
      const activePending = pending && performance.now() <= pending.until ? pending : null;
      if (!activePending) pendingExplicit.current = null;

      if (activePending?.kind === 'known') {
        // 알려진 장비 카드 클릭 직후 입력칸이 순차 갱신되면서 발생하는
        // 임시 Custom 변환은 절대 받아들이지 않는다.
        if (next.id === activePending.equipment.id) {
          acceptedEquipment.current = { ...next };
          pendingExplicit.current = null;
          window.localStorage.removeItem(EXPLICIT_CUSTOM_STORAGE_KEY);
          return;
        }
        restoreAccepted();
        return;
      }

      if (activePending?.kind === 'custom') {
        if (next.id.startsWith('custom-')) {
          acceptedEquipment.current = { ...next };
          pendingExplicit.current = null;
          window.localStorage.setItem(EXPLICIT_CUSTOM_STORAGE_KEY, '1');
          return;
        }
        restoreAccepted();
        return;
      }

      // 적재 실패, 재배치, 물리검증, 관성검사, 저장 동기화 또는
      // 프로그램이 발생시킨 change 이벤트는 장비 선택을 바꿀 수 없다.
      restoreAccepted();
    };

    document.addEventListener('click', markExplicitChange, true);
    document.addEventListener('change', markExplicitChange, true);
    window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, onEquipmentChanged);
    return () => {
      document.removeEventListener('click', markExplicitChange, true);
      document.removeEventListener('change', markExplicitChange, true);
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
