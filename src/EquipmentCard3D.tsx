import { EQUIPMENT_PHOTO_ATLAS_DATA_URI } from './equipmentPhotoAtlas';
import './equipment-card-photo.css';
import type { TransportEquipment } from './transportEquipment';

type Props = { item: TransportEquipment };

const EQUIPMENT_ATLAS_CELLS: Record<string, readonly [number, number]> = {
  '20-standard': [0, 0],
  '40-standard': [1, 0],
  '40-high-cube': [2, 0],
  '45-high-cube': [3, 0],
  '20-open-top': [4, 0],
  '40-open-top': [0, 1],
  '20-flatrack': [1, 1],
  '40-flatrack': [2, 1],
  '20-flatrack-collapsible': [3, 1],
  '40-flatrack-collapsible': [4, 1],
  '20-platform': [0, 2],
  '40-platform': [1, 2],
  '20-reefer': [2, 2],
  '40-reefer': [3, 2],
  '20-bulk': [4, 2],
  '20-tank': [0, 3],
  'custom-container': [1, 3],
};

export default function EquipmentCard3D({ item }: Props) {
  const [column, row] = EQUIPMENT_ATLAS_CELLS[item.id] ?? EQUIPMENT_ATLAS_CELLS['40-high-cube'];

  return (
    <span className="equipment-card-photo" aria-hidden="true">
      <img
        src={EQUIPMENT_PHOTO_ATLAS_DATA_URI}
        alt=""
        draggable={false}
        style={{ left: `-${column * 100}%`, top: `-${row * 100}%` }}
      />
    </span>
  );
}
