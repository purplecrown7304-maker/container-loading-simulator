import type { ReactNode } from 'react';

type Props = {
  open: boolean;
  title: string;
  size?: 'sm' | 'md';
  onClose: () => void;
  children: ReactNode;
};

export default function Modal({ open, title, size = 'sm', onClose, children }: Props) {
  if (!open) return null;
  return <div className="ux3-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`ux3-modal ux3-modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button type="button" className="ux3-ghost-button" onClick={onClose}>닫기</button></header>
      <div className="ux3-modal-body">{children}</div>
    </section>
  </div>;
}
