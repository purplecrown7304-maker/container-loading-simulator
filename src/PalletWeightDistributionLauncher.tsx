import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { readWeightGraphPreference } from './PreviewViewControls';

function findWeightToggle() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.pallet-weight-dock > .pallet-weight-toolbar > button'))
    .find((button) => button.textContent?.includes('3D 무게분포')) ?? null;
}

function findDockViewButton(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.pallet-weight-dock .pallet-weight-view-buttons button'))
    .find((button) => button.textContent?.trim() === label) ?? null;
}

export default function PalletWeightDistributionLauncher() {
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [open, setOpen] = useState(readWeightGraphPreference);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      setPortalTarget(document.querySelector('.pallet-viewer .preview-view-controls'));
      const dock = document.querySelector('.pallet-viewer .pallet-weight-dock');
      setOpen(dock?.classList.contains('open') ?? readWeightGraphPreference());
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(sync);
    };

    sync();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const forwardView = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>('.pallet-viewer .preview-view-controls .preview-view-buttons button');
      if (!button) return;
      const dock = document.querySelector('.pallet-viewer .pallet-weight-dock');
      if (!dock?.classList.contains('open')) return;
      const label = button.textContent?.trim();
      if (!label) return;
      window.requestAnimationFrame(() => findDockViewButton(label)?.click());
    };

    document.addEventListener('click', forwardView);
    return () => document.removeEventListener('click', forwardView);
  }, []);

  if (!portalTarget) return null;

  const toggle = () => {
    const button = findWeightToggle();
    if (!button) return;
    button.click();
    window.requestAnimationFrame(() => {
      const dock = document.querySelector('.pallet-viewer .pallet-weight-dock');
      setOpen(dock?.classList.contains('open') ?? readWeightGraphPreference());
    });
  };

  return createPortal(
    <button
      type="button"
      className={`preview-weight-toggle pallet-weight-inline-launcher ${open ? 'active' : ''}`}
      onClick={toggle}
      aria-pressed={open}
    >
      3D 무게분포 {open ? 'ON' : 'OFF'}
    </button>,
    portalTarget,
  );
}
