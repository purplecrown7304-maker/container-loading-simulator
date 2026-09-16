import { useEffect, useState } from 'react';
import {
  EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT,
  readEquipmentImageOverrides,
  refreshEquipmentImageOverrides,
} from './equipmentImageOverrides';
import { useTransportEquipment } from './transportEquipment';

function applyEquipmentVisual(equipmentId: string, equipmentName: string) {
  const root = document.documentElement;
  const image = readEquipmentImageOverrides()[equipmentId] ?? '';

  root.style.setProperty('--guided-equipment-label', JSON.stringify(equipmentName));
  if (image) {
    root.dataset.guidedEquipmentImage = '1';
    root.style.setProperty('--guided-equipment-image', `url(${JSON.stringify(image)})`);
    return;
  }
  delete root.dataset.guidedEquipmentImage;
  root.style.removeProperty('--guided-equipment-image');
}

function clearEquipmentVisual() {
  const root = document.documentElement;
  delete root.dataset.guidedEquipmentImage;
  root.style.removeProperty('--guided-equipment-image');
  root.style.removeProperty('--guided-equipment-label');
}

export default function TransportEquipmentSelectionUxBridge() {
  const equipment = useTransportEquipment();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    void refreshEquipmentImageOverrides();
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener(EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT, refresh);
  }, []);

  useEffect(() => {
    applyEquipmentVisual(equipment.id, equipment.name);
    return clearEquipmentVisual;
  }, [equipment.id, equipment.name, revision]);

  return null;
}
