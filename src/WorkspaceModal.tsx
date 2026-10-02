import { useEffect, useRef, type ReactNode } from 'react';

type Props = { open: boolean; title: string; onClose: () => void; children: ReactNode; footer: ReactNode };

/** Closing a workspace hides it; input drafts and the main canvas stay mounted. */
export default function WorkspaceModal({ open, title, onClose, children, footer }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current!;
    element.querySelector<HTMLButtonElement>('.workspace-modal-close')?.focus();
    const focusable = () => Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"],summary'))
      .filter(item => !item.closest('[hidden]') && item.getAttribute('aria-hidden') !== 'true');
    const onKey = (event: KeyboardEvent) => {
      // A nested equipment/product dialog owns its own Escape and focus handling.
      const owner = event.target instanceof Element ? event.target.closest('[role="dialog"]') : null;
      if (owner && owner !== element) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); element.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !element.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !element.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener?.isConnected && !opener.closest('[hidden]') && !opener.matches(':disabled')) opener.focus();
      else document.querySelector<HTMLElement>('.guided-step-list button[aria-current="step"]')?.focus();
    };
  }, [open]);
  return <div className="workspace-modal-backdrop" hidden={!open} onPointerDown={event => { if (event.target === event.currentTarget) close.current(); }}>
    <div ref={dialog} className="workspace-modal" role="dialog" aria-modal="true" aria-label={`${title} 설정`} tabIndex={-1}>
      <header className="workspace-modal-header"><span>WORKSPACE · {title}</span><button type="button" className="workspace-modal-close" aria-label="설정 닫기" onClick={onClose}>닫기 ×</button></header>
      <div className="workspace-modal-content">{children}</div>
      <div className="workspace-modal-footer">{footer}</div>
      <p className="workspace-modal-note">입력과 선택은 닫아도 유지됩니다. 유효한 변경은 메인 3D 미리보기에 반영됩니다.</p>
    </div>
  </div>;
}
