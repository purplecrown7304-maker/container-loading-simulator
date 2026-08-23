import { useEffect } from 'react';

function byText(root: ParentNode, selector: string, text: string): HTMLElement | null {
  return [...root.querySelectorAll<HTMLElement>(selector)].find(el => el.textContent?.includes(text)) ?? null;
}

function scrollToSelector(selector: string) {
  document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setText(el: HTMLElement | null, text: string) {
  if (el && el.textContent !== text) el.textContent = text;
}

function setViewMode(mode: '3d' | '2d' | 'layers') {
  const host = document.querySelector<HTMLElement>('.viewer-host');
  if (!host) return;
  if (host.dataset.viewMode !== mode) host.dataset.viewMode = mode;
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('.viewer-toolbar button')];
  buttons.forEach(button => button.classList.toggle('active',
    (mode === '3d' && button.textContent?.includes('3D')) ||
    (mode === '2d' && button.textContent?.includes('2D')) ||
    (mode === 'layers' && button.textContent?.includes('층별')),
  ));
  if (mode === 'layers') scrollToSelector('.layer-card');
}

function updateConstraintCards() {
  const root = document.querySelector<HTMLElement>('.mockup-dashboard');
  if (!root) return;
  const summary = [...root.querySelectorAll<HTMLElement>('.summary-list span')].map(x => x.textContent ?? '').join(' ');
  const remaining = root.querySelector('.remaining-compact');
  const locationCount = root.querySelectorAll('.location-row').length;
  const invalidMetric = /NaN|Infinity/.test(summary);
  const hasRemaining = Boolean(remaining?.textContent?.trim());

  const constraintRows = [...root.querySelectorAll<HTMLElement>('.constraint-list span')];
  constraintRows.forEach(row => {
    const value = row.querySelector<HTMLElement>('b');
    if (!value) return;
    let ok = !invalidMetric;
    if (row.textContent?.includes('중량 제한')) {
      const match = summary.match(/([\d,.]+)\s*\/\s*([\d,.]+)\s*kg/);
      if (match) ok = Number(match[1].replaceAll(',', '')) <= Number(match[2].replaceAll(',', ''));
    }
    if (row.textContent?.includes('문 개폐')) ok = locationCount > 0 || !hasRemaining;
    setText(value, ok ? '통과' : '확인 필요');
    row.classList.toggle('constraint-pass', ok);
    row.classList.toggle('constraint-warn', !ok);
  });

  const allPass = constraintRows.every(row => row.classList.contains('constraint-pass'));
  const badge = root.querySelector<HTMLElement>('.constraint-ok');
  if (badge) {
    setText(badge, allPass ? '✓ 제약 조건 모두 만족' : '⚠ 제약 조건 확인 필요');
    badge.classList.toggle('warning', !allPass);
  }
}

function renderHeatmapFromMinimap() {
  const heatmap = document.querySelector<HTMLElement>('.heatmap');
  const svg = document.querySelector<SVGSVGElement>('.topdown-minimap svg');
  if (!heatmap || !svg) return;
  const cells = 24;
  const cols = 8;
  const rows = 3;
  const density = Array(cells).fill(0) as number[];
  const vb = svg.viewBox.baseVal;
  const width = vb.width || 260;
  const height = vb.height || 110;
  const rects = [...svg.querySelectorAll<SVGRectElement>('rect')].slice(1);
  rects.forEach(rect => {
    const x = Number(rect.getAttribute('x') ?? 0) + Number(rect.getAttribute('width') ?? 0) / 2;
    const y = Number(rect.getAttribute('y') ?? 0) + Number(rect.getAttribute('height') ?? 0) / 2;
    const c = Math.min(cols - 1, Math.max(0, Math.floor(x / width * cols)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor(y / height * rows)));
    density[r * cols + c] += 1;
  });
  const max = Math.max(1, ...density);
  const signature = density.join(',');
  if (heatmap.dataset.signature === signature) return;
  heatmap.dataset.signature = signature;
  heatmap.replaceChildren(...density.map((count, i) => {
    const cell = document.createElement('i');
    const ratio = count / max;
    cell.dataset.level = ratio > .72 ? 'high' : ratio > .34 ? 'mid' : 'low';
    cell.title = `구역 ${i + 1}: 상대 적재 밀도 ${(ratio * 100).toFixed(0)}%`;
    return cell;
  }));
}

export default function DashboardRuntimeEnhancer() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.mockup-dashboard');
    if (!root) return;

    const handlers: Array<() => void> = [];
    const bind = (el: HTMLElement | null, fn: () => void) => {
      if (!el) return;
      el.addEventListener('click', fn);
      handlers.push(() => el.removeEventListener('click', fn));
    };

    bind(byText(root, '.main-nav .nav-item', '대시보드'), () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    bind(byText(root, '.main-nav .nav-item', '적재 설계'), () => scrollToSelector('.dashboard-left'));
    bind(byText(root, '.main-nav .nav-item', '3D 뷰'), () => { setViewMode('3d'); scrollToSelector('.viewer-card'); });
    bind(byText(root, '.main-nav .nav-item', '결과 분석'), () => scrollToSelector('.center-mini-grid'));
    bind(byText(root, '.viewer-toolbar button', '3D'), () => setViewMode('3d'));
    bind(byText(root, '.viewer-toolbar button', '2D'), () => setViewMode('2d'));
    bind(byText(root, '.viewer-toolbar button', '층별'), () => setViewMode('layers'));

    const layerThumbs = [...root.querySelectorAll<HTMLElement>('.layer-thumbnails > div')];
    layerThumbs.forEach((thumb, index) => bind(thumb, () => {
      setViewMode('3d');
      const label = index === 0 ? '1단' : index <= 2 ? '1~3단' : '1~5단';
      byText(root, '.layer-slicer button', label)?.click();
      scrollToSelector('.viewer-card');
    }));

    let raf = 0;
    const refresh = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        updateConstraintCards();
        renderHeatmapFromMinimap();
      });
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(root, { childList: true, subtree: true, characterData: true });

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      handlers.forEach(off => off());
    };
  }, []);

  return null;
}
