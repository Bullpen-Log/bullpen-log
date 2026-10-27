import {test,expect} from '@playwright/test';
test('jersey and rounded limb surfaces remain clean through close front, side and back reviews',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?lab=1');await page.locator('#mode-lab').click();await page.locator('[data-review="delivery"]').click();
  for(const pitcher of ['overhand','lefty']){
    await page.locator('[data-pitcher="'+pitcher+'"]').click();
    for(const event of [1,4,5])for(const view of ['delivery-front','delivery-side','delivery-back']){
      await page.locator('[data-delivery-event="'+event+'"]').click();
      await page.locator('[data-view="'+view+'"]').click();
      await page.locator('#viewport').hover();await page.mouse.wheel(0,-1000);
      await page.locator('#viewport').screenshot({path:`test-results/model-${pitcher}-${view}-${event}.png`});
    }
  }
  expect(errors).toEqual([]);
  expect(await page.evaluate(()=>localStorage.getItem('sinker-pitch-reading-v1'))).toBeNull();
});
