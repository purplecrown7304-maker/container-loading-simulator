import { useEffect } from 'react';
import {
  EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT,
  readEquipmentImageOverrides,
} from './equipmentImageOverrides';
import { readStoredState, writeStoredState } from './storage';
import {
  TRANSPORT_EQUIPMENT_EVENT,
  createCustomEquipment,
  getTransportEquipment,
  hasStoredTransportEquipment,
  readTransportEquipment,
  selectTransportEquipment,
  type TransportCategory,
  type TransportEquipment,
} from './transportEquipment';

const TYPE_LABEL_CLASS = 'guided-equipment-type-label';
const IMAGE_CLASS = 'equipment-custom-visual';
const EPS = 0.0001;
const EXPLICIT_SELECTION_LOCK_MS = 1800;

function sameNumber(a: number | undefined, b: number | undefined, tolerance = EPS) {
  if (a == null || b == null) return a === b;
  return Math.abs(a - b) <= tolerance;
}

function sameEquipment(a: TransportEquipment, b: TransportEquipment) {
  return a.id === b.id
    && a.category === b.category
    && sameNumber(a.length, b.length)
    && sameNumber(a.width, b.width)
    && sameNumber(a.height, b.height)
    && sameNumber(a.maxPayloadKg, b.maxPayloadKg, 1)
    && sameNumber(a.floorLoadLimitKgPerM2, b.floorLoadLimitKgPerM2, 1);
}

function syncEquipmentToStoredState(equipment: TransportEquipment) {
  const stored = readStoredState();
  const current = stored?.container;
  const nextContainer = {
    length: equipment.length,
    width: equipment.width,
    height: equipment.height,
    maxPayloadKg: equipment.maxPayloadKg,
    floorLoadLimitKgPerM2: equipment.floorLoadLimitKgPerM2,
    floorLoadWarningMultiplier: current?.floorLoadWarningMultiplier ?? 3,
  };

  const alreadySynced = Boolean(current)
    && sameNumber(current?.length, nextContainer.length)
    && sameNumber(current?.width, nextContainer.width)
    && sameNumber(current?.height, nextContainer.height)
    && sameNumber(current?.maxPayloadKg, nextContainer.maxPayloadKg, 1)
    && sameNumber(current?.floorLoadLimitKgPerM2, nextContainer.floorLoadLimitKgPerM2, 1);

  if (alreadySynced) return;
  writeStoredState({ container: nextContainer, cargo: stored?.cargo ?? [] }, true);
}

function syncSelectedEquipmentVisual() {
  const visual = document.querySelector<HTMLElement>('.guided-equipment-stage .guided-equipment-visual');
  if (!visual) return;

  const equipment = readTransportEquipment();
  const registeredImage = readEquipmentImageOverrides()[equipment.id] ?? '';
  const svg = visual.querySelector<SVGElement>('svg');
  let image = visual.querySelector<HTMLImageElement>(`img.${IMAGE_CLASS}`);

  visual.style.position = 'relative';

  if (registeredImage) {
    if (!image) {
      image = document.createElement('img');
      image.className = IMAGE_CLASS;
      image.draggable = false;
      image.style.display = 'block';
      image.style.width = '100%';
      image.style.height = 'auto';
      image.style.aspectRatio = '760 / 260';
      image.style.objectFit = 'contain';
      image.style.background = 'transparent';
      visual.prepend(image);
    }
    image.src = registeredImage;
    image.alt = `${equipment.name} 적재공간 이미지`;
    if (svg) svg.style.display = 'none';
  } else {
    image?.remove();
    if (svg) svg.style.display = '';
  }

  let label = visual.querySelector<HTMLElement>(`.${TYPE_LABEL_CLASS}`);
  if (!label) {
    label = document.createElement('span');
    label.className = TYPE_LABEL_CLASS;
    visual.appendChild(label);
  }
  label.textContent = equipment.name;
}

function closeSelectorIfOpen() {
  const dialog = document.querySelector<HTMLElement>('.transport-selector-modal');
  if (!dialog) return;
  const closeButton = dialog.querySelector<HTMLButtonElement>('.transport-selector-head > button');
  closeButton?.click();
}

function customEquipmentFromDialog(): TransportEquipment | null {
  const dialog = document.querySelector<HTMLElement>('.transport-selector-modal');
  if (!dialog) return null;
  const activeTab = dialog.querySelector<HTMLButtonElement>('.transport-category-tabs button.active');
  const category: TransportCategory = (activeTab?.textContent ?? '').includes('트럭') ? 'truck' : 'container';
  const inputs = [...dialog.querySelectorAll<HTMLInputElement>('.transport-custom-editor input[type="number"]')];
  if (inputs.length < 5) return null;
  const [length, width, height, maxPayloadKg, floorLoadLimitKgPerM2] = inputs.slice(0, 5).map(input => Number(input.value));
  if (![length, width, height, maxPayloadKg, floorLoadLimitKgPerM2].every(value => Number.isFinite(value) && value > 0)) return null;
  return createCustomEquipment(category, { length, width, height, maxPayloadKg, floorLoadLimitKgPerM2 });
}

export default function TransportEquipmentSelectionUxBridge() {
  useEffect(() => {
    let frame = 0;
    let restoringExplicit = false;
    let explicitLock: { equipment: TransportEquipment; until: number } | null = null;

    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncSelectedEquipmentVisual);
    };

    const applyExplicitEquipment = (equipment: TransportEquipment) => {
      explicitLock = { equipment: { ...equipment }, until: performance.now() + EXPLICIT_SELECTION_LOCK_MS };
      restoringExplicit = true;
      try {
        selectTransportEquipment(equipment);
        syncEquipmentToStoredState(equipment);
      } finally {
        queueMicrotask(() => { restoringExplicit = false; });
      }
      closeSelectorIfOpen();
      sync();
    };

    const onSelectorClickCapture = (event: MouseEvent) => {
      if (!event.isTrusted) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      const customApply = target.closest<HTMLButtonElement>('.transport-apply-custom');
      if (customApply) {
        const equipment = customEquipmentFromDialog();
        if (!equipment) return;
        event.preventDefault();
        event.stopPropagation();
        queueMicrotask(() => applyExplicitEquipment(equipment));
        return;
      }

      const card = target.closest<HTMLButtonElement>('.transport-equipment-card[data-equipment-id]');
      if (!card || !card.closest('.transport-selector-modal')) return;
      const id = card.dataset.equipmentId ?? '';
      if (!id || id.startsWith('custom-')) return;
      const equipment = getTransportEquipment(id);
      if (!equipment) return;

      // 사용자가 장비 카드를 명시적으로 눌렀다면 그 선택이 유일한 master다.
      // Selector의 legacy DOM/storage 역동기화가 수십 ms 뒤 이전 장비를 재선택하는 경로를 막는다.
      event.preventDefault();
      event.stopPropagation();
      queueMicrotask(() => applyExplicitEquipment(equipment));
    };

    const onEquipmentSelected = (event: Event) => {
      const incoming = (event as CustomEvent<TransportEquipment>).detail ?? readTransportEquipment();
      const lock = explicitLock && performance.now() <= explicitLock.until ? explicitLock : null;
      if (!lock) explicitLock = null;

      if (lock && !restoringExplicit && !sameEquipment(incoming, lock.equipment)) {
        // 오래된 dashboard/storage 값이 explicit selection 뒤늦게 덮어쓰려 하면
        // 사용자 선택을 즉시 복구하고 같은 선택으로 저장 상태까지 다시 맞춘다.
        restoringExplicit = true;
        try {
          selectTransportEquipment(lock.equipment);
          syncEquipmentToStoredState(lock.equipment);
        } finally {
          queueMicrotask(() => { restoringExplicit = false; });
        }
        sync();
        return;
      }

      syncEquipmentToStoredState(incoming);
      sync();
    };

    document.addEventListener('click', onSelectorClickCapture, true);
    window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, onEquipmentSelected);
    window.addEventListener(EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT, sync);

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    if (hasStoredTransportEquipment()) syncEquipmentToStoredState(readTransportEquipment());
    sync();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('click', onSelectorClickCapture, true);
      window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, onEquipmentSelected);
      window.removeEventListener(EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT, sync);
      document.querySelectorAll(`.${TYPE_LABEL_CLASS}`).forEach(node => node.remove());
    };
  }, []);

  return null;
}
