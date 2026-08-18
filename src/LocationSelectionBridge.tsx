import { useEffect } from 'react';
import { PLACEMENT_SELECT_EVENT, selectPlacement, type PlacementSelectDetail } from './selectionEvents';

export default function LocationSelectionBridge() {
  useEffect(() => {
    const bindRows = () => {
      document.querySelectorAll<HTMLElement>('.location-row').forEach((row, index) => {
        row.dataset.placementIndex = String(index);
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.setAttribute('aria-label', `${row.textContent?.trim() ?? '적재 위치'} 3D에서 보기`);
        row.onclick = () => selectPlacement(index);
        row.onkeydown = (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectPlacement(index);
          }
        };
      });
    };

    const observer = new MutationObserver(bindRows);
    observer.observe(document.body, { childList: true, subtree: true });
    bindRows();

    const onSelected = (event: Event) => {
      const index = (event as CustomEvent<PlacementSelectDetail>).detail?.index ?? null;
      document.querySelectorAll<HTMLElement>('.location-row').forEach((row) => {
        const active = index !== null && Number(row.dataset.placementIndex) === index;
        row.classList.toggle('selected', active);
        row.setAttribute('aria-pressed', active ? 'true' : 'false');
        if (active) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    };

    window.addEventListener(PLACEMENT_SELECT_EVENT, onSelected);
    return () => {
      observer.disconnect();
      window.removeEventListener(PLACEMENT_SELECT_EVENT, onSelected);
    };
  }, []);

  return null;
}
