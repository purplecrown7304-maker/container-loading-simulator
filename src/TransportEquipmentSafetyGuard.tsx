import { useEffect, useState } from 'react';
import { OPEN_TRANSPORT_SELECTOR_EVENT, useTransportEquipment } from './transportEquipment';

function isAutomaticLoadingAction(target: Element) {
  const button = target.closest('button');
  if (!(button instanceof HTMLButtonElement)) return false;
  const label = (button.textContent ?? '').replace(/\s+/g, ' ').trim();
  return button.classList.contains('primary-action')
    || label.includes('물리 최적 자동 적재')
    || label.includes('적재 최적화');
}

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
      if (!(target instanceof Element) || !isAutomaticLoadingAction(target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setBlocked(true);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [equipment]);

  if (!blocked || !equipment.specializedCargo) return null;
  return <div className="transport-specialized-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setBlocked(false); }}>
    <section className="transport-specialized-dialog" role="alertdialog" aria-modal="true" aria-labelledby="transport-specialized-title">
      <span>SPECIALIZED EQUIPMENT</span>
      <h2 id="transport-specialized-title">{equipment.shortName}은 일반 박스 적재 대상이 아닙니다.</h2>
      <p>{equipment.note ?? '이 장비는 특수화물 전용입니다.'}</p>
      <p>현재 박스/팔레트 엔진으로 임의 계산하지 않습니다. 일반 화물은 Standard / High Cube / Open Top / Flat Rack / Platform / Truck 장비를 선택하세요.</p>
      <div>
        <button type="button" onClick={() => { setBlocked(false); window.dispatchEvent(new CustomEvent(OPEN_TRANSPORT_SELECTOR_EVENT, { detail: { category: equipment.category } })); }}>장비 다시 선택</button>
        <button type="button" onClick={() => setBlocked(false)}>닫기</button>
      </div>
    </section>
  </div>;
}
