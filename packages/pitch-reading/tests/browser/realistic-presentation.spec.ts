import {test,expect} from '@playwright/test';
import {physicalFov} from '../../src/display-calibration.ts';
type BridgeMessage={kind:string;sessions?:{id:string;observationVersion:string;occlusionMs:number;battingView:{horizontalFov:number};trials:{pitch:{duration:number};observedMs:number}[]}[]};
async function question(page:import('@playwright/test').Page){for(let i=0;i<5;i++){await expect(page.locator('#app')).toHaveAttribute('data-phase',/question|interrupted/,{timeout:10000});if(await page.locator('#app').getAttribute('data-phase')==='question')return;await page.locator('#primary-action').click();}throw new Error('trial did not complete');}
test('native bridge uses device projection, spatial observation, real-speed replay and isolated cached history',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:393,height:780});
  await page.addInitScript(()=>{
    const w=window as unknown as {__SINKER_PITCH__:unknown;__messages:unknown[];ReactNativeWebView:{postMessage:(s:string)=>void}};
    w.__messages=[];w.ReactNativeWebView={postMessage:s=>w.__messages.push(JSON.parse(s))};
    w.__SINKER_PITCH__={embedded:true,history:[],displayCalibration:{cssPixelsPerCm:460/3/2.54,viewDistanceCm:35,source:'device',version:'physical-window-1'}};
    localStorage.setItem('sinker-pitch-reading-v1',JSON.stringify([{id:'another-account'}]));
  });
  await page.goto('/');await expect(page.locator('#app')).toHaveAttribute('data-display-source','device');
  await expect(page.locator('#display-guide-text')).toContainText('35cm');
  await page.locator('[data-choice="L"]').click();await page.locator('[data-choice="L"]').click();await page.locator('[data-choice="mlb"]').click();await page.locator('#setup-start').click();
  await question(page);await page.locator('[data-answer="fastball"]').click();await page.locator('[data-call="strike"]').click();
  await expect(page.locator('#tracking-card')).toHaveClass(/has-result/,{timeout:10000});
  const messages=await page.evaluate(()=>(window as unknown as {__messages:BridgeMessage[]}).__messages);
  expect(messages.some(m=>m.kind==='ready')).toBe(true);
  const session=messages.filter(m=>m.kind==='history').at(-1)!.sessions![0];
  expect(session.id).not.toBe('another-account');expect(session.observationVersion).toBe('approach-150cm-1');expect(session.occlusionMs).toBe(0);
  expect(session.trials[0].observedMs).toBeGreaterThan(session.trials[0].pitch.duration*800);
  expect(session.battingView.horizontalFov).toBeCloseTo(physicalFov(393,{cssPixelsPerCm:460/3/2.54,viewDistanceCm:35,source:'device',version:'physical-window-1'}),3);
  await expect(page.locator('#real-replay-action')).toBeVisible();await page.locator('#real-replay-action').click();
  await expect(page.locator('#scene-state')).toHaveText('실제 속도 · 1×');
  await expect(page.locator('#camera-name')).toContainText('좌타자');await expect(page.locator('[data-view]')).toHaveCount(0);
  await expect(page.locator('#scene-state')).toHaveText('실제 속도 재생 완료',{timeout:8000});
  await page.screenshot({path:'test-results/realistic-native-presentation.png'});
  expect(errors).toEqual([]);
});
test('screen calibration changes physical scale once without introducing camera controls',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await page.locator('#display-open').click();
  await page.locator('#card-measure-range').fill('270');
  expect((await page.locator('#card-measure-line').boundingBox())!.height).toBeCloseTo(270,0);
  await page.locator('#display-save').click();await expect(page.locator('#app')).toHaveAttribute('data-display-source','card');
  await page.reload();await expect(page.locator('#app')).toHaveAttribute('data-display-source','card');
  await expect(page.locator('#fov-options,[data-view],#eye-options')).toHaveCount(0);
});
