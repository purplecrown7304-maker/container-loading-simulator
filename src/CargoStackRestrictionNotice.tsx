import type { CargoItem } from './engine/types';
import { cargoStackRestrictions } from './cargoStackRestrictions';

export default function CargoStackRestrictionNotice({ cargo }: { cargo: CargoItem[] }) {
  const restrictions = cargoStackRestrictions(cargo);
  if (!restrictions.length) return null;
  return <details className="guided-pallet-stack-note">
    <summary>팔레트 수를 늘릴 수 있는 적층 제한 · {restrictions.length}개 제품·포장 조합</summary>
    <p>미적재를 줄인 뒤, 현재 제한을 지키는 후보 중 팔레트가 가장 적은 배치를 선택합니다. 자동 제한과 등록값은 아래에서 구분합니다.</p>
    <ul>{restrictions.map((entry, index) => <li key={index}>
      <b>{entry.name}</b><span>{entry.box} · {entry.quantity.toLocaleString()}개 적재단위{entry.rows > 1 ? ' (정량·잔량 합산)' : ''}</span>
      <span>{entry.reason}</span><span>{entry.limits}</span>
    </li>)}</ul>
    <p>3단계에서 적층 가능한 등록 박스로 바꾸거나 박스 관리에서 실제 강도 자료에 따른 제한값을 확인하세요. 강도 미확인 값을 임의로 늘리지는 않습니다.</p>
  </details>;
}
