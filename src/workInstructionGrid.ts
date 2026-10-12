import type { Placement } from './engine/types';
import { buildWorkInstructionAddresses, type WorkInstructionAddress } from './engine/workInstructionAddresses';
import { uiText, readUiLanguage, type UiLanguage } from './uiLanguage';
export { buildWorkInstructionAddresses, type WorkInstructionAddress } from './engine/workInstructionAddresses';

export type WorkInstructionRun = {
  indices: number[]; columnFrom: number; columnTo: number; rowFrom: number; rowTo: number;
  layer: number; cargoId: string; quantity: number;
};
const EPS = 1e-6;
export function formatWorkAddress(address: WorkInstructionAddress, locale: UiLanguage = readUiLanguage()): string {
  return uiText('{0}열 {1}행 {2}단', [address.column, address.row, address.layer], locale);
}
const range = (from: number, to: number) => from === to ? String(from) : `${from}–${to}`;
export function formatWorkRun(run: WorkInstructionRun, locale: UiLanguage = readUiLanguage()): string {
  return uiText('{0}열 {1}행 {2}단 · {3}개', [range(run.columnFrom, run.columnTo), range(run.rowFrom, run.rowTo), run.layer, run.quantity], locale);
}
export function workInstructionLegend(locale: UiLanguage = readUiLanguage()): string {
  return uiText('행: 놓기 시작위치를 안쪽→문쪽 순서로 셉니다. 열: 같은 행에서 문을 등지고 안쪽을 볼 때 왼쪽→오른쪽. 단: 서로 다른 박스 바닥 높이를 낮은 순서로 표시합니다. 같은 시작위치는 단이 달라도 같은 행·열 번호입니다. 번호는 같은 크기의 격자나 수직 박스 개수를 뜻하지 않습니다. 도면에 없는 칸은 채우지 마세요.', [], locale);
}
/** Compress only actual, touching, equal-sized/equal-orientation rectangles.
 * Every range has exactly (columns × rows) cartons, never a bounding-box guess.
 */
export function buildWorkInstructionRuns(placements: readonly Placement[], indices: readonly number[] = placements.map((_, i) => i)): WorkInstructionRun[] {
  const addresses = buildWorkInstructionAddresses(placements);
  type Run = WorkInstructionRun & { x: number; y: number; endX: number; endY: number; signature: string };
  const same = (a: number, b: number) => Math.abs(a - b) <= EPS;
  const signature = (p: Placement) => [p.cargoId, p.length, p.width, p.height, p.rotated ?? false, p.orientation ?? ''].join('|');
  const ordered = [...new Set(indices)].sort((a, b) => addresses[a].layer - addresses[b].layer || addresses[a].row - addresses[b].row || addresses[a].column - addresses[b].column);
  const strips: Run[] = [];
  for (const index of ordered) {
    const p = placements[index], a = addresses[index], last = strips.at(-1), sig = signature(p);
    if (last && last.signature === sig && last.layer === a.layer && last.rowFrom === a.row && last.columnTo + 1 === a.column && same(p.y + p.width, last.y)) {
      last.indices.push(index); last.columnTo = a.column; last.y = p.y; last.quantity++;
    } else strips.push({ indices: [index], columnFrom: a.column, columnTo: a.column, rowFrom: a.row, rowTo: a.row, layer: a.layer, cargoId: p.cargoId, quantity: 1, x: p.x, y: p.y, endX: p.x + p.length, endY: p.y + p.width, signature: sig });
  }
  const rectangles: Run[] = [];
  for (const strip of strips) {
    const previous = rectangles.find(r => r.signature === strip.signature && r.layer === strip.layer && r.rowTo + 1 === strip.rowFrom && r.columnFrom === strip.columnFrom && r.columnTo === strip.columnTo && same(r.endX, strip.x) && same(r.y, strip.y) && same(r.endY, strip.endY));
    if (previous) { previous.indices.push(...strip.indices); previous.rowTo = strip.rowTo; previous.endX = strip.endX; previous.quantity += strip.quantity; }
    else rectangles.push({ ...strip, indices: [...strip.indices] });
  }
  return rectangles.map(({ indices, columnFrom, columnTo, rowFrom, rowTo, layer, cargoId, quantity }) => ({ indices, columnFrom, columnTo, rowFrom, rowTo, layer, cargoId, quantity }));
}
