import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PALLET_CATALOG, palletMaterialLabel, type PalletType } from './engine/palletCatalog';
import { recommendPalletsAsync } from './engine/palletRecommendationAsync';
import type { PalletTypeEvaluation } from './engine/palletRecommendation';
import { LOADING_STRATEGY_PREFERENCE_EVENT, readLoadingStrategyPreference } from './loadingStrategyPreference';
import { readStoredState, STORAGE_UPDATED_EVENT, type StoredState } from './storage';
import {
  AUTO_PALLET_TYPE,
  choosePalletType,
  finishPalletRecommendation,
  readPalletTypeSelection,
  recordPalletEvaluation,
  resolvePalletType,
  startPalletRecommendation,
  usePalletTypeSelection,
} from './palletTypeSelection';

let inFlight: string | null = null;
// Columns grouped by material: wood first, then plastic.
const groups = (['wood', 'plastic'] as const).map(material => ({ material, types: PALLET_CATALOG.filter(type => type.material === material) }));
const kg = (value: number) => Math.round(value).toLocaleString();

function signatureOf(state: StoredState | null, strategy: string) {
  if (!state) return null;
  const cargo = state.cargo.filter(item => item.quantity > 0)
    .map(item => [item.id, item.quantity, item.length, item.width, item.height, item.weightKg, item.maxStackLayers ?? null, item.maxTopLoadKg ?? null, item.allowRotation !== false]);
  if (!cargo.length) return null;
  return JSON.stringify([state.container, cargo, strategy]);
}

function outcome(evaluation: PalletTypeEvaluation | undefined) {
  if (!evaluation) return <small className="pending">계산 중…</small>;
  if (!evaluation.fits) return <small className="warn">적재공간 바닥에 맞지 않음</small>;
  const left = evaluation.requestedUnits - evaluation.loadedUnits;
  return (
    <small className={left > 0 ? 'warn' : ''}>
      {evaluation.palletCount}장 · {evaluation.maxTiers}단 · {left > 0 ? `${left.toLocaleString()}개 미적재` : '전량 적재'}
    </small>
  );
}

/** Pallet product choice shown in step 4 when the operator picks pallet loading. */
export default function GuidedPalletTypePicker() {
  const selection = usePalletTypeSelection();
  const [stored, setStored] = useState(() => readStoredState());
  const [strategy, setStrategy] = useState(() => readLoadingStrategyPreference() ?? 'capacity');

  useEffect(() => {
    const onStorage = (event: Event) => setStored((event as CustomEvent<StoredState>).detail ?? readStoredState());
    const onStrategy = () => setStrategy(readLoadingStrategyPreference() ?? 'capacity');
    window.addEventListener(STORAGE_UPDATED_EVENT, onStorage);
    window.addEventListener(LOADING_STRATEGY_PREFERENCE_EVENT, onStrategy);
    return () => {
      window.removeEventListener(STORAGE_UPDATED_EVENT, onStorage);
      window.removeEventListener(LOADING_STRATEGY_PREFERENCE_EVENT, onStrategy);
    };
  }, []);

  const signature = useMemo(() => signatureOf(stored, strategy), [stored, strategy]);

  useEffect(() => {
    if (!signature || !stored) return;
    const current = readPalletTypeSelection();
    if (current.signature === signature && (current.status === 'done' || inFlight === signature)) return;
    // Not aborted on unmount: re-renders must not restart or strand the calculation, and
    // results for other cargo are ignored by signature in the store.
    inFlight = signature;
    startPalletRecommendation(signature);
    recommendPalletsAsync(stored.container, stored.cargo.filter(item => item.quantity > 0), strategy,
      evaluation => recordPalletEvaluation(signature, evaluation))
      .then(result => finishPalletRecommendation(signature, result.recommendedId))
      .catch(() => finishPalletRecommendation(signature, null, true))
      .finally(() => { if (inFlight === signature) inFlight = null; });
  }, [signature, stored, strategy]);

  const byId = new Map(selection.evaluations.map(e => [e.typeId, e]));
  const recommended = PALLET_CATALOG.find(type => type.id === selection.recommendedId) ?? null;
  const active = resolvePalletType(selection);
  const auto = selection.selected === AUTO_PALLET_TYPE;
  const running = selection.status === 'running' && selection.signature === signature;
  const rowClass = (id: string) => [active.id === id ? 'selected' : '', id === selection.recommendedId ? 'recommended' : ''].join(' ').trim();
  const fields: Array<{ label: string; numeric?: boolean; value: (type: PalletType) => ReactNode }> = [
    { label: '규격 (L×W×T mm)', numeric: true, value: type => `${Math.round(type.length * 1000)}×${Math.round(type.width * 1000)}×${Math.round(type.height * 1000)}` },
    { label: '자체중량', numeric: true, value: type => `${type.tareWeightKg.toLocaleString()} kg` },
    { label: '동하중', numeric: true, value: type => `${kg(type.maxLoadKg)} kg` },
    { label: '정하중', numeric: true, value: type => type.staticLoadKg !== null ? `${kg(type.staticLoadKg)} kg` : '—' },
    { label: '예상 결과', value: type => outcome(byId.get(type.id)) },
  ];

  return (
    <div className="guided-pallet-type-picker" aria-label="파렛트 선택">
      <div className="guided-pallet-type-heading">
        <div>
          <b>사용할 파렛트</b>
          <span>
            {running ? '화물로 파렛트별 적재를 계산해 추천하는 중입니다.'
              : recommended ? `추천: ${recommended.name} · 적재 수량, 파렛트 수, 파렛트 자중 순으로 비교했습니다.`
              : '포장이 확정되면 화물에 맞는 파렛트를 추천합니다.'}
          </span>
        </div>
        <button type="button" role="radio" aria-checked={auto} className={auto ? 'selected' : ''} onClick={() => choosePalletType(AUTO_PALLET_TYPE)}>
          추천 자동 적용
        </button>
      </div>
      <div className="guided-pallet-type-table-wrap">
        <table className="guided-pallet-type-table" aria-label="파렛트 종류 비교">
          <thead>
            <tr>
              <th scope="col" className="material-head">재질</th>
              <th scope="col">이름</th>
              {fields.map(field => <th key={field.label} scope="col" className={field.numeric ? 'num' : ''}>{field.label}</th>)}
            </tr>
          </thead>
          {groups.map(group => (
            <tbody key={group.material} role="radiogroup" aria-label={`${palletMaterialLabel(group.material)} 파렛트`}>
              {group.types.map((type, index) => (
                <tr key={type.id} className={rowClass(type.id)} onClick={() => choosePalletType(type.id)}>
                  {index === 0 && (
                    <th scope="rowgroup" rowSpan={group.types.length} className={`material-head ${group.material}`}>
                      {palletMaterialLabel(group.material)}
                    </th>
                  )}
                  <td className="name">
                    <button type="button" role="radio" aria-checked={active.id === type.id} onClick={event => { event.stopPropagation(); choosePalletType(type.id); }}>
                      <b>{type.name}</b>
                      {type.id === selection.recommendedId && <em>추천</em>}
                    </button>
                  </td>
                  {fields.map(field => <td key={field.label} className={field.numeric ? 'num' : ''}>{field.value(type)}</td>)}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="guided-pallet-type-note">
        선택: {active.name} · {active.standard} · {active.forkEntry}방향 포크 · {active.note} 동하중을 적재 한도로 씁니다. 값은 규격별 대략치라 실제 제조사 사양과 다르면 결과 화면의 파렛트 설정에서 수정하세요.
      </p>
    </div>
  );
}
