import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';

async function ready(page:Page) {
  await page.goto('/?lab=1');
  await expect(page.locator('#viewport canvas')).toBeVisible();
  await expect(page.locator('#render-error')).toBeHidden();
}
async function awaitQuestion(page:Page) {
  // Slow graphics environments must ask the user to replay rather than silently score a late trial.
  for(let attempt=0;attempt<4;attempt++) {
    await expect(page.locator('#app')).toHaveAttribute('data-phase', /question|interrupted/, {timeout:10000});
    const phase=await page.locator('#app').getAttribute('data-phase');
    if(phase==='question')return;
    await page.locator('#primary-action').click();
  }
  throw new Error('The graphics environment repeatedly interrupted timed playback.');
}

test('complete ten pitches, reveal only after answer, store and export the real result', async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await ready(page);
  await page.screenshot({path:'test-results/training-desktop.png',fullPage:true});
  await expect(page.locator('[data-answer]').first()).toBeDisabled();
  await page.locator('#primary-action').click();
  for(let i=0;i<10;i++) {
    await awaitQuestion(page);
    await expect(page.locator('#stage-message')).toBeVisible();
    await expect(page.locator('#view-selector')).toBeHidden();
    await expect(page.locator('[data-pitcher]').first()).toBeDisabled();
    await page.locator('[data-answer]').nth(i%2).click();await page.locator('[data-call="strike"]').click();
    await expect(page.locator('#stage-message')).toBeHidden();
    await expect(page.locator('#view-selector')).toBeVisible();
    await expect(page.locator('#round-current')).toHaveText(String(i+1).padStart(2,'0'));
    await expect(page.locator('[data-answer].answer-correct')).toHaveCount(1);
    const lastCall=await page.evaluate(()=>JSON.parse(localStorage.getItem('sinker-pitch-reading-v1')??'[]')[0].trials.at(-1).actualCall);
    await expect(page.locator('#track-call')).toHaveText(lastCall==='strike'?'STRIKE':'BALL');
    await page.locator('#primary-action').click();
  }
  await expect(page.locator('#result-dialog')).toBeVisible();
  const sessions=await page.evaluate(()=>JSON.parse(localStorage.getItem('sinker-pitch-reading-v1')??'[]'));
  expect(sessions).toHaveLength(1);expect(sessions[0].completed).toBe(true);expect(sessions[0].trials).toHaveLength(10);
  expect(sessions[0].samplingVersion).toBe('mixed-zone-2-unrestricted');
  const calls=sessions[0].trials.map((t:{actualCall:string})=>t.actualCall);
  const strikes=calls.filter((c:string)=>c==='strike').length;expect(strikes).toBeGreaterThanOrEqual(4);expect(strikes).toBeLessThanOrEqual(6);
  expect(new Set(sessions[0].trials.map((t:{id:string})=>t.id)).size).toBe(10);
  const percentage=Math.round(sessions[0].trials.filter((t:{correct:boolean})=>t.correct).length/10*100);
  await expect(page.locator('.result-score>strong')).toHaveText(String(percentage));
  await page.locator('#result-dialog .dialog-close').first().click();
  await page.locator('.history-open').click();
  await expect(page.locator('.history-item')).toHaveCount(1);
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-history').click();
  const download=await downloadPromise;expect(download.suggestedFilename()).toMatch(/sinker-pitch-reading.*\.json/);
  await download.saveAs('test-results/session-export.json');
  expect(errors).toEqual([]);
});

test('lab sliders change the curve, all views and scrubbing work without creating records',async({page})=>{
  await ready(page);await page.locator('#mode-lab').click();
  await expect(page.locator('#lab-settings')).toBeVisible();
  const old=Number(await page.locator('#metric-time').textContent());
  await page.locator('#speed-slider').fill('140');
  expect(Number(await page.locator('#metric-time').textContent())).toBeLessThan(old);
  await page.locator('[data-view="top"]').click();
  await expect(page.locator('#camera-name')).toContainText('위쪽');
  await page.locator('#timeline').fill('500');
  await expect(page.locator('#timeline-time')).not.toHaveText(/^0\.000/);
  await page.locator('[data-pitcher="lefty"]').click();
  await page.locator('[data-lab-pitch="changeup"]').click();
  await expect(page.locator('#speed-output')).toHaveText('97 km/h');
  await page.locator('[data-target="8"]').click();
  await expect(page.locator('[data-target="8"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('#lab-play').click();
  await expect(page.locator('#lab-play')).toHaveAttribute('aria-label','궤적 재생',{timeout:10000});
  expect(await page.evaluate(()=>localStorage.getItem('sinker-pitch-reading-v1'))).toBeNull();
  await page.screenshot({path:'test-results/lab-desktop.png',fullPage:true});
});

test('interruption and early ending never score unseen or unanswered pitches',async({page})=>{
  await ready(page);await page.locator('#primary-action').click();
  await page.locator('#about-open').click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase','interrupted');
  await page.locator('#about-dialog .dialog-close').first().click();
  await expect(page.locator('#round-current')).toHaveText('00');
  await page.locator('#primary-action').click();await awaitQuestion(page);
  await page.locator('[data-answer]').first().click();await page.locator('[data-call="strike"]').click();
  const snapshot=await page.evaluate(()=>JSON.parse(localStorage.getItem('sinker-pitch-reading-v1')??'[]'));
  expect(snapshot[0].trials).toHaveLength(1);
  await page.locator('#end-session').click();
  await expect(page.locator('#result-dialog')).toBeVisible();
  const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('sinker-pitch-reading-v1')??'[]'));
  expect(data[0].completed).toBe(false);expect(data[0].trials).toHaveLength(1);
});

test('answered trials survive reload without pretending the partial session was completed',async({page})=>{
  await ready(page);await page.locator('#primary-action').click();await awaitQuestion(page);
  await page.locator('[data-answer]').first().click();await page.locator('[data-call="strike"]').click();await page.reload();
  await expect(page.locator('#round-current')).toHaveText('00');
  await page.locator('.history-open').click();
  await expect(page.locator('.history-item')).toContainText('1구 기록');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('sinker-pitch-reading-v1')??'[]'));
  expect(saved).toHaveLength(1);expect(saved[0].completed).toBe(false);
});

test('single HTML release opens offline without loading external scripts or assets',async({page})=>{
  const remoteRequests:string[]=[];
  page.on('request',request=>{if(/^https?:/.test(request.url()))remoteRequests.push(request.url());});
  const html=fileURLToPath(new URL('../../release/sinker-pitch-reading.html',import.meta.url));
  await page.goto(pathToFileURL(html).href+'?lab=1');
  await expect(page.locator('#viewport canvas')).toBeVisible();
  await expect(page.locator('#render-error')).toBeHidden();
  await page.locator('#mode-lab').click();
  await page.locator('#speed-slider').fill('130');
  await expect(page.locator('#metric-speed')).toHaveText('130.0');
  expect(remoteRequests).toEqual([]);
});

test('phone portrait and landscape have no horizontal overflow; settings and training still work',async({page})=>{
  await page.setViewportSize({width:390,height:844});await ready(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator('[data-pitcher="threequarter"]').click();
  await expect(page.locator('#camera-name')).toContainText('우타자');
  await expect(page.locator('[data-eye]')).toHaveCount(0);
  await page.screenshot({path:'test-results/training-phone.png',fullPage:true});
  await page.locator('#primary-action').click();await awaitQuestion(page);
  await page.locator('[data-answer="sinker"]').click();await page.locator('[data-call="strike"]').click();
  await expect(page.locator('#round-current')).toHaveText('01');
  await page.locator('#end-session').click();await page.locator('#result-dialog .dialog-close').first().click();
  await page.setViewportSize({width:844,height:390});await page.locator('#mode-lab').click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(844);
  await page.screenshot({path:'test-results/lab-phone-landscape.png',fullPage:true});
});
