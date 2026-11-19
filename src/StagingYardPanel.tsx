import { useEffect, useId, useMemo, useState } from 'react';
import type { StagingCounts, StagingInventory, StagingUnit } from './stagingInventory';
import type { StagingYardLayout } from './stagingYardLayout';
import { uiMessage, uiLocale, uiText, useUiLanguage } from './uiLanguage';
import './staging-yard.css';
import ViewerQualityControls from './ViewerQualityControls';

export type StagingYardPanelProps = {
  inventory: StagingInventory;
  layout: StagingYardLayout;
  selectedId: string | null;
  view: 'all' | 'vehicle' | 'yard';
  visibleZoneIds: readonly string[];
  zonePage: number;
  zonePageCount: number;
  busy: boolean;
  canUndo: boolean;
  canLoad?: boolean;
  canWithdraw?: boolean;
  message: string;
  preview?: { valid: boolean; reasons: readonly string[]; cautions?: readonly string[] };
  /** The selected pallet was put in place by hand and automatic loading keeps it there. */
  pinned?: boolean;
  /** How many pallets are held in place that way, selected or not. */
  pinnedCount?: number;
  onUnpin?: () => void;
  onSelect: (id: string | null) => void;
  onLoad: () => void;
  onWithdraw: () => void;
  onUndo: () => void;
  onView: (view: 'all' | 'vehicle' | 'yard') => void;
  onZonePage: (page: number) => void;
  onArrange: () => void;
  onPackagingDetails?: () => void;
  flightEnabled?: boolean;
  flightReducedMotion?: boolean;
  flightCount?: number;
  onFlightEnabled?: (enabled: boolean) => void;
  onSkipFlight?: () => void;
};
const LIST_PAGE_SIZE = 4;
const locationLabel = (location: StagingUnit['location']) => location === 'vehicle' ? '현재 차량' : location === 'other-vehicle' ? '다른 차량' : '대기장';
const verdictLabel: Record<StagingUnit['verdict'], string> = {
  pending: '계산 전', checking: '적재 가능 위치 검토 중', placed: '차량 배치됨', unloaded: '계산 결과 미적재', error: '입력·포장 오류',
};

export default function StagingYardPanel(props: StagingYardPanelProps) {
  const language = useUiLanguage();
  const id = useId();
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState<'all' | StagingUnit['location']>('yard');
  const [listPage, setListPage] = useState(0);
  const [toolsOpen, setToolsOpen] = useState(false);
  const selected = props.inventory.units.find(unit => unit.id === props.selectedId);
  useEffect(() => { if (props.selectedId) setToolsOpen(true); }, [props.selectedId]);
  const normalized = search.trim().toLocaleLowerCase();
  const filtered = useMemo(() => props.inventory.units.filter(unit => (location === 'all' || unit.location === location)
    && (!normalized || [unit.id, unit.name, ...unit.cargoIds].some(value => value.toLocaleLowerCase().includes(normalized)))), [props.inventory.units, location, normalized]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE));
  const currentPage = Math.min(listPage, pageCount - 1);
  const listUnits = filtered.slice(currentPage * LIST_PAGE_SIZE, (currentPage + 1) * LIST_PAGE_SIZE);
  const slots = useMemo(() => new Map(props.layout.slots.map(slot => [slot.unitId, slot])), [props.layout.slots]);
  const visibleZones = props.visibleZoneIds.filter((zone, index, list) => list.indexOf(zone) === index && props.layout.zones.some(item => item.id === zone));
  const selectedZoneId = selected?.location === 'yard' ? slots.get(selected.id)?.zoneId : undefined;
  const selectedZoneIndex = selectedZoneId ? props.layout.zones.findIndex(zone => zone.id === selectedZoneId) : -1;
  const hiddenSelectedZone = selectedZoneIndex >= 0 && !visibleZones.includes(selectedZoneId!);
  const format = (value: number, maximumFractionDigits = 0) => value.toLocaleString(uiLocale(language), { maximumFractionDigits });
  const row = (label: string, counts: StagingCounts) => <div key={label}><dt>{uiText(label)}</dt><dd><span>{format(counts.pallets)}</span><i aria-hidden="true">/</i><span>{format(counts.looseBoxes)}</span></dd></div>;
  const loadAllowed = Boolean(selected && selected.location === 'yard' && selected.verdict !== 'error' && !selected.requiresPackaging
    && !(selected.kind === 'pallet' && props.inventory.packagingStatus !== 'ready') && props.canLoad !== false && !props.busy);
  const withdrawAllowed = Boolean(selected && selected.location === 'vehicle' && props.canWithdraw !== false && !props.busy);
  const packaging = selected?.packaging;

  return <section className="staging-yard-panel" aria-labelledby={`${id}-title`} data-staging-yard-panel="true">
    <header className="staging-panel-heading"><h2 id={`${id}-title`}>{uiText('적재 대기장')}</h2><span>{uiText('파렛트 / 낱박스')}</span></header>
    <dl className="staging-panel-counts">
      {row('전체 준비량', props.inventory.summary.total)}
      {row('현재 차량 배치량', props.inventory.summary.vehicle)}
      {row('대기량', props.inventory.summary.yard)}
      {row('대기 중 미적재량', props.inventory.summary.unloaded)}
      {props.inventory.otherVehicleUnits.length > 0 && row('다른 차량 배치량', props.inventory.summary.otherVehicles)}
    </dl>
    <p className="staging-panel-count-note">{uiText('박스 총수량 {0}개 · 파렛트 내부 포함', [format(props.inventory.summary.total.boxes)])}</p>
    <p className="staging-panel-count-note">{uiText('미적재 수량은 대기 수량에 포함됩니다.')}</p>
    <div className="staging-panel-views" role="group" aria-label={uiText('카메라 보기')}>
      {([{ value: 'all', label: '전체 보기' }, { value: 'vehicle', label: '차량 내부' }, { value: 'yard', label: '대기장 보기' }] as const).map(item => <button key={item.value} type="button" data-view-only="true" aria-pressed={props.view === item.value} onClick={() => props.onView(item.value)}>{uiText(item.label)}</button>)}
    </div>
    <ViewerQualityControls />
    {props.onFlightEnabled && <div className="staging-flight-controls" data-view-only="true">
      <label><input type="checkbox" checked={props.flightEnabled !== false} disabled={props.flightReducedMotion}
        onChange={event => props.onFlightEnabled?.(event.target.checked)} />{uiText('화물 이동 연출')}</label>
      {props.flightReducedMotion && <small>{uiText('동작 줄이기 설정에 따라 즉시 배치합니다.')}</small>}
      {Boolean(props.flightCount) && <div role="status"><span>{uiText('배치 확정 · {0}개 화물 이동 연출 중', [props.flightCount ?? 0])}</span>
        <button type="button" data-view-only="true" onClick={props.onSkipFlight}>{uiText('연출 건너뛰기')}</button>
        <small>{uiText('수량은 최종 배치 기준입니다. 이동 연출은 실제 상차 경로 검증이 아닙니다.')}</small></div>}
    </div>}
    {props.inventory.packagingStatus === 'pending' && <p className="staging-panel-notice" role="status">{uiText('포장 계획 계산 중')}</p>}
    {props.inventory.packagingStatus === 'error' && <p className="staging-panel-warning" role="status">{uiText('포장 계획을 확인하세요')}</p>}
    {props.message && <p className="staging-panel-message" role="status">{uiMessage(props.message)}</p>}
    <details className="staging-panel-tools" open={toolsOpen} onToggle={event => setToolsOpen(event.currentTarget.open)}>
      <summary>{uiText('대기장 도구')}</summary>
      <div className="staging-panel-zones" role="group" aria-label={uiText('대기장 구역')}>
        <div><b>{uiText('표시 {0}구역 / 전체 {1}구역', [visibleZones.length, props.layout.zones.length])}</b><span>{visibleZones.length ? visibleZones.join(' · ') : uiText('표시 구역 없음')}</span></div>
        <div className="staging-panel-pagination"><button type="button" data-view-only="true" disabled={props.zonePage <= 0} onClick={() => props.onZonePage(props.zonePage - 1)}>{uiText('이전 구역')}</button><span>{uiText('{0} / {1} 구역 페이지', [props.zonePage + 1, Math.max(1, props.zonePageCount)])}</span><button type="button" data-view-only="true" disabled={props.zonePage + 1 >= props.zonePageCount} onClick={() => props.onZonePage(props.zonePage + 1)}>{uiText('다음 구역')}</button></div>
        <button type="button" data-view-only="true" onClick={props.onArrange}>{uiText('대기장 정렬')}</button>
      </div>
      <div className="staging-panel-search"><label htmlFor={`${id}-search`}>{uiText('화물 검색')}</label><input id={`${id}-search`} type="search" value={search} data-view-only="true" placeholder={uiText('화물명 또는 품목코드')} onChange={event => { setSearch(event.target.value); setListPage(0); }} />
        <label htmlFor={`${id}-location`}>{uiText('표시 위치')}</label><select id={`${id}-location`} value={location} data-view-only="true" onChange={event => { setLocation(event.target.value as typeof location); setListPage(0); }}><option value="yard">{uiText('대기장')}</option><option value="vehicle">{uiText('현재 차량')}</option><option value="other-vehicle">{uiText('다른 차량')}</option><option value="all">{uiText('전체')}</option></select>
      </div>
      <div className="staging-panel-unit-list" role="group" aria-label={uiText('대기 화물 목록')}>
        {listUnits.map(unit => <button key={unit.id} type="button" data-view-only="true" data-staging-unit-id={unit.id} aria-pressed={unit.id === props.selectedId} aria-label={uiText('{0} 선택', [unit.name])} onClick={() => props.onSelect(unit.id)}>
          <span className="staging-unit-copy"><b>{unit.name}</b><small>{unit.kind === 'pallet' ? uiText('포장 파렛트') : uiText('낱박스')} · {slots.get(unit.id)?.label ?? uiText(locationLabel(unit.location))}</small></span>
          <span className={`staging-unit-verdict ${unit.verdict}`}>{uiText(verdictLabel[unit.verdict])}</span>
        </button>)}
        {!filtered.length && <p className="staging-panel-empty">{uiText(search || location !== 'yard' ? '검색 조건에 맞는 화물이 없습니다.' : '대기 화물 없음')}</p>}
      </div>
      {filtered.length > LIST_PAGE_SIZE && <div className="staging-panel-pagination"><button type="button" data-view-only="true" disabled={currentPage <= 0} onClick={() => setListPage(currentPage - 1)}>{uiText('이전')}</button><span>{uiText('화물 목록 {0} / {1} 페이지', [currentPage + 1, pageCount])}</span><button type="button" data-view-only="true" disabled={currentPage + 1 >= pageCount} onClick={() => setListPage(currentPage + 1)}>{uiText('다음')}</button></div>}
      {selected && <section className="staging-panel-selection" aria-labelledby={`${id}-selected`}>
        <header><h3 id={`${id}-selected`}>{uiText('선택 화물')}</h3><button type="button" data-view-only="true" aria-label={uiText('화물 선택 해제')} onClick={() => props.onSelect(null)}>{uiText('선택 해제')}</button></header>
        <strong>{selected.name}</strong>
        {hiddenSelectedZone && <button type="button" data-view-only="true" onClick={() => props.onZonePage(Math.floor(selectedZoneIndex / 4))}>{uiText('선택 화물 구역 보기')}</button>}
        <dl>
          <div><dt>{uiText('화물 개체 ID')}</dt><dd className="staging-panel-unit-id">{selected.id}</dd></div>
          <div><dt>{uiText('위치')}</dt><dd>{uiText(locationLabel(selected.location))}{selected.vehicleId ? ` · ${selected.vehicleId}` : ''}{slots.get(selected.id)?.label ? ` · ${slots.get(selected.id)!.label}` : ''}</dd></div>
          <div><dt>{uiText('상태')}</dt><dd>{uiText(verdictLabel[selected.verdict])}</dd></div>
          <div><dt>{uiText('구성 품목')}</dt><dd>{selected.contents?.length ? selected.contents.map(item => `${item.name} (${item.cargoId}) · ${uiText('{0}개', [format(item.boxCount)])}`).join(' / ') : selected.cargoIds.join(', ')}</dd></div>
          <div><dt>{uiText('외형 규격')}</dt><dd>{[selected.length, selected.width, selected.height].map(value => format(Math.round(value * 1000))).join(' × ')} mm</dd></div>
          <div><dt>{uiText('박스 수량')}</dt><dd>{format(selected.boxCount)}</dd></div>
          <div><dt>{uiText('중량')}</dt><dd>{format(selected.weightKg, 2)} kg</dd></div>
          <div><dt>{uiText('하역 순서')}</dt><dd>{selected.unloadPriorities.length ? selected.unloadPriorities.join(' · ') : uiText('지정 없음')}</dd></div>
        </dl>
        {selected.kind === 'pallet' && <div className="staging-panel-packaging"><b>{uiText('포장 구성')}</b><p>{packaging ? [uiText('밴딩 {0}줄', [packaging.bandingStraps]), uiText(packaging.wrapping ? '랩핑 사용' : '랩핑 없음'), uiText(packaging.cornerGuards ? '각대 사용' : '각대 없음')].join(' · ') : uiText('포장 정보 없음')}</p>{packaging?.source === 'transport-reinforcement' && <small>{uiText('기본 포장과 실제 운송 보강 계획을 함께 표시합니다.')}</small>}<small>{uiText('포장 표시는 계획 상태이며 운송 검증을 뜻하지 않습니다.')}</small></div>}
        {props.onPackagingDetails && <button type="button" data-view-only="true" onClick={props.onPackagingDetails}>{uiText('포장 상세 보기')}</button>}
        {selected.reasons.length > 0 ? <ul className="staging-panel-reasons">{selected.reasons.map((reason, index) => <li key={`${reason.reasonCode ?? ''}-${index}`}>{reason.reasonCode && <code>{reason.reasonCode}</code>}{uiMessage(reason.reason)}</li>)}</ul> : selected.verdict === 'unloaded' ? <p className="staging-panel-warning">{uiText('사유 정보 없음')}</p> : null}
        {selected.requiresPackaging && <p className="staging-panel-warning">{uiText('포장 계획 완료 후 상차할 수 있습니다.')}</p>}
        {props.pinned && <div className="staging-panel-pinned" role="status" data-staging-pinned="true"><b>{uiText('자리 고정')}</b>
          <p>{uiText('손으로 놓은 자리입니다. 자동 적재를 다시 실행해도 이 자리를 유지하고 나머지를 다시 배치합니다.')}</p>
          <button type="button" disabled={props.busy} onClick={props.onUnpin}>{uiText('고정 해제')}</button></div>}
        {props.preview && (() => {
          const cautions = props.preview.valid ? props.preview.cautions ?? [] : [];
          const lines = props.preview.valid ? cautions : props.preview.reasons;
          return <div className={`staging-panel-preview ${props.preview.valid ? cautions.length ? 'valid caution' : 'valid' : 'invalid'}`} role="status">
            <b>{uiText(!props.preview.valid ? '배치 불가' : cautions.length ? '배치 가능 · 무게중심 오류가 남습니다' : '배치 가능')}</b>
            {lines.length > 0 && <ul>{lines.map((line, index) => <li key={index}>{uiMessage(line)}</li>)}</ul>}
          </div>;
        })()}
        <div className="staging-panel-actions"><button type="button" className="staging-panel-primary" disabled={!loadAllowed} onClick={props.onLoad}>{uiText('선택 화물 적재')}</button><button type="button" disabled={!withdrawAllowed} onClick={props.onWithdraw}>{uiText('대기장으로 회수')}</button></div>
      </section>}
      <div className="staging-panel-undo"><button type="button" disabled={!props.canUndo || props.busy} onClick={props.onUndo}>{uiText('되돌리기')}</button></div>
      {(props.pinnedCount ?? 0) > 0 && <p className="staging-panel-help" data-staging-pinned-count={props.pinnedCount}>{uiText('자리 고정 파렛트 {0}개 · 자동 적재가 이 자리를 유지합니다.', [props.pinnedCount!])}</p>}
      <p className="staging-panel-help">{uiText('대기 화물은 차량 안으로 드래그하거나 선택 화물 적재를 누르세요.')}</p>
      {props.inventory.excluded.length > 0 && <details className="staging-panel-excluded"><summary>{uiText('입력에서 제외된 화물')}</summary><ul>{props.inventory.excluded.map((entry, index) => <li key={`${entry.cargoId}-${index}`}><b>{uiText('{0} · {1}개', [entry.cargoId, format(entry.quantity)])}</b><span>{uiMessage(entry.reason)}</span></li>)}</ul></details>}
      {props.inventory.issues.length > 0 && <ul className="staging-panel-reasons">{props.inventory.issues.map((issue, index) => <li key={index}>{uiMessage(issue)}</li>)}</ul>}
      {props.layout.rejected.length > 0 && <ul className="staging-panel-reasons">{props.layout.rejected.map(entry => <li key={entry.unitId}><code>{entry.unitId}</code>{uiMessage(entry.reason)}</li>)}</ul>}
      <p className="staging-panel-help">{uiText('구역 간격은 화면 배치용이며 현장 동선 검증값이 아닙니다.')}</p>
    </details>
  </section>;
}
