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

export type FloorLoadFootprint = {
  x: number;
  y: number;
  length: number;
  width: number;
  weightKg: number;
};

const EPS = 1e-9;

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function createCells(container: ContainerSpec, columns: number, rows: number) {
  const safeColumns = Math.max(1, Math.floor(columns));
  const safeRows = Math.max(1, Math.floor(rows));
  const cellLength = container.length / safeColumns;
  const cellWidth = container.width / safeRows;
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

  return { cells, safeColumns, safeRows, cellArea: Math.max(EPS, cellLength * cellWidth) };
}

function finishAnalysis(
  container: ContainerSpec,
  cells: FloorLoadCell[],
  safeColumns: number,
  safeRows: number,
  cellArea: number,
): FloorLoadAnalysis {
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

/**
 * 각 화물의 중량을 바닥 투영면적에 균등 분포시켜 kg/m² 격자를 만든다.
 * DIRECT BOX 모드에서 상부 화물도 수직 투영하여 바닥 하중에 포함한다.
 */
export function analyzeFloorLoad(
  container: ContainerSpec,
  result: Pick<LoadingResult, 'placements'>,
  columns = 12,
  rows = 4,
): FloorLoadAnalysis {
  const grid = createCells(container, columns, rows);
  for (const placement of result.placements) distributePlacement(placement, grid.cells);
  return finishAnalysis(container, grid.cells, grid.safeColumns, grid.safeRows, grid.cellArea);
}

/**
 * 팔레트/받침 구조처럼 실제 바닥에 전달되는 접촉면이 화물 박스와 다른 경우 사용한다.
 * 상단 팔레트의 하중은 같은 stackColumn의 바닥 팔레트에 합산해 전달한 값을 넘겨야 한다.
 */
export function analyzeFloorLoadFootprints(
  container: ContainerSpec,
  footprints: FloorLoadFootprint[],
  columns = 12,
  rows = 4,
): FloorLoadAnalysis {
  const grid = createCells(container, columns, rows);
  for (const footprint of footprints) distributeFootprint(footprint, grid.cells);
  return finishAnalysis(container, grid.cells, grid.safeColumns, grid.safeRows, grid.cellArea);
}

function distributePlacement(placement: Placement, cells: FloorLoadCell[]) {
  distributeFootprint({
    x: placement.x,
    y: placement.y,
    length: placement.length,
    width: placement.width,
    weightKg: placement.weightKg,
  }, cells);
}

function distributeFootprint(footprint: FloorLoadFootprint, cells: FloorLoadCell[]) {
  const footprintArea = Math.max(EPS, footprint.length * footprint.width);
  for (const cell of cells) {
    const ox = overlap(footprint.x, footprint.x + footprint.length, cell.x, cell.x + cell.length);
    const oy = overlap(footprint.y, footprint.y + footprint.width, cell.y, cell.y + cell.width);
    const area = ox * oy;
    if (area <= EPS) continue;
    cell.loadKg += Math.max(0, footprint.weightKg) * (area / footprintArea);
  }
}
