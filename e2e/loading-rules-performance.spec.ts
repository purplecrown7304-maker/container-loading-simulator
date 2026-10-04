import { expect, test } from '@playwright/test';

test('A bulk loading completes through the real worker and preserves canvas and invalidation', async ({page,context,baseURL}) => {
  test.setTimeout(120000);
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(baseURL!).origin?route.continue():route.abort());
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker {
      started=0;
      constructor(url:string|URL,options?:WorkerOptions){
        super(url,options);
        if(String(url).includes('loading.worker')) this.addEventListener('message',event=>{
          if(event.data.result) (window as any).__aWorkerTiming={ms:performance.now()-this.started,count:event.data.result.placements.length,issues:event.data.result.validationIssues,errors:event.data.result.operationalFindings?.filter((f:any)=>f.severity==='error')};
        });
      }
      postMessage(message:any,transfer?:any){this.started=performance.now();super.postMessage(message,transfer);}
    };
  });
  await page.goto('/');
  const rules=page.getByLabel('적재 규칙',{exact:true});
  await rules.selectOption('a-v1');
  // Registered carton limits permit eight tiers. A bare product deliberately has
  // no verified stacking strength, so it is not a bulk stacked-carton fixture.
  await page.evaluate(()=>{
    localStorage.setItem('container-loading-product-packaging-v1:guest',JSON.stringify({
      container:{length:12.03,width:2.35,height:2.69,maxPayloadKg:26500},
      products:[{id:'A-BULK',name:'대량 계산 점검',length:.49,width:.49,height:.24,weightKg:5,quantity:300,requiresBoxPackaging:true}],
      boxes:[{id:'BULK-BOX',name:'8단 등록 박스',innerLength:.491,innerWidth:.491,innerHeight:.241,outerLength:.5,outerWidth:.5,outerHeight:.25,tareWeightKg:0,maxGrossWeightKg:5,maxStackLayers:8,maxTopLoadKg:1000}],
      settings:{allowCustom:false},
    }));
    window.dispatchEvent(new Event('container-loading:enterprise-packaging-planner-updated'));
  });
  await page.getByRole('button',{name:/다음: 제품 선택/}).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill('A-BULK');
  await page.locator('.guided-product-table article').filter({hasText:'A-BULK'}).locator('input[type=number]').fill('300');
  await page.getByRole('button',{name:/다음: 제품 포장/}).click();
  await expect(page.getByText('포장안 준비 완료')).toBeVisible();
  await page.getByRole('button',{name:/포장 확정 · 다음: 적재 방식 선택/}).click();
  await page.getByRole('radio',{name:/공간효율 우선/}).click();
  await page.getByRole('button',{name:/다음 단계/}).click();
  await page.getByRole('button',{name:/최종 적재 진행/}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__aWorkerTiming?.count),{timeout:60000}).toBe(300);
  const timing=await page.evaluate(()=>(window as any).__aWorkerTiming);
  expect(timing.issues).toEqual([]);
  expect(timing.errors).toEqual([]);
  await test.info().attach('worker-timing',{body:JSON.stringify(timing),contentType:'application/json'});
  const viewer=page.locator('.viewer-host .three-comparison-viewer');
  await expect(viewer).toHaveAttribute('data-three-count','300',{timeout:60000});
  await expect(viewer).toHaveAttribute('data-three-applied','true');
  await expect(viewer).toHaveAttribute('data-three-ready','true');
  await expect(viewer).toHaveAttribute('data-three-cg-position',/.+/);
  await page.screenshot({path:test.info().outputPath('a-bulk-loaded.png'),fullPage:true});
  await rules.selectOption('legacy');
  await expect.poll(()=>page.evaluate(()=>(window as any).__containerLoadingLatestResult?.result.placements.length)).toBe(0);
  expect(await page.evaluate(()=>(window as any).__containerLoadingPhysicsTarget)).toBeFalsy();
  expect(errors).toEqual([]);
});
