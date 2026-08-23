import type { ContainerSpec, LoadingResult, Placement } from './types';

export type FloorLoadCell = {
  row: number;
  column: number;
  x: number;
  y: number;
  width: number;
  length: number;
  loadKg: number;
  kgPerM2: number;
};

export type FloorLoadAnalysis = {
  rows: number;
  columns: number;
  cells: FloorLoadCell[];
  maxKgPerM2: number;
  averageKgPerM2: number;
  totalProjectedKg: number;
};

const EPS = 1e-9;

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/**
 * 각 화물의 중량을 바닥 투영면적에 균등 분포시켜 kg/m² 격자를 만든다.
 * 상부 화물도 수직 투영하여 바닥 하중에 포함한다. 적재 엔진이 완전 지지를
 * 강제하므로 실제 하중 전달을 단순하고 보수적으로 시각화하는 용도다.
 */
export function analyzeFloorLoad(
  container: ContainerSpec,
  result: Pick<LoadingResult, 'placements'>,
  columns = 12,
  rows = 4,
): FloorLoadAnalysis {
  const safeColumns = Math.max(1, Math.floor(columns));
  const safeRows = Math.max(1, Math.floor(rows));
  const cellLength = container.length / safeColumns;
  const cellWidth = container.width / safeRows;
  const cellArea = Math.max(EPS, cellLength * cellWidth);

  const cells: FloorLoadCell[] = [];
  for (let row = 0; row < safeRows; row += 1) {
    for (let column = 0; column < safeColumns; column += 1) {
      cells.push({
        row,
        column,
        x: column * cellLength,
        y: row * cellWidth,
        length: cellLength,
        width: cellWidth,
        loadKg: 0,
        kgPerM2: 0,
      });
    }
  }

  for (const p of result.placements) distributePlacement(p, cells);

  for (const cell of cells) cell.kgPerM2 = cell.loadKg / cellArea;
  const maxKgPerM2 = Math.max(0, ...cells.map(cell => cell.kgPerM2));
  const totalProjectedKg = cells.reduce((sum, cell) => sum + cell.loadKg, 0);
  const floorArea = Math.max(EPS, container.length * container.width);

  return {
    rows: safeRows,
    columns: safeColumns,
    cells,
    maxKgPerM2,
    averageKgPerM2: totalProjectedKg / floorArea,
    totalProjectedKg,
  };
}

function distributePlacement(p: Placement, cells: FloorLoadCell[]) {
  const footprintArea = Math.max(EPS, p.length * p.width);
  for (const cell of cells) {
    const ox = overlap(p.x, p.x + p.length, cell.x, cell.x + cell.length);
    const oy = overlap(p.y, p.y + p.width, cell.y, cell.y + cell.width);
    const area = ox * oy;
    if (area <= EPS) continue;
    cell.loadKg += p.weightKg * (area / footprintArea);
  }
}
