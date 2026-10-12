import { expect, test, type Page } from '@playwright/test';
import type { CargoItem, ContainerSpec } from '../src/engine/types';
import { clearLatestInertiaCertification, type InertiaCertification } from '../src/inertiaCertification';
import { buildPalletLoadingReportHtml, type PalletWorkSnapshot } from '../src/palletWorkerReport';
import { clearPhysicsTarget } from '../src/physicsTarget';
import { buildLoadingReportHtml } from '../src/report';
import { reportFixture } from '../src/reportZones.fixture';
import { getTransportEquipment, readTransportEquipment, selectTransportEquipment } from '../src/transportEquipment';
import { setUiLanguage } from '../src/uiLanguage';

// Run in both configured Chromium projects. Generated reports have no app/auth dependency.
const copy = {
  en: {
    title: 'Container shipment and loading work order', palletTitle: 'Pallet loading work order',
    layout: 'Loading layout at a glance', checklist: 'Field work checklist',
    final: 'Final checks before dispatch', print: 'Print / Save PDF',
    fields: ['Customer', 'Destination', 'Vehicle/Container No.', 'Planned dispatch'],
    missing: 'Unspecified', missingPrefix: 'Missing shipment information: ',
    missingQuestion: '\nPrint with missing-field labels?',
    complete: 'Shipment information complete · Check the details before printing.',
    incomplete: 'Validation incomplete', review: 'For review · Verification required',
    whatIf: 'WHAT-IF REVIEW · Not dispatch approval',
    disclaimer: 'not transport safety certification',
  },
  vi: {
    title: 'Lệnh xuất và xếp hàng Container', palletTitle: 'Lệnh xếp hàng pallet',
    layout: 'Tổng quan bố trí xếp hàng', checklist: 'Danh sách kiểm tra hiện trường',
    final: 'Kiểm tra cuối trước khi xuất hàng', print: 'In / Lưu PDF',
    fields: ['Khách hàng', 'Điểm đến', 'Số xe/container', 'Dự kiến xuất hàng'],
    missing: 'Chưa nhập', missingPrefix: 'Thiếu thông tin xuất hàng: ',
    missingQuestion: '\nIn kèm nhãn mục chưa nhập?',
    complete: 'Đã nhập đủ thông tin xuất hàng · Kiểm tra nội dung trước khi in.',
    incomplete: 'Kiểm chứng chưa hoàn tất', review: 'Để xem xét · Cần kiểm tra xác nhận',
    whatIf: 'WHAT-IF REVIEW · Không phải phê duyệt xuất hàng',
    disclaimer: 'không phải chứng nhận an toàn vận chuyển',
  },
} as const;
const cargoName = '한국고객 원문 <script>window.__reportInjection = 1</script> & "A"';
const shipmentValues = {
  customer: '서울고객 <img src=x onerror="window.__reportInjection=2">',
  destination: '인천창고 & <A> "도착지"',
  vehicle: '차량-TEST-001',
  departure: '2026-10-12 09:00',
};
const fieldIds = ['customer', 'destination', 'vehicle', 'departure'] as const;
const previousEquipment = readTransportEquipment();

test.beforeEach(() => {
  clearLatestInertiaCertification();
  clearPhysicsTarget();
  selectTransportEquipment(getTransportEquipment('20-standard')!);
});
test.afterEach(() => {
  setUiLanguage('ko');
  clearLatestInertiaCertification();
  clearPhysicsTarget();
  selectTransportEquipment(previousEquipment);
});

/** Keep only exact, deliberately supplied user strings out of the fixed-copy audit. */
async function expectNoFixedHangul(page: Page, userText: readonly string[] = []) {
  const renderedCopy = await page.evaluate(() => {
    const body = document.body.cloneNode(true) as HTMLElement;
    body.querySelectorAll('script, style').forEach(element => element.remove());
    const attributes = [...body.querySelectorAll('*')].flatMap(element =>
      ['aria-label', 'title', 'placeholder', 'alt'].map(name => element.getAttribute(name) ?? '').filter(Boolean));
    return [document.title, body.textContent ?? '', ...attributes].join('\n');
  });
  const fixedCopy = userText.reduce((text, value) => text.replaceAll(value, ''), renderedCopy);
  const untranslated = [...fixedCopy.matchAll(/.{0,45}[가-힣ㄱ-ㅎㅏ-ㅣ].{0,85}/g)].map(match => match[0]);
  expect(untranslated).toEqual([]);
  expect((await page.locator('script').allTextContents()).join('\n')).not.toMatch(/[가-힣]/);
}

async function clickPrintWithDialog(page: Page, button: string, accept: boolean) {
  const dialogResult = page.waitForEvent('dialog').then(async dialog => {
    const result = { type: dialog.type(), message: dialog.message() };
    if (accept) await dialog.accept(); else await dialog.dismiss();
    return result;
  });
  await page.getByRole('button', { name: button, exact: true }).click();
  return dialogResult;
}

async function installPrintSpy(page: Page) {
  await page.evaluate(() => {
    const state = window as Window & { __reportPrintCount?: number };
    state.__reportPrintCount = 0;
    window.print = () => { state.__reportPrintCount = (state.__reportPrintCount ?? 0) + 1; };
  });
}
const printCount = (page: Page) => page.evaluate(() => (window as Window & { __reportPrintCount?: number }).__reportPrintCount);

// Same synthetic stacked-pallet shape as workOrderReportLanguage.test.ts; no solver runs.
function palletFixture() {
  const container: ContainerSpec = { length: 4.4, width: 2.2, height: 2.6, maxPayloadKg: 5000 };
  const cargo: CargoItem[] = [{ id: 'A', name: cargoName, length: .5, width: .5, height: .4, weightKg: 10, quantity: 4 }];
  const pallets = [0, 1].map(index => ({
    palletIndex: index + 1, x: 0, y: 0, z: index * .55, stackLevel: index + 1, stackColumn: 1,
    length: 1.1, width: 1.1, height: .15,
    cargoPlacements: [0, .5].map(x => ({ cargoId: 'A', x, y: 0, z: .15 + index * .55, length: .5, width: .5, height: .4, weightKg: 10 })),
    cargoWeightKg: 20, packagingWeightKg: 0, packagingExtraHeightM: 0,
    cornerGuardsUsed: false, wrappingUsed: false, totalWeightKg: 45,
    centerOfGravity: { x: .5, y: .25, z: .3 + index * .55 },
  }));
  const snapshot: PalletWorkSnapshot = {
    spec: { length: 1.1, width: 1.1, height: .15, tareWeightKg: 25, maxLoadKg: 1000,
      maxStackLevels: 2, maxSupportedTopWeightKg: 1000, useCornerGuards: false,
      cornerGuardWeightKg: 2, cornerGuardExtraHeightM: .03, useWrapping: false,
      wrappingWeightKg: 1.5, wrappingExtraHeightM: .01, minimizePackaging: true },
    result: { pallets, placements: pallets.flatMap(pallet => pallet.cargoPlacements), remaining: [],
      palletCount: 2, loadedCargoWeightKg: 40, totalPackagingWeightKg: 0, avoidedPackagingWeightKg: 0,
      packagedPalletCount: 0, totalPalletizedWeightKg: 90, consolidatedPallets: 0,
      lateralImbalanceKg: 0, stackedPallets: 1, maxUsedStackLevel: 2,
      optimization: { selectedStackTarget: 2, candidateCount: 2, floorPositions: 1, redistributedForLowUtilization: false, consolidationPasses: 0 } },
  };
  const certification: InertiaCertification = {
    status: 'passed', mode: 'pallets', targetSignature: 'legacy-test-only', testedAt: '2026-10-12T00:00:00Z',
    securing: { level: 2, levelLabel: '2차 보강 · 밴딩+각대+랩핑', palletCount: 2, palletWeightKg: 50,
      bandingStraps: 6, bandingLengthM: 18, cornerGuards: 8, cornerGuardLengthM: 3.2, wrappingLengthM: 28,
      antiSlipMats: 2, dunnageBlocks: 0, loadBars: 0, estimatedAddedWeightKg: 2.1, estimatedNonCargoWeightKg: 52.1 },
    testedScenarios: 3, passedScenarios: 3, failedScenarios: [], maxHorizontalShiftM: .006,
    maxCargoRelativeSlipM: .003, maxSupportShiftM: .004, maxTiltDeg: .9, maxCargoRestraintForceN: 2400,
    results: {}, payloadWithinLimit: true,
  };
  return { container, cargo, snapshot, certification };
}

for (const language of ['en', 'vi'] as const) {
  test(`${language} carton report preserves localized dialogs, user fields and review status when printed`, async ({ page }) => {
    const text = copy[language];
    const fixture = reportFixture();
    fixture.cargo[0].name = cargoName;
    const original = JSON.stringify(fixture);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    setUiLanguage(language);
    const html = buildLoadingReportHtml(fixture.container, fixture.cargo, fixture.result);
    // A generated document must keep its own language even if the app switches afterwards.
    setUiLanguage(language === 'en' ? 'vi' : 'en');
    await page.setContent(html);
    await installPrintSpy(page);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page).toHaveTitle(text.title);
    for (const heading of [text.title, text.layout, text.checklist, text.final]) {
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }
    await expect(page.locator('.zone-table tbody tr')).toHaveCount(5);
    await expect(page.locator('.zone-progress article')).toHaveCount(5);
    await expect(page.locator('.zone-table tfoot')).toContainText('895');
    await expect(page.locator('.partial-locations li')).toHaveCount(3);
    await expect(page.locator('.zone-legend')).toContainText(cargoName);
    await expect(page.locator('.report-status')).toHaveClass(/neutral/);
    await expect(page.locator('.report-status')).toContainText(text.incomplete);
    await expect(page.locator('.watermark')).toHaveText(text.review);
    await expect(page.locator('aside.technical-note')).toContainText(text.disclaimer);
    await expectNoFixedHangul(page, [cargoName]);

    const firstDialog = await clickPrintWithDialog(page, text.print, false);
    expect(firstDialog).toEqual({ type: 'confirm', message: text.missingPrefix + text.fields.join(', ') + text.missingQuestion });
    expect(await printCount(page)).toBe(0);
    await expect(page.getByLabel(text.fields[0], { exact: true })).toBeFocused();
    for (const [index, id] of fieldIds.entries()) {
      const input = page.getByLabel(text.fields[index], { exact: true });
      await expect(input).toHaveAttribute('placeholder', text.missing);
      await input.fill(shipmentValues[id]);
      await expect(input).toHaveValue(shipmentValues[id]);
      await expect(page.locator(`[data-shipment-value="${id}"]`)).toHaveText(shipmentValues[id]);
    }
    await expect(page.locator('#shipment-input-status')).toHaveText(text.complete);
    await expect(page.locator('.report-shipment-values img, .report-shipment-values script, .zone-legend script')).toHaveCount(0);
    expect(await page.evaluate(() => (window as Window & { __reportInjection?: number }).__reportInjection)).toBeUndefined();
    await page.getByRole('button', { name: text.print, exact: true }).click();
    expect(await printCount(page)).toBe(1);

    await page.getByLabel(text.fields[3], { exact: true }).fill('   ');
    const cancelDialog = await clickPrintWithDialog(page, text.print, false);
    expect(cancelDialog.message).toBe(text.missingPrefix + text.fields[3] + text.missingQuestion);
    expect(await printCount(page)).toBe(1);
    await expect(page.getByLabel(text.fields[3], { exact: true })).toBeFocused();
    await expect(page.getByLabel(text.fields[0], { exact: true })).toHaveValue(shipmentValues.customer);
    const acceptDialog = await clickPrintWithDialog(page, text.print, true);
    expect(acceptDialog).toEqual(cancelDialog);
    expect(await printCount(page)).toBe(2);
    await expect(page.locator('[data-shipment-value="departure"]')).toHaveText(text.missing);
    await expect(page.locator('[data-shipment-value="departure"]')).toHaveClass(/shipment-missing/);

    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.report-shipment-entry')).toBeHidden();
    await expect(page.locator('.report-toolbar')).toBeHidden();
    await expect(page.locator('.report-nav')).toBeHidden();
    await expect(page.locator('.watermark')).toBeVisible();
    await expect(page.locator('.watermark')).toHaveText(text.review);
    await expect(page.locator('.report-status')).not.toHaveClass(/good/);
    for (const id of fieldIds.slice(0, 3)) {
      await expect(page.locator(`[data-shipment-value="${id}"]`)).toBeVisible();
      await expect(page.locator(`[data-shipment-value="${id}"]`)).toHaveText(shipmentValues[id]);
    }
    await expectNoFixedHangul(page, [cargoName, ...Object.values(shipmentValues)]);

    // Browser-menu printing must synchronize values even without an input event.
    await page.evaluate(() => {
      document.querySelector<HTMLInputElement>('[data-shipment-input="departure"]')!.value = '2026-10-13 10:30';
      window.dispatchEvent(new Event('beforeprint'));
    });
    await expect(page.locator('[data-shipment-value="departure"]')).toHaveText('2026-10-13 10:30');
    await expect(page.locator('[data-shipment-value="departure"]')).not.toHaveClass(/shipment-missing/);
    await page.emulateMedia({ media: 'screen' });
    await expect(page.getByLabel(text.fields[0], { exact: true })).toHaveValue(shipmentValues.customer);
    await expect(page.locator('#shipment-input-status')).toHaveText(text.complete);
    await page.getByRole('button', { name: text.print, exact: true }).click();
    expect(await printCount(page)).toBe(3);
    expect(JSON.stringify(fixture)).toBe(original);
    expect(errors).toEqual([]);
  });

  test(`${language} numerical-review report remains explicitly unapproved in print`, async ({ page }) => {
    const text = copy[language];
    const fixture = reportFixture();
    fixture.container.limitReview = { mode: 'what-if', maxPayloadKg: 30000 };
    const original = JSON.stringify(fixture);
    setUiLanguage(language);
    await page.setContent(buildLoadingReportHtml(fixture.container, fixture.cargo, fixture.result));
    await expect(page.locator('.watermark')).toHaveText(text.whatIf);
    await expect(page.locator('.limit-review-warning')).toBeVisible();
    await expect(page.locator('.report-status')).toContainText(text.whatIf);
    await expect(page.locator('.report-status')).toHaveClass(/caution/);
    await expectNoFixedHangul(page);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.watermark')).toBeVisible();
    await expect(page.locator('.limit-review-warning')).toBeVisible();
    await expect(page.locator('.report-status')).not.toHaveClass(/good/);
    expect(JSON.stringify(fixture)).toBe(original);
  });

  test(`${language} stacked-pallet report localizes diagrams and print without promoting legacy verification`, async ({ page }) => {
    const text = copy[language];
    const fixture = palletFixture();
    const original = JSON.stringify(fixture);
    setUiLanguage(language);
    await page.setContent(buildPalletLoadingReportHtml(fixture.container, fixture.cargo, fixture.snapshot, fixture.certification));
    await installPrintSpy(page);
    await expect(page).toHaveTitle(text.palletTitle);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.getByRole('heading', { name: text.checklist, exact: true })).toBeVisible();
    await expect(page.locator('.diagrams svg')).toHaveCount(2);
    await expect(page.locator('.work tbody tr')).toHaveCount(2);
    await expect(page.locator('.sequence article')).toHaveCount(2);
    await expect(page.locator('.work')).toContainText(cargoName);
    await expect(page.locator('.work script')).toHaveCount(0);
    await expect(page.locator('.technical')).toContainText(text.disclaimer);
    await expect(page.locator('.watermark')).toHaveText(text.review);
    // This legacy fixture also has genuine support/CG failures: translation must
    // retain the danger verdict and the measured values, not hide diagnostics.
    await expect(page.locator('.report-status')).toHaveClass(/danger/);
    for (const value of ['41.3%', '80%', '1700', '220', '850', '110']) {
      await expect(page.locator('.recommendations')).toContainText(value);
    }
    await expectNoFixedHangul(page, [cargoName]);
    await page.getByRole('button', { name: text.print, exact: true }).click();
    expect(await printCount(page)).toBe(1);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.report-toolbar')).toBeHidden();
    await expect(page.locator('.watermark')).toBeVisible();
    await expect(page.locator('.work')).toBeVisible();
    await expect(page.locator('.report-signoff')).toBeVisible();
    await expect(page.locator('.report-status')).not.toHaveClass(/good/);
    expect(await page.evaluate(() => (window as Window & { __reportInjection?: number }).__reportInjection)).toBeUndefined();
    expect(JSON.stringify(fixture)).toBe(original);
  });
}
