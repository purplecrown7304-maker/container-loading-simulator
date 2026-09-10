import { useEffect } from 'react';
import {
  TRANSPORT_EQUIPMENT_EVENT,
  readTransportEquipment,
} from './transportEquipment';

const TYPE_LABEL_CLASS = 'guided-equipment-type-label';

function syncSelectedTypeLabel() {
  const visual = document.querySelector<HTMLElement>('.guided-equipment-stage .guided-equipment-visual');
  if (!visual) return;

  visual.style.position = 'relative';
  let label = visual.querySelector<HTMLElement>(`.${TYPE_LABEL_CLASS}`);
  if (!label) {
    label = document.createElement('span');
    label.className = TYPE_LABEL_CLASS;
    visual.appendChild(label);
  }

  label.textContent = readTransportEquipment().name;
}

function closeSelectorIfOpen() {
  const dialog = document.querySelector<HTMLElement>('.transport-selector-modal');
  if (!dialog) return;
  const closeButton = dialog.querySelector<HTMLButtonElement>('.transport-selector-head > button');
  closeButton?.click();
}

export default function TransportEquipmentSelectionUxBridge() {
  useEffect(() => {
    let frame = 0;

    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncSelectedTypeLabel);
    };

    const onEquipmentSelected = () => {
      closeSelectorIfOpen();
      sync();
    };

    window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, onEquipmentSelected);

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, onEquipmentSelected);
      document.querySelectorAll(`.${TYPE_LABEL_CLASS}`).forEach(node => node.remove());
    };
  }, []);

  return null;
}
