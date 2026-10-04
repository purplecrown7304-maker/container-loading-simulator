import { expect, test, type Page } from '@playwright/test';

async function seedAndPackage(page:Page, mixed=false) {
  await page.goto('/');
  await page.getByLabel('적재 규칙',{exact:true}).selectOption('a-v1');
  await page.evaluate(({mixed})=>{
    localStorage.setItem('container-loading-product-packaging-v1:guest',JSON.stringify({
      container:{length:12.03,width:2.35,height:2.69,maxPayloadKg:26500},
      products:(mixed?['A','B']:['A']).map(id=>({id:`MIN-${id}`,name:`최소 팔레트 ${id}`,length:.49,width:.49,height:.37,weightKg:10,quantity:mixed?4:24,requiresBoxPackaging:true})),
      boxes:[{id:'MIN-BOX',name:'6단 등록 박스',innerLength:.491,innerWidth:.491,innerHeight:.371,outerLength:.5,outerWidth:.5,outerHeight:.38,tareWeightKg:0,maxGrossWeightKg:10,maxStackLayers:6,maxTopLoadKg:1000}],settings:{allowCustom:false},
    }));
    window.dispatchEvent(new Event('container-loading:enterprise-packaging-planner-updated'));
  },{mixed});
  await page.getByRole('button',{name:/다음: 제품 선택/}).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill('MIN-');
  for(const id of mixed?['A','B']:['A']) await page.locator('.guided-product-table article').filter({hasText:`MIN-${id}`}).locator('input[type=number]').fill(mixed?'4':'24');
  await page.getByRole('button',{name:/다음: 제품 포장/}).click();
  await page.getByRole('button',{name:/포장 확정 · 다음: 적재 방식 선택/}).click();
  await page.getByRole('radio',{name:/공간효율 우선/}).click();
}

test.beforeEach(async ({context,baseURL})=>{
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(baseURL!).origin?route.continue():route.abort());
});

test('STEP04 compares real counts and loads 24 cartons on one pallet',async ({page})=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await seedAndPackage(page);
  await page.getByRole('radio',{name:/파렛트 적재/}).click();
  await page.getByRole('radio',{name:'T12 목재 (EPAL 3)',exact:true}).click();
  await expect(page.getByRole('columnheader',{name:'팔레트당 박스 단수',exact:true})).toBeVisible();
  await expect(page.getByRole('columnheader',{name:'팔레트 적층',exact:true})).toBeVisible();
  // Hold the worker script so cancel and duplicate-run protection are verified
  // deterministically, without relying on machine speed or invented timeouts.
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const workerPattern='**/loadingForecast.worker-*.js';
  await page.route(workerPattern,async route=>{await gate;await route.continue().catch(()=>{});});
  await page.getByRole('button',{name:'예상 결과 비교',exact:true}).click();
  await expect(page.getByRole('button',{name:'예상 결과 비교',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'비교 취소',exact:true}).click();
  release();
  await page.unroute(workerPattern);
  await expect(page.locator('.step04-forecast dd').first()).toHaveText('미계산');
  await page.getByRole('button',{name:'예상 결과 비교',exact:true}).click();
  await expect(page.locator('.step04-forecast dd').first()).toHaveText('24개',{timeout:60000});
  await expect(page.locator('.guided-strategy-grid[aria-label="최적화 목표"]')).toContainText('팔레트 1장 · 미적재 0개 · 계산상 오류 0건');
  await page.screenshot({path:test.info().outputPath('step04-calculated-forecast.png'),fullPage:true,animations:'disabled'});
  // Consignee updates invalidate old estimates while retaining packaging confirmation.
  await page.getByLabel('수령처 지정 팔레트 규격').selectOption('1200x1000');
  await expect(page.locator('.step04-forecast dd').first()).toHaveText('미계산');
  await expect(page.getByRole('button',{name:/다음 단계/})).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:test.info().outputPath('step04-pallet-comparison.png'),fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:/다음 단계/}).click();
  await page.getByRole('button',{name:/최종 적재 진행/}).click();
  await expect.poll(()=>page.evaluate(()=>{
    const result=(window as any).__containerLoadingPalletSnapshot?.result;
    return result && {count:result.placements.length,pallets:result.palletCount};
  }),{timeout:60000}).toEqual({count:24,pallets:1});
  await expect(page.locator('.viewer-host .three-comparison-viewer')).toHaveAttribute('data-three-supports','1');
  await expect(page.locator('[data-workspace-step="6"]')).toBeEnabled({timeout:90000});
  await page.screenshot({path:test.info().outputPath('minimum-one-pallet-canvas.png'),fullPage:true,animations:'disabled'});
  expect(errors).toEqual([]);
});

test('mixed SKU assignment and independent unloading survive navigation and reach the engine',async ({page})=>{
  test.setTimeout(120000);
  await seedAndPackage(page,true);
  await page.getByRole('radio',{name:/혼합 적재/}).click();
  await page.getByLabel('최소 팔레트 A 혼합 적재 방식').selectOption('direct');
  await page.getByLabel('최소 팔레트 B 혼합 적재 방식').selectOption('pallet');
  await page.getByRole('radio',{name:'T12 목재 (EPAL 3)',exact:true}).click();
  await page.getByText('품목별 착지 번호 · 같은 배송지는 같은 번호',{exact:true}).click();
  await page.getByRole('spinbutton',{name:'최소 팔레트 B 하역 순서',exact:true}).fill('2');
  await page.getByRole('radio',{name:/^완화/}).click();
  await page.getByRole('radio',{name:/안정성 우선/}).click();
  await expect(page.getByRole('radio',{name:/^완화/})).toHaveAttribute('aria-checked','true');
  await page.getByRole('button',{name:'설정 닫기',exact:true}).click();
  await page.locator('[data-workspace-step="4"]').click();
  await expect(page.getByLabel('최소 팔레트 A 혼합 적재 방식')).toHaveValue('direct');
  await expect(page.getByRole('radio',{name:/^완화/})).toHaveAttribute('aria-checked','true');
  await expect(page.getByRole('button',{name:/다음 단계/})).toBeEnabled();
  await page.screenshot({path:test.info().outputPath('step04-mixed-and-unload.png'),fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:/다음 단계/}).click();
  await page.getByRole('button',{name:/최종 적재 진행/}).click();
  await expect.poll(()=>page.evaluate(()=>{
    const snapshot=(window as any).__containerLoadingPalletSnapshot;
    return snapshot && {direct:snapshot.result.mixed?.directBoxCount,pallet:snapshot.result.mixed?.palletBoxCount,policy:(window as any).__containerLoadingPhysicsTarget?.container.unloadingPolicy};
  }),{timeout:60000}).toEqual({direct:4,pallet:4,policy:'soft'});
  try {
    await expect(page.locator('[data-workspace-step="6"]')).toBeEnabled({timeout:30000});
  } finally {
    await test.info().attach('mixed-final-state',{contentType:'application/json',body:JSON.stringify(await page.evaluate(()=>({target:(window as any).__containerLoadingPhysicsTarget,certification:(window as any).__containerLoadingLatestCertification, text:document.body.innerText})),null,2)});
  }
  const final = await page.evaluate(()=>(window as any).__containerLoadingPalletSnapshot.result);
  expect(final.mixed.directBoxCount).toBe(4);
  expect(final.pallets.flatMap((p:any)=>p.cargoPlacements).every((p:any)=>p.cargoId==='PKG-MIN-B')).toBe(true);
  await page.screenshot({path:test.info().outputPath('mixed-loading-canvas.png'),fullPage:true,animations:'disabled'});
});
