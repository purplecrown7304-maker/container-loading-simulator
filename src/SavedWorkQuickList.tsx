import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  return date.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
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
    const timer = window.setInterval(refresh, 1500);
    return () => {
      window.removeEventListener('storage', refresh);
      window.clearInterval(timer);
    };
  }, []);

  if (!host) return null;
  const recent = works.slice(0, 5);

  const restore = (work: SavedWork) => {
    writeStoredState(work.state, true);
    setMessage(`${work.name} 작업을 불러왔습니다.`);
  };

  return createPortal(
    <section className="saved-work-quick-list">
      <div className="saved-work-quick-head">
        <div><h2>저장된 작업</h2><span>최근 {Math.min(works.length, 5)}건</span></div>
        <button type="button" onClick={() => openWorkspace('data')}>전체 보기</button>
      </div>
      {recent.length ? <div className="saved-work-quick-items">
        {recent.map(work => <button type="button" key={work.id} onClick={() => restore(work)}>
          <span><b>{work.name}</b><small>{savedAtLabel(work.savedAt)}</small></span>
          <em>{work.state.cargo.length}종</em>
        </button>)}
      </div> : <div className="saved-work-quick-empty">저장된 작업이 없습니다.</div>}
      {message && <p>{message}</p>}
    </section>,
    host,
  );
}
