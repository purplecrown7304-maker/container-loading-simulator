import { useEffect } from 'react';
import {
  EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT,
  readEquipmentImageOverrides,
} from './equipmentImageOverrides';
import {
  TRANSPORT_EQUIPMENT_EVENT,
  readTransportEquipment,
} from './transportEquipment';

const TYPE_LABEL_CLASS = 'guided-equipment-type-label';
const IMAGE_CLASS = 'equipment-custom-visual';

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

export default function TransportEquipmentSelectionUxBridge() {
  useEffect(() => {
    let frame = 0;

    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncSelectedEquipmentVisual);
    };

    const onEquipmentSelected = () => {
      closeSelectorIfOpen();
      sync();
    };

    window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, onEquipmentSelected);
    window.addEventListener(EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT, sync);

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, onEquipmentSelected);
      window.removeEventListener(EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT, sync);
      document.querySelectorAll(`.${TYPE_LABEL_CLASS}`).forEach(node => node.remove());
    };
  }, []);

  return null;
}
