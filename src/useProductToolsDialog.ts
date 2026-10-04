import { useEffect, useRef } from 'react';

const focusable = 'button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"],summary';

/** Retain form contents while keeping keyboard focus within the visible tool. */
export function useProductToolsDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (!open || !ref.current) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = ref.current;
    const available = () => [...panel.querySelectorAll<HTMLElement>(focusable)]
      .filter(item => !item.closest('[hidden],[inert]') && item.getClientRects().length > 0);
    (available()[0] ?? panel).focus();
    const keydown = (event: KeyboardEvent) => {
      const owner = (document.activeElement as HTMLElement | null)?.closest('[role="dialog"]');
      if (owner && owner !== panel) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const items = available(), first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); panel.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      if (previous?.isConnected && previous !== document.body && previous.getClientRects().length > 0 && !previous.closest('[hidden],[inert]') && !previous.matches(':disabled')) previous.focus();
      else document.querySelector<HTMLElement>('.header-menu-button')?.focus();
    };
  }, [open]);
  return ref;
}
