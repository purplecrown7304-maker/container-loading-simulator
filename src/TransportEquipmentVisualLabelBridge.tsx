import { useEffect } from 'react';
import { TRANSPORT_EQUIPMENT_EVENT, readTransportEquipment } from './transportEquipment';

const TYPE_LABEL_CLASS = 'guided-equipment-type-label';

/**
 * 가이드 1단계 적재공간 그림의 좌측 상단 이름표만 동기화한다.
 * 장비 선택/저장/클릭을 가로채지 않으며 시각 표시만 담당한다.
 */
export default function TransportEquipmentVisualLabelBridge() {
  useEffect(() => {
    let frame = 0;

    const render = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const visual = document.querySelector<HTMLElement>('.guided-equipment-stage .guided-equipment-visual');
        if (!visual) return;

        visual.style.position = 'relative';
        let label = visual.querySelector<HTMLElement>(`.${TYPE_LABEL_CLASS}`);
        if (!label) {
          label = document.createElement('span');
          label.className = TYPE_LABEL_CLASS;
          visual.prepend(label);
        }
        label.textContent = readTransportEquipment().name;
      });
    };

    window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, render);
    const observer = new MutationObserver(render);
    observer.observe(document.body, { childList: true, subtree: true });
    render();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, render);
      document.querySelectorAll(`.${TYPE_LABEL_CLASS}`).forEach(node => node.remove());
    };
  }, []);

  return null;
}
