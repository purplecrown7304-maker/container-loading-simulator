import { OPEN_TRANSPORT_SELECTOR_EVENT, useTransportEquipment } from './transportEquipment';

export default function ReferenceWorkspaceBar(){
  const equipment = useTransportEquipment();
  const openEquipment = () => window.dispatchEvent(new CustomEvent(OPEN_TRANSPORT_SELECTOR_EVENT, { detail: { category: equipment.category } }));
  const doorLabel = equipment.category === 'truck' ? 'TRUCK REAR DOOR' : 'CONTAINER DOOR';

  return <>
    <div className="reference-utility">
      <div className="ref-brand"><span className="ref-logo">CL</span><span className="ref-brand-text"><b>Container Loading Simulator</b><small>컨테이너 · 트럭 · 커스텀 차량 · 안전 적재 최적화</small></span></div>
      <div className="ref-vehicle">
        <button className="equipment-current" type="button" onClick={openEquipment} aria-label="컨테이너 및 트럭 장비 선택">
          <b>{equipment.shortName}</b>
          <small>{equipment.length.toFixed(2)} × {equipment.width.toFixed(2)} × {equipment.height.toFixed(2)}m · {equipment.maxPayloadKg.toLocaleString()}kg</small>
        </button>
        <button className="add" type="button" onClick={openEquipment}>▦ 장비 선택</button>
      </div>
      <div className="ref-user-actions">
        <button className="ai" type="button">◆ 적재 최적화</button>
        <button className="physics-launch-button" type="button" onClick={()=>window.dispatchEvent(new CustomEvent('container-loading:open-physics-validation'))}>◈ 물리 검증</button>
        <details className="ref-more-actions">
          <summary>더보기</summary>
          <div className="ref-more-menu">
            <button className="member" type="button" onClick={()=>window.dispatchEvent(new CustomEvent('container-loading:open-workspace',{detail:{tab:'data'}}))}>계획 관리</button>
            <button type="button" onClick={()=>document.documentElement.requestFullscreen?.()}>전체 화면</button>
          </div>
        </details>
        <span className="ref-avatar">박</span>
      </div>
    </div>
    <div className="ref-bottom-hint"><span>{equipment.category === 'truck' ? '트럭 적재공간 중심' : '컨테이너 중심'}</span><span>● 실제 무게중심</span><b>＋ 목표 무게중심</b><span>{doorLabel} = 문 방향</span></div>
  </>;
}
