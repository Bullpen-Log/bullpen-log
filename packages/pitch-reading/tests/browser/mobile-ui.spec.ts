import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page){await page.locator('[data-choice="L"]').click();await page.locator('[data-choice="R"]').click();await page.locator('[data-choice="kbo"]').click();}
async function question(page:Page){for(let i=0;i<5;i++){await expect(page.locator('#app')).toHaveAttribute('data-phase',/question|interrupted/,{timeout:12000});if(await page.locator('#app').getAttribute('data-phase')==='question')return;await page.locator('#primary-action').click();}throw new Error('Repeated interrupted trial');}
for(const viewport of [{width:667,height:375},{width:740,height:354},{width:830,height:370}])test(`landscape native entry, answers and results fit ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);
  await page.addInitScript(()=>{(window as unknown as {__SINKER_PITCH__:unknown}).__SINKER_PITCH__={embedded:true,theme:'light',history:[],displayCalibration:{cssPixelsPerCm:460/3/2.54,viewDistanceCm:35,source:'device',version:'physical-window-1'}};});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await setup(page);
  await expect(page.locator('#setup-start')).toBeInViewport({ratio:1});
  for(const option of await page.locator('[data-choice]').all())await expect(option).toBeInViewport({ratio:1});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/mobile-setup-${viewport.width}.png`});
  await page.locator('#setup-start').click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase','windup');
  await expect(page.locator('#training-console')).toBeHidden();
  await question(page);
  for(const button of await page.locator('[data-answer],[data-call]').all()){
    await expect(button).toBeInViewport({ratio:1});expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({path:`test-results/mobile-question-${viewport.width}.png`});
  await page.locator('[data-answer="fastball"]').click();await page.locator('[data-call="strike"]').click();
  await expect(page.locator('#tracking-card')).toHaveClass(/has-result/,{timeout:10000});
  const callBox=(await page.locator('#track-call').boundingBox())!,consoleBox=(await page.locator('#training-console').boundingBox())!;
  expect(callBox.y+callBox.height).toBeLessThanOrEqual(consoleBox.y);
  await expect(page.locator('#primary-action')).toBeInViewport({ratio:1});await expect(page.locator('#real-replay-action')).toBeInViewport({ratio:1});
  await page.screenshot({path:`test-results/mobile-feedback-${viewport.width}.png`});
  await page.locator('#end-session').click();
  await expect(page.locator('#practice-again')).toBeInViewport({ratio:1});await expect(page.locator('#result-settings')).toBeInViewport({ratio:1});
  await page.screenshot({path:`test-results/mobile-result-${viewport.width}.png`});
  await page.locator('#result-settings').click();await expect(page.locator('#setup-panel')).toBeVisible();
  await page.locator('.setup-history').click();await expect(page.locator('#history-dialog')).toBeVisible();
  expect(errors).toEqual([]);
});
test('native colors follow the Sinker theme bridge without reloading an active session',async({page})=>{
  await page.addInitScript(()=>{(window as unknown as {__SINKER_PITCH__:unknown}).__SINKER_PITCH__={embedded:true,theme:'navy',history:[],palette:{page:'#0b1220',card:'#141d2b',ink:'#e8eef7',action:'#0070c9'}};});
  await page.goto('/');await expect(page.locator('html')).toHaveAttribute('data-theme','navy');
  await expect(page.locator('body')).toHaveCSS('background-color','rgb(11, 18, 32)');
  await expect(page.locator('#setup-start')).toHaveCSS('background-color','rgb(0, 112, 201)');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('sinker-theme',{detail:{theme:'light',palette:{page:'#f2f2f7',card:'#ffffff',ink:'#1d1d1f',action:'#0070c9'}}})));
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');await expect(page.locator('body')).toHaveCSS('background-color','rgb(242, 242, 247)');
});
test('actual stage camera never follows the ball for either pitching or batting hand',async({page})=>{
  await page.goto('/?lab=1');
  const results=await page.evaluate(async()=>{
    const {PitchStage}=await import(location.origin+'/src/stage.ts');
    const {createTrainingPitcher}=await import(location.origin+'/src/training-profile.ts');
    const {generatePitch}=await import(location.origin+'/src/physics.ts');
    const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;width:740px;height:354px';document.body.append(host);
    const stage=new PitchStage(host,(error:string)=>{throw new Error(error);});
    stage.configureDisplay({cssPixelsPerCm:460/3/2.54,viewDistanceCm:35,source:'device',version:'physical-window-1'});
    let frames=0;
    for(const eye of ['R','L'])for(const hand of ['R','L']){
      stage.setView('batter',eye);const pitcher=createTrainingPitcher('mlb',hand,17);
      for(const spec of pitcher.pitches){
        const pitch=generatePitch(pitcher,spec.kind,9);stage.setPitch(pitcher,pitch);
        const before=stage.camera.quaternion.toArray().join(',');const position=stage.camera.position.toArray().join(',');
        for(const t of [0,.05,.15,.25,pitch.duration]){stage.draw({time:t,deliveryTime:t,held:false,ballVisible:true,reveal:false,ballScale:1});frames++;if(stage.camera.quaternion.toArray().join(',')!==before||stage.camera.position.toArray().join(',')!==position)throw new Error('Camera followed the ball');}
      }
    }
    stage.setView('tracking','R');
    for(const x of [-.24,.24])for(const y of [.487,1.004]){
      const projected=stage.camera.position.clone().set(x,y,18.22).project(stage.camera);
      const screenY=(1-projected.y)*354/2;
      if(screenY<52||screenY>354-138)throw new Error('Tracking zone overlaps header or answer panel');
    }
    stage.dispose();host.remove();return frames;
  });expect(results).toBe(80);
});
