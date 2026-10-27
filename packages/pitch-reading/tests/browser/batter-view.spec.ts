import {test,expect} from '@playwright/test';

test('fixed adult batters-box view has no camera settings and keeps the same eye point when enlarged',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?lab=1');await expect(page.locator('#viewport canvas')).toBeVisible();
  await expect(page.locator('#render-error')).toBeHidden();
  await expect(page.locator('#fixed-batter')).toContainText('180cm 기준 타자');
  await expect(page.locator('#fixed-batter')).toContainText('47.18cm');
  await expect(page.locator('#fixed-batter')).toContainText('48.67 · 100.35cm');
  await expect(page.locator('#fixed-batter')).toContainText('35°');
  await expect(page.locator('#eye-height,#plate-distance,#plate-depth,#fov-options,#calibrate-view,[data-eye]')).toHaveCount(0);
  await expect(page.locator('#bat-toggle')).toHaveCount(0);
  await expect(page.locator('[data-scale="1"]')).toHaveAttribute('aria-pressed','true');
  await page.screenshot({path:'test-results/fixed-batter-desktop.png',fullPage:true});
  await page.locator('#focus-toggle').click();
  await expect(page.locator('body')).toHaveClass(/immersive/);
  const viewport=await page.locator('#viewport').boundingBox();expect(viewport?.width).toBe(1440);expect(viewport?.height).toBeGreaterThan(600);
  await expect(page.locator('#camera-name')).toContainText('우타자');
  await page.screenshot({path:'test-results/batter-right.png'});
  await page.keyboard.press('Escape');await expect(page.locator('body')).not.toHaveClass(/immersive/);
  expect(errors).toEqual([]);
});

test('full delivery can be reviewed from the batters eyes, with the navy evening sky and plate-side camera',async({page})=>{
  await page.goto('/?lab=1');await page.locator('#mode-lab').click();await page.locator('[data-review="delivery"]').click();
  await page.locator('[data-view="batter"]').click();await expect(page.locator('#camera-name')).toContainText('타자 시점');
  await expect(page.locator('#orbit-hint')).toBeHidden();
  await page.locator('[data-delivery-event="4"]').click();await page.locator('#focus-toggle').click();
  await page.screenshot({path:'test-results/batter-release.png'});
  // Inspect the ball 100ms after release against the sky, without the revealed trajectory.
  await page.locator('#timeline').fill('749');
  await expect(page.locator('#timeline-time')).toContainText('+0.101s');
  await page.screenshot({path:'test-results/floodlit-ball-flight.png'});
  await page.locator('[data-delivery-event="0"]').click();await page.locator('#lab-play').click();
  await expect(page.locator('#lab-play')).toHaveAttribute('aria-label','궤적 재생',{timeout:12000});
});

test('landscape phone keeps the answer controls visible in the immersive batters view',async({page})=>{
  await page.setViewportSize({width:844,height:390});await page.goto('/?lab=1');await page.locator('[data-pitcher="lefty"]').click();await page.locator('#focus-toggle').click();
  await page.locator('#stage-start').click();
  for(let n=0;n<4;n++){
    await expect(page.locator('#app')).toHaveAttribute('data-phase',/question|interrupted/,{timeout:10000});
    if(await page.locator('#app').getAttribute('data-phase')==='question')break;
    await page.locator('#primary-action').click();
  }
  await expect(page.locator('#app')).toHaveAttribute('data-phase','question');
  const box=await page.locator('#answer-row').boundingBox();expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.y+box!.height).toBeLessThanOrEqual(390);
  const calls=await page.locator('#call-row').boundingBox();expect(calls!.y).toBeGreaterThanOrEqual(0);expect(calls!.y+calls!.height).toBeLessThanOrEqual(390);
  await page.locator('[data-answer]').first().click();await page.locator('[data-call="strike"]').click();
  await expect(page.locator('#tracking-card')).toHaveClass(/has-result/,{timeout:10000});
  await page.screenshot({path:'test-results/batter-phone-landscape.png'});
  await page.keyboard.press('Escape');await page.locator('#end-session').click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('sinker-pitch-reading-v1')??'[]'));
  expect(saved[0].pitcherId).toBe('lefty');expect(saved[0].motionSample).toBe(3);
  expect(saved[0].cameraVersion).toBe('batters-eyes-fixed-v3');
  expect(saved[0].trials[0].view.immersive).toBe(true);
  expect(saved[0].trials[0].view.width).toBe(844);
});
