import {test,expect,type Page} from '@playwright/test';
import {pathToFileURL,fileURLToPath} from 'node:url';
async function choose(page:Page,hand='R',eye='R',level='middle'){
  await page.locator(`[data-choice="${hand}"]`).click();
  await page.locator(`[data-choice="${eye}"]`).click();
  await page.locator(`[data-choice="${level}"]`).click();
}
async function question(page:Page){
  for(let i=0;i<5;i++){
    await expect(page.locator('#app')).toHaveAttribute('data-phase',/question|interrupted/,{timeout:12000});
    if(await page.locator('#app').getAttribute('data-phase')==='question')return;
    await page.locator('#primary-action').click();
  }
  throw new Error('No uninterrupted trial');
}
test('entry requires three choices; all 16 conditions are selectable without public inspection controls',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  for(const hand of ['R','L'])for(const eye of ['R','L'])for(const level of ['middle','high','kbo','mlb']){
    await page.goto('/');await expect(page.locator('#setup-start')).toBeDisabled();
    await expect(page.locator('.controls-panel,#mode-lab,[data-view]')).toHaveCount(0);
    await choose(page,hand,eye,level);await expect(page.locator('#setup-start')).toBeEnabled();
    await expect(page.locator('#setup-summary')).toContainText(hand==='R'?'우투':'좌투');
    await expect(page.locator('#setup-summary')).toContainText(eye==='R'?'우타':'좌타');
  }
  expect(errors).toEqual([]);
});
test('public four pitch practice freezes conditions, saves them, tracks automatically, and returns to setup',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await choose(page,'L','L','mlb');
  await page.screenshot({path:'test-results/entry-levels.png'});
  await page.locator('#setup-start').click();
  await expect(page.locator('#camera-name')).toContainText('좌타자');
  await expect(page.locator('#scene-pitcher-name')).toHaveText('MLB · 좌투');
  await expect(page.locator('#answer-row button')).toHaveCount(4);
  await expect(page.locator('#change-settings')).toBeDisabled();
  await expect(page.locator('[data-view]')).toHaveCount(0);
  await question(page);await page.screenshot({path:'test-results/public-four-pitches.png'});
  await page.keyboard.press('4');await expect(page.locator('#app')).toHaveAttribute('data-phase','question');
  await page.keyboard.press('6');await expect(page.locator('#app')).toHaveAttribute('data-phase','feedback');
  await expect(page.locator('#camera-name')).toContainText('투수 → 홈');
  await expect(page.locator('#tracking-card')).toHaveClass(/has-result/,{timeout:10000});
  await expect(page.locator('#view-selector')).toBeHidden();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('sinker-pitch-reading-v1')??'[]')[0]);
  expect(saved.trainingLevel).toBe('mlb');expect(saved.pitchHand).toBe('L');expect(saved.eye).toBe('L');expect(saved.ballScale).toBe(1);
  expect(saved.trials[0].answer).toBe('changeup');expect(saved.trials[0].call).toBe('ball');
  expect(Object.keys(saved.speedRanges)).toHaveLength(4);expect(saved.motionSample).toBe(3);
  await page.locator('#end-session').click();await expect(page.locator('#result-dialog')).toBeVisible();
  await page.locator('#result-dialog .dialog-close').first().click();
  await expect(page.locator('#setup-panel')).toBeVisible();
  await page.locator('.history-open:visible').click();await expect(page.locator('#history-list')).toContainText('MLB · 좌투');
  expect(errors).toEqual([]);
});
for(const viewport of [{width:390,height:844},{width:844,height:390}])test(`four answers and two calls fit ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);await page.goto('/');await choose(page,'R','R','high');await page.locator('#setup-start').click();
  await question(page);
  for(const button of await page.locator('[data-answer],[data-call]').all()){
    await expect(button).toBeInViewport({ratio:1});
  }
  await expect(page.locator('#end-session')).toBeInViewport({ratio:1});
  await page.screenshot({path:`test-results/entry-${viewport.width}.png`});
});
test('offline package opens the same public entry without network',async({page,context})=>{
  await context.setOffline(true);
  const html=fileURLToPath(new URL('../../release/sinker-pitch-reading.html',import.meta.url));
  await page.goto(pathToFileURL(html).href);await expect(page.locator('#setup-panel')).toBeVisible();
  await choose(page,'R','L','kbo');await page.locator('#setup-start').click();
  await expect(page.locator('#camera-name')).toContainText('좌타자');
  await expect(page.locator('#viewport canvas')).toBeVisible();
});
