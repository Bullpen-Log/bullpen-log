import {at,trackingAt,BALL_RADIUS,PLATE_FRONT_Z,PLATE_Z,type Pitch,type Vec3} from './physics.ts';
import {REFERENCE_STRIKE_ZONE,KBO_ABS} from './batter-reference.ts';
export type ZoneCall='strike'|'ball';
export const STRIKE_ZONE=REFERENCE_STRIKE_ZONE;
export const MIDDLE_Z=(PLATE_FRONT_Z+PLATE_Z)/2;
export const END_BOTTOM=STRIKE_ZONE.bottom-KBO_ABS.endBottomDrop;
export const callName=(call:ZoneCall)=>call==='strike'?'스트라이크':'볼';
export type ZoneReason='inside'|'middle-side'|'middle-high'|'middle-low'|'middle-corner'|'end-high'|'end-low';
const explanations:Record<ZoneReason,string>={inside:'중간·끝면 통과','middle-side':'중간면 좌우 벗어남','middle-high':'중간면 높은 공','middle-low':'중간면 낮은 공','middle-corner':'중간면 경계 바깥','end-high':'끝면 높은 공','end-low':'끝면 낮은 공'};
export const zoneExplanation=(result:{reason:ZoneReason})=>explanations[result.reason];
/** The ball cross-section must touch the middle rectangle; x is NOT checked at the end. */
export function classifyCrossings(middle:Vec3,end:Vec3){
  const dx=Math.max(Math.abs(middle.x)-STRIKE_ZONE.halfWidth,0);
  const dy=Math.max(STRIKE_ZONE.bottom-middle.y,0,middle.y-STRIKE_ZONE.top);
  const horizontal=dx<=BALL_RADIUS+1e-10,middleVertical=dy<=BALL_RADIUS+1e-10;
  const middleContact=dx*dx+dy*dy<=BALL_RADIUS*BALL_RADIUS+1e-11;
  const endVertical=end.y+BALL_RADIUS>=END_BOTTOM-1e-10&&end.y-BALL_RADIUS<=STRIKE_ZONE.top+1e-10;
  const reason:ZoneReason=!horizontal?'middle-side':!middleVertical?(middle.y<STRIKE_ZONE.bottom?'middle-low':'middle-high'):!middleContact?'middle-corner':!endVertical?(end.y<END_BOTTOM?'end-low':'end-high'):'inside';
  return {call:reason==='inside'?'strike' as const:'ball' as const,reason,checks:{horizontal,middleVertical,middleContact,endVertical}};
}
/** Solve the actual monotonic z-plane crossings on the same continuous flight as the renderer. */
export function crossingAt(pitch:Pitch,z:number){
  let lo=pitch.duration,hi=pitch.duration+.065;
  if(trackingAt(pitch,hi).z<z)throw new Error('홈플레이트 판정 면에 도달하지 못한 궤적입니다.');
  for(let i=0;i<36;i++){const mid=(lo+hi)/2;if(trackingAt(pitch,mid).z<z)lo=mid;else hi=mid;}
  const time=(lo+hi)/2;return {point:trackingAt(pitch,time),time};
}
export type ZoneAssessment=ReturnType<typeof classifyCrossings>&{
  point:Vec3;middle:Vec3;end:Vec3;front:Vec3;time:number;decisionTime:number;
};
const cache=new WeakMap<Pitch,ZoneAssessment>();
export function assessZone(pitch:Pitch):ZoneAssessment{
  const saved=cache.get(pitch);if(saved)return saved;
  const middle=crossingAt(pitch,MIDDLE_Z),end=crossingAt(pitch,PLATE_Z);
  const result={...classifyCrossings(middle.point,end.point),point:middle.point,middle:middle.point,end:end.point,
    front:at(pitch,pitch.duration),time:middle.time,decisionTime:crossingAt(pitch,PLATE_Z+BALL_RADIUS).time};
  cache.set(pitch,result);return result;
}
