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

  return <>
    {titleTarget && createPortal(<span className="transport-dashboard-title">{title}</span>, titleTarget)}
    {settingTarget && createPortal(<div className="transport-dashboard-setting">
      <span>운송 장비</span>
      <b>{equipment.shortName}</b>
      <button type="button" onClick={open}>장비 변경</button>
    </div>, settingTarget)}
  </>;
}
