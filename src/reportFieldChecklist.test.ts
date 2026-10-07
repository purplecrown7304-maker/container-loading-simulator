import { afterEach, describe, expect, it } from 'vitest';
import { buildFieldChecklistHtml, fieldChecklistGroups } from './reportFieldChecklist';
import { buildLoadingReportHtml } from './report';
import { INERTIA_SCENARIO_ACCELERATION_G } from './engine/inertiaSimulation';
import { clearLatestInertiaCertification } from './inertiaCertification';
import { clearPhysicsTarget } from './physicsTarget';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';

afterEach(() => { clearLatestInertiaCertification(); clearPhysicsTarget(); });

const container: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };
const cargo: CargoItem[] = [{ id: 'BOX-A', name: 'BOX A', length: 0.6, width: 0.4, height: 0.35, weightKg: 18, quantity: 1, maxStackLayers: 7, maxTopLoadKg: 100 }];
const result: LoadingResult = {
  placements: [{ cargoId: 'BOX-A', x: 0, y: 0, z: 0, length: 0.6, width: 0.4, height: 0.35, weightKg: 18 }],
  remaining: [], loadedWeightKg: 18, usedVolumeM3: 0.084, validationIssues: [],
};

describe('LOADING_RULES R-10 field checklist', () => {
  it('lists before, during and after loading checks for both equipment kinds', () => {
    for (const kind of ['container', 'truck'] as const) {
      const groups = fieldChecklistGroups(kind);
      expect(groups.map(group => group.title)).toEqual(['적재 전', '적재 중', '적재 후']);
      expect(groups.every(group => group.items.length >= 4)).toBe(true);
    }
  });

  it('asks for the seal and VGM only on containers and for road limits only on trucks', () => {
    const containerText = fieldChecklistGroups('container').flatMap(group => group.items).join('\n');
    const truckText = fieldChecklistGroups('truck').flatMap(group => group.items).join('\n');
    expect(containerText).toContain('봉인');
    expect(containerText).toContain('VGM');
    expect(truckText).not.toContain('봉인');
    expect(truckText).not.toContain('VGM');
    expect(truckText).toContain('도로 운행 한도');
  });

  it('prints unchecked boxes and blank record fields only', () => {
    const html = buildFieldChecklistHtml('container');
    const items = fieldChecklistGroups('container').reduce((sum, group) => sum + group.items.length, 0);
    expect(html.match(/□ /g)).toHaveLength(items);
    expect(html).not.toMatch(/☑|✓|완료됨/);
    expect(html).toContain('봉인 번호');
    expect(html).toContain('사진 기록');
    expect(html).toContain('재조임 지점');
  });
});

describe('work order discloses field checks and inertia conditions', () => {
  it('adds the checklist section without changing the approval wording', () => {
    const html = buildLoadingReportHtml(container, cargo, result);
    expect(html).toContain('현장 작업 체크리스트');
    expect(html).toContain('data-field-checklist=');
    // No certification exists: the document must still read as unverified.
    expect(html).toContain('검증 미완료');
    expect(html).toContain('출고 전 확인 3건');
    expect(html).toContain('물리검증: 미완료');
  });

  it('prints the accelerations the inertia simulation actually uses', () => {
    const html = buildLoadingReportHtml(container, cargo, result);
    const g = INERTIA_SCENARIO_ACCELERATION_G;
    expect(g).toEqual({ acceleration: 0.3, braking: 0.5, cornering: 0.35 });
    expect(html).toContain(`관성 검증 조건: 출발 ${g.acceleration.toFixed(2)}g · 제동 ${g.braking.toFixed(2)}g · 회전 ${g.cornering.toFixed(2)}g`);
  });
});
