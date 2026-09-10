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

function mainContainerPanel() {
  for (const panel of Array.from(document.querySelectorAll('.dashboard-left .dashboard-card'))) {
    const heading = panel.querySelector('h2')?.textContent ?? '';
    if (heading.includes('컨테이너 정보')) return panel;
  }
  return null;
}

function inputsFor(labelText: string) {
  const inputs: HTMLInputElement[] = [];
  const main = matchingInput(mainContainerPanel(), labelText);
  if (main) inputs.push(main);

  const planner = document.getElementById('product-packaging-planner');
  const enterprisePanel = planner?.querySelector('.enterprise-settings-grid .packaging-panel') ?? null;
  const enterprise = matchingInput(enterprisePanel, labelText);
  if (enterprise && enterprise !== main) inputs.push(enterprise);
  return inputs;
}

/**
 * Transport equipment is the master geometry. Keep both the main loading App and the
 * enterprise packaging planner synchronized with the selected equipment, including
 * floor load. React receives normal input/change events, then the main loading result
 * is recalculated so the equipment badge and the actual ContainerSpec cannot diverge.
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
      let changedMain = false;
      labels.forEach(([label, key]) => {
        for (const input of inputsFor(label)) {
          const isMain = Boolean(input.closest('.dashboard-left'));
          const changed = setNativeInput(input, values[key]);
          changedMain = changedMain || (isMain && changed);
        }
      });

      if (changedMain) {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent(APP_ACTION_EVENT, { detail: { action: 'run-loading' } }));
        }, 50);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [equipment]);

  return null;
}
