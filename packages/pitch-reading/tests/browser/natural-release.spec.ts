import {test,expect} from '@playwright/test';

test('single-ball release stays attached before launch and separates in a continuous slow replay',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?lab=1');await page.locator('#mode-lab').click();await page.locator('[data-review="delivery"]').click();
  await page.locator('[data-view="delivery-front"]').click();await page.locator('#focus-toggle').click();
  await page.locator('#timeline').fill('690');await page.screenshot({path:'test-results/release-before.png'});
  await page.locator('[data-delivery-event="4"]').click();await expect(page.locator('#timeline-time')).toContainText('+0.000s');
  await page.screenshot({path:'test-results/release-contact.png'});
  await page.locator('#timeline').fill('715');await page.screenshot({path:'test-results/release-after.png'});
  await page.locator('#playback-speed').selectOption('0.25');
  await page.locator('[data-delivery-event="3"]').click();await page.locator('#lab-play').click();
  await expect(page.locator('#lab-play')).toHaveAttribute('aria-label','궤적 재생',{timeout:12000});
  expect(errors).toEqual([]);
});

test('fixed batting camera and KBO ABS zone survive resizing, replay, and stored practice',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?lab=1');await expect(page.locator('#bat-toggle,#calibrate-view,#fov-options')).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});await page.locator('#focus-toggle').click();
  await page.screenshot({path:'test-results/fixed-batter-phone-portrait.png'});
  await page.setViewportSize({width:844,height:390});
  await expect(page.locator('#viewport')).toHaveCSS('height','278px');
  await page.screenshot({path:'test-results/real-batter-phone.png'});
  await page.locator('#stage-start').click();
  for(let attempt=0;attempt<4;attempt++){
    await expect(page.locator('#app')).toHaveAttribute('data-phase',/question|interrupted/,{timeout:10000});
    if(await page.locator('#app').getAttribute('data-phase')==='question')break;
    await page.locator('#primary-action').click();
  }
  await expect(page.locator('#app')).toHaveAttribute('data-phase','question');
  await page.locator('[data-answer]').first().click();await page.locator('[data-call="strike"]').click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('sinker-pitch-reading-v1')??'[]'));
  expect(saved[0].trials[0].view).toMatchObject({eyeHeight:1.6,plateDistance:.7,plateDepth:-.15,horizontalFov:35});
  expect(saved[0].trials[0].view).not.toHaveProperty('screenWidthCm');
  expect(saved[0].strikeZone.halfWidth*2).toBeCloseTo(.4718,8);expect(saved[0].strikeZone.bottom).toBeCloseTo(.48672,8);expect(saved[0].strikeZone.top).toBeCloseTo(1.0035,8);
  expect(saved[0].zoneRules.endBottom).toBeCloseTo(.47172,8);expect(saved[0].zoneRules.middleZ).toBeCloseTo(18.2245,8);expect(saved[0].zoneRules.endZ).toBe(18.4404);
  expect(saved[0].batterProfileId).toBe('adult-180-right-v1');expect(saved[0].zoneVersion).toBe('kbo-abs-2026-180-v1');
  expect(saved[0].eye).toBe('R');expect(saved[0].trials[0].observedMs).toBeLessThanOrEqual(405);
  await expect(page.locator('#tracking-card')).toHaveClass(/has-result/,{timeout:10000});
  await expect(page.locator('#tracking-card')).toContainText('KBO ABS');
  await page.locator('[data-view="batter"]').click();await expect(page.locator('#camera-name')).toContainText('우타자');
  await page.screenshot({path:'test-results/fixed-batter-zone-review.png'});
  expect(saved[0].trials[0].view).not.toHaveProperty('showBat');expect(errors).toEqual([]);
});
