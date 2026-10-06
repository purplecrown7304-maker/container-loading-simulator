import { useEffect, useState } from 'react';
import type { CargoItem, ContainerSpec, LimitReviewConfig, LoadingResult } from './engine/types';
import { INERTIA_CERTIFICATION_EVENT, readLatestInertiaCertification } from './inertiaCertification';
import { limitReviewMetrics } from './limitReviewPresentation';
import { resolveLimitReview } from './engine/limitReview';
import './limit-review.css';

type Props = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult; mode: string; onChange: (config?: LimitReviewConfig) => void };
type Field = { selected: boolean; value: string };
type Draft = { payload: Field; floor: Field; support: Field; displacement: Field; rotation: Field; cargo: Record<string, { layers: Field; topLoad: Field }> };
const field = (value: number | undefined, fallback: number | string): Field => ({ selected: value !== undefined, value: String(value ?? fallback) });
function draftFor(container: ContainerSpec, cargo: CargoItem[]): Draft {
  const c = container.limitReview;
  return { payload: field(c?.maxPayloadKg, container.maxPayloadKg), floor: field(c?.floorLoadLimitKgPerM2, container.floorLoadLimitKgPerM2 ?? ''),
    support: field(c?.minimumSupportRatio === undefined ? undefined : c.minimumSupportRatio * 100, 80),
    displacement: field(c?.simulation?.maxDisplacementMm, 12), rotation: field(c?.simulation?.maxRotationDeg, 1.8),
    cargo: Object.fromEntries(cargo.map(item => [item.id, { layers: field(c?.cargoLimits?.[item.id]?.maxStackLayers, item.strengthUnverified ? 1 : item.maxStackLayers ?? 1),
      topLoad: field(c?.cargoLimits?.[item.id]?.maxTopLoadKg, item.strengthUnverified ? 0 : item.maxTopLoadKg ?? 0) }])) };
}
function NumberChoice({ label, original, unit, choice, onChange, min = 0, max = 10_000_000, step = 'any' }: {
  label: string; original: string; unit: string; choice: Field; onChange: (field: Field) => void; min?: number; max?: number; step?: string;
}) {
  return <div className="limit-review-choice">
    <label><input type="checkbox" checked={choice.selected} onChange={e => onChange({ ...choice, selected: e.target.checked })} />{label}</label>
    <span>원 기준 {original} {unit}</span>
    <label className="limit-review-value">검토 범위<input aria-label={`${label} 검토 범위`} type="number" min={min} max={max} step={step} disabled={!choice.selected} value={choice.value} onChange={e => onChange({ ...choice, value: e.target.value })} /><span>{unit}</span></label>
  </div>;
}

export default function LimitReviewControls({ container, cargo, result, mode, onChange }: Props) {
  const [draft, setDraft] = useState(() => draftFor(container, cargo));
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const configKey = JSON.stringify({ container, cargo });
  useEffect(() => { setDraft(draftFor(container, cargo)); setError(''); setEditing(false); }, [configKey]);
  const active = container.limitReview?.mode === 'what-if';
  const supported = mode === 'boxes' && !container.rules;
  const update = (key: Exclude<keyof Draft, 'cargo'>, value: Field) => { setDraft(d => ({ ...d, [key]: value })); setEditing(true); setError(''); };
  const updateCargo = (id: string, key: 'layers' | 'topLoad', value: Field) => { setDraft(d => ({ ...d, cargo: { ...d.cargo, [id]: { ...d.cargo[id], [key]: value } } })); setEditing(true); setError(''); };
  const apply = () => {
    const config: LimitReviewConfig = { mode: 'what-if' };
    const errors: string[] = [];
    const number = (f: Field, label: string, min: number, max: number, integer = false) => {
      if (!f.selected) return undefined;
      const n = f.value.trim() ? Number(f.value) : NaN;
      if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) errors.push(`${label}: ${min}~${max}${integer ? '의 정수' : ' 범위의 수'}를 입력하세요.`);
      return n;
    };
    config.maxPayloadKg = number(draft.payload, '총 적재중량', container.maxPayloadKg, 10_000_000);
    config.floorLoadLimitKgPerM2 = number(draft.floor, '바닥하중', container.floorLoadLimitKgPerM2 ?? 0.001, 10_000_000);
    const support = number(draft.support, '최소 지지율', 0.001, 80); if (support !== undefined) config.minimumSupportRatio = support / 100;
    const displacement = number(draft.displacement, '수평 이동', 12, 1_000_000);
    const rotation = number(draft.rotation, '기울기', 1.8, 180);
    if (displacement !== undefined || rotation !== undefined) config.simulation = { maxDisplacementMm: displacement, maxRotationDeg: rotation };
    for (const item of cargo) {
      const row = draft.cargo[item.id]; if (!row) continue;
      const maxStackLayers = number(row.layers, `${item.id} 적층단`, item.strengthUnverified ? 1 : item.maxStackLayers ?? 1, 10_000, true);
      const maxTopLoadKg = number(row.topLoad, `${item.id} 상부하중`, item.strengthUnverified ? 0 : item.maxTopLoadKg ?? 0, 10_000_000);
      if (maxStackLayers !== undefined || maxTopLoadKg !== undefined) (config.cargoLimits ??= {})[item.id] = { maxStackLayers, maxTopLoadKg };
    }
    if (errors.length) { setError(errors.join(' ')); return; }
    // Match saved JSON identity: unselected options must be absent, never own undefined keys.
    const selected = JSON.parse(JSON.stringify(config)) as LimitReviewConfig;
    const resolved = resolveLimitReview({ ...container, limitReview: selected }, cargo);
    if (resolved.status !== 'active') { setError(resolved.errors.join(' ')); return; }
    onChange(selected); setEditing(false); setError('');
  };
  return <section className={`limit-review-controls${active ? ' is-review' : ''}`} aria-label="한도 초과 검토 설정">
    <div className="limit-review-heading"><strong>{active ? 'WHAT-IF REVIEW · 한도 초과 검토' : '기본 엄격 모드'}</strong>
      <span>{active ? '검토 전용 · 출고 승인 불가' : '등록 한도와 기존 규칙을 그대로 적용합니다'}</span>
      {active ? <button type="button" onClick={() => onChange(undefined)}>엄격 모드로 전환</button> : <button type="button" disabled={!supported} onClick={() => onChange({ mode: 'what-if' })}>한도 초과 범위 선택</button>}
    </div>
    {!supported && <p role={active ? 'alert' : undefined}>한도 초과 검토는 기존 규칙의 박스 직접 적재에서 지원합니다. A 규칙·팔레트·혼합은 엄격 모드로 계산하세요.</p>}
    {active && <>
      <p className="limit-review-persistent-warning">선택한 수치 범위 안에서만 초과 계산합니다. 실제 정격·등록 한도와 초과 경고는 유지되며, 이 결과는 실제 운송 안전 인증이나 출고 승인이 아닙니다. 대표 장비값과 미확인 포장 강도는 현장 확인이 필요합니다.</p>
      <details><summary>검토 범위 선택 및 변경{editing ? ' · 미적용 변경 있음' : ''}</summary>
        <p>확인란을 선택한 항목만 변경합니다. 최초 값은 원 기준과 같습니다. 계산 상한은 입력 오류를 막는 범위이며 안전 여유를 뜻하지 않습니다. 변경 후 다시 적재해야 합니다.</p>
        <fieldset disabled={!supported}><legend>적재 수치 한도</legend>
          <NumberChoice label="총 적재중량(고정재 포함)" original={String(container.maxPayloadKg)} unit="kg" choice={draft.payload} min={container.maxPayloadKg} onChange={f => update('payload', f)} />
          <NumberChoice label="바닥하중" original={String(container.floorLoadLimitKgPerM2 ?? '미등록 · 근거 미확인')} unit="kg/m²" choice={draft.floor} min={container.floorLoadLimitKgPerM2 ?? 0.001} onChange={f => update('floor', f)} />
          <NumberChoice label="최소 지지율" original="80" unit="%" choice={draft.support} min={0.001} max={80} onChange={f => update('support', f)} />
          <small>경계·충돌·실제 지지 접촉·지지영역 안의 무게중심·유효 입력·하역 경로는 면제되지 않습니다.</small>
        </fieldset>
        <fieldset disabled={!supported}><legend>품목별 적층 / 상부하중</legend>
          {cargo.map(item => <div className="limit-review-cargo" key={item.id}><b>{item.id} · {item.name}{item.strengthUnverified ? ' · 강도 미확인' : ''}</b>
            <NumberChoice label={`${item.id} 적층단`} original={item.strengthUnverified ? '1 (강도 미확인)' : String(item.maxStackLayers ?? '미등록')} unit="단" choice={draft.cargo[item.id]?.layers ?? field(undefined, 1)} min={item.strengthUnverified ? 1 : item.maxStackLayers ?? 1} max={10_000} step="1" onChange={f => updateCargo(item.id, 'layers', f)} />
            <NumberChoice label={`${item.id} 상부하중`} original={item.strengthUnverified ? '0 (강도 미확인)' : String(item.maxTopLoadKg ?? '미등록')} unit="kg" choice={draft.cargo[item.id]?.topLoad ?? field(undefined, 0)} min={item.strengthUnverified ? 0 : item.maxTopLoadKg ?? 0} onChange={f => updateCargo(item.id, 'topLoad', f)} />
          </div>)}
        </fieldset>
        <fieldset disabled={!supported}><legend>내부 시뮬레이션 비교선</legend>
          <p>이동·기울기는 앱의 비교 기준입니다. 실제 장비 정격과 다르며, 범위를 바꿔도 원 기준의 미달 기록과 검토 전용 상태가 유지됩니다.</p>
          <NumberChoice label="수평 이동" original="12" unit="mm" choice={draft.displacement} min={12} max={1_000_000} onChange={f => update('displacement', f)} />
          <NumberChoice label="기울기" original="1.8" unit="°" choice={draft.rotation} min={1.8} max={180} onChange={f => update('rotation', f)} />
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <div className="limit-review-actions"><button type="button" disabled={!supported} onClick={apply}>검토 범위 적용</button><button type="button" onClick={() => { setDraft(draftFor(container, cargo)); setEditing(false); setError(''); }}>변경 취소</button></div>
      </details>
      {result.limitReview?.errors.length ? <p role="alert">{result.limitReview.errors.join(' ')}</p> : null}
    </>}
  </section>;
}

export function LimitReviewBanner({ container, result, cargo }: Pick<Props, 'container' | 'result'> & { cargo?: CargoItem[] }) {
  const [certification, setCertification] = useState(readLatestInertiaCertification);
  useEffect(() => { const refresh = () => setCertification(readLatestInertiaCertification()); window.addEventListener(INERTIA_CERTIFICATION_EVENT, refresh); return () => window.removeEventListener(INERTIA_CERTIFICATION_EVENT, refresh); }, []);
  if (container.limitReview?.mode !== 'what-if') return null;
  const metrics = cargo ? limitReviewMetrics({ container, cargo, result, mode: 'boxes' }, certification) : result.limitReview?.metrics ?? [];
  return <section className="limit-review-result-banner" aria-label="검토 전용 적재 경고" role="status">
    <strong>WHAT-IF REVIEW · 검토 전용 · 출고 승인 불가</strong>
    <span>원 기준 초과 경고는 창을 닫거나 저장해도 유지됩니다. 장비 정격 및 포장 강도의 확인 상태는 별도입니다.</span>
    {metrics.length > 0 && <details><summary>원 기준 / 선택 범위 / 실제 계산값 / 초과량</summary><ul>{metrics.map((metric, index) => <li key={`${metric.key}-${metric.cargoId ?? ''}-${index}`}>
      {metric.cargoId ? `${metric.cargoId} · ` : ''}{({payload:'총중량','floor-load':'바닥하중',support:'최소 지지율','stack-layers':'적층단','top-load':'상부하중',displacement:'내부 수평 이동',rotation:'내부 기울기'})[metric.key]}:
      {' '}원 기준 {metric.originalLimit ?? '미확인'} / 선택 {metric.scenarioLimit} / 실제 {Number(metric.actual.toFixed(3))} {metric.unit}
      {' '}· 초과 {metric.excess === null ? '산정 불가' : `${Number(metric.excess.toFixed(3))} ${metric.unit}${metric.excessPercent === null ? ' (비율 산정 불가)' : ` (${metric.excessPercent.toFixed(2)}%)`}`}
      {metric.provenance === 'unknown' || metric.provenance === 'unverified' ? ' · 한도 근거 미확인' : metric.provenance === 'app-default' ? ' · 앱 기본 비교값' : ' · 등록값, 실제 정격 확인 필요'}
    </li>)}</ul></details>}
  </section>;
}
