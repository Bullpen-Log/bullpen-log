import {test,expect,type Page} from '@playwright/test';
async function boot(page:Page,width=814,height=409){
  await page.setViewportSize({width,height});
  await page.addInitScript(()=>{
    const w=window as unknown as {__SINKER_PITCH__:unknown;__messages:any[];ReactNativeWebView:{postMessage:(s:string)=>void}};
    w.__messages=[];w.ReactNativeWebView={postMessage:s=>w.__messages.push(JSON.parse(s))};
    w.__SINKER_PITCH__={embedded:true,presentation:'phone',theme:'light',history:[],displayCalibration:{cssPixelsPerCm:460/3/2.54,viewDistanceCm:35,source:'device',version:'physical-window-1'}};
  });
  await page.goto('/');
  await page.locator('[data-choice="L"]').click();await page.locator('[data-choice="R"]').click();await page.locator('[data-choice="kbo"]').click();
}
async function question(page:Page){
  for(let n=0;n<5;n++){
    await expect(page.locator('#app')).toHaveAttribute('data-phase',/question|interrupted/,{timeout:12000});
    if(await page.locator('#app').getAttribute('data-phase')==='question')return;
    await page.locator('#primary-action').click();
  }
  throw new Error('No uninterrupted pitch');
}
async function answer(page:Page){await page.locator('[data-answer="fastball"]').click();await page.locator('[data-call="ball"]').click();}
async function saved(page:Page){return page.evaluate(()=>((window as unknown as {__messages:any[]}).__messages.filter(m=>m.kind==='history').at(-1).sessions[0]));}
for(const [width,height] of [[814,409],[568,320]])test(`full-width batter view reaches home without live guide or question mask at ${width}x${height}`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await boot(page,width,height);await expect(page.locator('#zone-guide,#zone-guide-choice')).toHaveCount(0);
  await expect(page.locator('#setup-start')).toBeInViewport({ratio:1});await page.locator('#setup-start').click();await question(page);
  expect((await page.locator('#viewport').boundingBox())!.width).toBe(width);
  await expect(page.locator('#stage-message')).toBeHidden();await expect(page.locator('#tracking-card')).toBeHidden();
  for(const button of await page.locator('[data-answer],[data-call]').all())await expect(button).toBeInViewport({ratio:1});
  await page.screenshot({path:`test-results/full-flight-question-${width}.png`});
  await answer(page);await expect(page.locator('#tracking-card')).toHaveClass(/has-result/,{timeout:10000});
  await expect(page.locator('#training-hint')).toHaveClass(/location-feedback/);await expect(page.locator('#training-hint')).toContainText(/존 안|경계|벗어난/);
  let record=await saved(page);expect(record.zoneGuide).toBe(false);expect(record.guideVersion).toBeUndefined();expect(record.observationVersion).toBe('batter-home-full-1');
  const expected=await page.evaluate(async(pitch)=>{const {assessZone}=await import(location.origin+'/src/strike-zone.ts');return assessZone(pitch).decisionTime*1000;},record.trials[0].pitch);
  expect(record.trials[0].observedMs).toBeCloseTo(expected,5);expect(record.trials[0].observedMs).toBeGreaterThan(record.trials[0].pitch.duration*1000);
  await page.locator('#primary-action').click();await question(page);await answer(page);record=await saved(page);expect(record.trials).toHaveLength(2);
  for(const trial of record.trials){expect(trial.view.eyeHeight).toBe(1.6);expect(trial.view.plateDistance).toBe(.7);expect(trial.view.verticalFov).toBe(48);}
  expect(record.trials[0].view.width).toBe(record.trials[1].view.width);expect(record.trials[0].view.horizontalFov).toBeCloseTo(record.trials[1].view.horizontalFov,6);
  expect(errors).toEqual([]);
});
test('actual-speed replay completes and background interruption keeps the next button usable without another score',async({page})=>{
  await boot(page);await page.locator('#setup-start').click();await question(page);await answer(page);
  await expect(page.locator('#tracking-card')).toHaveClass(/has-result/,{timeout:10000});await page.locator('#real-replay-action').click();
  await expect(page.locator('#scene-state')).toHaveText('실제 속도 재생 완료',{timeout:12000});
  await page.locator('#real-replay-action').click();await page.evaluate(()=>window.dispatchEvent(new Event('sinker-pause')));
  await expect(page.locator('#primary-action')).toBeVisible();await expect(page.locator('#scene-state')).toHaveText('재생 중단 · 결과 확인');
  expect((await saved(page)).trials).toHaveLength(1);await expect(page.locator('#zone-guide,#zone-guide-choice')).toHaveCount(0);
});
