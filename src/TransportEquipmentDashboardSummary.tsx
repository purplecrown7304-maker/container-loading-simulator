import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { OPEN_TRANSPORT_SELECTOR_EVENT, useTransportEquipment } from './transportEquipment';

export default function TransportEquipmentDashboardSummary() {
  const equipment = useTransportEquipment();
  const [titleTarget, setTitleTarget] = useState<HTMLElement | null>(null);
  const [settingTarget, setSettingTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const card = document.querySelector('.dashboard-left .dashboard-card:first-child');
    setTitleTarget(card?.querySelector('h2') instanceof HTMLElement ? card.querySelector('h2') as HTMLElement : null);
    setSettingTarget(card?.querySelector('.static-setting') instanceof HTMLElement ? card.querySelector('.static-setting') as HTMLElement : null);
  }, []);

  const open = () => window.dispatchEvent(new CustomEvent(OPEN_TRANSPORT_SELECTOR_EVENT, { detail: { category: equipment.category } }));
  const title = equipment.category === 'truck' ? '1. 트럭 적재공간 정보' : '1. 컨테이너 정보';
  const feature = equipment.specializedCargo
    ? '특수화물 전용'
    : equipment.temperatureControlled
      ? '온도관리 장비'
      : equipment.sideLoading && equipment.topLoading
        ? '측면·상부 적재 가능'
        : equipment.sideLoading
          ? '측면 적재 가능'
          : equipment.topLoading
            ? '상부 적재 가능'
            : '일반 적재 장비';

  return <>
    {titleTarget && createPortal(<span className="transport-dashboard-title">{title}</span>, titleTarget)}
    {settingTarget && createPortal(<div className="transport-dashboard-setting">
      <span>운송 장비</span>
      <b>{equipment.shortName}</b>
      <small>{feature} · {equipment.sourceLabel}</small>
      <button type="button" onClick={open}>장비 변경</button>
    </div>, settingTarget)}
  </>;
}
