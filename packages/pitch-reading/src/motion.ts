import capture from './data/sinker-sample-4.json' with { type: 'json' };
import leftCapture from './data/sinker-sample-3.json' with { type: 'json' };
import type { Pitcher, Vec3 } from './physics.ts';
import { moundHeight } from './world.ts';

export const MOTION_VERSION = 'sinker-c2-pose-8';
export const FOLLOW_THROUGH = 0.7;
export const POINT_NAMES = [
  'hipT','hipG','shoulderT','shoulderG','elbowT','elbowG','wristT','wristG','handT','handG',
  'kneeT','kneeG','ankleT','ankleG','toeT','toeG','heelT','heelG','head','headFront','headBack','neck','sternum',
] as const;
export type PointName = typeof POINT_NAMES[number];
export type DeliveryPose = Record<PointName | 'grip',Vec3>;
const vec=(x=0,y=0,z=0):Vec3=>({x,y,z});
const add=(a:Vec3,b:Vec3):Vec3=>vec(a.x+b.x,a.y+b.y,a.z+b.z);
const sub=(a:Vec3,b:Vec3):Vec3=>vec(a.x-b.x,a.y-b.y,a.z-b.z);
const mul=(a:Vec3,s:number):Vec3=>vec(a.x*s,a.y*s,a.z*s);
const length=(a:Vec3)=>Math.hypot(a.x,a.y,a.z);
const dot=(a:Vec3,b:Vec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const normal=(a:Vec3)=>mul(a,1/(length(a)||1));
const clamp=(v:number,min=0,max=1)=>Math.max(min,Math.min(max,v));
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
const captureFor=(pitcher:Pitcher):typeof capture=>pitcher.hand==='L'?leftCapture:capture;
export const motionSample=(pitcher:Pitcher)=>captureFor(pitcher).sample;
export const motionSourceLabel=(pitcher:Pitcher)=>`투구 ${motionSample(pitcher)} · ${pitcher.hand==='L'?'좌완':'우완'}`;

export function preparationDuration(pitcher:Pitcher):number {
  const data=captureFor(pitcher);
  return data.releaseFrame/data.sampleRate*(pitcher.id==='threequarter'?1.08:1);
}
export function deliveryEvents(pitcher:Pitcher) {
  const prep=preparationDuration(pitcher);
  const data=captureFor(pitcher);
  return [
    {name:'준비',time:-prep}, {name:'무릎 들기',time:-prep*(data.releaseFrame-data.kneeFrame)/data.releaseFrame},
    {name:'착지',time:-prep*(data.releaseFrame-data.lockFrame)/data.releaseFrame},
    {name:'팔 가속',time:-prep*.055}, {name:'릴리스',time:0}, {name:'팔로스루',time:.3},
  ];
}
export function deliveryLabel(pitcher:Pitcher,time:number):string {
  const e=deliveryEvents(pitcher);
  if(time<e[1].time)return '준비 · 무릎 들기';
  if(time<e[2].time)return '중심 이동 · 스트라이드';
  if(time<e[3].time)return '착지 · 몸통 회전';
  if(time<0)return '팔 가속';
  if(time<.06)return '릴리스';
  return '감속 · 팔로스루';
}

function rawSample(frame:number,mirror:number,data:typeof capture):DeliveryPose {
  const value=clamp(frame,0,data.frames.length-1),i=Math.floor(value),j=Math.min(i+1,data.frames.length-1),t=value-i;
  const previous=data.frames[Math.max(0,i-1)],a=data.frames[i],b=data.frames[j],next=data.frames[Math.min(data.frames.length-1,j+1)];
  const result={} as DeliveryPose;
  const first=data.frames[0],hi=data.names.indexOf('hipT')*3,hg=data.names.indexOf('hipG')*3;
  const originX=(first[hi]+first[hg])/2;
  // A centred cubic B-spline has continuous acceleration across sample boundaries.
  // Unlike passing exactly through every estimated joint, it does not amplify
  // frame-to-frame tracking noise. It uses the recorded neighbours, with no live
  // lag, motion-time stretching, or smoothing of the free-flight ball.
  const t2=t*t,t3=t2*t;
  const weights=[(1-3*t+3*t2-t3)/6,(4-6*t2+3*t3)/6,(1+3*t+3*t2-3*t3)/6,t3/6];
  const cubic=(k:number)=>weights[0]*previous[k]+weights[1]*a[k]+weights[2]*b[k]+weights[3]*next[k];
  for(let n=0;n<data.names.length;n++) {
    const k=data.names[n] as PointName,idx=n*3;
    result[k]=vec((cubic(idx)-originX)*mirror,cubic(idx+1),cubic(idx+2));
  }
  return result;
}

export function releaseHeightRange(pitcher:Pitcher){return {min:Number((pitcher.release.y-.10).toFixed(2)),max:Number((pitcher.release.y+(pitcher.hand==='L'?.03:.10)).toFixed(2))};}

function groundedSample(frame:number,pitcher:Pitcher,translation:Vec3,data:typeof capture):DeliveryPose {
  const points=rawSample(frame,pitcher.hand==='L'?-1:1,data);
  // Align the complete captured pose once; do not pull the throwing wrist away from it.
  for(const k of POINT_NAMES)points[k]=add(points[k],translation);
  for(const side of ['T','G'] as const){
    const heel=points[`heel${side}`],toe=points[`toe${side}`],mid=mul(add(heel,toe),.5);
    const floor=moundHeight(mid.x,mid.z),sole=Math.min(heel.y,toe.y);
    const contact=1-smooth((sole-floor-.025)/.07),shift=(floor-sole)*contact;
    for(const k of [`ankle${side}`,`heel${side}`,`toe${side}`] as PointName[])points[k]=add(points[k],vec(0,shift,0));
    const leg=twoBone(points[`hip${side}`],points[`ankle${side}`],data[`upperLeg${side}`],data[`lowerLeg${side}`],points[`knee${side}`]);
    const correction=sub(leg.end,points[`ankle${side}`]);
    points[`knee${side}`]=leg.joint;points[`ankle${side}`]=leg.end;
    points[`heel${side}`]=add(points[`heel${side}`],correction);points[`toe${side}`]=add(points[`toe${side}`],correction);
  }
  return points;
}

/** Analytic two-bone solve: preserves segment lengths, using the captured elbow as a bend-plane hint. */
export function twoBone(root:Vec3,end:Vec3,upper:number,lower:number,pole:Vec3):{joint:Vec3;end:Vec3} {
  const delta=sub(end,root),distance=clamp(length(delta),Math.abs(upper-lower)+.0001,upper+lower-.0001);
  const direction=length(delta)>.000001?normal(delta):vec(0,1,0),resolvedEnd=add(root,mul(direction,distance));
  let bend=sub(sub(pole,root),mul(direction,dot(sub(pole,root),direction)));
  if(length(bend)<.00001) { const fallback=Math.abs(direction.y)<.9?vec(0,1,0):vec(0,0,1);bend=sub(fallback,mul(direction,dot(fallback,direction))); }
  bend=normal(bend);
  const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
  const height=Math.sqrt(Math.max(0,upper*upper-along*along));
  return {joint:add(add(root,mul(direction,along)),mul(bend,height)),end:resolvedEnd};
}

/** Correct only small captured segment-length variation, retaining the original bend plane. */
function fitArms(points:DeliveryPose,data:typeof capture){
  for(const side of ['T','G'] as const){
    const oldWrist=points[`wrist${side}`],direction=sub(points[`hand${side}`],oldWrist);
    const handOffset=side==='T'?mul(normal(direction),.09):direction;
    const arm=twoBone(points[`shoulder${side}`],oldWrist,side==='T'?data.upperArm:data.upperArmG,side==='T'?data.lowerArm:data.lowerArmG,points[`elbow${side}`]);
    points[`elbow${side}`]=arm.joint;points[`wrist${side}`]=arm.end;points[`hand${side}`]=add(arm.end,handOffset);
  }
}

export function sampleDelivery(time:number,pitcher:Pitcher,release:Vec3,launchVelocity?:Vec3):DeliveryPose {
  const data=captureFor(pitcher),prep=preparationDuration(pitcher),range=releaseHeightRange(pitcher);
  if(release.y<range.min-.001||release.y>range.max+.001)throw new Error('이 투수의 자연스러운 릴리스 높이 범위를 벗어났습니다.');
  const dt=prep/data.releaseFrame,clipEnd=(data.frames.length-1-data.releaseFrame)*dt;
  const slowdown=Math.min(.06,clipEnd*.4),remaining=clipEnd-slowdown;
  const frameAt=(t:number)=>{
    const u=clamp((t-slowdown)/(2*remaining));
    const capturedTime=t<=slowdown?t:slowdown+remaining*(2*u-u*u);
    return clamp(data.releaseFrame+capturedTime/dt,0,data.frames.length-1);
  };
  const reference=rawSample(data.releaseFrame,pitcher.hand==='L'?-1:1,data);fitArms(reference,data);
  const translation=sub(release,reference.handT);
  const poseAt=(t:number)=>{const points=groundedSample(frameAt(t),pitcher,translation,data);fitArms(points,data);return points;};
  const points=poseAt(time);points.grip={...points.handT};
  // The arm stays on the recorded path. Only the ball rolls across the fingertips in
  // the final 6ms (less than one ball radius), matching launch position and velocity.
  const roll=.006;
  if(launchVelocity&&time>=-roll&&time<=0){
    const start=poseAt(-roll).handT,h=.00001;
    const initial=mul(sub(poseAt(-roll+h).handT,poseAt(-roll-h).handT),1/(2*h));
    const q=clamp((time+roll)/roll),q2=q*q,q3=q2*q;
    points.grip=add(add(mul(start,2*q3-3*q2+1),mul(initial,(q3-2*q2+q)*roll)),add(mul(release,-2*q3+3*q2),mul(launchVelocity,(q3-q2)*roll)));
  }
  return points;
}
