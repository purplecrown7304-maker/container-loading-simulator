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

const ATLAS_COLUMNS = 5;
const ATLAS_ROWS = 4;
// Exact cell scale is 5x4. We intentionally zoom out uniformly so each card
// includes extra whitespace above/below the equipment and never crops the
// lower frame/shadow at the atlas-cell boundary.
const BACKGROUND_SCALE_X = 4.05;
const BACKGROUND_SCALE_Y = 3.24;

function centeredBackgroundPosition(index: number, count: number, scale: number) {
  const cellCenter = (index + 0.5) / count;
  return ((0.5 - scale * cellCenter) / (1 - scale)) * 100;
}

export default function EquipmentCard3D({ item }: Props) {
  const [column, row] = EQUIPMENT_ATLAS_CELLS[item.id] ?? EQUIPMENT_ATLAS_CELLS['40-high-cube'];
  const positionX = centeredBackgroundPosition(column, ATLAS_COLUMNS, BACKGROUND_SCALE_X);
  const positionY = centeredBackgroundPosition(row, ATLAS_ROWS, BACKGROUND_SCALE_Y);

  return (
    <span className="equipment-card-photo" aria-hidden="true">
      <span
        className="equipment-card-photo-sprite"
        style={{
          backgroundImage: `url(${EQUIPMENT_PHOTO_ATLAS_DATA_URI})`,
          backgroundPosition: `${positionX}% ${positionY}%`,
          backgroundSize: `${BACKGROUND_SCALE_X * 100}% ${BACKGROUND_SCALE_Y * 100}%`,
        }}
      />
    </span>
  );
}
