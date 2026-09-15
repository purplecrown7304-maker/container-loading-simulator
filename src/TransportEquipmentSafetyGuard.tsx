import { useEffect, useState } from 'react';
import {
  OPEN_TRANSPORT_SELECTOR_EVENT,
  useTransportEquipment,
} from './transportEquipment';

function isUnsupportedGeneralCargoAction(target: Element) {
  const button = target.closest('button');
  if (!(button instanceof HTMLButtonElement)) return false;
  const label = (button.textContent ?? '').replace(/\s+/g, ' ').trim();
  return button.classList.contains('primary-action')
    || label.includes('물리 최적 자동 적재')
    || label.includes('적재 최적화')
    || label.includes('작업 지시서')
    || label.includes('작업지시서')
    || label.includes('결과 보기');
}

/**
 * 특수화물 전용 장비의 일반 박스 적재 실행만 차단한다.
 *
 * 장비 선택 자체의 master는 TransportEquipmentSelector / transportEquipment.ts 하나다.
 * 이 guard는 장비 선택을 복원하거나 거부하지 않는다. 과거 구현은 acceptedEquipment를
 * 별도로 기억했다가 정상적인 20FT/40FT/트럭 선택 이벤트까지 이전 40FT High Cube로
 * 되돌릴 수 있었고, 그 결과 사용자가 카드를 눌러도 선택이 고정되는 경쟁 조건이 생겼다.
 */
export default function TransportEquipmentSafetyGuard() {
  const equipment = useTransportEquipment();
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!equipment.specializedCargo) {
      setBlocked(false);
      return;
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !isUnsupportedGeneralCargoAction(target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setBlocked(true);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [equipment]);

  if (!blocked || !equipment.specializedCargo) return null;

  return <div
    className="transport-specialized-backdrop"
    role="presentation"
    onMouseDown={(event) => { if (event.target === event.currentTarget) setBlocked(false); }}
  >
    <section
      className="transport-specialized-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="transport-specialized-title"
    >
      <span>SPECIALIZED EQUIPMENT</span>
      <h2 id="transport-specialized-title">{equipment.shortName}은 일반 박스 적재 대상이 아닙니다.</h2>
      <p>{equipment.note ?? '이 장비는 특수화물 전용입니다.'}</p>
      <p>현재 박스/팔레트 엔진으로 임의 계산하거나 일반화물 작업지시서를 발행하지 않습니다. 장비 변경은 사용자가 직접 선택할 때만 적용됩니다.</p>
      <div>
        <button
          type="button"
          onClick={() => {
            setBlocked(false);
            window.dispatchEvent(new CustomEvent(OPEN_TRANSPORT_SELECTOR_EVENT, { detail: { category: equipment.category } }));
          }}
        >장비 선택</button>
        <button type="button" onClick={() => setBlocked(false)}>닫기</button>
      </div>
    </section>
  </div>;
}
