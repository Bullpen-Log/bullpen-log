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
for(const [width,height] of [[814,409],[568,320]])test(`guided home crossing, neutral location and two-pitch projection at ${width}x${height}`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await boot(page,width,height);await expect(page.locator('#zone-guide-choice')).toBeChecked();await expect(page.locator('#setup-start')).toBeInViewport({ratio:1});
  await page.screenshot({path:`test-results/guide-setup-${width}.png`});
  await page.locator('#setup-start').click();await question(page);
  await expect(page.locator('#zone-guide')).toBeVisible();await expect(page.locator('#zone-guide')).toHaveAttribute('data-state','crossed');
  await expect(page.locator('#guide-ball')).toBeVisible();await expect(page.locator('#guide-state')).toHaveText('홈 통과');
  await expect(page.locator('#zone-guide')).not.toContainText(/스트라이크|커브|슬라이더|체인지업/);
  const guide=(await page.locator('#zone-guide').boundingBox())!,field=(await page.locator('#viewport').boundingBox())!,panel=(await page.locator('#training-console').boundingBox())!;
  expect(field.x+field.width).toBeLessThanOrEqual(guide.x+.5);expect(guide.y+guide.height).toBeLessThanOrEqual(panel.y+.5);
  for(const button of await page.locator('[data-answer],[data-call]').all())await expect(button).toBeInViewport({ratio:1});
  await page.screenshot({path:`test-results/guide-question-${width}.png`});
  await answer(page);await expect(page.locator('#tracking-card')).toHaveClass(/has-result/,{timeout:10000});
  await expect(page.locator('#zone-guide')).toBeHidden();await expect(page.locator('#training-hint')).toHaveClass(/location-feedback/);
  await expect(page.locator('#training-hint')).toContainText(/존 안|경계|벗어난/);await expect(page.locator('#primary-action')).toBeInViewport({ratio:1});
  await page.screenshot({path:`test-results/guide-feedback-${width}.png`});
  let record=await saved(page);expect(record.zoneGuide).toBe(true);expect(record.guideVersion).toBe('home-guide-1');expect(record.observationVersion).toBe('home-crossing-1');
  const expected=await page.evaluate(async(pitch)=>{const {assessZone}=await import(location.origin+'/src/strike-zone.ts');return assessZone(pitch).decisionTime*1000;},record.trials[0].pitch);
  expect(record.trials[0].observedMs).toBeCloseTo(expected,5);
  await page.locator('#primary-action').click();await question(page);await answer(page);
  record=await saved(page);expect(record.trials).toHaveLength(2);
  for(const trial of record.trials){expect(trial.view.eyeHeight).toBe(1.6);expect(trial.view.plateDistance).toBe(.7);expect(trial.view.verticalFov).toBe(48);}
  expect(record.trials[0].view.width).toBe(record.trials[1].view.width);
  expect(record.trials[0].view.horizontalFov).toBeCloseTo(record.trials[1].view.horizontalFov,6);
  expect(errors).toEqual([]);
});
test('guide can be turned off before a session and old unassisted observation remains separate',async({page})=>{
  await boot(page);await page.locator('#zone-guide-choice').uncheck();await page.locator('#setup-start').click();await question(page);
  await expect(page.locator('#zone-guide')).toBeHidden();expect((await page.locator('#viewport').boundingBox())!.width).toBe(814);
  await answer(page);const record=await saved(page);expect(record.zoneGuide).toBe(false);expect(record.guideVersion).toBeUndefined();expect(record.observationVersion).toBe('fixed-window-150cm-2');
});
test('actual-speed batter replay also reaches home and ending clears guide and session state',async({page})=>{
  await boot(page);await page.locator('#setup-start').click();await question(page);await answer(page);
  await expect(page.locator('#tracking-card')).toHaveClass(/has-result/,{timeout:10000});await page.locator('#real-replay-action').click();
  await expect(page.locator('#guide-state')).toHaveText('홈 통과',{timeout:12000});await expect(page.locator('#scene-state')).toHaveText('실제 속도 재생 완료');
  await page.locator('#end-session').click();await expect(page.locator('#zone-guide')).toBeHidden();await expect(page.locator('#result-dialog')).toBeVisible();
  await page.locator('#result-settings').click();await expect(page.locator('#setup-panel')).toBeVisible();await expect(page.locator('#app')).toHaveAttribute('data-zone-guide','false');
});

test('backgrounding an answered replay leaves usable final guide and next button without scoring another pitch',async({page})=>{
  await boot(page);await page.locator('#setup-start').click();await question(page);await answer(page);
  await expect(page.locator('#tracking-card')).toHaveClass(/has-result/,{timeout:10000});await page.locator('#real-replay-action').click();
  await page.evaluate(()=>window.dispatchEvent(new Event('sinker-pause')));
  await expect(page.locator('#guide-state')).toHaveText('홈 통과');await expect(page.locator('#primary-action')).toBeVisible();
  await expect(page.locator('#scene-state')).toHaveText('재생 중단 · 결과 확인');expect((await saved(page)).trials).toHaveLength(1);
});
