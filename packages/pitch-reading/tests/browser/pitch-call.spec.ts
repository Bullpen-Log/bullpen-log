import {test,expect} from '@playwright/test';
test('two answers are required, then the ball crosses the zone before the tracking verdict appears',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?lab=1');await page.locator('#primary-action').click();
  for(let i=0;i<4;i++){
    await expect(page.locator('#app')).toHaveAttribute('data-phase',/question|interrupted/,{timeout:10000});
    if(await page.locator('#app').getAttribute('data-phase')==='question')break;
    await page.locator('#primary-action').click();
  }
  await page.locator('[data-answer]').first().focus();await page.keyboard.press('Enter');
  await expect(page.locator('[data-answer]').first()).toBeFocused();
  await expect(page.locator('[data-answer]').first()).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#app')).toHaveAttribute('data-phase','question');
  await expect(page.locator('#tracking-card')).toBeHidden();await expect(page.locator('#round-current')).toHaveText('00');
  expect(await page.evaluate(()=>localStorage.getItem('sinker-pitch-reading-v1'))).toBeNull();
  await page.locator('[data-call="ball"]').click();await expect(page.locator('#app')).toHaveAttribute('data-phase','feedback');
  await expect(page.locator('#tracking-card')).toBeVisible();await expect(page.locator('#camera-name')).toContainText('투구 추적');
  await expect(page.locator('.track-impact')).toBeHidden();await expect(page.locator('#track-call')).toHaveText('존 통과 확인 중');
  await expect(page.locator('.track-live')).toBeVisible({timeout:10000});
  await expect(page.locator('#tracking-card')).toHaveClass(/has-result/,{timeout:10000});
  await expect(page.locator('.track-live')).toBeHidden();
  await expect(page.locator('.track-impact')).toBeVisible();await expect(page.locator('#primary-action')).toBeVisible();
  const sessions=await page.evaluate(()=>JSON.parse(localStorage.getItem('sinker-pitch-reading-v1')??'[]')),trial=sessions[0].trials[0];
  expect(trial.call).toBe('ball');expect(trial.correct).toBe(trial.pitchCorrect&&trial.callCorrect);
  await expect(page.locator('#track-call')).toHaveText(trial.actualCall==='strike'?'STRIKE':'BALL');
  await page.locator('#focus-toggle').click();await page.screenshot({path:'test-results/pitch-tracking.png'});
  await page.locator('#replay-action').click();await expect(page.locator('#track-call')).toHaveText('존 통과 확인 중');
  await expect(page.locator('#primary-action')).toBeHidden();await expect(page.locator('#feedback-detail')).toBeHidden();
  await expect(page.locator('.answer-correct')).toHaveCount(0);
  // Leaving the tab during feedback must still leave a usable result and next action.
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
    document.dispatchEvent(new Event('visibilitychange'));
    Reflect.deleteProperty(document,'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#tracking-card')).toHaveClass(/has-result/,{timeout:10000});
  await expect(page.locator('#primary-action')).toBeVisible();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('sinker-pitch-reading-v1')??'[]'));
  expect(saved[0].trials).toHaveLength(1);
  await page.locator('[data-view="batter"]').click();
  await expect(page.locator('#camera-name')).toContainText('우타자');
  await expect(page.locator('#scene-state')).toHaveText('REAL TIME · 1×');
  await expect(page.locator('#tracking-card')).toBeHidden();
  await expect(page.locator('#primary-action')).toBeVisible({timeout:3000});
  await page.locator('#replay-action').click();
  await expect(page.locator('#scene-state')).toHaveText('REAL TIME · 1×');
  await expect(page.locator('#tracking-card')).toBeHidden();
  expect((await page.evaluate(()=>JSON.parse(localStorage.getItem('sinker-pitch-reading-v1')??'[]')))[0].trials).toHaveLength(1);
  expect(errors).toEqual([]);
});
