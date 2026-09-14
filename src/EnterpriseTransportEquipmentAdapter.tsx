import { useEffect } from 'react';
import { useTransportEquipment } from './transportEquipment';
import { readStoredState, writeStoredState } from './storage';
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
 * Transport equipment is the master geometry.
 *
 * 일반 화면에서는 기존처럼 장비 변경 뒤 즉시 재계산할 수 있지만, 가이드 작업에서는
 * 1단계 장비 선택이 5단계 자동 적재를 몰래 실행하면 안 된다. 가이드 모드에서는
 * App/포장 계산이 같은 ContainerSpec을 보도록 저장 상태만 동기화하고, 실제 적재는
 * 사용자가 적재 방식을 확정해 5단계에 들어갈 때 실행한다.
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

      const guided = document.documentElement.dataset.guidedWorkflow === 'true';
      if (guided) {
        const stored = readStoredState();
        const container = {
          ...(stored?.container ?? {
            length: equipment.length,
            width: equipment.width,
            height: equipment.height,
            maxPayloadKg: equipment.maxPayloadKg,
            floorLoadLimitKgPerM2: equipment.floorLoadLimitKgPerM2,
            floorLoadWarningMultiplier: 3,
          }),
          length: equipment.length,
          width: equipment.width,
          height: equipment.height,
          maxPayloadKg: equipment.maxPayloadKg,
          floorLoadLimitKgPerM2: equipment.floorLoadLimitKgPerM2,
        };
        writeStoredState({ container, cargo: stored?.cargo ?? [] }, true);
        return;
      }

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
