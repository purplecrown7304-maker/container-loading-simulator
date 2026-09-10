import { useEffect } from 'react';
import { useTransportEquipment } from './transportEquipment';
import { APP_ACTION_EVENT } from './uiEvents';

const labels = [
  ['길이(m)', 'length'],
  ['폭(m)', 'width'],
  ['높이(m)', 'height'],
  ['최대중량', 'maxPayloadKg'],
  ['바닥허용하중(kg/m²)', 'floorLoadLimitKgPerM2'],
] as const;

function setNativeInput(input: HTMLInputElement, value: number) {
  if (Number(input.value) === value) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) return false;
  setter.call(input, String(value));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function inputFor(planner: Element, labelText: string) {
  const firstPanel = planner.querySelector('.enterprise-settings-grid .packaging-panel');
  if (!firstPanel) return null;
  for (const label of Array.from(firstPanel.querySelectorAll('label'))) {
    const text = (label.textContent ?? '').replace(/\s+/g, '').trim();
    if (!text.startsWith(labelText.replace(/\s+/g, ''))) continue;
    const input = label.querySelector('input');
    if (input instanceof HTMLInputElement) return input;
  }
  return null;
}

/**
 * The transport selector and App historically kept separate container state. That
 * allowed the equipment badge to say 20FT Standard while the loading result still
 * used an older Flatrack ContainerSpec. Keep the editable App fields synchronized
 * with the selected equipment, including the floor-load limit, and then force a
 * fresh loading calculation after React has committed the changed inputs.
 */
export default function EnterpriseTransportEquipmentAdapter() {
  const equipment = useTransportEquipment();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const planner = document.getElementById('product-packaging-planner');
      if (!planner) return;
      const values = {
        length: equipment.length,
        width: equipment.width,
        height: equipment.height,
        maxPayloadKg: equipment.maxPayloadKg,
        floorLoadLimitKgPerM2: equipment.floorLoadLimitKgPerM2,
      };
      let changed = false;
      labels.forEach(([label, key]) => {
        const input = inputFor(planner, label);
        if (input) changed = setNativeInput(input, values[key]) || changed;
      });

      if (changed) {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent(APP_ACTION_EVENT, { detail: { action: 'run-loading' } }));
        }, 40);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [equipment]);

  return null;
}
