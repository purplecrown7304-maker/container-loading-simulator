import { useRef } from 'react';
import { cargoColor, cargoTint } from '../../cargoColors';
import type { CargoItem } from '../../engine/types';
import type { LoadingMode } from '../types';

type Props = {
  adminMode: boolean;
  mode: LoadingMode;
  cargo: CargoItem[];
  filteredCargo: CargoItem[];
  selectedCargo: CargoItem[];
  search: string;
  importMode: 'replace' | 'merge';
  totalQty: number;
  onMode: (mode: LoadingMode) => void;
  onSearch: (value: string) => void;
  onQuantityDelta: (id: string, delta: number) => void;
  onQuantity: (id: string, value: number) => void;
  onNewCargo: () => void;
  onEditCargo: (item: CargoItem) => void;
  onDeleteCargo: (id: string) => void;
  onSample: () => void;
  onImportMode: (mode: 'replace' | 'merge') => void;
  onExcelFile: (file: File | undefined) => void;
  onTemplate: () => void;
};

export default function CargoStep({ adminMode, mode, cargo, filteredCargo, selectedCargo, search, importMode, totalQty, onMode, onSearch, onQuantityDelta, onQuantity, onNewCargo, onEditCargo, onDeleteCargo, onSample, onImportMode, onExcelFile, onTemplate }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestedWeight = selectedCargo.reduce((sum, item) => sum + item.weightKg * item.quantity, 0);

  return <section className="ux3-step-page ux3-cargo-page">
    <div className="ux3-page-heading">
      <div><span>STEP 2</span><h1>화물을 선택하세요</h1><p>박스 마스터와 이번 적재 목록을 분리해 관리합니다.</p></div>
      <div className="ux3-segmented" role="tablist">
        <button type="button" className={mode === 'boxes' ? 'active' : ''} onClick={() => onMode('boxes')}>박스 직접</button>
        <button type="button" className={mode === 'pallets' ? 'active' : ''} onClick={() => onMode('pallets')}>팔레트</button>
      </div>
    </div>

    <div className="ux3-cargo-columns">
      <section className="ux3-card ux3-master-panel">
        <div className="ux3-card-head">
          <div><h2>박스 마스터</h2><span>{cargo.length}종 등록</span></div>
          {adminMode && <div className="ux3-inline-actions">
            <button type="button" className="ux3-secondary-button" onClick={onNewCargo}>신규 등록</button>
            <button type="button" className="ux3-secondary-button" onClick={() => fileInputRef.current?.click()}>Excel 등록</button>
          </div>}
        </div>
        {adminMode && <div className="ux3-import-tools">
          <select aria-label="Excel 반영 방식" value={importMode} onChange={event => onImportMode(event.target.value as 'replace' | 'merge')}>
            <option value="merge">기존 마스터와 병합</option><option value="replace">전체 교체</option>
          </select>
          <button type="button" className="ux3-ghost-button" onClick={onTemplate}>Excel 양식</button>
          <input ref={fileInputRef} className="ux3-hidden-input" type="file" accept=".xlsx,.xls" onChange={event => { onExcelFile(event.target.files?.[0]); event.target.value = ''; }} />
        </div>}
        <input className="ux3-search-input" aria-label="박스 마스터 검색" placeholder="코드 또는 이름 검색" value={search} onChange={event => onSearch(event.target.value)} />

        {filteredCargo.length ? <div className="ux3-master-list">
          {filteredCargo.map(item => <article className="ux3-master-item" key={item.id}>
            <i style={{ background: cargoColor(item.id) }} />
            <div className="ux3-master-copy"><b>{item.id} · {item.name}</b><span>{Math.round(item.length * 1000)} × {Math.round(item.width * 1000)} × {Math.round(item.height * 1000)} mm</span><small>{item.weightKg}kg · 최대 {item.maxStackLayers ?? '-'}단 · 상부 {item.maxTopLoadKg == null ? '제한없음' : `${item.maxTopLoadKg}kg`}</small></div>
            <button type="button" className="ux3-add-qty" aria-label={`${item.id} 적재 수량 추가`} onClick={() => onQuantityDelta(item.id, 1)}>＋</button>
            {adminMode && <div className="ux3-admin-item-actions"><button type="button" onClick={() => onEditCargo(item)}>수정</button><button type="button" onClick={() => onDeleteCargo(item.id)}>삭제</button></div>}
          </article>)}
        </div> : <div className="ux3-empty"><b>등록된 박스 마스터가 없습니다.</b><span>{adminMode ? '신규 등록 또는 Excel 등록을 사용하세요.' : '관리자에게 박스 마스터 등록을 요청하세요.'}</span>{adminMode && <button type="button" className="ux3-secondary-button" onClick={onSample}>샘플 마스터 만들기</button>}</div>}
      </section>

      <section className="ux3-card ux3-selected-panel">
        <div className="ux3-card-head"><div><h2>이번 적재 목록</h2><span>{selectedCargo.length}종 · {totalQty}EA</span></div></div>
        {selectedCargo.length ? <div className="ux3-selected-list">
          {selectedCargo.map(item => <article className="ux3-selected-item" key={item.id} style={{ borderLeftColor: cargoColor(item.id), background: cargoTint(item.id) }}>
            <div><b>{item.id} · {item.name}</b><span>{item.weightKg}kg/EA · 합계 {(item.weightKg * item.quantity).toLocaleString()}kg</span></div>
            <div className="ux3-qty-control"><button type="button" onClick={() => onQuantityDelta(item.id, -1)}>−</button><input aria-label={`${item.id} 적재 수량`} type="number" min="0" step="1" value={item.quantity} onChange={event => onQuantity(item.id, Number(event.target.value))} /><button type="button" onClick={() => onQuantityDelta(item.id, 1)}>＋</button></div>
            <button type="button" className="ux3-ghost-button ux3-danger-text" onClick={() => onQuantity(item.id, 0)}>제외</button>
          </article>)}
        </div> : <div className="ux3-empty"><b>이번 적재 목록이 비어 있습니다.</b><span>왼쪽 박스 마스터의 ＋ 버튼으로 수량을 추가하세요.</span>{cargo.length === 0 && <button type="button" className="ux3-secondary-button" onClick={onSample}>샘플 복원</button>}</div>}
        <div className="ux3-selected-summary"><span>요청수량 <b>{totalQty} EA</b></span><span>예상 중량 <b>{requestedWeight.toLocaleString()} kg</b></span></div>
      </section>
    </div>
  </section>;
}
