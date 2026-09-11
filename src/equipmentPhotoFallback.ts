import { EQUIPMENT_PHOTO_ATLAS_DATA_URI } from './equipmentPhotoAtlas';

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
const BACKGROUND_SCALE_X = 3.75;
const BACKGROUND_SCALE_Y = 3.0;

function centeredBackgroundPosition(index: number, count: number, scale: number) {
  const cellCenter = (index + 0.5) / count;
  return ((0.5 - scale * cellCenter) / (1 - scale)) * 100;
}

export type EquipmentPhotoFallback = {
  backgroundImage: string;
  backgroundPosition: string;
  backgroundSize: string;
};

export function equipmentPhotoFallback(equipmentId: string): EquipmentPhotoFallback | null {
  const cell = EQUIPMENT_ATLAS_CELLS[equipmentId];
  if (!cell) return null;
  const [column, row] = cell;
  const positionX = centeredBackgroundPosition(column, ATLAS_COLUMNS, BACKGROUND_SCALE_X);
  const positionY = centeredBackgroundPosition(row, ATLAS_ROWS, BACKGROUND_SCALE_Y);
  return {
    backgroundImage: `url(${EQUIPMENT_PHOTO_ATLAS_DATA_URI})`,
    backgroundPosition: `${positionX}% ${positionY}%`,
    backgroundSize: `${BACKGROUND_SCALE_X * 100}% ${BACKGROUND_SCALE_Y * 100}%`,
  };
}
