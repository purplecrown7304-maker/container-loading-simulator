import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ContainerSpec } from './engine/types';
import type { StoredState } from './storage';
import { writeStoredState } from './storage';
import { openWorkspace } from './uiEvents';
import './saved-work-quick-list.css';

const SAVED_WORK_KEY = 'container-loading-workspace-boxes-v1';

type SavedWork = {
  id: string;
  name: string;
  savedAt: string;
  state: StoredState;
};

const knownEquipment = [
  { name: '20FT Standard', spec: { length: 5.90, width: 2.35, height: 2.39 } },
  { name: '40FT Standard', spec: { length: 12.03, width: 2.35, height: 2.39 } },
  { name: '40FT High Cube', spec: { length: 12.03, width: 2.35, height: 2.69 } },
];

function readSavedWorks(): SavedWork[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_WORK_KEY) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SavedWork => Boolean(
        item && typeof item === 'object'
        && typeof (item as SavedWork).id === 'string'
        && typeof (item as SavedWork).name === 'string'
        && typeof (item as SavedWork).savedAt === 'string'
        && (item as SavedWork).state,
      ))
      .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  } catch {
    return [];
  }
}

function savedAtLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function sameSize(a: ContainerSpec, b: Pick<ContainerSpec, 'length' | 'width' | 'height'>) {
  return Math.abs(a.length - b.length) < 0.03
    && Math.abs(a.width - b.width) < 0.03
    && Math.abs(a.height - b.height) < 0.03;
}

function equipmentLabel(container: ContainerSpec) {
  const known = knownEquipment.find(item => sameSize(container, item.spec));
  if (known) return known.name;
  return `${container.length.toFixed(2)}×${container.width.toFixed(2)}×${container.height.toFixed(2)}m`;
}

function workStats(work: SavedWork) {
  const cargo = work.state.cargo;
  const productIds = new Set(cargo.map(item => item.productId ?? item.id));
  const productUnits = cargo.reduce((sum, item) => sum + item.quantity * Math.max(1, item.unitsPerPackage ?? 1), 0);
  const explicitBoxes = cargo.reduce((sum, item) => sum + (item.boxId || item.id.startsWith('PKG-') ? item.quantity : 0), 0);
  const totalUnits = cargo.reduce((sum, item) => sum + item.quantity, 0);
  return {
    productTypes: productIds.size,
    productUnits,
    boxCount: explicitBoxes || totalUnits,
  };
}

export default function SavedWorkQuickList() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [works, setWorks] = useState<SavedWork[]>(() => typeof window === 'undefined' ? [] : readSavedWorks());
  const [message, setMessage] = useState('');

  useEffect(() => {
    let frame = 0;
    let mountedHost: HTMLElement | null = null;
    const syncHost = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const summary = document.querySelector<HTMLElement>('.guided-job-summary');
        if (!summary?.parentElement) return;
        let next = summary.parentElement.querySelector<HTMLElement>(':scope > .saved-work-quick-host');
        if (!next) {
          next = document.createElement('div');
          next.className = 'saved-work-quick-host';
          summary.insertAdjacentElement('afterend', next);
        } else if (summary.nextElementSibling !== next) {
          summary.insertAdjacentElement('afterend', next);
        }
        mountedHost = next;
        setHost(current => current === next ? current : next);
      });
    };
    syncHost();
    const observer = new MutationObserver(syncHost);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      mountedHost?.remove();
    };
  }, []);

  useEffect(() => {
    const refresh = () => setWorks(readSavedWorks());
    refresh();
    window.addEventListener('storage', refresh);
    const timer = window.setInterval(refresh, 1200);
    return () => {
      window.removeEventListener('storage', refresh);
      window.clearInterval(timer);
    };
  }, []);

  if (!host) return null;
  const visible = works.slice(0, 12);

  const restore = (work: SavedWork) => {
    writeStoredState(work.state, true);
    setMessage(`${work.name} 계획을 불러왔습니다.`);
  };

  return createPortal(
    <section className="saved-work-quick-list">
      <div className="saved-work-quick-head">
        <div><h2>저장된 계획</h2><span>{works.length}건</span></div>
        <button type="button" onClick={() => openWorkspace('data')}>계획 관리</button>
      </div>
      {visible.length ? <div className="saved-work-quick-items">
        {visible.map(work => {
          const stats = workStats(work);
          return <article key={work.id}>
            <div className="saved-work-copy">
              <b>{work.name}</b>
              <small>{equipmentLabel(work.state.container)}</small>
              <span>제품 {stats.productTypes}종 / {stats.productUnits.toLocaleString()}EA · 박스 {stats.boxCount.toLocaleString()}개</span>
              <time>{savedAtLabel(work.savedAt)}</time>
            </div>
            <button type="button" onClick={() => restore(work)}>불러오기</button>
          </article>;
        })}
      </div> : <div className="saved-work-quick-empty">저장된 계획이 없습니다.</div>}
      {message && <p>{message}</p>}
    </section>,
    host,
  );
}
