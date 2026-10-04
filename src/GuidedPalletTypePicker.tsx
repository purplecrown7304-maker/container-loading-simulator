import { useEffect, useState, type ReactNode } from 'react';
import { PALLET_CATALOG, palletMaterialLabel, type PalletType } from './engine/palletCatalog';
import { palletDestinationFit } from './engine/palletDestination';
import { recommendPalletsAsync } from './engine/palletRecommendationAsync';
import type { PalletTypeEvaluation } from './engine/palletRecommendation';
import type { LoadingStrategy } from './engine/loadingEngine';
import type { StoredState } from './storage';
import { palletRecommendationSignature } from './palletRecommendationInput';
import { palletJobSpec, readPalletJobSpecs, usePalletJobSpecs } from './palletJobSpecs';
import CargoStackRestrictionNotice from './CargoStackRestrictionNotice';
import { AUTO_PALLET_TYPE, cancelPalletRecommendation, choosePalletType, finishPalletRecommendation,
  readPalletTypeSelection, recordPalletEvaluation, resolvePalletType, startPalletRecommendation, usePalletTypeSelection } from './palletTypeSelection';

const groups = (['wood', 'plastic'] as const).map(material => ({ material, types: PALLET_CATALOG.filter(type => type.material === material) }));
const kg = (value: number) => value.toLocaleString();

/** Counts use the real pallet engine; input changes/unmount terminate obsolete work. */
export default function GuidedPalletTypePicker({ input, strategy, active = true, mode = 'pallets' }: { input: StoredState; strategy: LoadingStrategy; active?: boolean; mode?: 'pallets' | 'mixed' }) {
  const selection = usePalletTypeSelection();
  const jobSpecs = usePalletJobSpecs();
  const spec = (type:PalletType) => palletJobSpec(type,jobSpecs);
  const [retry, setRetry] = useState(0);
  const signature = palletRecommendationSignature(input, strategy, mode);
  useEffect(() => {
    if (!active || !signature) return;
    const current = readPalletTypeSelection();
    if (current.signature === signature && current.status === 'done') return;
    const controller = new AbortController();
    startPalletRecommendation(signature);
    // Capture input values without restarting for referentially new render props.
    const [container, cargo] = JSON.parse(signature) as [StoredState['container'], StoredState['cargo']];
    recommendPalletsAsync(container, cargo, strategy,
      evaluation => { if (!controller.signal.aborted) recordPalletEvaluation(signature, evaluation); }, controller.signal, mode, readPalletJobSpecs())
      .then(result => { if (!controller.signal.aborted) finishPalletRecommendation(signature, result.recommendedId); })
      .catch(() => { if (!controller.signal.aborted) finishPalletRecommendation(signature, null, true); });
    return () => { controller.abort(); cancelPalletRecommendation(signature); };
  }, [signature, strategy, mode, active, retry]);

  const current = selection.signature === signature;
  const byId = new Map((current ? selection.evaluations : []).map(e => [e.typeId, e]));
  const recommended = current ? PALLET_CATALOG.find(type => type.id === selection.recommendedId) : undefined;
  const selected = resolvePalletType({ ...selection, recommendedId: recommended?.id ?? null });
  const auto = selection.selected === AUTO_PALLET_TYPE;
  const running = selection.status === 'running' && current;
  const value = (type: PalletType, field: (e: PalletTypeEvaluation) => ReactNode) => {
    const evaluation = byId.get(type.id);
    if (!evaluation) return <small className="pending">{running ? '계산 중…' : '미계산'}</small>;
    return evaluation.fits ? field(evaluation) : <small className="warn">부적합</small>;
  };
  const fields: Array<{ label: string; value: (type: PalletType) => ReactNode }> = [
    { label: '규격 (L×W×T mm)', value: t => `${Math.round(spec(t).length*1000)}×${Math.round(spec(t).width*1000)}×${Math.round(spec(t).height*1000)}` },
    { label: '자체중량', value: t => `${kg(spec(t).tareWeightKg)} kg` },
    { label: '동하중', value: t => `${kg(spec(t).maxLoadKg)} kg` },
    { label: '정하중', value: t => spec(t).maxStaticLoadKg ? `${kg(spec(t).maxStaticLoadKg!)} kg` : '값 없음' },
    { label: '도착지 적합', value: t => palletDestinationFit(input.container, spec(t)).label },
    { label: '팔레트 수', value: t => value(t, e => `${e.palletCount}장`) },
    { label: '팔레트당 박스 단수', value: t => value(t, e => `${e.maxTiers}단`) },
    { label: '팔레트 적층', value: t => !spec(t).maxStaticLoadKg ? '1단만 가능' : value(t, e => `${e.maxPalletStackLevels ?? 0}단`) },
    { label: '미적재', value: t => value(t, e => e.requestedUnits > e.loadedUnits ? <small className="warn">{(e.requestedUnits-e.loadedUnits).toLocaleString()}개</small> : '없음') },
    { label: '배치 검사', value: t => value(t, e => e.hardErrorCount ? <small className="warn">오류 {e.hardErrorCount}건</small> : '계산상 오류 없음') },
  ];
  return <div className="guided-pallet-type-picker" aria-label="파렛트 선택">
    <div className="guided-pallet-type-heading"><div><b>사용할 파렛트</b><span role="status">
      {running ? `팔레트 비교 계산 중 · ${byId.size}/${PALLET_CATALOG.length}` : recommended ? `추천: ${recommended.name}` : '현재 입력의 추천 계산 대기'}
    </span><span>추천 기준: 지정 규격 적합 → 미적재 수량 → 팔레트 수 → 팔레트 자중</span></div>
      <button type="button" role="radio" aria-checked={auto} className={auto ? 'selected' : ''} onClick={() => choosePalletType(AUTO_PALLET_TYPE)}>추천 자동 적용</button>
    </div>
    <div className="guided-pallet-type-table-wrap" tabIndex={0} aria-label="팔레트 비교 표 가로 스크롤">
      <table className="guided-pallet-type-table" aria-label="파렛트 비교 표">
        <thead><tr><th scope="col">재질</th><th scope="col">이름</th>{fields.map(f => <th key={f.label} scope="col">{f.label}</th>)}</tr></thead>
        {groups.map(group => <tbody key={group.material} role="radiogroup" aria-label={`${palletMaterialLabel(group.material)} 파렛트`}>
          {group.types.map(type => <tr key={type.id} className={selected.id === type.id ? 'selected' : ''}>
            <td>{palletMaterialLabel(type.material)}</td><td className="name">
              <button type="button" role="radio" aria-checked={selected.id === type.id} disabled={palletDestinationFit(input.container,spec(type)).status === 'incompatible'} onClick={() => choosePalletType(type.id)}>
                <b>{type.name}</b>{jobSpecs[type.id] && <small>작업 설정 적용</small>}{type.id === recommended?.id && <em>추천</em>}
              </button></td>{fields.map(f => <td key={f.label}>{f.value(type)}</td>)}
          </tr>)}
        </tbody>)}
      </table>
    </div>
    {current && selection.status === 'error' && <p role="alert">비교 계산에 실패했습니다. <button type="button" onClick={() => setRetry(n => n+1)}>다시 계산</button></p>}
    <p className="guided-pallet-type-note">팔레트당 박스 단수는 한 장 위의 박스 층수이며, 팔레트 적층은 팔레트 자체를 위로 쌓는 층수입니다. 정하중이 없으면 팔레트는 1단으로 제한합니다. 표는 선택한 적재 유형과 품목 지정을 반영한 예측입니다.</p>
    <p className="guided-pallet-type-note">하중 수치는 규격별 대표값입니다. 실제 제조사 제원과 다르면 팔레트 설정을 확인하세요. 수출 규격·목재 처리·수령처 승인은 이 계산으로 인증하지 않습니다.</p>
    <CargoStackRestrictionNotice cargo={input.cargo} />
  </div>;
}
