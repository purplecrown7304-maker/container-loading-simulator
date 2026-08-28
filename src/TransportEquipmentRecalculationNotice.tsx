import { useEffect, useState } from 'react';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import { TRANSPORT_EQUIPMENT_EVENT, useTransportEquipment } from './transportEquipment';

export default function TransportEquipmentRecalculationNotice() {
  const equipment = useTransportEquipment();
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const onEquipment = () => {
      const hasCargo = Boolean(document.querySelector('.cargo-list-item'));
      setStale(hasCargo);
    };
    const onLoadingResult = () => setStale(false);
    window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, onEquipment);
    window.addEventListener(LOADING_RESULT_EVENT, onLoadingResult);
    return () => {
      window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, onEquipment);
      window.removeEventListener(LOADING_RESULT_EVENT, onLoadingResult);
    };
  }, []);

  if (!stale || equipment.specializedCargo) return null;
  return <div className="transport-recalc-notice" role="status">
    <b>{equipment.shortName} 규격으로 변경됨</b>
    <span>기존 적재 배치는 새 적재공간 기준으로 재검증되지 않았습니다. 물리 최적 자동 적재를 다시 실행하세요.</span>
    <button type="button" onClick={() => setStale(false)} aria-label="장비 변경 안내 닫기">×</button>
  </div>;
}
