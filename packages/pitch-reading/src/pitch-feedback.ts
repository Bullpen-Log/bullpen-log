import {STRIKE_ZONE,type ZoneAssessment} from './strike-zone.ts';

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
