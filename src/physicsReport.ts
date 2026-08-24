import type { PhysicsScenario, PhysicsValidationSuite } from './engine/physicsValidation';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const scenarioLabel = (scenario: PhysicsScenario) => scenario === 'settle' ? '정적 중력' : scenario === 'braking' ? '급제동 0.5g' : '횡가속 0.35g';
const mm = (value: number) => `${(value * 1000).toFixed(value * 1000 >= 10 ? 0 : 1)} mm`;

export function buildPhysicsReportHtml(container: ContainerSpec, cargo: CargoItem[], loading: LoadingResult, physics: PhysicsValidationSuite) {
  const cargoMap = new Map(cargo.map(item => [item.id, item]));
  const issues = physics.placements.filter(item => item.severity !== 'stable').slice(0, 100);
  const supportIssues = physics.supports.filter(item => item.severity !== 'stable').slice(0, 100);
  const scenarioRows = physics.scenarios.map(row => `<tr><td>${scenarioLabel(row.scenario)}</td><td>${row.score}</td><td>${row.stableCount}</td><td>${row.warningCount}</td><td>${row.unstableCount}</td><td>${row.supportWarningCount}</td><td>${row.supportUnstableCount}</td><td>${mm(row.maxHorizontalShiftM)}</td><td>${row.maxTiltDeg.toFixed(1)}°</td></tr>`).join('');
  const issueRows = issues.map(item => {
    const placement = loading.placements[item.index];
    const spec = cargoMap.get(item.cargoId);
    return `<tr><td>${item.index + 1}</td><td>${escapeHtml(item.cargoId)}</td><td>${escapeHtml(spec?.name ?? item.cargoId)}</td><td>${item.severity === 'unstable' ? '불안정' : '주의'}</td><td>${mm(item.horizontalShiftM)}</td><td>${mm(Math.abs(item.verticalShiftM))}</td><td>${item.tiltDeg.toFixed(1)}°</td><td>${escapeHtml(item.reason)}</td><td>${placement ? `${placement.x.toFixed(2)}, ${placement.y.toFixed(2)}, ${placement.z.toFixed(2)}` : '-'}</td></tr>`;
  }).join('');
  const supportRows = supportIssues.map(item => `<tr><td>${escapeHtml(item.id)}</td><td>${item.severity === 'unstable' ? '불안정' : '주의'}</td><td>${mm(item.horizontalShiftM)}</td><td>${mm(Math.abs(item.verticalShiftM))}</td><td>${item.tiltDeg.toFixed(1)}°</td><td>${escapeHtml(item.reason)}</td></tr>`).join('');

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>컨테이너 물리 안정성 검증 리포트</title><style>
  *{box-sizing:border-box}body{font-family:Arial,'Noto Sans KR',sans-serif;margin:30px;color:#172033;font-size:12px}h1{font-size:24px;margin:0 0 6px}h2{font-size:16px;margin:24px 0 8px}p{color:#526477}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0}.card{border:1px solid #cbd8e6;border-radius:8px;padding:10px}.card span{display:block;color:#66788b;font-size:10px}.card b{display:block;font-size:16px;margin-top:4px}table{border-collapse:collapse;width:100%;font-size:10px}th,td{border:1px solid #cfd9e4;padding:6px;text-align:left}th{background:#edf3f9}.note{margin-top:20px;padding:10px;border:1px solid #d7e0ea;background:#f7fafc;font-size:10px;line-height:1.55}@media print{body{margin:12mm}.no-print{display:none}}</style></head><body>
  <h1>컨테이너 물리 안정성 검증 리포트</h1><p>Rapier 3D deterministic · 정적 중력 / 급제동 / 횡가속 종합검증</p>
  <div class="grid"><div class="card"><span>종합점수</span><b>${physics.score}/100</b></div><div class="card"><span>최악 조건</span><b>${scenarioLabel(physics.worstScenario)}</b></div><div class="card"><span>적재 박스</span><b>${loading.placements.length.toLocaleString()} EA</b></div><div class="card"><span>팔레트/지지체</span><b>${physics.supports.length.toLocaleString()} EA</b></div><div class="card"><span>적재중량</span><b>${loading.loadedWeightKg.toLocaleString()} kg</b></div><div class="card"><span>최대 수평 이동</span><b>${mm(physics.maxHorizontalShiftM)}</b></div><div class="card"><span>최대 기울기</span><b>${physics.maxTiltDeg.toFixed(1)}°</b></div><div class="card"><span>불안정 박스 / 팔레트</span><b>${physics.unstableCount} / ${physics.supportUnstableCount}</b></div></div>
  <h2>시나리오별 결과</h2><table><thead><tr><th>조건</th><th>점수</th><th>박스 안정</th><th>박스 주의</th><th>박스 불안정</th><th>팔레트 주의</th><th>팔레트 불안정</th><th>최대 수평 이동</th><th>최대 기울기</th></tr></thead><tbody>${scenarioRows}</tbody></table>
  <h2>박스 재확인 위치</h2>${issues.length ? `<table><thead><tr><th>#</th><th>코드</th><th>품목</th><th>판정</th><th>수평 이동</th><th>높이 변화</th><th>기울기</th><th>사유</th><th>XYZ(m)</th></tr></thead><tbody>${issueRows}</tbody></table>` : '<p>주의 또는 불안정 박스가 없습니다.</p>'}
  ${physics.supports.length ? `<h2>팔레트/지지체 재확인</h2>${supportIssues.length ? `<table><thead><tr><th>지지체</th><th>판정</th><th>수평 이동</th><th>높이 변화</th><th>기울기</th><th>사유</th></tr></thead><tbody>${supportRows}</tbody></table>` : '<p>주의 또는 불안정 팔레트가 없습니다.</p>'}` : ''}
  <div class="note">본 결과는 적재안 비교와 위험 위치 탐색을 위한 보조 시뮬레이션입니다. 실제 운송 안전 판정에는 박스 압축강도, 팔레트/고정장치, 실제 마찰계수, 차량 가감속, 진동, 도로조건 및 관련 법규·사내 기준을 별도로 적용해야 합니다.</div>
  <p class="no-print"><button onclick="window.print()">인쇄 / PDF 저장</button></p></body></html>`;
}

export function openPhysicsReport(container: ContainerSpec, cargo: CargoItem[], loading: LoadingResult, physics: PhysicsValidationSuite) {
  const popup = window.open('', '_blank');
  if (!popup) return false;
  try { popup.opener = null; } catch { /* 일부 브라우저는 opener 변경을 제한할 수 있음 */ }
  popup.document.open(); popup.document.write(buildPhysicsReportHtml(container, cargo, loading, physics)); popup.document.close();
  return true;
}
