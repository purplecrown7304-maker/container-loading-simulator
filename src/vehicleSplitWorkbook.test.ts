import { beforeEach, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { exportBoxWorkbook } from './excelExportWorkbooks';
import { buildSecuringUsage, createPhysicsTargetSignature, type InertiaCertification } from './inertiaCertification';
import type { PhysicsTarget } from './physicsTarget';
import { readStoredState, writeStoredState } from './storage';
import { resetVehicleSplitStateForTests, startVehicleSplit } from './vehicleSplitState';

vi.mock('xlsx', async importOriginal => ({ ...await importOriginal<object>(), writeFile: vi.fn() }));

const container: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };
const cargo: CargoItem[] = [{ id: 'SLAB', name: 'SLAB', length: 1, width: 2.3, height: .5, weightKg: 4, quantity: 7, maxStackLayers: 1, maxTopLoadKg: 0, allowRotation: true }];

function summaryOf(list: CargoItem[]) {
  const placements = list.flatMap(item => Array.from({ length: item.quantity }, (_, index) => ({
    cargoId: item.id, x: index * item.length, y: 0, z: 0, length: item.length, width: item.width, height: item.height, weightKg: item.weightKg, rotated: false,
  })));
  const result: LoadingResult = { placements, remaining: [], validationIssues: [], loadedWeightKg: placements.length * 4, usedVolumeM3: placements.length * 1.15 };
  const target: PhysicsTarget = { mode: 'boxes', container, cargo: list, result };
  const certification: InertiaCertification = {
    status: 'passed', mode: 'boxes', targetSignature: createPhysicsTargetSignature(target), testedAt: new Date(0).toISOString(),
    securing: buildSecuringUsage(target, 1), testedScenarios: 3, passedScenarios: 3, failedScenarios: [],
    maxHorizontalShiftM: .005, maxTiltDeg: .5, payloadWithinLimit: true, results: {},
  };
  exportBoxWorkbook({ container, cargo: list, result }, certification);
  const book = vi.mocked(XLSX.writeFile).mock.calls.at(-1)![0];
  return XLSX.utils.sheet_to_json<Array<string | number>>(book.Sheets['요약'], { header: 1 });
}

beforeEach(() => {
  localStorage.clear();
  resetVehicleSplitStateForTests();
  vi.clearAllMocks();
  writeStoredState({ container, cargo });
});

it('names the vehicle at the top of the workbook summary of a divided job, and nowhere else', () => {
  expect(summaryOf(cargo).some(row => row[0] === '차량 구분')).toBe(false);

  startVehicleSplit(2);
  const share = readStoredState()!.cargo;
  const rows = summaryOf(share);
  // Right under the loading mode, before any number of the vehicle.
  expect(rows.slice(1, 6)).toEqual([
    ['적재모드', '박스 직접 적재'],
    ['차량 구분', '차량 1/2 · 나눠 싣는 화물'],
    ['전체 출하 수량(EA, 모든 차량)', 7],
    ['차량 1', '4 EA · 16 kg · 이 문서'],
    ['차량 2', '3 EA · 12 kg'],
  ]);
  expect(rows.find(row => row[0] === '적재 박스 수(EA)')?.[1]).toBe(4);
});
