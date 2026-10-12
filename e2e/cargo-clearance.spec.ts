import { expect, test, type Locator, type Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { openWorkspace } from './helpers/workspace';

// Use the same supported CI WebGL configuration as the existing renderer suite.
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

async function clickWorld(viewer: Locator, position: [number, number, number], clickCount = 1) {
  const canvas = viewer.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const rect = await canvas.boundingBox();
  const pose = (await viewer.getAttribute('data-three-camera-pose'))!.split(',').map(Number);
  const camera = new PerspectiveCamera(40, rect!.width / rect!.height, .02, 500);
  camera.position.fromArray(pose); camera.quaternion.fromArray(pose.slice(3)); camera.updateMatrixWorld(true);
  const screen = new Vector3(...position).project(camera);
  await canvas.click({clickCount, position:{x:(screen.x+1)*rect!.width/2,y:(1-screen.y)*rect!.height/2}});
}

async function selectIndex(page: Page, index: number) {
  await page.evaluate(index => window.dispatchEvent(new CustomEvent('container-loading:placement-select',{detail:{index}})),index);
}

test('clicking cargo shows six signed boundary distances with two switchable dimension lines',async({page})=>{
  test.setTimeout(120_000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/comparison.html');
  await page.getByRole('button',{name:'박스 12개',exact:true}).click();
  const viewer=page.locator('.three-comparison-viewer');
  await expect(viewer).toHaveAttribute('data-three-applied','true',{timeout:60_000});
  const revision=await viewer.getAttribute('data-three-plan-revision');
  await viewer.getByRole('button',{name:'상단',exact:true}).click();
  await viewer.getByRole('button',{name:'외벽 숨기기',exact:true}).click();
  // The upper carton at engine (0,0,.5) has center (-2.7,.75,-.975) in Three.
  await clickWorld(viewer,[-2.7,.75,-.975]);
  await expect(viewer).toHaveAttribute('data-three-selected','6');
  const panel=viewer.locator('.three-clearance-inspector');
  await expect(panel.locator('[data-clearance-face]')).toHaveCount(6);
  await expect(panel.locator('[data-clearance-face="right"]')).toContainText('0 mm');
  await expect(panel.locator('[data-clearance-face="left"]')).toContainText('1950 mm');
  await expect(viewer.locator('.three-clearance-label')).toHaveCount(2);
  await panel.getByRole('button',{name:'높이',exact:true}).click();
  await expect(viewer.locator('.three-clearance-label').first()).toContainText('상부 경계');
  await page.screenshot({path:test.info().outputPath('selected-boundary-clearances.png'),fullPage:true});
  await selectIndex(page,7);await expect(viewer).toHaveAttribute('data-three-selected','7');
  const canvas=viewer.locator('canvas'), rect=(await canvas.boundingBox())!;
  const previousCamera=await viewer.getAttribute('data-three-camera-pose');
  await page.mouse.move(rect.x+rect.width*.35,rect.y+rect.height*.7);await page.mouse.down({button:'right'});
  await page.mouse.move(rect.x+rect.width*.39,rect.y+rect.height*.7,{steps:5});await page.mouse.up({button:'right'});
  await expect(viewer).not.toHaveAttribute('data-three-camera-pose',previousCamera!);
  await expect(viewer).toHaveAttribute('data-three-selected','7');
  await page.mouse.move(rect.x+rect.width*.30,rect.y+rect.height*.7);await page.mouse.down();
  await page.mouse.move(rect.x+rect.width*.36,rect.y+rect.height*.68,{steps:5});await page.mouse.up();
  await expect(viewer).toHaveAttribute('data-three-selected','7');
  await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);await expect(viewer.locator('.three-clearance-label')).toHaveCount(0);
  await selectIndex(page,0);await panel.getByRole('button',{name:'선택 해제',exact:true}).click();await expect(panel).toHaveCount(0);
  await selectIndex(page,6);await viewer.getByRole('slider',{name:'Three.js 적재 순서',exact:true}).fill('0');
  await expect(panel).toHaveCount(0);await expect(viewer.locator('.three-clearance-label')).toHaveCount(0);
  await expect(viewer).toHaveAttribute('data-three-plan-revision',revision!);expect(errors).toEqual([]);
});

test('marks the rear door for containers and 1-ton box trucks but uses rear reference on Flatrack',async({page})=>{
  test.setTimeout(120_000);await page.goto('/');
  const viewer=page.locator('.viewer-host .three-comparison-viewer');
  await expect(viewer).toHaveAttribute('data-three-applied','true',{timeout:60_000});
  await expect(viewer.locator('[data-rear-access="door"]')).toHaveText('문 ↓');
  const workspace=await openWorkspace(page,1);
  await workspace.getByRole('button',{name:'트럭',exact:true}).click();
  await workspace.locator('.equipment-icon-option[data-equipment-id="kr-1t-box"]').click();
  await expect(viewer).toHaveAttribute('data-three-applied','true',{timeout:60_000});
  await expect(viewer.locator('[data-rear-access="door"]')).toHaveCount(1);
  await workspace.getByRole('button',{name:'컨테이너',exact:true}).click();
  await workspace.locator('.equipment-icon-option[data-equipment-id="20-flatrack"]').click();
  await expect(viewer).toHaveAttribute('data-three-applied','true',{timeout:60_000});
  await expect(viewer.locator('[data-rear-access="door"]')).toHaveCount(0);
  await expect(viewer.locator('[data-rear-access="rear"]')).toHaveText('후면 기준 ↓');
});


test('pallet single and double clicks show measurements before explicit detail opening',async({page})=>{
  test.setTimeout(90_000);await page.goto('/comparison.html');
  const viewer=page.locator('.three-comparison-viewer');
  await expect(viewer).toHaveAttribute('data-three-applied','true',{timeout:60_000});
  await viewer.getByRole('button',{name:'상단',exact:true}).click();
  await viewer.getByRole('button',{name:'외벽 숨기기',exact:true}).click();
  await clickWorld(viewer,[-2.175,.825,-.425],2);
  await expect(viewer).toHaveAttribute('data-three-selected','4');
  await expect(viewer.locator('.three-clearance-inspector')).toBeVisible();
  await expect(page.locator('.comparison-demo-status')).not.toContainText('화물 선택');
  await viewer.getByRole('button',{name:'팔레트 상세 보기',exact:true}).click();
  await expect(page.locator('.comparison-demo-status')).toContainText('화물 선택 5');
});
