import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { OPEN_TRANSPORT_SELECTOR_EVENT, useTransportEquipment } from './transportEquipment';

export default function TransportEquipmentDashboardSummary() {
  const equipment = useTransportEquipment();
  const [settingTarget, setSettingTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const card = document.querySelector('.dashboard-left .dashboard-card:first-child');
    setSettingTarget(card?.querySelector('.static-setting') instanceof HTMLElement ? card.querySelector('.static-setting') as HTMLElement : null);
  }, []);

  const open = () => window.dispatchEvent(new CustomEvent(OPEN_TRANSPORT_SELECTOR_EVENT, { detail: { category: equipment.category } }));

  return <>
    {settingTarget && createPortal(<div className="transport-dashboard-setting">
      <b>{equipment.shortName}</b>
      <button type="button" onClick={open}>장비 변경</button>
    </div>, settingTarget)}
  </>;
}
