import { useEffect, useMemo, useState } from 'react';
import { readStoredState, STORAGE_UPDATED_EVENT, type StoredState } from './storage';

export const CARGO_FILTER_EVENT = 'container-loading:cargo-filter';

function dispatchFilter(cargoId: string | null) {
  window.dispatchEvent(new CustomEvent(CARGO_FILTER_EVENT, { detail: { cargoId } }));
}

export default function CargoFilterBar() {
  const [cargo, setCargo] = useState(() => readStoredState()?.cargo ?? []);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const sync = (event?: Event) => {
      const state = event ? (event as CustomEvent<StoredState>).detail : readStoredState();
      if (state?.cargo) setCargo(state.cargo);
    };
    window.addEventListener(STORAGE_UPDATED_EVENT, sync);
    return () => window.removeEventListener(STORAGE_UPDATED_EVENT, sync);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cargo.slice(0, 8);
    return cargo.filter(item => item.id.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)).slice(0, 8);
  }, [cargo, query]);

  const apply = (id: string) => {
    setActiveId(id);
    setQuery(id);
    dispatchFilter(id);
  };

  const clear = () => {
    setActiveId(null);
    setQuery('');
    dispatchFilter(null);
  };

  return <div className="cargo-filter-bar" aria-label="적재 품목 검색">
    <div className="cargo-filter-input-row">
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="품목 코드/품명 검색"
        aria-label="품목 코드 또는 품명 검색"
      />
      {activeId && <button type="button" className="secondary" onClick={clear}>전체 보기</button>}
    </div>
    {query.trim() && !activeId && <div className="cargo-filter-results">
      {matches.length ? matches.map(item => <button type="button" key={item.id} onClick={() => apply(item.id)}>
        <b>{item.id}</b><span>{item.name}</span><small>{item.quantity} EA</small>
      </button>) : <span className="cargo-filter-empty">일치하는 품목이 없습니다.</span>}
    </div>}
    {activeId && <div className="cargo-filter-active"><b>{activeId}</b><span>3D에서 이 품목만 표시 중</span></div>}
  </div>;
}
