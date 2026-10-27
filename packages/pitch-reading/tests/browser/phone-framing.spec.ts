import {test,expect} from '@playwright/test';

test('iPhone 15 Pro Max uses the phone presentation and stores its actual projection',async({page})=>{
  await page.setViewportSize({width:814,height:409});
  await page.addInitScript(()=>{
    const w=window as unknown as {__SINKER_PITCH__:unknown;__messages:unknown[];ReactNativeWebView:{postMessage:(s:string)=>void}};
    w.__messages=[];w.ReactNativeWebView={postMessage:s=>w.__messages.push(JSON.parse(s))};
    w.__SINKER_PITCH__={embedded:true,presentation:'phone',theme:'light',history:[],displayCalibration:{cssPixelsPerCm:460/3/2.54,viewDistanceCm:35,source:'device',version:'physical-window-1'}};
  });
  await page.goto('/');await expect(page.locator('#app')).toHaveAttribute('data-presentation','phone');await expect(page.locator('#display-open')).toBeHidden();
  await page.locator('[data-choice="R"]').click();await page.locator('[data-choice="L"]').click();await page.locator('[data-choice="kbo"]').click();await page.locator('#setup-start').click();
  for(let i=0;i<4;i++){
    await expect(page.locator('#app')).toHaveAttribute('data-phase',/question|interrupted/,{timeout:12000});
    if(await page.locator('#app').getAttribute('data-phase')==='question')break;
    await page.locator('#primary-action').click();
  }
  await page.locator('[data-answer="fastball"]').click();await page.locator('[data-call="strike"]').click();
  const saved=await page.evaluate(()=>((window as unknown as {__messages:{kind:string;sessions?:{presentationVersion:string;minBallPixels:number;battingView:{verticalFov:number};trials:{observedMs:number;pitch:{duration:number}}[]}[]}[]}).__messages.filter(m=>m.kind==='history').at(-1)!.sessions![0]));
  expect(saved.presentationVersion).toBe('phone-fit-1');expect(saved.minBallPixels).toBe(5);expect(saved.battingView.verticalFov).toBe(48);
  expect(saved.trials[0].observedMs/saved.trials[0].pitch.duration/1000).toBeGreaterThan(.87);
});

test('actual phone renderer fits the full pitcher and late low balls without moving the camera',async({page})=>{
  await page.setViewportSize({width:814,height:409});await page.goto('/?lab=1');
  const results=await page.evaluate(async()=>{
    const {PitchStage}=await import(location.origin+'/src/stage.ts');
    const {createTrainingPitcher}=await import(location.origin+'/src/training-profile.ts');
    const {generatePracticePitch}=await import(location.origin+'/src/practice-sequence.ts');
    const {approachCutoff}=await import(location.origin+'/src/observation.ts');
    const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;width:814px;height:409px;z-index:9999';document.body.append(host);
    const stage=new PitchStage(host,(message:string)=>{throw new Error(message);});
    stage.configureDisplay({cssPixelsPerCm:460/3/2.54,viewDistanceCm:35,source:'device',version:'physical-window-1'},true);
    let frames=0,minEdge=Infinity,minDiameter=Infinity;
    for(const eye of ['R','L'])for(const hand of ['R','L']){
      const pitcher=createTrainingPitcher('kbo',hand,509);stage.setView('batter',eye);
      for(const spec of pitcher.pitches){
        const pitch=generatePracticePitch(pitcher,spec.kind,'ball',509);stage.setPitch(pitcher,pitch);
        const rotation=stage.camera.quaternion.toArray().join(',');
        for(const t of [-.6,0,.15,approachCutoff(pitch)]){
          stage.draw({time:Math.max(0,t),deliveryTime:t,held:t<0,ballVisible:true,reveal:false,ballScale:1});frames++;
          if(stage.camera.quaternion.toArray().join(',')!==rotation)throw new Error('Camera moved');
          const ball=stage.ball.position.clone(),depth=-ball.clone().applyMatrix4(stage.camera.matrixWorldInverse).z;
          const diameter=.0366*stage.ball.scale.x*409/(depth*Math.tan(stage.camera.fov*Math.PI/360));minDiameter=Math.min(minDiameter,diameter);
          const screen=ball.project(stage.camera),x=(screen.x+1)*814/2,y=(1-screen.y)*409/2;
          const edge=Math.min(x,y,814-x,409-y)-diameter/2;minEdge=Math.min(minEdge,edge);
          if(edge<=4)throw new Error(`Ball clipped at ${eye}/${hand}/${spec.kind}/${t}: ${edge}px`);
          stage.rig.group.updateMatrixWorld(true);
          stage.rig.group.traverse((object:any)=>{
            if(!object.geometry)return;object.geometry.computeBoundingBox();const b=object.geometry.boundingBox;
            for(const xx of [b.min.x,b.max.x])for(const yy of [b.min.y,b.max.y])for(const zz of [b.min.z,b.max.z]){
              const point=object.localToWorld(stage.camera.position.clone().set(xx,yy,zz)).project(stage.camera);
              if(Math.abs(point.x)>1||Math.abs(point.y)>1)throw new Error(`Pitcher clipped at ${eye}/${hand}/${spec.kind}/${t}`);
            }
          });
        }
      }
    }
    (window as unknown as {__phoneStage:unknown}).__phoneStage=stage;
    return {frames,minEdge,minDiameter};
  });
  expect(results.frames).toBe(64);expect(results.minEdge).toBeGreaterThan(4);expect(results.minDiameter).toBeGreaterThanOrEqual(4.99);
  await page.screenshot({path:'test-results/iphone15-promax-full-flight.png'});
});
