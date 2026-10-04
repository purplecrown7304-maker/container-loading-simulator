import { afterEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const styles = readFileSync(resolve(process.cwd(), 'src/persistent-workspace.css'), 'utf8');

let style: HTMLStyleElement | undefined, host: HTMLDivElement | undefined;
afterEach(() => { style?.remove(); host?.remove(); delete document.documentElement.dataset.guidedWorkflow; });
it('constrains the step rail to its floating wrapper and keeps every step scrollable', () => {
  document.documentElement.dataset.guidedWorkflow = 'true';
  style = document.createElement('style'); style.textContent = styles; document.head.append(style);
  host = document.createElement('div'); host.className = 'dashboard-left';
  host.style.setProperty('max-height', '154px', 'important');
  host.innerHTML = '<section class="guided-step-rail"><div class="guided-step-list">'
    + Array.from({ length: 6 }, (_, index) => `<button>Step ${index + 1}</button>`).join('')
    + '</div></section>';
  document.body.append(host);
  const rail = host.querySelector<HTMLElement>('.guided-step-rail')!;
  // happy-dom does not resolve inherited max-height; the browser test checks
  // the resulting bounds, while this test checks the actual parsed rule.
  const railRule = Array.from(style.sheet!.cssRules).find(rule => rule instanceof CSSStyleRule
    && rule.selectorText === 'html[data-guided-workflow="true"] .guided-step-rail') as CSSStyleRule;
  expect(railRule.style.maxHeight).toBe('inherit');
  expect(getComputedStyle(rail).overflowY).toBe('auto');
  expect(getComputedStyle(rail).overscrollBehavior).toBe('contain');
  expect(rail.querySelectorAll('button')).toHaveLength(6);
});

it('lays out the canvas bottom info horizontally and suppresses it during active inertia playback', () => {
  document.documentElement.dataset.guidedWorkflow = 'true';
  style = document.createElement('style'); style.textContent = styles; document.head.append(style);
  host = document.createElement('div'); host.className = 'mockup-dashboard';
  host.innerHTML = '<div class="viewer-host"><div class="inertia-canvas-host" data-inertia-active="false"><div class="viewer-bottom-info"><div class="unity-controls"><label>높이 단면</label></div><div class="unity-summary"><span>적재 요약</span></div></div></div></div>';
  document.body.append(host);
  const strip = host.querySelector<HTMLElement>('.viewer-bottom-info')!;
  const playback = host.querySelector<HTMLElement>('.inertia-canvas-host')!;
  expect(getComputedStyle(strip).display).toBe('flex');
  expect(getComputedStyle(strip).flexWrap).toBe('wrap');
  expect(getComputedStyle(host.querySelector('.unity-summary')!).display).toBe('contents');
  playback.dataset.inertiaActive = 'true';
  expect(getComputedStyle(strip).display).toBe('none');
  playback.dataset.inertiaActive = 'false';
  expect(getComputedStyle(strip).display).toBe('flex');
});
