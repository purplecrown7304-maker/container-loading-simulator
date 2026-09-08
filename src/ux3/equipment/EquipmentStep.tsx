import type { ContainerSpec } from '../../engine/types';
import EditableEquipmentCard from '../../EditableEquipmentCard';
import type { TransportCategory, TransportEquipment } from '../../transportEquipment';

type Props = {
  category: TransportCategory;
  equipment: TransportEquipment;
  items: TransportEquipment[];
  container: ContainerSpec;
  search: string;
  onCategory: (category: TransportCategory) => void;
  onSearch: (value: string) => void;
  onSelect: (equipment: TransportEquipment) => void;
  onContainerField: (field: keyof ContainerSpec, value: string) => void;
  onApplyCustom: () => void;
  onMessage: (message: string) => void;
};

export default function EquipmentStep({ category, equipment, items, container, search, onCategory, onSearch, onSelect, onContainerField, onApplyCustom, onMessage }: Props) {
  return <section className="ux3-step-page">
    <div className="ux3-page-heading">
      <div><span>STEP 1</span><h1>운송 장비를 선택하세요</h1><p>장비를 바꿔도 박스 마스터와 이번 적재수량은 유지됩니다.</p></div>
      <div className="ux3-segmented" role="tablist">
        <button type="button" className={category === 'container' ? 'active' : ''} onClick={() => onCategory('container')}>컨테이너</button>
        <button type="button" className={category === 'truck' ? 'active' : ''} onClick={() => onCategory('truck')}>트럭</button>
      </div>
    </div>
    <div className="ux3-search-row"><input aria-label="장비 검색" placeholder="장비 이름 검색" value={search} onChange={event => onSearch(event.target.value)} /></div>
    <div className="ux3-equipment-grid">
      {items.map(item => <EditableEquipmentCard key={item.id} item={item} active={equipment.id === item.id} onSelect={onSelect} onMessage={onMessage} />)}
    </div>
    <details className="ux3-details">
      <summary>사용자 규격 직접 입력</summary>
      <div className="ux3-form-grid">
        <label>내부 길이(m)<input type="number" min="0.1" step="0.01" value={container.length} onChange={event => onContainerField('length', event.target.value)} /></label>
        <label>내부 폭(m)<input type="number" min="0.1" step="0.01" value={container.width} onChange={event => onContainerField('width', event.target.value)} /></label>
        <label>내부 높이(m)<input type="number" min="0.1" step="0.01" value={container.height} onChange={event => onContainerField('height', event.target.value)} /></label>
        <label>최대 적재중량(kg)<input type="number" min="1" step="100" value={container.maxPayloadKg} onChange={event => onContainerField('maxPayloadKg', event.target.value)} /></label>
        <label>바닥 허용하중(kg/m²)<input type="number" min="1" step="100" value={container.floorLoadLimitKgPerM2 ?? 1500} onChange={event => onContainerField('floorLoadLimitKgPerM2', event.target.value)} /></label>
        <label>국부하중 경고배수<input type="number" min="0.1" step="0.1" value={container.floorLoadWarningMultiplier ?? 3} onChange={event => onContainerField('floorLoadWarningMultiplier', event.target.value)} /></label>
      </div>
      <button type="button" className="ux3-secondary-button" onClick={onApplyCustom}>사용자 규격 적용</button>
    </details>
  </section>;
}
