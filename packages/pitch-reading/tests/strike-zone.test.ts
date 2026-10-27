import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BALL_RADIUS,PLATE_FRONT_Z,PLATE_Z,PITCHERS,generatePitch,trackingAt,at,randomCommand} from '../src/physics.ts';
import {STRIKE_ZONE,assessZone,classifyCrossings,crossingAt,MIDDLE_Z,END_BOTTOM} from '../src/strike-zone.ts';
import {recordAnswer,finish,readHistory,STORAGE_KEY,type Session} from '../src/session.ts';

const center=(STRIKE_ZONE.bottom+STRIKE_ZONE.top)/2;
const middle={x:0,y:center,z:MIDDLE_Z},end={x:0,y:center,z:PLATE_Z};
test('KBO middle plane accepts ball-edge contact but rejects a circle outside the corner',()=>{
  const x=STRIKE_ZONE.halfWidth,r=BALL_RADIUS;
  assert.equal(classifyCrossings(middle,end).call,'strike');
  assert.equal(classifyCrossings({...middle,x:x+r-.001},end).call,'strike');
  assert.equal(classifyCrossings({...middle,x:x+r+.001},end).reason,'middle-side');
  assert.equal(classifyCrossings({...middle,y:STRIKE_ZONE.top+r},end).call,'strike');
  assert.equal(classifyCrossings({...middle,x:x+r*.8,y:STRIKE_ZONE.top+r*.8},end).reason,'middle-corner');
});
test('both height checks are required and end x is irrelevant to the call',()=>{
  assert.equal(classifyCrossings(middle,{...end,y:END_BOTTOM-BALL_RADIUS-.001}).reason,'end-low');
  assert.equal(classifyCrossings({...middle,y:STRIKE_ZONE.top+BALL_RADIUS+.001},end).reason,'middle-high');
  assert.equal(classifyCrossings(middle,{...end,x:1}).call,'strike');
  assert.equal(classifyCrossings({...middle,x:1},end).call,'ball');
});
test('end plane lowers ONLY the bottom by 1.5cm; top and edge contact remain unchanged',()=>{
  assert.equal(classifyCrossings(middle,{...end,y:END_BOTTOM-BALL_RADIUS}).call,'strike');
  assert.equal(classifyCrossings(middle,{...end,y:STRIKE_ZONE.bottom-BALL_RADIUS-.01}).call,'strike');
  assert.equal(classifyCrossings(middle,{...end,y:STRIKE_ZONE.top+BALL_RADIUS-.001}).call,'strike');
  assert.equal(classifyCrossings(middle,{...end,y:STRIKE_ZONE.top+BALL_RADIUS+.001}).reason,'end-high');
});
test('actual flight is evaluated at middle and end, not at the broad front edge',()=>{
  const pitch=generatePitch(PITCHERS[0],'curve',7,false,{targetY:STRIKE_ZONE.bottom-BALL_RADIUS+.015});
  const result=assessZone(pitch);
  assert.ok(result.time>pitch.duration);assert.ok(result.decisionTime>result.time);
  assert.ok(Math.abs(result.middle.z-MIDDLE_Z)<1e-9);assert.ok(Math.abs(result.end.z-PLATE_Z)<1e-9);
  assert.deepEqual(result.point,result.middle);
  assert.deepEqual(result.middle,crossingAt(pitch,MIDDLE_Z).point);
  // Its front-edge ball overlaps the height band but the falling ball misses the required planes.
  assert.ok(result.front.y+BALL_RADIUS>STRIKE_ZONE.bottom);assert.equal(result.call,'ball');
});
test('command has strikes, edge pitches and misses independently of pitch type',()=>{
  let strikes=0,balls=0;const categories=new Set<string>();
  for(let seed=0;seed<200;seed++){
    const p=generatePitch(PITCHERS[0],'fastball',seed),other=generatePitch(PITCHERS[0],'curve',seed);
    assert.deepEqual(p.target,other.target);assert.deepEqual(randomCommand(seed),randomCommand(seed));
    const result=assessZone(p);if(result.call==='strike')strikes++;else balls++;
    categories.add(p.target.x<-.27?'left':p.target.x>.27?'right':p.target.y<STRIKE_ZONE.bottom-.05?'low':p.target.y>STRIKE_ZONE.top+.05?'high':'zone');
  }
  assert.ok(strikes>65&&strikes<140);assert.ok(balls>60);assert.equal(categories.size,5);
});
test('same solved flight crosses the zone and continues beyond home plate without a jump',()=>{
  for(const p of PITCHERS)for(const spec of p.pitches){
    const pitch=generatePitch(p,spec.kind,1,false),dt=.00001;
    assert.deepEqual(trackingAt(pitch,pitch.duration),at(pitch,pitch.duration));
    const a=trackingAt(pitch,pitch.duration-dt),b=trackingAt(pitch,pitch.duration+dt);
    assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<.001);
    assert.ok(trackingAt(pitch,pitch.duration+.05).z>PLATE_Z);
    assert.equal(assessZone(pitch).call,'strike');
    assert.ok(assessZone(pitch).decisionTime>pitch.duration);
  }
});
test('two-part tasks require both answers and preserve separate correctness',()=>{
  const pitch=generatePitch(PITCHERS[0],'fastball',1,false);
  const s:Session={id:'two',startedAt:'2026-10-27',pitcherId:pitch.pitcherId,difficulty:'easy',occlusionMs:340,ballScale:1,eye:'R',trials:[],targetCount:10,engineVersion:pitch.engineVersion,taskVersion:'pitch-and-zone-v1'};
  assert.equal(recordAnswer(s,pitch,'missing','fastball',340),false);
  assert.ok(recordAnswer(s,pitch,'pitch-only','fastball',340,'ball'));
  assert.equal(s.trials[0].pitchCorrect,true);assert.equal(s.trials[0].callCorrect,false);assert.equal(s.trials[0].correct,false);
  assert.ok(recordAnswer(s,pitch,'zone-only','curve',340,'strike'));assert.equal(s.trials[1].callCorrect,true);assert.equal(s.trials[1].correct,false);
  assert.ok(recordAnswer(s,pitch,'both','fastball',340,'strike'));assert.equal(s.trials[2].correct,true);
  const stored=finish(s);assert.equal(readHistory({getItem:k=>k===STORAGE_KEY?JSON.stringify([stored]):null})[0].trials[2].actualCall,'strike');
});
test('practice recorded against the previous zone keeps its original call and score',()=>{
  const pitch={...generatePitch(PITCHERS[0],'fastball',1,false),engineVersion:'synthetic-aero-4-command'};
  const old:Session={id:'legacy-zone',startedAt:'2026-10-27',pitcherId:pitch.pitcherId,difficulty:'easy',occlusionMs:340,ballScale:1,eye:'L',trials:[{id:'old',pitch,answer:'fastball',call:'ball',actualCall:'ball',pitchCorrect:true,callCorrect:true,correct:true,observedMs:340}],targetCount:10,engineVersion:pitch.engineVersion,taskVersion:'pitch-and-zone-v1',cameraVersion:'batters-eyes-physical-v2',strikeZone:{halfWidth:.2159,bottom:.50,top:1.20}};
  const restored=readHistory({getItem:()=>JSON.stringify([finish(old)])})[0];
  assert.equal(restored.trials[0].actualCall,'ball');assert.equal(restored.trials[0].correct,true);
  assert.equal(restored.eye,'L');assert.equal(restored.strikeZone?.bottom,.50);assert.equal(restored.zoneVersion,undefined);
});
