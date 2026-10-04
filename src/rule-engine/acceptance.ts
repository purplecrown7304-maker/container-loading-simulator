import type { OperationalRuleFinding, ValidationIssue } from '../engine/types';
import { hasBlockingLoadingRules } from '../inertiaCertification';
import { publishPhysicsTarget, readPhysicsTarget, subscribePhysicsTarget, type PhysicsTarget } from '../physicsTarget';
import { validateExistingWithLoadSim } from './loadSimEngine';
import { existingPlacementIntegrityIssues } from './placementIntegrity';
import { preflightCargoInput } from '../engine/inputPreflight';
import { isCurrentLoadingSource } from './inputIdentity';
import { matchesPalletRuleEngineProvenance } from './palletProvenance';

export const LOAD_SIM_ACCEPTANCE_EVENT = 'container-loading:load-sim-acceptance';

/** Static A-rule acceptance is independent from optional Rapier/inertia inspection. */
export type LoadSimAcceptance = {
  status: 'accepted' | 'rejected';
  targetSignature: string;
  validationIssues: ValidationIssue[];
  operationalFindings: OperationalRuleFinding[];
};

let latest: LoadSimAcceptance | undefined;
const listeners = new Set<() => void>();

/** Contains A inputs/output only, never optional inertia model or securing settings. */
export function createLoadSimTargetSignature(target: PhysicsTarget): string {
  return JSON.stringify({
    ruleModel: 'load-sim-static-v1', mode: target.mode, container: target.container,
    cargo: [...target.cargo].sort((a, b) => a.id.localeCompare(b.id)),
    ruleEngine: target.result.ruleEngine, placements: target.result.placements,
    ruleEngineInput: target.result.ruleEngineInput ?? null,
    remaining: target.result.remaining, loadedWeightKg: target.result.loadedWeightKg,
    usedVolumeM3: target.result.usedVolumeM3,
    validationIssues: target.result.validationIssues, operationalFindings: target.result.operationalFindings ?? [],
  });
}

function notify() {
  listeners.forEach(listener => listener());
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<LoadSimAcceptance | undefined>(LOAD_SIM_ACCEPTANCE_EVENT, { detail: latest }));
}

export function clearLoadSimAcceptance() { latest = undefined; notify(); }

export function subscribeLoadSimAcceptance(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function readLoadSimAcceptance(): LoadSimAcceptance | undefined {
  const target = readPhysicsTarget();
  if (!target || !isCurrentLoadingSource(target.container, target.cargo) || !latest || latest.targetSignature !== createLoadSimTargetSignature(target)) return undefined;
  return latest;
}

export function isLoadSimAcceptedTarget(target: PhysicsTarget | undefined): boolean {
  return Boolean(target && target.result.ruleEngine === 'load-sim'
    && isCurrentLoadingSource(target.container, target.cargo)
    && !hasBlockingLoadingRules(target.result)
    && latest?.status === 'accepted'
    && latest.targetSignature === createLoadSimTargetSignature(target));
}

export function publishLoadSimAcceptance(target: PhysicsTarget): LoadSimAcceptance {
  if (!isCurrentLoadingSource(target.container, target.cargo)) return {
    status: 'rejected', targetSignature: createLoadSimTargetSignature(target),
    validationIssues: [{ type: 'INVALID_CARGO', message: '입력이 변경되었습니다. 최신 결과를 다시 계산하세요.', placementIndexes: [] }], operationalFindings: [],
  };
  const canonical = target.result.ruleEngineInput;
  const malformedCanonical = canonical && (!Array.isArray(canonical.cargo) || !Array.isArray(canonical.placements) || !Array.isArray(canonical.palletUnits));
  const checked = validateExistingWithLoadSim(target.container, malformedCanonical ? [] : canonical?.cargo ?? target.cargo, malformedCanonical ? [] : canonical?.placements ?? target.result.placements);
  const validationIssues = [...target.result.validationIssues, ...checked.validationIssues];
  const boundaryError = (message: string, placementIndexes: number[] = []) => validationIssues.push({ type: 'INVALID_CARGO', message, placementIndexes });
  if (target.mode === 'pallets' && !canonical) boundaryError('팔레트 강체의 원본 적재 입력이 없습니다. 전체 적재를 다시 계산하세요.');
  if (malformedCanonical) boundaryError('A 강체 적재단위 입력 형식이 유효하지 않습니다.');
  const canonicalWeight = (malformedCanonical ? target.result.placements : canonical?.placements ?? target.result.placements).reduce((sum, placement) => sum + placement.weightKg, 0);
  if (!Number.isFinite(target.result.loadedWeightKg) || Math.abs(canonicalWeight - target.result.loadedWeightKg) > 1e-6) boundaryError('표시 적재중량이 A 적재단위의 총중량과 일치하지 않습니다.');
  const sourceRows = preflightCargoInput(target.cargo).cargo;
  const sourceIds = new Set(sourceRows.map(row => row.id));
  if (target.result.remaining.some(item => !sourceIds.has(item.cargoId) || !Number.isInteger(item.quantity) || item.quantity < 0)) boundaryError('잔량 목록이 등록된 화물 수량과 일치하지 않습니다.');
  for (const row of sourceRows) {
    const loaded = target.result.placements.filter(placement => placement.cargoId === row.id).length;
    const remaining = target.result.remaining.filter(item => item.cargoId === row.id).reduce((sum, item) => sum + item.quantity, 0);
    if (loaded + remaining !== row.quantity) validationIssues.push({ type: 'QUANTITY', message: `${row.id}: 적재·잔량 합계가 요청 수량과 일치하지 않습니다.`, placementIndexes: [] });
  }
  if (canonical && !malformedCanonical) {
    if (!matchesPalletRuleEngineProvenance(target.cargo, target.result.placements, canonical)) boundaryError('팔레트 준비 입력 또는 표시 배치가 생성 시점과 다릅니다. 전체 적재를 다시 계산하세요.');
    validationIssues.push(...existingPlacementIntegrityIssues(sourceRows, target.result.placements));
    const mapped = new Set<number>();
    const rigidIds = new Set<string>();
    for (const unit of canonical.palletUnits) {
      const rigid = canonical.placements.find(placement => placement.cargoId === unit.cargoId);
      if (!rigid || rigidIds.has(unit.cargoId)) boundaryError('팔레트 표시 매핑에 중복되거나 누락된 A 강체가 있습니다.');
      rigidIds.add(unit.cargoId);
      let childWeight = 0;
      for (const index of unit.displayPlacementIndexes ?? []) {
        const child = target.result.placements[index];
        if (!Number.isInteger(index) || mapped.has(index)) boundaryError('팔레트 표시 화물이 중복 매핑되었습니다.', [index]);
        mapped.add(index);
        childWeight += child?.weightKg ?? 0;
        if (!rigid || !child || child.x < rigid.x - 1e-6 || child.y < rigid.y - 1e-6 || child.z < rigid.z - 1e-6
          || child.x + child.length > rigid.x + rigid.length + 1e-6
          || child.y + child.width > rigid.y + rigid.width + 1e-6
          || child.z + child.height > rigid.z + rigid.height + 1e-6) {
          validationIssues.push({ type: 'INVALID_CARGO', message: '팔레트 표시 화물이 A 강체 적재단위와 일치하지 않습니다.', placementIndexes: [index] });
        }
      }
      if (rigid && childWeight > rigid.weightKg + 1e-6) boundaryError('팔레트 표시 화물 중량이 A 강체 총중량보다 큽니다.');
    }
    const samePlacement = (a: typeof target.result.placements[number], b: typeof a) => a.cargoId === b.cargoId
      && (['x', 'y', 'z', 'length', 'width', 'height', 'weightKg'] as const).every(key => Math.abs(a[key] - b[key]) <= 1e-6)
      && (!a.loadSimOrientation || !b.loadSimOrientation || a.loadSimOrientation === b.loadSimOrientation);
    for (const loose of canonical.placements.filter(placement => !rigidIds.has(placement.cargoId))) {
      const index = target.result.placements.findIndex((placement, index) => !mapped.has(index) && samePlacement(loose, placement));
      if (index < 0) boundaryError('A 낱개 적재단위와 표시 화물이 일치하지 않습니다.');
      else mapped.add(index);
    }
    if (mapped.size !== target.result.placements.length) boundaryError('A 적재단위에 연결되지 않은 표시 화물이 있습니다.');
  }
  const operationalFindings = [...(target.result.operationalFindings ?? []), ...checked.operationalFindings];
  if (target.result.ruleEngine !== 'load-sim') validationIssues.push({ type: 'INVALID_CARGO', message: 'A 적재 방식으로 다시 계산해야 합니다.', placementIndexes: [] });
  if (!target.result.placements.length) validationIssues.push({ type: 'INVALID_CARGO', message: '적재된 화물이 없습니다.', placementIndexes: [] });
  const acceptance: LoadSimAcceptance = {
    status: validationIssues.length || operationalFindings.some(finding => finding.severity === 'error') ? 'rejected' : 'accepted',
    targetSignature: createLoadSimTargetSignature(target), validationIssues, operationalFindings,
  };
  publishPhysicsTarget(target);
  latest = acceptance;
  notify();
  return acceptance;
}

subscribePhysicsTarget(() => {
  const target = readPhysicsTarget();
  if (latest && (!target || latest.targetSignature !== createLoadSimTargetSignature(target))) clearLoadSimAcceptance();
});

if (typeof window !== 'undefined') window.addEventListener('container-loading:result', () => {
  const target = readPhysicsTarget();
  if (latest && (!target || !isCurrentLoadingSource(target.container, target.cargo))) clearLoadSimAcceptance();
});
