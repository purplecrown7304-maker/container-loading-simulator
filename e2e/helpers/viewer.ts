import { expect, type Page } from '@playwright/test';

export const backgroundPreferenceKey = 'container-loading:viewer-environment';

export async function expectThreeOnly(page: Page) {
  await expect(page.getByRole('group', { name: '3D 엔진 선택' })).toHaveCount(0);
  await expect(page.getByText('3D 엔진 · 동일 적재 결과', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Unity', exact: true })).toHaveCount(0);
  await expect(page.locator('iframe[src*="unity-viewer"], [data-unity-ready], [data-unity-applied]')).toHaveCount(0);
}

export async function expectGlobalBackgroundControl(page: Page, value?: string) {
  const selector = page.getByRole('combobox', { name: '3D 배경', exact: true });
  await expect(selector).toHaveCount(1);
  await expect(page.locator('.reference-utility').getByRole('combobox', { name: '3D 배경', exact: true })).toHaveCount(1);
  await expect(page.locator('.viewer-host,.workspace-modal').getByRole('combobox', { name: '3D 배경', exact: true })).toHaveCount(0);
  await expect(selector).toBeVisible();
  await expect(selector).toBeEnabled();
  if (value) await expect(selector).toHaveValue(value);
  await expect(selector.locator('option')).toHaveText(['숲속', '물류창고', '해변', '우주']);
  return selector;
}

export async function expectHeaderSceneControlsFit(page: Page) {
  const selector = await expectGlobalBackgroundControl(page);
  const equipment = page.getByRole('button', { name: '현재 장비 변경', exact: true });
  await expect(equipment).toBeVisible();
  await expect(equipment).toBeInViewport();
  await expect(selector).toBeInViewport();
  await expect(page.locator('.header-menu-button')).toBeInViewport();
  const layout = await selector.evaluate(element => {
    const controls = element.closest('.header-scene-controls');
    const equipment = controls?.querySelector('.header-equipment-pill');
    const wrapper = element.closest('.viewer-background-selector');
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { adjacent: !!equipment && equipment.nextElementSibling === wrapper,
      pointerReachable: hit === element || element.contains(hit),
      equipment: equipment?.getBoundingClientRect().toJSON(), selector: rect.toJSON(),
      fits: document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1 };
  });
  expect(layout.adjacent).toBe(true);
  expect(layout.pointerReachable).toBe(true);
  expect(layout.equipment).toBeDefined();
  expect(layout.selector.x).toBeGreaterThanOrEqual(layout.equipment!.right - 1);
  expect(layout.selector.x - layout.equipment!.right).toBeLessThanOrEqual(60);
  expect(Math.abs(layout.selector.y + layout.selector.height / 2 - (layout.equipment!.y + layout.equipment!.height / 2))).toBeLessThanOrEqual(8);
  expect(layout.selector.height).toBeGreaterThanOrEqual(28);
  expect(layout.fits).toBe(true);
}

export async function expectCompactViewerFooter(page: Page) {
  const footer = page.getByRole('group', { name: '3D 보기 조작 및 적재 요약', exact: true });
  await expect(footer).toHaveCount(1);
  await expect(footer).toBeVisible();
  const layout = await footer.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const scene = document.querySelector('.viewer-host .three-comparison-stage')!.getBoundingClientRect();
    const style = getComputedStyle(element);
    const items = Array.from(element.querySelectorAll<HTMLElement>('.unity-controls > *, .unity-summary > span'))
      .filter(item => getComputedStyle(item).display !== 'none')
      .map(item => { const box = item.getBoundingClientRect(); return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, centerY: box.y + box.height / 2 }; });
    return { direction: style.flexDirection, display: style.display, wrap: style.flexWrap, rect: rect.toJSON(), scene: scene.toJSON(), items };
  });
  expect(layout.display).toBe('flex');
  expect(layout.direction).toBe('row');
  expect(layout.wrap).toBe('wrap');
  expect(layout.items.length).toBeGreaterThanOrEqual(2);
  expect(layout.rect.x).toBeGreaterThanOrEqual(layout.scene.x);
  expect(layout.rect.right).toBeLessThanOrEqual(layout.scene.right + 1);
  expect(layout.rect.bottom).toBeLessThanOrEqual(layout.scene.bottom);
  expect(layout.rect.height).toBeLessThanOrEqual(layout.scene.height * .3 + 2);
  for (const item of layout.items) {
    expect(item.x).toBeGreaterThanOrEqual(layout.rect.x - 1);
    expect(item.right).toBeLessThanOrEqual(layout.rect.right + 1);
  }
  if (page.viewportSize()!.width >= 1100) {
    const centers = layout.items.map(item => item.centerY);
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(4);
  }
  await expect(page.locator('.viewer-host .three-comparison-metrics')).toHaveCount(0);
}
