import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

test.use({viewport:{width:1440,height:900},deviceScaleFactor:2});
test('left and right deliveries use a continuous flight clock with steady presentation frames',async({page})=>{
  await page.goto('/?lab=1');await page.locator('#mode-lab').click();await page.locator('[data-review="delivery"]').click();
  await page.locator('[data-view="batter"]').click();
  const audits=[];
  for(const pitcher of ['overhand','lefty']){
    await page.locator('[data-pitcher="'+pitcher+'"]').click();
    await page.locator('#focus-toggle').click();
    // The observer applies the new backing size on the next presentation frame.
    await expect.poll(()=>page.locator('#viewport canvas').evaluate((canvas:HTMLCanvasElement)=>canvas.width/canvas.clientWidth)).toBeCloseTo(2,2);
    for(let run=0;run<2;run++){
      await page.locator('[data-delivery-event="0"]').click();
      const samples=await page.evaluate(()=>new Promise<{wall:number;time:number}[]>(resolve=>{
        const samples:{wall:number;time:number}[]=[];
        const button=document.querySelector<HTMLButtonElement>('#lab-play')!;
        button.click();
        function sample(now:number){
          if(button.getAttribute('aria-label')==='궤적 재생'){resolve(samples);return;}
          samples.push({wall:now,time:Number(document.querySelector('#timeline-time')!.textContent!.split('s')[0])});
          requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      }));
      const gaps=samples.slice(1).map((s,i)=>s.wall-samples[i].wall).sort((a,b)=>a-b);
      const median=gaps[Math.floor(gaps.length*.5)],p95=gaps[Math.floor(gaps.length*.95)];
      audits.push({pitcher,run,frames:samples.length,median,p95,max:gaps.at(-1),missed:gaps.filter(g=>g>median*1.6).length,samples});
      expect(samples.length).toBeGreaterThan(20);
      for(let i=1;i<samples.length;i++)expect(samples[i].time).toBeGreaterThanOrEqual(samples[i-1].time);
    }
    await page.locator('#focus-toggle').click();
  }
  await writeFile('test-results/frame-pacing.json',JSON.stringify(audits,null,2));
  console.log(JSON.stringify(audits.map(({samples,...summary})=>summary)));
});
