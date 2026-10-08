import {test,expect} from '@playwright/test';
test.use({launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']}});
test('A rules keep the canvas, run a real worker and invalidate results on switching',async({page,context,baseURL})=>{
 test.setTimeout(120000);
 await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(baseURL!).origin?r.continue():r.abort());
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 const rules=page.getByLabel('적재 규칙',{exact:true});await expect(rules).toBeVisible();
 await rules.selectOption('a-v1');
 await expect.poll(()=>page.evaluate(()=>(window as any).__containerLoadingLatestResult?.container.maxPayloadKg)).toBe(28600);
 await expect.poll(()=>page.evaluate(()=>(window as any).__containerLoadingLatestResult?.container.rules?.version)).toBe('a-v1');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('container-loading:open-product-tool', { detail: 'products' })));
  const product = page.getByRole('dialog', { name: '회사 제품 관리' });
  await product.getByLabel('제품코드').fill('A-QA');
  await product.getByLabel('제품명').fill('점검용 샘플');
  await product.getByLabel('길이 mm').fill('400'); await product.getByLabel('폭 mm').fill('300'); await product.getByLabel('높이 mm').fill('200');
  await product.getByLabel('중량 kg').fill('2'); await product.getByLabel('박스 적재').selectOption('no');
  await product.getByRole('button', { name: '제품 등록' }).click(); await product.locator('header button').click();
  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill('A-QA');
  await page.locator('.guided-product-table article').filter({ hasText: 'A-QA' }).locator('input[type=number]').fill('1');
  await page.getByRole('button', { name: /다음: 제품 포장/ }).click();
  await expect(page.getByText('포장안 준비 완료')).toBeVisible();
  await page.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click();
  await page.getByRole('radio', { name: /공간효율 우선/ }).click();
  await page.getByRole('button', { name: /다음 단계/ }).click();
  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__containerLoadingLatestResult?.result.ruleset),{timeout:60000}).toBe('a-v1');
 const viewer=page.locator('.viewer-card .three-comparison-viewer');
 await expect(viewer).toHaveAttribute('data-three-count','1',{timeout:30000});
 await expect(viewer).toHaveAttribute('data-three-applied','true');
 expect(await page.evaluate(()=>(window as any).__containerLoadingLatestResult.result.ruleset)).toBe('a-v1');
 await page.screenshot({path:test.info().outputPath('a-loaded.png'),fullPage:true});
 const findings=await page.evaluate(()=>(window as any).__containerLoadingLatestResult.result.operationalFindings);
 expect(findings.filter((f:any)=>f.severity==='error')).toEqual([]);
 expect(findings.filter((f:any)=>f.code==='SECURING_FORCE')).toEqual([expect.objectContaining({severity:'warning',placementIndexes:[0],value:expect.any(Number)})]);
 await expect.poll(()=>page.evaluate(()=>!(window as any).__containerLoadingFinalPhysicsRunning),{timeout:60000}).toBe(true);
 await expect.poll(()=>page.evaluate(()=>Boolean((window as any).__containerLoadingLatestCertification)),{timeout:60000}).toBe(true);
 await page.locator('.header-menu-button').click();
 const inspections=page.locator('section[aria-label="점검 메뉴"]');
 await expect(inspections.getByRole('button')).toHaveCount(4);
 await inspections.getByRole('button',{name:'관성 테스트',exact:true}).click();
 const motion=page.locator('[aria-labelledby="inertia-title"]');
 const timeline=motion.getByRole('slider',{name:'관성 테스트 재생 위치'});
 await expect(timeline).toBeVisible({timeout:60000});
 await timeline.fill('20');
 await expect(viewer).toHaveAttribute('data-three-frame-step','40');
 await expect(viewer).toHaveAttribute('data-three-cg-position',/.+/);
 await page.screenshot({path:test.info().outputPath('a-inertia-canvas.png'),fullPage:true});
 await motion.getByRole('button',{name:'관성 테스트 닫기'}).click();
 await rules.selectOption('legacy');
 await expect.poll(()=>page.evaluate(()=>(window as any).__containerLoadingLatestResult?.result.placements.length)).toBe(0);
 await expect.poll(()=>page.evaluate(()=>(window as any).__containerLoadingLatestResult?.container.maxPayloadKg)).toBe(28600);
 await rules.selectOption('a-v1');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('container-loading:app-action',{detail:{action:'run-loading'}})));
 await rules.selectOption('legacy');
 await page.waitForTimeout(1500);
 expect(await page.evaluate(()=>(window as any).__containerLoadingLatestResult.result.placements.length)).toBe(0);
 await page.screenshot({path:test.info().outputPath('rules-invalidated.png'),fullPage:true});
 expect(errors).toEqual([]);
});

test('going back cancels an in-flight A worker without publishing a partial layout',async({page,context,baseURL})=>{
 test.setTimeout(120000);
 await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(baseURL!).origin?r.continue():r.abort());
 // Hold worker input so completion cannot race the user's Back click.
 await page.addInitScript(()=>{
   const NativeWorker=window.Worker;
   (window as any).__heldLoadingWorkers=0;
   (window as any).__terminatedLoadingWorkers=0;
   window.Worker=class extends NativeWorker {
     held:boolean;
     constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.held=String(url).includes('loading.worker');}
     postMessage(message:any,transfer?:any){if(this.held){(window as any).__heldLoadingWorkers++;return;}super.postMessage(message,transfer);}
     terminate(){if(this.held)(window as any).__terminatedLoadingWorkers++;super.terminate();}
   };
 });
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 const rules=page.getByLabel('적재 규칙',{exact:true});await expect(rules).toBeVisible();
 await rules.selectOption('a-v1');
 await expect.poll(()=>page.evaluate(()=>(window as any).__containerLoadingLatestResult?.container.maxPayloadKg)).toBe(28600);
 await expect.poll(()=>page.evaluate(()=>(window as any).__containerLoadingLatestResult?.container.rules?.version)).toBe('a-v1');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('container-loading:open-product-tool', { detail: 'products' })));
  const product = page.getByRole('dialog', { name: '회사 제품 관리' });
  await product.getByLabel('제품코드').fill('A-QA');
  await product.getByLabel('제품명').fill('점검용 샘플');
  await product.getByLabel('길이 mm').fill('400'); await product.getByLabel('폭 mm').fill('300'); await product.getByLabel('높이 mm').fill('200');
  await product.getByLabel('중량 kg').fill('2'); await product.getByLabel('박스 적재').selectOption('no');
  await product.getByRole('button', { name: '제품 등록' }).click(); await product.locator('header button').click();
  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill('A-QA');
  await page.locator('.guided-product-table article').filter({ hasText: 'A-QA' }).locator('input[type=number]').fill('100');
  await page.getByRole('button', { name: /다음: 제품 포장/ }).click();
  await expect(page.getByText('포장안 준비 완료')).toBeVisible();
  await page.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click();
  await page.getByRole('radio', { name: /공간효율 우선/ }).click();
  await page.getByRole('button', { name: /다음 단계/ }).click();
  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
 await expect(page.locator('.calculation-overlay')).toBeVisible();
 await page.locator('[data-workspace-step="4"]').click();
 await expect(page.locator('.workspace-modal')).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__heldLoadingWorkers)).toBeGreaterThan(0);
 await expect.poll(()=>page.evaluate(()=>(window as any).__terminatedLoadingWorkers)).toBeGreaterThan(0);
 await page.waitForTimeout(1500);
 // Returning to setup restores the floor preview, which may contain every box.
 // It must remain a preview, with no completed A result or physics target.
 await expect(page.locator('.workflow-preview-status')).toBeVisible();
 await expect(page.locator('.calculation-overlay')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).__containerLoadingLatestResult.result.ruleset)).toBeUndefined();
 expect(await page.evaluate(()=>(window as any).__containerLoadingPhysicsTarget)).toBeFalsy();
 expect(errors).toEqual([]);
});
