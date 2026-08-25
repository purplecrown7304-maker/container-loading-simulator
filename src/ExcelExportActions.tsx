import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { analyzeConstraints } from './engine/constraintAnalysis';
import { analyzeFloorLoad } from './engine/floorLoad';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import { buildWorkSequence } from './engine/workSequence';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { confirmUnverifiedExport, hasCurrentPhysicsVerification } from './exportVerification';
import { createPhysicsTargetSignature, readLatestInertiaCertification, type InertiaCertification } from './inertiaCertification';

type Detail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type ExportWindow = Window & { __containerLoadingLatestResult?: Detail };

function matchingCertification(detail: Detail): InertiaCertification | undefined {
  const certification = readLatestInertiaCertification();
  if (!certification || certification.status !== 'passed' || certification.mode !== 'boxes') return undefined;
  const signature = createPhysicsTargetSignature({ mode: 'boxes', container: detail.container, cargo: detail.cargo, result: detail.result });
  return certification.targetSignature === signature ? certification : undefined;
}

function exportWorkbook(detail: Detail, certification: InertiaCertification) {
  const { container, cargo, result } = detail;
  const floor = analyzeFloorLoad(container, result, 12, 4);
  const checks = analyzeConstraints(container, cargo, result, floor);
  const loadedByCargo = new Map<string, number>();
  result.placements.forEach(p => loadedByCargo.set(p.cargoId, (loadedByCargo.get(p.cargoId) ?? 0) + 1));
  const loadSteps = buildWorkSequence(container,cargo,result,'LOAD');
  const unloadSteps = buildWorkSequence(container,cargo,result,'UNLOAD');
  const physicsVerified = hasCurrentPhysicsVerification();
  const securing = certification.securing;

  const summary = [
    ['항목', '값'],
    ['컨테이너 길이(m)', container.length], ['컨테이너 폭(m)', container.width], ['컨테이너 높이(m)', container.height],
    ['최대 적재중량(kg)', container.maxPayloadKg], ['적재 중량(kg)', result.loadedWeightKg],
    ['적재 부피(m3)', result.usedVolumeM3], ['적재 박스 수(EA)', result.placements.length],
    ['바닥 평균 하중(kg/m2)', Number(floor.averageKgPerM2.toFixed(1))], ['바닥 최대 하중(kg/m2)', Number(floor.maxKgPerM2.toFixed(1))],
    ['바닥 하중 경고 기준(kg/m2)', container.floorLoadLimitKgPerM2 ?? 1500],
    ['물리 안정성 검증', physicsVerified ? '검증 완료' : '미검증 - 현장 사용 전 반드시 검증'],
    ['최종 관성검증', `통과 · 최대 이동 ${(certification.maxHorizontalShiftM * 1000).toFixed(1)}mm · 최대 기울기 ${certification.maxTiltDeg.toFixed(1)}°`],
    ['보강 단계', securing.levelLabel],
    ['박스 제외 보조자재 중량(kg)', Number(securing.estimatedNonCargoWeightKg.toFixed(2))],
    ['추가 보강재 중량(kg)', Number(securing.estimatedAddedWeightKg.toFixed(2))],
  ];
  const cargoRows = cargo.map(item => ({
    코드: item.id, 품명: item.name, 요청수량: item.quantity, 적재수량: loadedByCargo.get(item.id) ?? 0,
    잔량: Math.max(0, item.quantity - (loadedByCargo.get(item.id) ?? 0)), 길이_m: item.length, 폭_m: item.width,
    높이_m: item.height, 개당중량_kg: item.weightKg, 최대적층단: item.maxStackLayers ?? '', 상부허용중량_kg: item.maxTopLoadKg ?? '', 회전허용: item.allowRotation !== false ? 'Y' : 'N', 하역순서: item.unloadPriority ?? '',
  }));
  const placementRows = result.placements.map((p, index) => ({
    No: index + 1, 코드: p.cargoId, X_m: p.x, Y_m: p.y, Z_m: p.z, 길이_m: p.length, 폭_m: p.width, 높이_m: p.height, 중량_kg: p.weightKg, 회전: p.rotated ? '90도' : '기본',
  }));
  const remainingRows = result.remaining.map(item => ({ 코드: item.cargoId, 수량: item.quantity, 사유: item.reason }));
  const correctionRows = (result.autoCorrections ?? []).map(item => ({
    보정: item.label, 코드: item.cargoId ?? '', 내용: item.description,
    이동전: item.from ? `${item.from.x.toFixed(2)},${item.from.y.toFixed(2)},${item.from.z.toFixed(2)}` : '',
    이동후: item.to ? `${item.to.x.toFixed(2)},${item.to.y.toFixed(2)},${item.to.z.toFixed(2)}` : '',
    점수전: item.beforeScore ?? '', 점수후: item.afterScore ?? '',
  }));
  const floorRows = floor.cells.map(cell => ({ 행: cell.row + 1, 열: cell.column + 1, X_m: cell.x, Y_m: cell.y, 하중_kg: Number(cell.loadKg.toFixed(2)), 하중_kg_m2: Number(cell.kgPerM2.toFixed(2)) }));
  const checkRows = checks.map(check => ({ 제약조건: check.label, 상태: check.status === 'pass' ? '통과' : check.status === 'warn' ? '확인' : '실패', 상세: check.detail }));
  const toStepRows = (steps: ReturnType<typeof buildWorkSequence>) => steps.map(step => ({
    순서:step.step, 코드:step.cargoId, 품명:step.label, 구역:step.zone, 행:step.row, 열:step.column, 단:step.layer,
    X_m:step.x, Y_m:step.y, Z_m:step.z, 하역우선순위:step.unloadPriority ?? '', 작업지시:step.instruction,
  }));
  const materialRows = [
    securing.palletCount > 0 ? { 자재: '팔레트', 수량: securing.palletCount, 단위: 'EA', 길이_m: '', 중량_kg: Number(securing.palletWeightKg.toFixed(2)), 비고: '팔레트/기존 포장 중량' } : null,
    securing.bandingStraps > 0 ? { 자재: '밴딩', 수량: securing.bandingStraps, 단위: '줄', 길이_m: Number(securing.bandingLengthM.toFixed(2)), 중량_kg: Number((securing.bandingLengthM * 0.025).toFixed(2)), 비고: '적재 규격/높이 기반 계산' } : null,
    securing.cornerGuards > 0 ? { 자재: '각대', 수량: securing.cornerGuards, 단위: 'EA', 길이_m: Number(securing.cornerGuardLengthM.toFixed(2)), 중량_kg: Number((securing.cornerGuardLengthM * 0.12).toFixed(2)), 비고: '총 세로 길이' } : null,
    securing.wrappingLengthM > 0 ? { 자재: '랩핑 필름', 수량: 1, 단위: '작업', 길이_m: Number(securing.wrappingLengthM.toFixed(2)), 중량_kg: Number((securing.wrappingLengthM * 0.018).toFixed(2)), 비고: '50% 겹침 기준 추정' } : null,
    securing.antiSlipMats > 0 ? { 자재: '미끄럼방지재', 수량: securing.antiSlipMats, 단위: 'EA', 길이_m: '', 중량_kg: Number((securing.antiSlipMats * 0.35).toFixed(2)), 비고: '바닥/접촉면' } : null,
    securing.dunnageBlocks > 0 ? { 자재: '블로킹재', 수량: securing.dunnageBlocks, 단위: 'EA', 길이_m: '', 중량_kg: Number((securing.dunnageBlocks * 0.75).toFixed(2)), 비고: '빈 공간 이동 억제' } : null,
    securing.loadBars > 0 ? { 자재: '고정바', 수량: securing.loadBars, 단위: 'EA', 길이_m: '', 중량_kg: Number((securing.loadBars * 4.5).toFixed(2)), 비고: '길이 방향 블로킹' } : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), '요약');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cargoRows), '품목별');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(placementRows), '배치좌표');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(floorRows), '바닥하중');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(checkRows), '제약조건');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(materialRows.length ? materialRows : [{ 자재: '추가 보조자재 없음', 수량: 0, 단위: '', 길이_m: '', 중량_kg: 0, 비고: '' }]), '보조자재');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(remainingRows), '미적재');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(correctionRows), '자동보정');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toStepRows(loadSteps)), '적재작업순서');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toStepRows(unloadSteps)), '하역작업순서');
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `container-loading-${stamp}.xlsx`, { compression: true });
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
      if (!detail) return;
      const certification = matchingCertification(detail);
      if (!certification) {
        window.alert('Excel 결과는 현재 적재안이 출발 가속·급정거·급회전 관성 시뮬레이션 3종을 모두 통과한 뒤 내보낼 수 있습니다. 먼저 결과 보기를 실행해 최종 관성검증을 완료하세요.');
        return;
      }
      if (!confirmUnverifiedExport('Excel 파일')) return;
      exportWorkbook(detail, certification);
    };
    button.addEventListener('click', click);
    quickRow.appendChild(button);
    return () => { button.removeEventListener('click', click); button.remove(); };
  }, [detail]);
  return null;
}
