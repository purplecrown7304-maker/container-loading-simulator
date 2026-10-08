import { expect, test, type Page } from '@playwright/test';

async function seedAndPackage(page:Page) {
  await page.goto('/');
  await page.evaluate(()=>{
    localStorage.setItem('container-loading-product-packaging-v1:guest',JSON.stringify({
      container:{length:12.03,width:2.35,height:2.69,maxPayloadKg:26500},
      products:['A','B'].map(id=>({id:`SEG-${id}`,name:`혼적 시험 ${id}`,length:.49,width:.49,height:.37,weightKg:10,quantity:4,requiresBoxPackaging:true})),
      boxes:[{id:'SEG-BOX',name:'6단 등록 박스',innerLength:.491,innerWidth:.491,innerHeight:.371,outerLength:.5,outerWidth:.5,outerHeight:.38,tareWeightKg:0,maxGrossWeightKg:10,maxStackLayers:6,maxTopLoadKg:1000}],settings:{allowCustom:false},
    }));
    window.dispatchEvent(new Event('container-loading:enterprise-packaging-planner-updated'));
  });
  await page.getByRole('button',{name:/다음: 제품 선택/}).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill('SEG-');
  for(const id of ['A','B']) await page.locator('.guided-product-table article').filter({hasText:`SEG-${id}`}).locator('input[type=number]').fill('4');
  await page.getByRole('button',{name:/다음: 제품 포장/}).click();
  await page.getByRole('button',{name:/포장 확정 · 다음: 적재 방식 선택/}).click();
  await page.getByRole('radio',{name:/공간효율 우선/}).click();
}

test.beforeEach(async ({context,baseURL})=>{
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(baseURL!).origin?route.continue():route.abort());
});

test('STEP04 segregation input warns before loading and reaches the engine as a verdict',async ({page})=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await seedAndPackage(page);
  const section=page.getByRole('region',{name:'혼적·온도 구분'});
  await expect(section.getByText('등록된 금지 조합이 없습니다.',{exact:false})).toBeVisible();
  await section.getByText('품목별 화물 구분 · 온도대',{exact:true}).click();
  await section.getByLabel('혼적 시험 A 화물 구분').selectOption('식품');
  await section.getByLabel('혼적 시험 B 화물 구분').selectOption('화학품');
  // Classes alone forbid nothing: a pair must be registered.
  await expect(section.getByRole('status')).toHaveCount(0);
  await section.getByRole('button',{name:'권장 조합 넣기',exact:true}).click();
  await expect(section.getByRole('status')).toContainText('식품 ↔ 화학품');
  await section.getByRole('button',{name:'식품 위험물 조합 삭제',exact:true}).click();
  await expect(section.getByRole('listitem')).toHaveCount(2);
  await section.getByLabel('혼적 시험 B 온도대').selectOption('냉장');
  await section.getByLabel('혼적 시험 A 온도대').selectOption('상온');
  await expect(section.getByRole('status')).toContainText('온도대가 섞여 있습니다');
  await page.screenshot({path:test.info().outputPath('step04-segregation.png'),fullPage:true,animations:'disabled'});

  // The input survives leaving and re-entering the step.
  await page.getByRole('button',{name:'설정 닫기',exact:true}).click();
  await page.locator('[data-workspace-step="4"]').click();
  await expect(page.getByLabel('혼적 시험 A 화물 구분')).toHaveValue('식품');
  await expect(page.getByLabel('혼적 시험 B 온도대')).toHaveValue('냉장');

  await page.getByRole('button',{name:/다음 단계/}).click();
  await page.getByRole('button',{name:/최종 적재 진행/}).click();
  await expect.poll(()=>page.evaluate(()=>{
    const latest=(window as any).__containerLoadingLatestResult;
    const findings=latest?.result?.operationalFindings ?? [];
    return latest?.result?.placements?.length ? {
      placed:latest.result.placements.length,
      codes:[...new Set(findings.filter((f:any)=>f.severity==='error').map((f:any)=>f.code))].filter((c:any)=>c==='INCOMPATIBLE_CARGO'||c==='MIXED_TEMP_ZONE').sort(),
    } : null;
  }),{timeout:60000}).toEqual({placed:8,codes:['INCOMPATIBLE_CARGO','MIXED_TEMP_ZONE']});
  expect(errors).toEqual([]);
});
