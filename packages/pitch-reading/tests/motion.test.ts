import { test } from 'node:test';
import assert from 'node:assert/strict';
import capture4 from '../src/data/sinker-sample-4.json' with { type: 'json' };
import capture3 from '../src/data/sinker-sample-3.json' with { type: 'json' };
import {moundHeight} from '../src/world.ts';
import { PITCHERS, generatePitch } from '../src/physics.ts';
import { deliveryEvents, FOLLOW_THROUGH, preparationDuration, sampleDelivery, twoBone, releaseHeightRange, motionSample, POINT_NAMES } from '../src/motion.ts';
const distance=(a:{x:number;y:number;z:number},b:{x:number;y:number;z:number})=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

test('all fictional releases meet the hand grip exactly, including height adjustments',()=>{
  for(const p of PITCHERS)for(const height of [releaseHeightRange(p).min,p.release.y,releaseHeightRange(p).max]){
    const release={...p.release,y:height},pose=sampleDelivery(0,p,release);
    assert.ok(distance(pose.grip,release)<1e-8);
    assert.ok(distance(pose.handT,pose.grip)<1e-8);
  }
});
test('retargeted throwing limbs preserve anatomical lengths through the entire action',()=>{
  for(const p of PITCHERS) {
    const capture=p.hand==='L'?capture3:capture4;
    for(let t=-preparationDuration(p);t<=FOLLOW_THROUGH;t+=1/120){
      const pose=sampleDelivery(t,p,p.release);
      for(const point of Object.values(pose))assert.ok([point.x,point.y,point.z].every(Number.isFinite));
      assert.ok(Math.abs(distance(pose.shoulderT,pose.elbowT)-capture.upperArm)<1e-7);
      assert.ok(Math.abs(distance(pose.elbowT,pose.wristT)-capture.lowerArm)<1e-7);
      assert.ok(Math.abs(distance(pose.shoulderG,pose.elbowG)-capture.upperArmG)<1e-7);
      assert.ok(Math.abs(distance(pose.elbowG,pose.wristG)-capture.lowerArmG)<1e-7);
    }
  }
});
test('delivery sequencing and endpoints are stable across left and right handers',()=>{
  for(const p of PITCHERS) {
    const events=deliveryEvents(p);
    assert.ok(events[0].time<events[1].time&&events[1].time<events[2].time&&events[2].time<events[3].time&&events[3].time<0);
    assert.equal(events[4].time,0);
    assert.deepEqual(sampleDelivery(-100,p,p.release),sampleDelivery(-preparationDuration(p),p,p.release));
    assert.deepEqual(sampleDelivery(100,p,p.release),sampleDelivery(FOLLOW_THROUGH,p,p.release));
  }
});
test('two-bone solver handles unreachable and coincident endpoints without NaN or stretchy limbs',()=>{
  const root={x:0,y:0,z:0},pole={x:0,y:0,z:1};
  for(const end of [{x:0,y:0,z:0},{x:10,y:10,z:10},{x:.2,y:.1,z:.1}]) {
    const result=twoBone(root,end,.337,.294,pole);
    assert.ok(Math.abs(distance(root,result.joint)-.337)<1e-8);
    assert.ok(Math.abs(distance(result.joint,result.end)-.294)<1e-8);
  }
});
test('captured torso and pelvis actually rotate instead of remaining front-facing',()=>{
  const p=PITCHERS[0],start=sampleDelivery(-preparationDuration(p),p,p.release),release=sampleDelivery(0,p,p.release);
  const shoulderYaw=(s:typeof start)=>Math.atan2(s.shoulderG.z-s.shoulderT.z,s.shoulderG.x-s.shoulderT.x);
  assert.ok(Math.abs(shoulderYaw(start)-shoulderYaw(release))>.5);
  const hipYaw=(s:typeof start)=>Math.atan2(s.hipG.z-s.hipT.z,s.hipG.x-s.hipT.x);
  assert.ok(Math.abs(hipYaw(start)-hipYaw(release))>.5);
});
test('release is an extended throwing arm rather than an upright bent wave',()=>{
  for(const p of PITCHERS){
    const s=sampleDelivery(0,p,p.release);
    assert.ok(distance(s.shoulderT,s.wristT)>.50);
    assert.ok(distance(s.shoulderT,s.wristT)<.607);
    assert.ok(s.grip.z>s.wristT.z+.05);
  }
});
test('retargeting does not create a one-frame jump through the release transition',()=>{
  for(const p of PITCHERS){
    let previous=sampleDelivery(-preparationDuration(p),p,p.release);
    for(let t=-preparationDuration(p)+1/240;t<FOLLOW_THROUGH;t+=1/240){
      const next=sampleDelivery(t,p,p.release);
      for(const key of ['elbowT','wristT','shoulderT','grip'] as const)assert.ok(distance(next[key],previous[key])<.1,`${p.id} ${key} jumps at ${t}`);
      previous=next;
    }
  }
});
test('right handers use sample 4 and the left hander uses the independently captured sample 3',()=>{
  const capture=capture4;
  assert.equal(capture3.sample,3);assert.equal(capture3.recordedHand,'L');
  assert.equal(motionSample(PITCHERS[0]),4);assert.equal(motionSample(PITCHERS[2]),3);
  assert.equal(capture3.releaseFrame,245);assert.equal(capture3.frames.length,275);
  assert.ok(Math.abs(preparationDuration(PITCHERS[2])-capture3.releaseFrame/capture3.sampleRate)<1e-12);
  assert.notEqual(preparationDuration(PITCHERS[2]),preparationDuration(PITCHERS[0]));
  assert.equal(capture.sample,4);assert.equal(capture.releaseFrame,304);assert.equal(capture.frames.length,335);
  const a=PITCHERS[0],b=PITCHERS[1];
  for(const fraction of [.9,.6,.2]){
    const high=sampleDelivery(-preparationDuration(a)*fraction,a,a.release);
    const other=sampleDelivery(-preparationDuration(b)*fraction,b,b.release);
    assert.ok(distance(high.ankleG,other.ankleG)<1e-8);
    assert.ok(distance(high.shoulderT,other.shoulderT)<1e-8);
  }
});

test('release adjustments keep the torso and pelvis together, without independent shoulder lifting',()=>{
  for(const p of PITCHERS){const base=sampleDelivery(0,p,p.release);
    for(const y of [releaseHeightRange(p).min,releaseHeightRange(p).max]){const s=sampleDelivery(0,p,{...p.release,y});
      for(const axis of ['x','y','z'] as const)assert.ok(Math.abs((s.shoulderT[axis]-s.hipT[axis])-(base.shoulderT[axis]-base.hipT[axis]))<1e-7);
    }
    assert.throws(()=>sampleDelivery(0,p,{...p.release,y:2.2}));
  }
});

test('the same ball leaves the fingertip continuously at the solved launch velocity',()=>{
  for(const p of PITCHERS)for(const spec of p.pitches)for(const height of [releaseHeightRange(p).min,p.release.y,releaseHeightRange(p).max]){
    const ball=generatePitch(p,spec.kind,27,false,{height}),dt=.000001;
    const before=sampleDelivery(-dt,p,ball.release,ball.velocity),release=sampleDelivery(0,p,ball.release,ball.velocity);
    assert.ok(distance(release.grip,ball.release)<1e-8);
    const velocity={x:(release.grip.x-before.grip.x)/dt,y:(release.grip.y-before.grip.y)/dt,z:(release.grip.z-before.grip.z)/dt};
    assert.ok(distance(velocity,ball.velocity)<.04,`${p.id} ${spec.kind} has a release velocity kink`);
    for(let t=-.055;t<0;t+=.001){const pose=sampleDelivery(t,p,ball.release,ball.velocity);assert.ok(Math.abs(distance(pose.wristT,pose.handT)-.09)<1e-8);assert.ok(distance(pose.handT,pose.grip)<.0366);}
  }
});

test('jittered training releases remain at the actual hand for both source motions',()=>{
  for(const p of PITCHERS)for(const spec of p.pitches)for(let seed=0;seed<20;seed++){
    const ball=generatePitch(p,spec.kind,seed,true),pose=sampleDelivery(0,p,ball.release,ball.velocity);
    assert.ok(distance(pose.grip,ball.release)<1e-8,`${p.id} ${spec.kind} seed ${seed} detached at release`);
  }
});

test('throwing elbow and wrist stay within 2cm of the recorded shoulder-relative path',()=>{
  for(const p of PITCHERS){
    const capture=p.hand==='L'?capture3:capture4,ix=(name:string)=>capture.names.indexOf(name)*3;
    const pitch=generatePitch(p,p.pitches[0].kind,1,false),dt=preparationDuration(p)/capture.releaseFrame;
    for(let frame=capture.contactFrame;frame<=capture.releaseFrame+5;frame++){
      const pose=sampleDelivery((frame-capture.releaseFrame)*dt,p,pitch.release,pitch.velocity),raw=capture.frames[frame];
      for(const joint of ['wristT','elbowT'] as const){
        const source={x:(raw[ix(joint)]-raw[ix('shoulderT')])*(p.hand==='L'?-1:1),y:raw[ix(joint)+1]-raw[ix('shoulderT')+1],z:raw[ix(joint)+2]-raw[ix('shoulderT')+2]};
        const actual={x:pose[joint].x-pose.shoulderT.x,y:pose[joint].y-pose.shoulderT.y,z:pose[joint].z-pose.shoulderT.z};
        assert.ok(distance(source,actual)<.02,`${p.id} ${joint} moved away from source at frame ${frame}`);
      }
    }
  }
});
test('ball speed changes do not pull the arm, wrist, torso or fingers off the recorded path',()=>{
  for(const p of PITCHERS){
    const slow=generatePitch(p,p.pitches[0].kind,1,false,{speedKmh:80}),fast=generatePitch(p,p.pitches[0].kind,1,false,{speedKmh:150});
    for(const t of [-.08,-.03,-.005,-.001,0,.025,.06,.1]){
      const a=sampleDelivery(t,p,p.release,slow.velocity),b=sampleDelivery(t,p,p.release,fast.velocity);
      for(const joint of POINT_NAMES)assert.deepEqual(a[joint],b[joint]);
      assert.ok(distance(a.grip,a.handT)<.0366);assert.ok(distance(b.grip,b.handT)<.0366);
    }
  }
});
test('plant label uses the filmed foot-lock event and the planted shoe stays on the mound',()=>{
  for(const p of PITCHERS){
    const capture=p.hand==='L'?capture3:capture4,dt=preparationDuration(p)/capture.releaseFrame;
    assert.ok(Math.abs(deliveryEvents(p)[2].time-(capture.lockFrame-capture.releaseFrame)*dt)<1e-12);
    for(let frame=capture.lockFrame;frame<=capture.releaseFrame+5;frame++){
      const pose=sampleDelivery((frame-capture.releaseFrame)*dt,p,p.release),h=pose.heelG,t=pose.toeG;
      assert.ok(Math.abs(Math.min(h.y,t.y)-moundHeight((h.x+t.x)/2,(h.z+t.z)/2))<.025);
    }
  }
});

test('recorded sample boundaries do not introduce upper-body acceleration jumps',()=>{
  const h=.00003;
  for(const p of PITCHERS){
    const capture=p.hand==='L'?capture3:capture4,dt=preparationDuration(p)/capture.releaseFrame;
    for(let frame=5;frame<capture.releaseFrame-10;frame++){
      const t=(frame-capture.releaseFrame)*dt;
      const a=sampleDelivery(t-2*h,p,p.release),b=sampleDelivery(t-h,p,p.release),c=sampleDelivery(t,p,p.release),d=sampleDelivery(t+h,p,p.release),e=sampleDelivery(t+2*h,p,p.release);
      for(const key of ['head','hipT','shoulderT'] as const){
        const jump=Math.hypot(...(['x','y','z'] as const).map(axis=>((e[key][axis]-2*d[key][axis]+c[key][axis])-(c[key][axis]-2*b[key][axis]+a[key][axis]))/(h*h)));
        assert.ok(jump<1,`${p.id} ${key} acceleration changes abruptly at sample ${frame}: ${jump}`);
      }
    }
  }
});
