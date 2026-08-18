import { useEffect, useMemo, useState } from 'react';
import type { CargoItem } from './engine/types';
import { readStoredState, STORAGE_UPDATED_EVENT, type StoredState } from './storage';

export const CARGO_FILTER_EVENT = 'container-loading:cargo-filter';

function dispatchFilter(cargoId: string | null) {
  window.dispatchEvent(new CustomEvent(CARGO_FILTER_EVENT, { detail: { cargoId } }));
}

function readCargoCards(): CargoItem[] {
  return [...document.querySelectorAll<HTMLElement>('.cargo-card')].map((card) => {
    const name = card.querySelector<HTMLElement>('.cargo-head b')?.textContent?.trim() ?? '';
    const id = card.querySelector<HTMLElement>('.cargo-head span')?.textContent?.trim() ?? '';
    const quantityText = card.querySelector<HTMLElement>('.quantity-row strong')?.textContent ?? '0';
    const quantity = Number(quantityText.replace(/[^0-9.-]/g, '')) || 0;
    return { id, name, quantity, length: 0, width: 0, height: 0, weightKg: 0 };
  }).filter(item => item.id);
}

export default function CargoFilterBar() {
  const [cargo, setCargo] = useState<CargoItem[]>(() => readStoredState()?.cargo ?? []);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const syncFromDom = () => {
      const live = readCargoCards();
      if (live.length || document.querySelector('.cargo-card')) setCargo(live);
    };
    const syncStorage = (event?: Event) => {
      const state = event ? (event as CustomEvent<StoredState>).detail : readStoredState();
      if (state?.cargo) setCargo(state.cargo);
      queueMicrotask(syncFromDom);
    };
    syncFromDom();
    const observer = new MutationObserver(syncFromDom);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener(STORAGE_UPDATED_EVENT, syncStorage);
    return () => {
      observer.disconnect();
      window.removeEventListener(STORAGE_UPDATED_EVENT, syncStorage);
    };
  }, []);

  useEffect(() => {
    if (activeId && !cargo.some(item => item.id === activeId)) {
      setActiveId(null);
      dispatchFilter(null);
    }
  }, [cargo, activeId]);

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
        onChange={e => { setQuery(e.target.value); if (activeId) setActiveId(null); }}
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
