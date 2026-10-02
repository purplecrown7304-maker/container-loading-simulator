import { expect, type Page } from '@playwright/test';

/** Workspace controls are deliberately modal; close the current workspace before using the rail. */
export async function openWorkspace(page: Page, step: number) {
  const workspace = page.locator('.workspace-modal');
  if (await workspace.isVisible()) await workspace.getByRole('button', { name: '설정 닫기', exact: true }).click();
  await page.locator(`.guided-step-list button[data-workspace-step="${step}"]`).click();
  await expect(workspace).toBeVisible();
  return workspace;
}

/** Neither floating bar may reserve a layout row/column or intercept the empty canvas. */
export async function expectFloatingWorkspacesOverCanvas(page: Page) {
  const geometry = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector)!;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom,
        position: style.position, pointerEvents: style.pointerEvents,
        paddingLeft: parseFloat(style.paddingLeft), paddingRight: parseFloat(style.paddingRight),
        paddingTop: parseFloat(style.paddingTop), paddingBottom: parseFloat(style.paddingBottom) };
    };
    const center = read('.dashboard-center');
    const hit = document.elementFromPoint(center.x + center.width / 2, center.y + center.height * .65);
    return { grid: read('.dashboard-grid'), center, left: read('.dashboard-left'), right: read('.dashboard-right'),
      rail: read('.guided-step-rail'), summary: read('.guided-job-summary'),
      buttons: Array.from(document.querySelectorAll<HTMLElement>('.guided-step-list button')).map(element => {
        const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y, bottom: rect.bottom };
      }), canvasReceivesPointer: document.querySelector('.viewer-card')!.contains(hit) };
  });
  const { grid, center, rail, summary } = geometry;
  // Allow only the grid's decorative padding, never a row/column allocated to either bar.
  expect(Math.abs(center.x - (grid.x + grid.paddingLeft))).toBeLessThanOrEqual(2);
  expect(Math.abs(center.y - (grid.y + grid.paddingTop))).toBeLessThanOrEqual(2);
  expect(Math.abs(center.width - (grid.width - grid.paddingLeft - grid.paddingRight))).toBeLessThanOrEqual(2);
  expect(Math.abs(center.height - (grid.height - grid.paddingTop - grid.paddingBottom))).toBeLessThanOrEqual(2);
  for (const overlay of [rail, summary]) {
    expect(overlay.x).toBeGreaterThanOrEqual(center.x - 1);
    expect(overlay.y).toBeGreaterThanOrEqual(center.y - 1);
    expect(overlay.right).toBeLessThanOrEqual(center.right + 1);
    expect(overlay.bottom).toBeLessThanOrEqual(center.bottom + 1);
    expect(overlay.width).toBeGreaterThan(0);
    expect(overlay.height).toBeGreaterThan(0);
    expect(overlay.pointerEvents).toBe('auto');
  }
  expect(rail.right).toBeLessThanOrEqual(center.x + center.width / 2);
  expect(summary.x).toBeGreaterThanOrEqual(center.x + center.width / 2);
  expect(geometry.left.position).toBe('absolute');
  expect(geometry.right.position).toBe('absolute');
  expect(geometry.left.pointerEvents).toBe('none');
  expect(geometry.right.pointerEvents).toBe('none');
  for (let index = 1; index < geometry.buttons.length; index++) {
    expect(geometry.buttons[index].y).toBeGreaterThanOrEqual(geometry.buttons[index - 1].bottom - 1);
    expect(Math.abs(geometry.buttons[index].x - geometry.buttons[0].x)).toBeLessThanOrEqual(1);
  }
  expect(geometry.canvasReceivesPointer).toBe(true);
  // Check the rendered scene itself, not only the full-height outer panel.
  // Regression: the old auto-loading page left a tiny 180px scene above a blank page.
  const scene = page.locator('.viewer-host .unity-stage');
  const sceneBox = await scene.boundingBox();
  expect(sceneBox).not.toBeNull();
  expect(Math.abs(sceneBox!.height - center.height)).toBeLessThanOrEqual(3);
  expect(Math.abs(sceneBox!.width - center.width)).toBeLessThanOrEqual(3);
  expect(Math.abs(sceneBox!.x - center.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(sceneBox!.y - center.y)).toBeLessThanOrEqual(2);
  const actual = scene.locator('canvas,iframe').first();
  if (await actual.count()) {
    const surface = await actual.boundingBox();
    expect(surface!.height).toBeGreaterThan(sceneBox!.height - 3);
    expect(surface!.width).toBeGreaterThan(sceneBox!.width - 3);
  }
  for (const button of await page.locator('.guided-step-list button:enabled').all()) await expect(button).toBeInViewport();
}
