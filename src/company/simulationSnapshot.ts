import { readStoredState, writeStoredState } from '../storage';
import { readPhysicsTarget, clearPhysicsTarget } from '../physicsTarget';
import { clearLatestInertiaCertification, readLatestInertiaCertification } from '../inertiaCertification';
import { isPhysicsTargetVerified } from '../inertiaWorkOrderPolicy';
import { clearManualOverride } from '../engine/manualOverride';
import { clearPalletSnapshot } from '../palletSnapshotStore';
import { getTransportEquipment, readTransportEquipment, selectTransportEquipment, createCustomEquipment } from '../transportEquipment';
import { readGuidedLoadingUnit, publishGuidedLoadingUnit } from '../guidedLoadingUnitState';
import { buildPalletPhysicsTarget } from '../palletTargetRestore';
import { validCompanySnapshot } from '../../supabase/functions/_shared/companySnapshot';
import type { Snapshot } from './types';

/** Share one explicitly selected plan, never the member's entire storage/catalog. */
export function captureCompanySnapshot(): Snapshot {
  const state = readStoredState();
  if (!state || !state.cargo.some(item => item.quantity > 0)) throw new Error('공유할 화물 입력이 없습니다. 시뮬레이터에서 입력하세요.');
  const unit = readGuidedLoadingUnit();
  if (unit === 'mixed') throw new Error('혼합 적재의 기업 공유는 준비 중입니다. 박스 또는 팔레트 모드에서 저장하세요.');
  const mode = unit === 'pallets' ? 'pallets' : 'boxes';
  const target = readPhysicsTarget() ?? (unit === 'pallets' ? buildPalletPhysicsTarget(state.container, state.cargo) : undefined);
  const current = target && target.mode === mode && JSON.stringify({ container: target.container, cargo: target.cargo }) === JSON.stringify({ container: state.container, cargo: state.cargo });
  const certification = readLatestInertiaCertification();
  const equipment = readTransportEquipment();
  const snapshot: Snapshot = {
    schemaVersion: 1, mode, capturedAt: new Date().toISOString(),
    container: state.container, cargo: state.cargo,
    equipment: { id: equipment.id, name: equipment.shortName },
    ...(current ? { result: target.result } : state.result && unit !== 'pallets' ? { result: state.result } : {}),
    ...(current && certification && isPhysicsTargetVerified(target, certification) ? {
      recordedVerification: { status: 'passed' as const, testedAt: certification.testedAt },
    } : {}),
  };
  // JSON copy freezes the captured evidence and excludes non-JSON state.
  const copy: Snapshot = JSON.parse(JSON.stringify(snapshot));
  if (!validCompanySnapshot(copy)) throw new Error('공유 입력의 수량 또는 데이터 형식이 맞지 않습니다. 적재 결과를 다시 계산하세요.');
  return copy;
}

/** Restore inputs only: historical approval/evidence never revives a live PASS. */
export function loadCompanySnapshot(snapshot: Snapshot) {
  if (!validCompanySnapshot(snapshot)) throw new Error('저장된 계획의 데이터 형식을 확인하세요.');
  const copy: Snapshot = JSON.parse(JSON.stringify(snapshot));
  clearLatestInertiaCertification(); clearPhysicsTarget(); clearManualOverride(); clearPalletSnapshot();
  const known = copy.equipment ? getTransportEquipment(copy.equipment.id) : undefined;
  const dimensions = { length: copy.container.length, width: copy.container.width, height: copy.container.height,
    maxPayloadKg: copy.container.maxPayloadKg, floorLoadLimitKgPerM2: copy.container.floorLoadLimitKgPerM2 ?? 1500 };
  // Preserve the vehicle's graphics while copying declared plan inputs. No global
  // equipment master is modified, and imported results are never manual overrides.
  const equipment = known ? { ...known, ...dimensions } : createCustomEquipment('container', dimensions);
  selectTransportEquipment(equipment);
  publishGuidedLoadingUnit(copy.mode);
  writeStoredState({ container: copy.container, cargo: copy.cargo }, true);
}
