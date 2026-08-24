export default function ReferenceWorkspaceBar(){
  return <>
    <div className="reference-utility">
      <div className="ref-brand"><span className="ref-logo">CL</span><span className="ref-brand-text"><b>Container Loading Simulator</b><small>개인 박스 · 커스텀 차량 · 안전 적재 최적화</small></span></div>
      <div className="ref-vehicle"><select defaultValue="default" aria-label="차량 선택"><option value="default">기본 컨테이너 사용</option><option value="20ft">20FT</option><option value="40ft">40FT</option><option value="40hc">40FT High Cube</option></select><button className="add" type="button" onClick={()=>window.dispatchEvent(new CustomEvent('container-loading:open-workspace',{detail:{tab:'vehicles'}}))}>＋ 커스텀 차량 추가</button></div>
      <div className="ref-user-actions"><button className="ai" type="button">◆ 적재 최적화</button><button className="daily" type="button" onClick={()=>window.dispatchEvent(new CustomEvent('container-loading:open-workspace',{detail:{tab:'safety'}}))}>일일 점검</button><button className="member" type="button" onClick={()=>window.dispatchEvent(new CustomEvent('container-loading:open-workspace',{detail:{tab:'data'}}))}>계획 관리</button><button type="button" onClick={()=>document.documentElement.requestFullscreen?.()}>전체 화면</button><span className="ref-avatar">박</span></div>
    </div>
    <div className="ref-bottom-hint"><span>컨테이너 중심</span><span>● 실제 무게중심</span><b>＋ 목표 무게중심</b><span>CONTAINER DOOR = 문 방향</span></div>
  </>;
}
