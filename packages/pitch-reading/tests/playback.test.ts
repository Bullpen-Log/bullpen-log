import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replayTime} from '../src/playback.ts';

test('answer replay eases into zone slow motion without a velocity jump',()=>{
  const from=-.12,duration=.52,start=duration-.14-from,finish=start+.08,h=1e-5;
  const speed=(t:number)=>(replayTime(t+h,from,duration)-replayTime(t-h,from,duration))/(2*h);
  assert.equal(replayTime(0,from,duration),from);
  assert.ok(Math.abs(speed(start)-1)<1e-6);
  assert.ok(Math.abs(speed(finish)-.5)<1e-6);
  let previous=from;
  for(let t=.001;t<1.5;t+=.001){
    const time=replayTime(t,from,duration);
    assert.ok(time>previous);assert.ok(speed(t)>=.5-1e-8&&speed(t)<=1+1e-8);previous=time;
  }
  assert.ok(Math.abs(speed(start+.04)-.75)<1e-6);
});
