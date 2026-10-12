import { buildWorkInstructionAddresses, buildWorkInstructionRuns, formatWorkAddress, formatWorkRun, workInstructionLegend } from './workInstructionGrid';
import { buildPalletVehicleAddresses, palletAssemblyPlacements } from './palletWorkInstructionGrid';
import { workflowWorkInstruction } from './workflowPresentation';
import { uiMessage, uiText, useUiLanguage } from './uiLanguage';
import { excelDisplayRows } from './excelPresentation';
import { assessPhysicsVerification } from './physicsVerificationPolicy';
import { isLimitReviewTarget, limitReviewRows, LIMIT_REVIEW_WARNING, LIMIT_REVIEW_PROVENANCE } from './limitReviewPresentation';
import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { boxResultMatchesWorkOrderCertification, palletSnapshotMatchesWorkOrderCertification } from './certifiedExport';
import { analyzeConstraints } from './engine/constraintAnalysis';
import { analyzeFloorLoad } from './engine/floorLoad';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { OptimizedPalletPackingResult, PalletSpec } from './engine/palletOptimization';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './engine/types';
import { buildWorkSequence } from './engine/workSequence';
import { confirmUnverifiedExport } from './exportVerification';
import { buildWorkOrderRecommendations, isPhysicsTargetVerified, workOrderTargetApprovalLabel, physicsTargetHardFailureReasons } from './inertiaWorkOrderPolicy';
import { readLatestInertiaCertification, type InertiaCertification, type SecuringUsage } from './inertiaCertification';
import { buildPalletSecuringPlan } from './palletSecuringPlan';
import { palletBandingLabel } from './palletBanding';
import { readPhysicsTarget } from './physicsTarget';
import { defaultSecuringMaterialSettings } from './securingMaterialSettings';
import { VOID_FILL_DISCLAIMER, voidFillRows, voidFillTotal } from './voidFillPresentation';

const exportJsonSheet = (rows: readonly object[]) => XLSX.utils.json_to_sheet(excelDisplayRows(rows));

type Detail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type PalletSnapshot = { spec: PalletSpec; result: OptimizedPalletPackingResult };
type ExportWindow = Window & { __containerLoadingLatestResult?: Detail; __containerLoadingPalletSnapshot?: PalletSnapshot };
type CurrentTarget = NonNullable<ReturnType<typeof readPhysicsTarget>>;

type InertiaHistoryRow = {
  순서: number;
  단계: string;
  시나리오: string;
  전체수평이동_mm: string | number;
  화물팔레트미끄럼_mm: string | number;
  팔레트상대이동_mm: string | number;
  기울기_deg: string | number;
  판정: string;
};

function matchingBoxCertification(detail: Detail): InertiaCertification | undefined {
  const target = readPhysicsTarget();
  const certification = readLatestInertiaCertification();
  return boxResultMatchesWorkOrderCertification(detail, target, certification) ? certification : undefined;
}

function matchingCurrentPalletCertification(snapshot: PalletSnapshot | undefined): InertiaCertification | undefined {
  const target = readPhysicsTarget();
  const certification = readLatestInertiaCertification();
  return palletSnapshotMatchesWorkOrderCertification(snapshot, target, certification) ? certification : undefined;
}

function materialRows(securing: SecuringUsage) {
  const unit = securing.materialUnitWeights ?? defaultSecuringMaterialSettings;
  return [
    securing.palletCount > 0 ? { 자재: uiText('팔레트'), 수량: securing.palletCount, 단위: 'EA', 길이_m: '', 단위중량: '', 중량_kg: Number(securing.palletWeightKg.toFixed(2)), 비고: uiText('팔레트/기존 포장 중량') } : null,
    securing.bandingStraps > 0 ? { 자재: uiText('밴딩'), 수량: securing.bandingStraps, 단위: uiText('줄'), 길이_m: Number(securing.bandingLengthM.toFixed(2)), 단위중량: `${unit.bandingKgPerM} kg/m`, 중량_kg: Number((securing.bandingLengthM * unit.bandingKgPerM).toFixed(2)), 비고: uiText('적재 규격/높이 기반 계산') } : null,
    securing.cornerGuards > 0 ? { 자재: uiText('각대'), 수량: securing.cornerGuards, 단위: 'EA', 길이_m: Number(securing.cornerGuardLengthM.toFixed(2)), 단위중량: `${unit.cornerGuardKgPerM} kg/m`, 중량_kg: Number((securing.cornerGuardLengthM * unit.cornerGuardKgPerM).toFixed(2)), 비고: uiText('총 세로 길이') } : null,
    securing.wrappingLengthM > 0 ? { 자재: uiText('랩핑 필름'), 수량: 1, 단위: uiText('작업'), 길이_m: Number(securing.wrappingLengthM.toFixed(2)), 단위중량: `${unit.wrappingKgPerM} kg/m`, 중량_kg: Number((securing.wrappingLengthM * unit.wrappingKgPerM).toFixed(2)), 비고: uiText('50% 겹침 기준 추정') } : null,
    securing.antiSlipMats > 0 ? { 자재: uiText('미끄럼방지재'), 수량: securing.antiSlipMats, 단위: 'EA', 길이_m: '', 단위중량: `${unit.antiSlipKgPerEa} kg/EA`, 중량_kg: Number((securing.antiSlipMats * unit.antiSlipKgPerEa).toFixed(2)), 비고: uiText('바닥/접촉면') } : null,
    securing.dunnageBlocks > 0 ? { 자재: uiText('블로킹재'), 수량: securing.dunnageBlocks, 단위: 'EA', 길이_m: '', 단위중량: `${unit.dunnageKgPerEa} kg/EA`, 중량_kg: Number((securing.dunnageBlocks * unit.dunnageKgPerEa).toFixed(2)), 비고: uiText('빈 공간 이동 억제') } : null,
    securing.loadBars > 0 ? { 자재: uiText('고정바'), 수량: securing.loadBars, 단위: 'EA', 길이_m: '', 단위중량: `${unit.loadBarKgPerEa} kg/EA`, 중량_kg: Number((securing.loadBars * unit.loadBarKgPerEa).toFixed(2)), 비고: uiText('길이 방향 블로킹') } : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function appendMaterialSheet(wb: XLSX.WorkBook, securing: SecuringUsage) {
  const rows = materialRows(securing);
  XLSX.utils.book_append_sheet(wb, exportJsonSheet(rows.length ? rows : [{ 자재: uiText('추가 보조자재 없음'), 수량: 0, 단위: '', 길이_m: '', 단위중량: '', 중량_kg: 0, 비고: '' }]), uiText('보조자재'));
}

function appendInertiaMetricsSheet(wb: XLSX.WorkBook, certification: InertiaCertification, target: CurrentTarget) {
  const row = {
    적재모드: certification.mode === 'pallets' ? uiText('팔레트') : uiText('박스 직접 적재'),
    전체최대이동_mm: Number((certification.maxHorizontalShiftM * 1000).toFixed(2)),
    화물팔레트상대미끄럼_mm: certification.mode === 'pallets' ? Number(((certification.maxCargoRelativeSlipM ?? 0) * 1000).toFixed(2)) : '',
    팔레트상대이동_mm: certification.mode === 'pallets' ? Number(((certification.maxSupportShiftM ?? 0) * 1000).toFixed(2)) : '',
    최대기울기_deg: Number(certification.maxTiltDeg.toFixed(2)),
    최대화물구속력_kN: Number(((certification.maxCargoRestraintForceN ?? 0) / 1000).toFixed(3)),
    최대팔레트구속력_kN: Number(((certification.maxSupportRestraintForceN ?? 0) / 1000).toFixed(3)),
    판정: uiMessage(workOrderTargetApprovalLabel(target, certification)),
    문서용도: isPhysicsTargetVerified(target, certification) ? uiText('검증 결과') : uiText('검토용 · 출고 승인 아님'),
    비고: uiText('구속력은 내부 물리모델 비교값이며 실제 자재 정격을 대체하지 않음'),
  };
  XLSX.utils.book_append_sheet(wb, exportJsonSheet([row]), uiText('관성안전지표'));
}

function appendInertiaHistorySheet(wb: XLSX.WorkBook, certification: InertiaCertification, review = Boolean(certification.limitReview)) {
  const rows = (certification.attempts ?? []).flatMap<InertiaHistoryRow>((attempt, attemptIndex) => {
    if (!attempt.scenarios.length) return [{
      순서: attemptIndex + 1,
      단계: attempt.level === 0 ? uiText('기본 적재안') : uiMessage(attempt.levelLabel),
      시나리오: '-',
      전체수평이동_mm: '',
      화물팔레트미끄럼_mm: '',
      팔레트상대이동_mm: '',
      기울기_deg: '',
      판정: attempt.payloadWithinLimit ? uiText('검증 미완료') : uiText('보조자재 포함 최대중량 초과'),
    }];
    return attempt.scenarios.map((scenario) => ({
      순서: attemptIndex + 1,
      단계: attempt.level === 0 ? uiText('기본 적재안') : uiMessage(attempt.levelLabel),
      시나리오: scenario.scenario === 'acceleration' ? uiText('출발 가속') : scenario.scenario === 'braking' ? uiText('급정거') : uiText('급회전'),
      전체수평이동_mm: Number((scenario.maxHorizontalShiftM * 1000).toFixed(2)),
      화물팔레트미끄럼_mm: certification.mode === 'pallets' ? Number(((scenario.maxCargoRelativeSlipM ?? 0) * 1000).toFixed(2)) : '',
      팔레트상대이동_mm: certification.mode === 'pallets' ? Number(((scenario.maxSupportShiftM ?? 0) * 1000).toFixed(2)) : '',
      기울기_deg: Number(scenario.maxTiltDeg.toFixed(2)),
      판정: scenario.passed ? (review ? uiText('내부 기준 이내 · WHAT-IF 검토용') : 'PASS') : 'FAIL',
    }));
  });
  if (rows.length) XLSX.utils.book_append_sheet(wb, exportJsonSheet(rows), uiText('관성보강이력'));
}

/** Every exported tab carries a permanent data warning, including isolated sheet copies. */
export function appendLimitReviewSheets(wb: XLSX.WorkBook, target: CurrentTarget, certification: InertiaCertification) {
  if (!isLimitReviewTarget(target)) return;
  XLSX.utils.book_append_sheet(wb, exportJsonSheet(limitReviewRows(target, certification).map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, key !== '화물' && typeof value === 'string' ? uiMessage(value) : value])))), uiText('WHAT-IF 한도비교'));
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    wb.Sheets[name] = XLSX.utils.aoa_to_sheet([[uiText(LIMIT_REVIEW_WARNING)], [uiText(LIMIT_REVIEW_PROVENANCE)], ...rows]);
  }
}

function assemblyInstructionRows(placements: readonly Placement[], cargo: readonly CargoItem[]) {
  const names = new Map(cargo.map(item => [item.id, item.name]));
  return buildWorkInstructionRuns(placements).map((run, index) => ({
    순서: index + 1, 코드: run.cargoId, 품명: names.get(run.cargoId) ?? run.cargoId,
    작업위치: formatWorkRun(run), 열_시작: run.columnFrom, 열_끝: run.columnTo,
    행_시작: run.rowFrom, 행_끝: run.rowTo, 단: run.layer, 수량_EA: run.quantity,
    박스_번호: run.indices.map(i => i + 1).join(', '),
    회전: placements[run.indices[0]].orientation ?? (placements[run.indices[0]].rotated ? uiText('90도') : uiText('기본')),
    배치길이_m: placements[run.indices[0]].length, 배치폭_m: placements[run.indices[0]].width, 배치높이_m: placements[run.indices[0]].height,
  }));
}

function appendWorkNumberLegend(wb: XLSX.WorkBook, pallet = false) {
  const rows = [[uiText('항목'), uiText('값')], [uiText('번호 기준'), workInstructionLegend()], [uiText('작업지시'), uiText(pallet ? '조립 후 차량 투입은 팔레트별 시트의 순서를 따르세요.' : '조립지시는 위치별 묶음입니다. 실제 투입·하역은 작업순서 시트를 따르세요.')]];
  rows.push([uiText('회전'), uiText('방향 코드 L/W/H는 원래 길이/폭/높이입니다. 코드의 순서는 배치된 X/Y/Z 방향이며 배치 치수는 실제 놓인 방향의 길이·폭·높이입니다.')]);
  if (!pallet) rows.push([uiText('바닥하중'), uiText('바닥하중 시트의 분석행·분석열은 하중 계산용 고정 격자입니다. 작업 위치 번호와 별도로 읽으세요.')]);
  if (pallet) rows.push(
    [uiText('차량 위치'), uiText('차량 번호는 바닥의 C자리 기준이며, 팔레트 적층단은 같은 C자리에서 아래부터 셉니다.')],
    [uiText('팔레트 내 위치'), uiText('팔레트 상판부터 박스 1단을 시작합니다. 차량의 팔레트 적층단과 별도로 읽으세요.')],
    [uiText('박스 번호'), uiText('도면의 #번호는 해당 팔레트의 박스 번호입니다. 같은 번호를 작업 표와 대조하세요.')],
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), uiText('번호 기준'));
}

function exportBoxWorkbook(detail: Detail, certification: InertiaCertification) {
  const { container, cargo, result } = detail;
  const floor = analyzeFloorLoad(container, result, 12, 4);
  const checks = analyzeConstraints(container, cargo, result, floor);
  const loadedByCargo = new Map<string, number>();
  result.placements.forEach(p => loadedByCargo.set(p.cargoId, (loadedByCargo.get(p.cargoId) ?? 0) + 1));
  const loadSteps = buildWorkSequence(container, cargo, result, 'LOAD');
  const unloadSteps = buildWorkSequence(container, cargo, result, 'UNLOAD');
  const target: CurrentTarget = { mode: 'boxes', container, cargo, result };
  const physicsVerified = isPhysicsTargetVerified(target, certification);
  const approvalLabel = uiMessage(workOrderTargetApprovalLabel(target, certification));
  const securing = certification.securing;
  const voidRows = voidFillRows(result);
  const voidTotal = voidFillTotal(result);

  const summary = [
    [uiText('항목'), uiText('값')], [uiText('적재모드'), uiText('박스 직접 적재')],
    [uiText('컨테이너 길이(m)'), container.length], [uiText('컨테이너 폭(m)'), container.width], [uiText('컨테이너 높이(m)'), container.height],
    [uiText('최대 적재중량(kg)'), container.maxPayloadKg], [uiText('적재 중량(kg)'), result.loadedWeightKg],
    [uiText('적재 부피(m3)'), result.usedVolumeM3], [uiText('적재 박스 수(EA)'), result.placements.length],
    [uiText('바닥 평균 하중(kg/m2)'), Number(floor.averageKgPerM2.toFixed(1))], [uiText('바닥 최대 하중(kg/m2)'), Number(floor.maxKgPerM2.toFixed(1))],
    [uiText('물리 안정성 검증'), physicsVerified ? uiText('검증 완료') : uiText('검증 확인 필요')],
    [uiText('문서 용도'), physicsVerified ? uiText('검증 결과') : uiText('검토용 · 출고 승인 아님')],
    [uiText('검증 경고'), [...physicsTargetHardFailureReasons(target), ...assessPhysicsVerification(target, certification).reasons, ...buildWorkOrderRecommendations(certification)].map(value => uiMessage(value)).join(' / ')],
    [uiText('최종 관성검증'), uiText("{0} · 전체 {1}mm · 기울기 {2}°", [approvalLabel, (certification.maxHorizontalShiftM * 1000).toFixed(1), certification.maxTiltDeg.toFixed(1)])],
    [uiText('내부 최대 화물 구속력(kN)'), Number(((certification.maxCargoRestraintForceN ?? 0) / 1000).toFixed(3))],
    [uiText('보강 단계'), uiMessage(securing.levelLabel)], [uiText('박스 제외 보조자재 중량(kg)'), Number(securing.estimatedNonCargoWeightKg.toFixed(2))],
    [uiText('메움재 수량(EA)'), voidTotal.quantity], [uiText('메움재 중량(kg)'), Number(voidTotal.weightKg.toFixed(2))], [uiText('메움재 미확정 위치'), voidTotal.unresolvedCount],
  ];
  const cargoRows = cargo.map(item => ({ 코드: item.id, 품명: item.name, 요청수량: item.quantity, 적재수량: loadedByCargo.get(item.id) ?? 0, 잔량: Math.max(0, item.quantity - (loadedByCargo.get(item.id) ?? 0)), 길이_m: item.length, 폭_m: item.width, 높이_m: item.height, 개당중량_kg: item.weightKg, 최대적층단: item.maxStackLayers ?? '', 상부허용중량_kg: item.maxTopLoadKg ?? '', 회전허용: item.allowRotation !== false ? 'Y' : 'N', 하역순서: item.unloadPriority ?? '' }));
  const addresses = buildWorkInstructionAddresses(result.placements);
  const placementRows = result.placements.map((p, index) => ({ No: index + 1, 코드: p.cargoId, 작업위치: formatWorkAddress(addresses[index]), 열: addresses[index].column, 행: addresses[index].row, 단: addresses[index].layer, X_m: p.x, Y_m: p.y, Z_m: p.z, 길이_m: p.length, 폭_m: p.width, 높이_m: p.height, 중량_kg: p.weightKg, 회전: p.orientation ?? (p.rotated ? uiText('90도') : uiText('기본')) }));
  const remainingRows = result.remaining.map(item => ({ 코드: item.cargoId, 수량: item.quantity, 사유: uiMessage(item.reason) }));
  const correctionRows = (result.autoCorrections ?? []).map(item => ({ 보정: uiMessage(item.label), 코드: item.cargoId ?? '', 내용: uiMessage(item.description), 이동전: item.from ? `${item.from.x.toFixed(2)},${item.from.y.toFixed(2)},${item.from.z.toFixed(2)}` : '', 이동후: item.to ? `${item.to.x.toFixed(2)},${item.to.y.toFixed(2)},${item.to.z.toFixed(2)}` : '', 점수전: item.beforeScore ?? '', 점수후: item.afterScore ?? '' }));
  const floorRows = floor.cells.map(cell => ({ 하중분석행: cell.row + 1, 하중분석열: cell.column + 1, X_m: cell.x, Y_m: cell.y, 하중_kg: Number(cell.loadKg.toFixed(2)), 하중_kg_m2: Number(cell.kgPerM2.toFixed(2)) }));
  const checkRows = checks.map(check => ({ 제약조건: uiMessage(check.label), 상태: check.status === 'pass' ? uiText('통과') : check.status === 'warn' ? uiText('확인') : uiText('실패'), 상세: uiMessage(check.detail) }));
  const toStepRows = (steps: ReturnType<typeof buildWorkSequence>) => steps.map(step => ({ 순서: step.step, 코드: step.cargoId, 품명: step.label, 구역: uiMessage(step.zone), 열: step.column, 행: step.row, 단: step.layer, X_m: step.x, Y_m: step.y, Z_m: step.z, 하역우선순위: step.unloadPriority ?? '', 작업지시: workflowWorkInstruction(step) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), uiText('요약'));
  XLSX.utils.book_append_sheet(wb, exportJsonSheet(cargoRows), uiText('품목별'));
  XLSX.utils.book_append_sheet(wb, exportJsonSheet(placementRows), uiText('배치좌표'));
  XLSX.utils.book_append_sheet(wb, exportJsonSheet(assemblyInstructionRows(result.placements, cargo)), uiText('박스 조립지시'));
  appendWorkNumberLegend(wb);
  XLSX.utils.book_append_sheet(wb, exportJsonSheet(floorRows), uiText('바닥하중'));
  XLSX.utils.book_append_sheet(wb, exportJsonSheet(checkRows), uiText('제약조건'));
  appendMaterialSheet(wb, securing);
  XLSX.utils.book_append_sheet(wb, exportJsonSheet(voidRows.length ? voidRows.map(row => ({
    ID: row.id,
    틈유형: uiMessage(row.gapType),
    자재: uiMessage(row.material),
    수량_EA: row.quantity,
    중량_kg: row.weightKg,
    틈_m: row.gapM,
    빈공간_m3: row.voidVolumeM3,
    X_m: row.xM,
    Y_m: row.yM,
    Z_m: row.zM,
    길이_m: row.lengthM,
    폭_m: row.widthM,
    높이_m: row.heightM,
    관성고정지지: row.fixedSupportEligible,
    비고: uiText(VOID_FILL_DISCLAIMER),
  })) : [{ ID: uiText('메움재 없음'), 틈유형: '', 자재: '', 수량_EA: 0, 중량_kg: 0, 비고: uiText(VOID_FILL_DISCLAIMER) }]), uiText('메움재상세'));
  appendInertiaMetricsSheet(wb, certification, target);
  appendInertiaHistorySheet(wb, certification, isLimitReviewTarget(target));
  XLSX.utils.book_append_sheet(wb, exportJsonSheet(remainingRows), uiText('미적재'));
  XLSX.utils.book_append_sheet(wb, exportJsonSheet(correctionRows), uiText('자동보정'));
  XLSX.utils.book_append_sheet(wb, exportJsonSheet(toStepRows(loadSteps)), uiText('적재작업순서'));
  XLSX.utils.book_append_sheet(wb, exportJsonSheet(toStepRows(unloadSteps)), uiText('하역작업순서'));
  appendLimitReviewSheets(wb, target, certification);
  XLSX.writeFile(wb, `container-loading-box-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
}

function exportPalletWorkbook(target: CurrentTarget, snapshot: PalletSnapshot, certification: InertiaCertification) {
  const result = snapshot.result;
  const physicsVerified = isPhysicsTargetVerified(target, certification);
  const approvalLabel = uiMessage(workOrderTargetApprovalLabel(target, certification));
  const securing = certification.securing;
  const plan = buildPalletSecuringPlan(target, securing);
  const cargoById = new Map(target.cargo.map(item => [item.id, item.name]));
  const palletByIndex = new Map(result.pallets.map(pallet => [pallet.palletIndex, pallet]));
  const vehicleAddresses = buildPalletVehicleAddresses(result.pallets);
  const summary = [
    [uiText('항목'), uiText('값')], [uiText('적재모드'), uiText('팔레트 적재')],
    [uiText('컨테이너'), `${target.container.length} × ${target.container.width} × ${target.container.height} m`],
    [uiText('팔레트 규격'), `${snapshot.spec.length} × ${snapshot.spec.width} × ${snapshot.spec.height} m`],
    [uiText('사용 팔레트(EA)'), result.palletCount], [uiText('바닥 위치(열)'), result.optimization.floorPositions], [uiText('적층 팔레트(EA)'), result.stackedPallets], [uiText('최대 적층단'), result.maxUsedStackLevel],
    [uiText('적재 화물(EA)'), result.placements.length], [uiText('화물 중량(kg)'), Number(result.loadedCargoWeightKg.toFixed(2))], [uiText('총 팔레트화 중량(kg)'), Number(result.totalPalletizedWeightKg.toFixed(2))],
    [uiText('좌우 편차(kg)'), Number(result.lateralImbalanceKg.toFixed(2))],
    [uiText('문서 용도'), physicsVerified ? uiText('검증 결과') : uiText('검토용 · 출고 승인 아님')],
    [uiText('검증 경고'), [...physicsTargetHardFailureReasons(target), ...assessPhysicsVerification(target, certification).reasons, ...buildWorkOrderRecommendations(certification)].map(value => uiMessage(value)).join(' / ')],
    [uiText('관성검증'), uiText("{0} · 전체 {1}mm · 화물↔팔레트 {2}mm · 팔레트 {3}mm · {4}°", [approvalLabel, (certification.maxHorizontalShiftM * 1000).toFixed(1), ((certification.maxCargoRelativeSlipM ?? 0) * 1000).toFixed(1), ((certification.maxSupportShiftM ?? 0) * 1000).toFixed(1), certification.maxTiltDeg.toFixed(1)])],
    [uiText('내부 최대 화물 구속력(kN)'), Number(((certification.maxCargoRestraintForceN ?? 0) / 1000).toFixed(3))],
    [uiText('내부 최대 팔레트 구속력(kN)'), Number(((certification.maxSupportRestraintForceN ?? 0) / 1000).toFixed(3))],
    [uiText('보강 단계'), uiMessage(securing.levelLabel)], [uiText('박스 제외 보조자재 중량(kg)'), Number(securing.estimatedNonCargoWeightKg.toFixed(2))],
  ];
  const pallets = [...result.pallets].sort((a, b) => a.x - b.x || a.stackColumn - b.stackColumn || a.stackLevel - b.stackLevel || a.y - b.y).map((pallet, index) => {
    const counts = new Map<string, number>();
    pallet.cargoPlacements.forEach(item => counts.set(item.cargoId, (counts.get(item.cargoId) ?? 0) + 1));
    const content = [...counts.entries()].map(([id, count]) => `${id}${cargoById.get(id) && cargoById.get(id) !== id ? `(${cargoById.get(id)})` : ''} ${count}EA`).join(' / ');
    const address = vehicleAddresses.get(pallet.palletIndex)!;
    return { 순서: index + 1, 팔레트: `P${pallet.palletIndex}`, 적층위치: `C${pallet.stackColumn}`, 차량위치: formatWorkAddress(address), 차량열: address.column, 차량행: address.row, 팔레트적층단: pallet.stackLevel, X_m: Number(pallet.x.toFixed(3)), Y_m: Number(pallet.y.toFixed(3)), Z_m: Number(pallet.z.toFixed(3)), 박스수_EA: pallet.cargoPlacements.length, 화물중량_kg: Number(pallet.cargoWeightKg.toFixed(2)), 총중량_kg: Number(pallet.totalWeightKg.toFixed(2)), 박스구성: content, 무게중심_X: Number(pallet.centerOfGravity.x.toFixed(3)), 무게중심_Y: Number(pallet.centerOfGravity.y.toFixed(3)), 무게중심_Z: Number(pallet.centerOfGravity.z.toFixed(3)) };
  });
  const boxes = result.pallets.flatMap(pallet => {
    const local = palletAssemblyPlacements(pallet);
    const addresses = buildWorkInstructionAddresses(local);
    const vehicle = vehicleAddresses.get(pallet.palletIndex)!;
    return pallet.cargoPlacements.map((item, index) => ({
      팔레트: `P${pallet.palletIndex}`, 적층위치: `C${pallet.stackColumn}`,
      차량위치: formatWorkAddress(vehicle), 차량열: vehicle.column, 차량행: vehicle.row, 팔레트적층단: pallet.stackLevel,
      팔레트내순번: index + 1, 코드: item.cargoId, 품명: cargoById.get(item.cargoId) ?? item.cargoId,
      팔레트내위치: formatWorkAddress(addresses[index]), 박스열: addresses[index].column, 박스행: addresses[index].row, 박스단: addresses[index].layer,
      X_m: item.x, Y_m: item.y, Z_m: item.z, 팔레트내X_m: Number(local[index].x.toFixed(6)), 팔레트내Y_m: Number(local[index].y.toFixed(6)), 팔레트내Z_m: Number(local[index].z.toFixed(6)),
      길이_m: item.length, 폭_m: item.width, 높이_m: item.height, 중량_kg: item.weightKg, 회전: item.orientation ?? (item.rotated ? uiText('90도') : uiText('기본')),
    }));
  });
  const assemblyRows = result.pallets.flatMap(pallet => assemblyInstructionRows(palletAssemblyPlacements(pallet), target.cargo).map(row => ({
    팔레트: `P${pallet.palletIndex}`, 적층위치: `C${pallet.stackColumn}`,
    차량위치: formatWorkAddress(vehicleAddresses.get(pallet.palletIndex)!), 팔레트적층단: pallet.stackLevel, ...row,
  })));
  const securingRows = [...plan.items].sort((a, b) => a.palletIndex - b.palletIndex).map((item, index) => {
    const pallet = palletByIndex.get(item.palletIndex);
    const steps = [
      item.antiSlipMats > 0 ? uiText("① 미끄럼방지재 {0}EA 설치", [item.antiSlipMats]) : '',
      pallet ? uiText("② P{0} → 차량 {1} · C{2} 배치", [item.palletIndex, formatWorkAddress(vehicleAddresses.get(pallet.palletIndex)!), pallet.stackColumn]) : uiText("② P{0} {1} 배치", [item.palletIndex, '']),
      item.cornerGuards > 0 ? uiText("③ 각대 {0}EA 설치", [item.cornerGuards]) : '',
      item.bandingStraps > 0 ? uiText("④ 밴딩 {0}줄 결속 · {1}", [item.bandingStraps, uiMessage(palletBandingLabel(item.bandingStraps))]) : '',
      item.wrappingLengthM > 0 ? uiText("⑤ 랩핑 {0}m", [item.wrappingLengthM.toFixed(1)]) : '',
      uiText('⑥ 흔들림/간섭 확인'),
    ].filter(Boolean).join(' → ');
    return {
      순서: index + 1,
      팔레트: `P${item.palletIndex}`,
      적층위치: pallet ? `C${pallet.stackColumn}` : '',
      차량위치: pallet ? formatWorkAddress(vehicleAddresses.get(pallet.palletIndex)!) : '',
      팔레트적층단: pallet?.stackLevel ?? '',
      적재높이_mm: Math.round(item.loadHeightM * 1000),
      밴딩_줄: item.bandingStraps,
      밴딩길이_m: Number(item.bandingLengthM.toFixed(2)),
      각대_EA: item.cornerGuards,
      각대길이_m: Number(item.cornerGuardLengthM.toFixed(2)),
      랩핑_m: Number(item.wrappingLengthM.toFixed(2)),
      미끄럼방지_EA: item.antiSlipMats,
      추가중량_kg: Number(item.estimatedAddedWeightKg.toFixed(2)),
      결속작업순서: steps,
    };
  });
  if (plan.sharedLoadBars > 0) securingRows.push({
    순서: securingRows.length + 1,
    팔레트: uiText('공통'),
    적층위치: '',
    차량위치: '',
    팔레트적층단: '',
    적재높이_mm: 0,
    밴딩_줄: 0,
    밴딩길이_m: 0,
    각대_EA: 0,
    각대길이_m: 0,
    랩핑_m: 0,
    미끄럼방지_EA: 0,
    추가중량_kg: Number(plan.sharedLoadBarWeightKg.toFixed(2)),
    결속작업순서: uiText("모든 팔레트 배치 후 고정바 {0}EA 설치 → 문 닫힘 간섭 확인", [plan.sharedLoadBars]),
  });
  const remaining = result.remaining.map(item => ({ 코드: item.cargoId, 수량: item.quantity, 사유: uiMessage(item.reason) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), uiText('요약'));
  XLSX.utils.book_append_sheet(wb, exportJsonSheet(pallets), uiText('팔레트별'));
  XLSX.utils.book_append_sheet(wb, exportJsonSheet(boxes), uiText('팔레트박스구성'));
  XLSX.utils.book_append_sheet(wb, exportJsonSheet(assemblyRows), uiText('팔레트 조립지시'));
  appendWorkNumberLegend(wb, true);
  XLSX.utils.book_append_sheet(wb, exportJsonSheet(securingRows.length ? securingRows : [{ 순서: 1, 팔레트: uiText('추가 보강 없음'), 결속작업순서: physicsVerified ? uiText('기본 적재안으로 관성검증 통과') : uiText('검토용 · 검증 결과 및 현장 고정 확인 필요') }]), uiText('팔레트별결속'));
  appendMaterialSheet(wb, securing);
  appendInertiaMetricsSheet(wb, certification, target);
  appendInertiaHistorySheet(wb, certification, isLimitReviewTarget(target));
  XLSX.utils.book_append_sheet(wb, exportJsonSheet(remaining.length ? remaining : [{ 코드: uiText('미적재 없음'), 수량: 0, 사유: '' }]), uiText('미적재'));
  appendLimitReviewSheets(wb, target, certification);
  XLSX.writeFile(wb, `container-loading-pallet-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
}

export default function ExcelExportActions() {
  const language = useUiLanguage();
  const [detail, setDetail] = useState<Detail | null>(() => typeof window === 'undefined' ? null : ((window as ExportWindow).__containerLoadingLatestResult ?? null));

  useEffect(() => {
    const onResult = (event: Event) => setDetail((event as CustomEvent<Detail>).detail ?? null);
    window.addEventListener(LOADING_RESULT_EVENT, onResult);
    return () => window.removeEventListener(LOADING_RESULT_EVENT, onResult);
  }, []);

  useEffect(() => {
    const quickRow = document.querySelector('.quick-row');
    if (!quickRow || quickRow.querySelector('.excel-export-runtime')) return;
    const button = document.createElement('button');
    button.className = 'excel-export-runtime';
    button.textContent = uiText('▧ Excel 내보내기');
    button.disabled = !detail;
    const click = () => {
      const target = readPhysicsTarget();
      if (target?.mode === 'pallets') {
        const snapshot = (window as ExportWindow).__containerLoadingPalletSnapshot;
        const certification = matchingCurrentPalletCertification(snapshot);
        if (!certification || !snapshot) {
          window.alert(uiText('팔레트 Excel은 현재 검증 결과와 적재안·출력 좌표가 일치해야 내보낼 수 있습니다. 실패·미완료 결과는 검토용으로 표시됩니다.'));
          return;
        }
        if (!confirmUnverifiedExport(uiText('팔레트 Excel 파일'))) return;
        exportPalletWorkbook(target, snapshot, certification);
        return;
      }
      if (!detail) return;
      const certification = matchingBoxCertification(detail);
      if (!certification) {
        window.alert(uiText('Excel은 현재 검증 결과와 적재안·출력 데이터가 일치해야 내보낼 수 있습니다. 실패·미완료 결과는 검토용으로 표시됩니다.'));
        return;
      }
      if (!confirmUnverifiedExport(uiText('Excel 파일'))) return;
      exportBoxWorkbook(detail, certification);
    };
    button.addEventListener('click', click);
    quickRow.appendChild(button);
    return () => { button.removeEventListener('click', click); button.remove(); };
  }, [detail, language]);

  return null;
}
