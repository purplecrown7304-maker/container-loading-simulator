import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { palletSnapshotMatchesCertification } from './certifiedExport';
import { analyzeConstraints } from './engine/constraintAnalysis';
import { analyzeFloorLoad } from './engine/floorLoad';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { OptimizedPalletPackingResult, PalletSpec } from './engine/palletOptimization';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { buildWorkSequence } from './engine/workSequence';
import { confirmUnverifiedExport, hasCurrentPhysicsVerification } from './exportVerification';
import { createPhysicsTargetSignature, readLatestInertiaCertification, type InertiaCertification, type SecuringUsage } from './inertiaCertification';
import { buildPalletSecuringPlan } from './palletSecuringPlan';
import { readPhysicsTarget } from './physicsTarget';
import { defaultSecuringMaterialSettings } from './securingMaterialSettings';

type Detail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type PalletSnapshot = { spec: PalletSpec; result: OptimizedPalletPackingResult };
type ExportWindow = Window & { __containerLoadingLatestResult?: Detail; __containerLoadingPalletSnapshot?: PalletSnapshot };
type CurrentTarget = NonNullable<ReturnType<typeof readPhysicsTarget>>;

function matchingBoxCertification(detail: Detail): InertiaCertification | undefined {
  const certification = readLatestInertiaCertification();
  if (!certification || certification.status !== 'passed' || certification.mode !== 'boxes') return undefined;
  const signature = createPhysicsTargetSignature({ mode: 'boxes', container: detail.container, cargo: detail.cargo, result: detail.result });
  return certification.targetSignature === signature ? certification : undefined;
}

function matchingCurrentPalletCertification(snapshot: PalletSnapshot | undefined): InertiaCertification | undefined {
  const target = readPhysicsTarget();
  const certification = readLatestInertiaCertification();
  return palletSnapshotMatchesCertification(snapshot, target, certification) ? certification : undefined;
}

function materialRows(securing: SecuringUsage) {
  const unit = securing.materialUnitWeights ?? defaultSecuringMaterialSettings;
  return [
    securing.palletCount > 0 ? { 자재: '팔레트', 수량: securing.palletCount, 단위: 'EA', 길이_m: '', 단위중량: '', 중량_kg: Number(securing.palletWeightKg.toFixed(2)), 비고: '팔레트/기존 포장 중량' } : null,
    securing.bandingStraps > 0 ? { 자재: '밴딩', 수량: securing.bandingStraps, 단위: '줄', 길이_m: Number(securing.bandingLengthM.toFixed(2)), 단위중량: `${unit.bandingKgPerM} kg/m`, 중량_kg: Number((securing.bandingLengthM * unit.bandingKgPerM).toFixed(2)), 비고: '적재 규격/높이 기반 계산' } : null,
    securing.cornerGuards > 0 ? { 자재: '각대', 수량: securing.cornerGuards, 단위: 'EA', 길이_m: Number(securing.cornerGuardLengthM.toFixed(2)), 단위중량: `${unit.cornerGuardKgPerM} kg/m`, 중량_kg: Number((securing.cornerGuardLengthM * unit.cornerGuardKgPerM).toFixed(2)), 비고: '총 세로 길이' } : null,
    securing.wrappingLengthM > 0 ? { 자재: '랩핑 필름', 수량: 1, 단위: '작업', 길이_m: Number(securing.wrappingLengthM.toFixed(2)), 단위중량: `${unit.wrappingKgPerM} kg/m`, 중량_kg: Number((securing.wrappingLengthM * unit.wrappingKgPerM).toFixed(2)), 비고: '50% 겹침 기준 추정' } : null,
    securing.antiSlipMats > 0 ? { 자재: '미끄럼방지재', 수량: securing.antiSlipMats, 단위: 'EA', 길이_m: '', 단위중량: `${unit.antiSlipKgPerEa} kg/EA`, 중량_kg: Number((securing.antiSlipMats * unit.antiSlipKgPerEa).toFixed(2)), 비고: '바닥/접촉면' } : null,
    securing.dunnageBlocks > 0 ? { 자재: '블로킹재', 수량: securing.dunnageBlocks, 단위: 'EA', 길이_m: '', 단위중량: `${unit.dunnageKgPerEa} kg/EA`, 중량_kg: Number((securing.dunnageBlocks * unit.dunnageKgPerEa).toFixed(2)), 비고: '빈 공간 이동 억제' } : null,
    securing.loadBars > 0 ? { 자재: '고정바', 수량: securing.loadBars, 단위: 'EA', 길이_m: '', 단위중량: `${unit.loadBarKgPerEa} kg/EA`, 중량_kg: Number((securing.loadBars * unit.loadBarKgPerEa).toFixed(2)), 비고: '길이 방향 블로킹' } : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function appendMaterialSheet(wb: XLSX.WorkBook, securing: SecuringUsage) {
  const rows = materialRows(securing);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ 자재: '추가 보조자재 없음', 수량: 0, 단위: '', 길이_m: '', 단위중량: '', 중량_kg: 0, 비고: '' }]), '보조자재');
}

function appendInertiaMetricsSheet(wb: XLSX.WorkBook, certification: InertiaCertification) {
  const row = {
    적재모드: certification.mode === 'pallets' ? '팔레트' : '박스 직접 적재',
    전체최대이동_mm: Number((certification.maxHorizontalShiftM * 1000).toFixed(2)),
    화물팔레트상대미끄럼_mm: certification.mode === 'pallets' ? Number(((certification.maxCargoRelativeSlipM ?? 0) * 1000).toFixed(2)) : '',
    팔레트상대이동_mm: certification.mode === 'pallets' ? Number(((certification.maxSupportShiftM ?? 0) * 1000).toFixed(2)) : '',
    최대기울기_deg: Number(certification.maxTiltDeg.toFixed(2)),
    최대화물구속력_kN: Number(((certification.maxCargoRestraintForceN ?? 0) / 1000).toFixed(3)),
    최대팔레트구속력_kN: Number(((certification.maxSupportRestraintForceN ?? 0) / 1000).toFixed(3)),
    판정: certification.status === 'passed' ? 'PASS' : 'FAIL',
    비고: '구속력은 내부 물리모델 비교값이며 실제 자재 정격을 대체하지 않음',
  };
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([row]), '관성안전지표');
}

function appendInertiaHistorySheet(wb: XLSX.WorkBook, certification: InertiaCertification) {
  const rows = (certification.attempts ?? []).flatMap((attempt, attemptIndex) => {
    if (!attempt.scenarios.length) return [{
      순서: attemptIndex + 1,
      단계: attempt.level === 0 ? '기본 적재안' : attempt.levelLabel,
      시나리오: '-',
      전체수평이동_mm: '',
      화물팔레트미끄럼_mm: '',
      팔레트상대이동_mm: '',
      기울기_deg: '',
      판정: attempt.payloadWithinLimit ? '검증 미완료' : '보조자재 포함 최대중량 초과',
    }];
    return attempt.scenarios.map((scenario) => ({
      순서: attemptIndex + 1,
      단계: attempt.level === 0 ? '기본 적재안' : attempt.levelLabel,
      시나리오: scenario.scenario === 'acceleration' ? '출발 가속' : scenario.scenario === 'braking' ? '급정거' : '급회전',
      전체수평이동_mm: Number((scenario.maxHorizontalShiftM * 1000).toFixed(2)),
      화물팔레트미끄럼_mm: certification.mode === 'pallets' ? Number(((scenario.maxCargoRelativeSlipM ?? 0) * 1000).toFixed(2)) : '',
      팔레트상대이동_mm: certification.mode === 'pallets' ? Number(((scenario.maxSupportShiftM ?? 0) * 1000).toFixed(2)) : '',
      기울기_deg: Number(scenario.maxTiltDeg.toFixed(2)),
      판정: scenario.passed ? 'PASS' : 'FAIL',
    }));
  });
  if (rows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), '관성보강이력');
}

function exportBoxWorkbook(detail: Detail, certification: InertiaCertification) {
  const { container, cargo, result } = detail;
  const floor = analyzeFloorLoad(container, result, 12, 4);
  const checks = analyzeConstraints(container, cargo, result, floor);
  const loadedByCargo = new Map<string, number>();
  result.placements.forEach(p => loadedByCargo.set(p.cargoId, (loadedByCargo.get(p.cargoId) ?? 0) + 1));
  const loadSteps = buildWorkSequence(container, cargo, result, 'LOAD');
  const unloadSteps = buildWorkSequence(container, cargo, result, 'UNLOAD');
  const physicsVerified = hasCurrentPhysicsVerification();
  const securing = certification.securing;

  const summary = [
    ['항목', '값'], ['적재모드', '박스 직접 적재'],
    ['컨테이너 길이(m)', container.length], ['컨테이너 폭(m)', container.width], ['컨테이너 높이(m)', container.height],
    ['최대 적재중량(kg)', container.maxPayloadKg], ['적재 중량(kg)', result.loadedWeightKg],
    ['적재 부피(m3)', result.usedVolumeM3], ['적재 박스 수(EA)', result.placements.length],
    ['바닥 평균 하중(kg/m2)', Number(floor.averageKgPerM2.toFixed(1))], ['바닥 최대 하중(kg/m2)', Number(floor.maxKgPerM2.toFixed(1))],
    ['물리 안정성 검증', physicsVerified ? '검증 완료' : '별도 확인'],
    ['최종 관성검증', `PASS · 전체 ${(certification.maxHorizontalShiftM * 1000).toFixed(1)}mm · 기울기 ${certification.maxTiltDeg.toFixed(1)}°`],
    ['내부 최대 화물 구속력(kN)', Number(((certification.maxCargoRestraintForceN ?? 0) / 1000).toFixed(3))],
    ['보강 단계', securing.levelLabel], ['박스 제외 보조자재 중량(kg)', Number(securing.estimatedNonCargoWeightKg.toFixed(2))],
  ];
  const cargoRows = cargo.map(item => ({ 코드: item.id, 품명: item.name, 요청수량: item.quantity, 적재수량: loadedByCargo.get(item.id) ?? 0, 잔량: Math.max(0, item.quantity - (loadedByCargo.get(item.id) ?? 0)), 길이_m: item.length, 폭_m: item.width, 높이_m: item.height, 개당중량_kg: item.weightKg, 최대적층단: item.maxStackLayers ?? '', 상부허용중량_kg: item.maxTopLoadKg ?? '', 회전허용: item.allowRotation !== false ? 'Y' : 'N', 하역순서: item.unloadPriority ?? '' }));
  const placementRows = result.placements.map((p, index) => ({ No: index + 1, 코드: p.cargoId, X_m: p.x, Y_m: p.y, Z_m: p.z, 길이_m: p.length, 폭_m: p.width, 높이_m: p.height, 중량_kg: p.weightKg, 회전: p.rotated ? '90도' : '기본' }));
  const remainingRows = result.remaining.map(item => ({ 코드: item.cargoId, 수량: item.quantity, 사유: item.reason }));
  const correctionRows = (result.autoCorrections ?? []).map(item => ({ 보정: item.label, 코드: item.cargoId ?? '', 내용: item.description, 이동전: item.from ? `${item.from.x.toFixed(2)},${item.from.y.toFixed(2)},${item.from.z.toFixed(2)}` : '', 이동후: item.to ? `${item.to.x.toFixed(2)},${item.to.y.toFixed(2)},${item.to.z.toFixed(2)}` : '', 점수전: item.beforeScore ?? '', 점수후: item.afterScore ?? '' }));
  const floorRows = floor.cells.map(cell => ({ 행: cell.row + 1, 열: cell.column + 1, X_m: cell.x, Y_m: cell.y, 하중_kg: Number(cell.loadKg.toFixed(2)), 하중_kg_m2: Number(cell.kgPerM2.toFixed(2)) }));
  const checkRows = checks.map(check => ({ 제약조건: check.label, 상태: check.status === 'pass' ? '통과' : check.status === 'warn' ? '확인' : '실패', 상세: check.detail }));
  const toStepRows = (steps: ReturnType<typeof buildWorkSequence>) => steps.map(step => ({ 순서: step.step, 코드: step.cargoId, 품명: step.label, 구역: step.zone, 행: step.row, 열: step.column, 단: step.layer, X_m: step.x, Y_m: step.y, Z_m: step.z, 하역우선순위: step.unloadPriority ?? '', 작업지시: step.instruction }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), '요약');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cargoRows), '품목별');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(placementRows), '배치좌표');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(floorRows), '바닥하중');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(checkRows), '제약조건');
  appendMaterialSheet(wb, securing);
  appendInertiaMetricsSheet(wb, certification);
  appendInertiaHistorySheet(wb, certification);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(remainingRows), '미적재');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(correctionRows), '자동보정');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toStepRows(loadSteps)), '적재작업순서');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toStepRows(unloadSteps)), '하역작업순서');
  XLSX.writeFile(wb, `container-loading-box-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
}

function exportPalletWorkbook(target: CurrentTarget, snapshot: PalletSnapshot, certification: InertiaCertification) {
  const result = snapshot.result;
  const securing = certification.securing;
  const plan = buildPalletSecuringPlan(target, securing);
  const cargoById = new Map(target.cargo.map(item => [item.id, item.name]));
  const palletByIndex = new Map(result.pallets.map(pallet => [pallet.palletIndex, pallet]));
  const summary = [
    ['항목', '값'], ['적재모드', '팔레트 적재'],
    ['컨테이너', `${target.container.length} × ${target.container.width} × ${target.container.height} m`],
    ['팔레트 규격', `${snapshot.spec.length} × ${snapshot.spec.width} × ${snapshot.spec.height} m`],
    ['사용 팔레트(EA)', result.palletCount], ['바닥 위치(열)', result.optimization.floorPositions], ['적층 팔레트(EA)', result.stackedPallets], ['최대 적층단', result.maxUsedStackLevel],
    ['적재 화물(EA)', result.placements.length], ['화물 중량(kg)', Number(result.loadedCargoWeightKg.toFixed(2))], ['총 팔레트화 중량(kg)', Number(result.totalPalletizedWeightKg.toFixed(2))],
    ['좌우 편차(kg)', Number(result.lateralImbalanceKg.toFixed(2))],
    ['관성검증', `PASS · 전체 ${(certification.maxHorizontalShiftM * 1000).toFixed(1)}mm · 화물↔팔레트 ${((certification.maxCargoRelativeSlipM ?? 0) * 1000).toFixed(1)}mm · 팔레트 ${((certification.maxSupportShiftM ?? 0) * 1000).toFixed(1)}mm · ${certification.maxTiltDeg.toFixed(1)}°`],
    ['내부 최대 화물 구속력(kN)', Number(((certification.maxCargoRestraintForceN ?? 0) / 1000).toFixed(3))],
    ['내부 최대 팔레트 구속력(kN)', Number(((certification.maxSupportRestraintForceN ?? 0) / 1000).toFixed(3))],
    ['보강 단계', securing.levelLabel], ['박스 제외 보조자재 중량(kg)', Number(securing.estimatedNonCargoWeightKg.toFixed(2))],
  ];
  const pallets = [...result.pallets].sort((a, b) => a.x - b.x || a.stackColumn - b.stackColumn || a.stackLevel - b.stackLevel || a.y - b.y).map((pallet, index) => {
    const counts = new Map<string, number>();
    pallet.cargoPlacements.forEach(item => counts.set(item.cargoId, (counts.get(item.cargoId) ?? 0) + 1));
    const content = [...counts.entries()].map(([id, count]) => `${id}${cargoById.get(id) && cargoById.get(id) !== id ? `(${cargoById.get(id)})` : ''} ${count}EA`).join(' / ');
    return { 순서: index + 1, 팔레트: `P${pallet.palletIndex}`, 적층위치: `C${pallet.stackColumn}`, 단수: pallet.stackLevel, X_m: Number(pallet.x.toFixed(3)), Y_m: Number(pallet.y.toFixed(3)), Z_m: Number(pallet.z.toFixed(3)), 박스수_EA: pallet.cargoPlacements.length, 화물중량_kg: Number(pallet.cargoWeightKg.toFixed(2)), 총중량_kg: Number(pallet.totalWeightKg.toFixed(2)), 박스구성: content, 무게중심_X: Number(pallet.centerOfGravity.x.toFixed(3)), 무게중심_Y: Number(pallet.centerOfGravity.y.toFixed(3)), 무게중심_Z: Number(pallet.centerOfGravity.z.toFixed(3)) };
  });
  const boxes = result.pallets.flatMap(pallet => pallet.cargoPlacements.map((item, index) => ({ 팔레트: `P${pallet.palletIndex}`, 적층위치: `C${pallet.stackColumn}`, 단수: pallet.stackLevel, 팔레트내순번: index + 1, 코드: item.cargoId, X_m: item.x, Y_m: item.y, Z_m: item.z, 길이_m: item.length, 폭_m: item.width, 높이_m: item.height, 중량_kg: item.weightKg, 회전: item.rotated ? '90도' : '기본' })));
  const securingRows = [...plan.items].sort((a, b) => a.palletIndex - b.palletIndex).map((item, index) => {
    const pallet = palletByIndex.get(item.palletIndex);
    const steps = [
      item.antiSlipMats > 0 ? `① 미끄럼방지재 ${item.antiSlipMats}EA 설치` : '',
      `② P${item.palletIndex} ${pallet ? `C${pallet.stackColumn} ${pallet.stackLevel}단` : ''} 배치`,
      item.cornerGuards > 0 ? `③ 각대 ${item.cornerGuards}EA 설치` : '',
      item.bandingStraps > 0 ? `④ 밴딩 ${item.bandingStraps}줄 결속` : '',
      item.wrappingLengthM > 0 ? `⑤ 랩핑 ${item.wrappingLengthM.toFixed(1)}m` : '',
      '⑥ 흔들림/간섭 확인',
    ].filter(Boolean).join(' → ');
    return {
      순서: index + 1,
      팔레트: `P${item.palletIndex}`,
      적층위치: pallet ? `C${pallet.stackColumn}` : '',
      단수: pallet?.stackLevel ?? '',
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
    팔레트: '공통',
    적층위치: '',
    단수: '',
    적재높이_mm: 0,
    밴딩_줄: 0,
    밴딩길이_m: 0,
    각대_EA: 0,
    각대길이_m: 0,
    랩핑_m: 0,
    미끄럼방지_EA: 0,
    추가중량_kg: Number(plan.sharedLoadBarWeightKg.toFixed(2)),
    결속작업순서: `모든 팔레트 배치 후 고정바 ${plan.sharedLoadBars}EA 설치 → 문 닫힘 간섭 확인`,
  });
  const remaining = result.remaining.map(item => ({ 코드: item.cargoId, 수량: item.quantity, 사유: item.reason }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), '요약');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pallets), '팔레트별');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(boxes), '팔레트박스구성');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(securingRows.length ? securingRows : [{ 순서: 1, 팔레트: '추가 보강 없음', 결속작업순서: '기본 적재안으로 관성검증 통과' }]), '팔레트별결속');
  appendMaterialSheet(wb, securing);
  appendInertiaMetricsSheet(wb, certification);
  appendInertiaHistorySheet(wb, certification);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(remaining.length ? remaining : [{ 코드: '미적재 없음', 수량: 0, 사유: '' }]), '미적재');
  XLSX.writeFile(wb, `container-loading-pallet-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
}

export default function ExcelExportActions() {
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
    button.textContent = '▧ Excel 내보내기';
    button.disabled = !detail;
    const click = () => {
      const target = readPhysicsTarget();
      if (target?.mode === 'pallets') {
        const snapshot = (window as ExportWindow).__containerLoadingPalletSnapshot;
        const certification = matchingCurrentPalletCertification(snapshot);
        if (!certification || !snapshot) {
          window.alert('팔레트 Excel은 현재 팔레트 적재안이 관성 시뮬레이션 3종을 모두 통과하고 인증 좌표와 출력 좌표가 일치한 뒤 내보낼 수 있습니다.');
          return;
        }
        if (!confirmUnverifiedExport('팔레트 Excel 파일')) return;
        exportPalletWorkbook(target, snapshot, certification);
        return;
      }
      if (!detail) return;
      const certification = matchingBoxCertification(detail);
      if (!certification) {
        window.alert('Excel 결과는 현재 박스 적재안이 관성 시뮬레이션 3종을 모두 통과한 뒤 내보낼 수 있습니다.');
        return;
      }
      if (!confirmUnverifiedExport('Excel 파일')) return;
      exportBoxWorkbook(detail, certification);
    };
    button.addEventListener('click', click);
    quickRow.appendChild(button);
    return () => { button.removeEventListener('click', click); button.remove(); };
  }, [detail]);

  return null;
}
