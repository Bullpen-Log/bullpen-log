import {PLATE_FRONT_Z,trackingAt,type Pitch} from './physics.ts';
import {assessZone,STRIKE_ZONE,type ZoneAssessment} from './strike-zone.ts';

export const ZONE_GUIDE_VERSION='home-guide-1';
export const GUIDED_OBSERVATION_VERSION='home-crossing-1';
export const HOME_HOLD_SECONDS=.18;
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));

/** Uses only the current ball until it actually crosses the middle plane.
 * Keep that observed crossing visible while the end-plane check completes. */
export function zoneGuideFrame(pitch:Pitch,time:number){
  const result=assessZone(pitch),t=clamp(time,0,result.decisionTime);
  const current=trackingAt(pitch,t);
  const point=t>=result.time?result.middle:current;
  const near=current.z>=PLATE_FRONT_Z-4;
  const rawX=110+point.x*200,rawY=258-point.y*200;
  const x=clamp(rawX,16,204),y=clamp(rawY,18,232);
  return {x,y,near,complete:time>=result.decisionTime,
    clipped:x!==rawX||y!==rawY,
    arrowAngle:Math.atan2(rawY-y,rawX-x)*180/Math.PI+90};
}

export function zoneGuideMarkup(){
  const left=110-STRIKE_ZONE.halfWidth*200,top=258-STRIKE_ZONE.top*200;
  const width=STRIKE_ZONE.halfWidth*400,height=(STRIKE_ZONE.top-STRIKE_ZONE.bottom)*200;
  return `<p class="guide-title">존 가이드 <span>타자 기준</span></p>
    <svg viewBox="0 0 220 260" role="img" aria-label="타자 쪽에서 본 홈 기준면의 공 높이와 좌우">
      <rect x="16" y="18" width="188" height="214" rx="10" fill="#ffffff04"/>
      <text x="110" y="38" text-anchor="middle" fill="#c7c7cc" font-size="18">높음</text>
      <rect x="${left}" y="${top}" width="${width}" height="${height}" fill="#ffffff0c" stroke="#e5e5ea" stroke-width="2"/>
      ${[1,2].map(i=>`<path d="M${left+width*i/3} ${top}v${height}M${left} ${top+height*i/3}h${width}" stroke="#ffffff40"/>`).join('')}
      <text x="110" y="208" text-anchor="middle" fill="#c7c7cc" font-size="18">낮음</text>
      <circle id="guide-ball" r="7.32" fill="#fff" stroke="#0b1220" stroke-width="2" hidden/>
      <path id="guide-arrow" d="M-7 7L0-1L7 7" fill="none" stroke="#fff" stroke-width="3" hidden/>
    </svg><p id="guide-state" class="guide-state" aria-live="polite">투구를 보세요</p>
    <p class="guide-caption">홈 통과까지 확인해요</p>`;
}

/** Explain the assessed call, including a ball edge touching the strike zone. */
export function locationFeedback(result:ZoneAssessment,eye:'R'|'L'){
  const side=result.middle.x*(eye==='R'?-1:1)>0?'몸쪽':'바깥쪽';
  if(result.reason==='middle-high'||result.reason==='end-high')return '높게 벗어난 공';
  if(result.reason==='middle-low'||result.reason==='end-low')return '낮게 벗어난 공';
  if(result.reason==='middle-side')return `${side}으로 벗어난 공`;
  if(result.reason==='middle-corner')return '존 모서리를 벗어난 공';
  if(result.middle.y>STRIKE_ZONE.top)return '높은 쪽 경계에 걸친 공';
  if(result.middle.y<STRIKE_ZONE.bottom)return '낮은 쪽 경계에 걸친 공';
  if(Math.abs(result.middle.x)>STRIKE_ZONE.halfWidth)return `${side} 경계에 걸친 공`;
  const height=(result.middle.y-STRIKE_ZONE.bottom)/(STRIKE_ZONE.top-STRIKE_ZONE.bottom);
  return height>=2/3?'존 안의 높은 공':height<=1/3?'존 안의 낮은 공':'존 안의 가운데 높이';
}
