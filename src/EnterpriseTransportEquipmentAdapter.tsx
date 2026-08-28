import { useEffect } from 'react';
import { useTransportEquipment } from './transportEquipment';

const labels = [
  ['길이(m)', 'length'],
  ['폭(m)', 'width'],
  ['높이(m)', 'height'],
  ['최대중량(kg)', 'maxPayloadKg'],
] as const;

function setNativeInput(input: HTMLInputElement, value: number) {
  if (Number(input.value) === value) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) return;
  setter.call(input, String(value));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
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
      };
      labels.forEach(([label, key]) => {
        const input = inputFor(planner, label);
        if (input) setNativeInput(input, values[key]);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [equipment]);

  return null;
}
