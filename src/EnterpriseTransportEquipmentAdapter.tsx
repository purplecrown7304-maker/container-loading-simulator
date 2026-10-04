import { useEffect } from 'react';
import { useTransportEquipment } from './transportEquipment';

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

function matchingInput(panel: Element | null, labelText: string) {
  if (!panel) return null;
  for (const label of Array.from(panel.querySelectorAll('label'))) {
    const text = (label.textContent ?? '').replace(/\s+/g, '').trim();
    if (!text.startsWith(labelText.replace(/\s+/g, ''))) continue;
    const input = label.querySelector('input');
    if (input instanceof HTMLInputElement) return input;
  }
  return null;
}

function inputsFor(labelText: string) {
  const inputs: HTMLInputElement[] = [];
  const planner = document.getElementById('product-packaging-planner');
  const enterprisePanel = planner?.querySelector('.enterprise-settings-grid .packaging-panel') ?? null;
  const enterprise = matchingInput(enterprisePanel, labelText);
  if (enterprise) inputs.push(enterprise);
  return inputs;
}

/**
 * Transport equipment is the master geometry. Keep the enterprise packaging planner
 * synchronized, including its legacy floor-area input. App subscribes directly to
 * atomic equipment source changes; do not mutate its individual DOM inputs here.
 * For the App, changing equipment
 * invalidates the previous layout and never starts an unrequested loading calculation.
 */
export default function EnterpriseTransportEquipmentAdapter() {
  const equipment = useTransportEquipment();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const values = {
        length: equipment.length,
        width: equipment.width,
        height: equipment.height,
        maxPayloadKg: equipment.maxPayloadKg,
        floorLoadLimitKgPerM2: equipment.floorLoadLimitKgPerM2,
      };
      labels.forEach(([label, key]) => {
        for (const input of inputsFor(label)) {
          setNativeInput(input, values[key]);
        }
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [equipment]);

  return null;
}
