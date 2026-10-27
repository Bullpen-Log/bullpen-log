import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import * as THREE from 'three';
import {at,BALL_RADIUS,generatePitch,PITCHERS,PLATE_Z} from '../../src/physics.ts';
import {battingCamera} from '../../src/world.ts';
import {preparationDuration,FOLLOW_THROUGH} from '../../src/motion.ts';

for(const viewport of [{width:1440,height:900},{width:844,height:390}]){
  test(`both pitching hands keep physical ball projection and real-time lab playback at ${viewport.width}px`,async({page})=>{
    await page.setViewportSize(viewport);await page.goto('/?lab=1');await page.locator('#mode-lab').click();
    await expect(page.locator('#playback-speed')).toHaveValue('1');
    await page.locator('[data-review="delivery"]').click();await page.locator('[data-view="batter"]').click();
    await expect(page.locator('#app')).toHaveAttribute('data-camera-view','batter');
    await expect(page.locator('.scene-vignette')).toBeHidden();
    const audit=[];
    for(const pitcher of [PITCHERS[0],PITCHERS[2]]){
      await page.locator('[data-pitcher="'+pitcher.id+'"]').click();
      await page.locator('#focus-toggle').click();
      const pitch=generatePitch(pitcher,pitcher.pitches[0].kind,1,false);
      for(const requestedTime of [.025,.15,.3]){
        const prep=preparationDuration(pitcher),range=Math.round((requestedTime+prep)/(prep+FOLLOW_THROUGH)*1000);
        await page.locator('#timeline').fill(String(range));
        const time=-prep+Number(await page.locator('#timeline').inputValue())/1000*(prep+FOLLOW_THROUGH);
        const box=(await page.locator('#viewport').boundingBox())!;
        const config=battingCamera('R',box.width/box.height,PLATE_Z),camera=new THREE.PerspectiveCamera(config.verticalFov,box.width/box.height,.04,2000);
        camera.position.set(config.position.x,config.position.y,config.position.z);camera.lookAt(config.target.x,config.target.y,config.target.z);camera.updateMatrixWorld();
        const p=at(pitch,time),local=new THREE.Vector3(p.x,p.y,p.z).applyMatrix4(camera.matrixWorldInverse),depth=-local.z;
        const projected=new THREE.Vector3(p.x,p.y,p.z).project(camera);
        const diameter=box.width*BALL_RADIUS*Math.sqrt(depth*depth+local.x*local.x-BALL_RADIUS**2)/((depth*depth-BALL_RADIUS**2)*Math.tan(35*Math.PI/360));
        const file=`test-results/reality-${viewport.width}-${pitcher.id}-${Math.round(requestedTime*1000)}.png`;
        await page.locator('#viewport').screenshot({path:file});
        audit.push({file,pitcher:pitcher.id,time,width:box.width,height:box.height,x:(projected.x+1)*box.width/2,y:(1-projected.y)*box.height/2,diameter});
      }
      await page.locator('#focus-toggle').click();
    }
    await writeFile(`test-results/ball-projection-${viewport.width}.json`,JSON.stringify(audit,null,2));
    await page.locator('[data-review="trajectory"]').click();
    await page.locator('[data-view="batter"]').click();
    for(const pitcher of PITCHERS)for(const spec of pitcher.pitches){
      await page.locator('[data-pitcher="'+pitcher.id+'"]').click();
      await page.locator('[data-lab-pitch="'+spec.kind+'"]').click();
      const samples=await page.evaluate(()=>{
        const output=document.querySelector('#timeline-time')!;
        return new Promise<{wall:number;flight:number}[]>(resolve=>{
          const values:{wall:number;flight:number}[]=[];
          const observer=new MutationObserver(()=>{
            const flight=Number(output.textContent!.split(' / ')[0]);
            if(flight>0)values.push({wall:performance.now(),flight});
            if(document.querySelector('#lab-play')?.getAttribute('aria-label')==='궤적 재생'&&values.length>2){observer.disconnect();resolve(values);}
          });
          observer.observe(document.querySelector('#lab-console')!,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-label']});
          document.querySelector<HTMLButtonElement>('#lab-play')!.click();
        });
      });
      const first=samples[0],last=samples.at(-2)!;
      expect((last.flight-first.flight)/((last.wall-first.wall)/1000)).toBeGreaterThan(.92);
      expect((last.flight-first.flight)/((last.wall-first.wall)/1000)).toBeLessThan(1.08);
    }
    expect(await page.evaluate(()=>localStorage.getItem('sinker-pitch-reading-v1'))).toBeNull();
  });
}
