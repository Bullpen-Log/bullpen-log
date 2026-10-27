import {generatePitch,randomGenerator,type Pitcher,type PitchKind} from './physics.ts';
import {assessZone,STRIKE_ZONE,type ZoneCall} from './strike-zone.ts';

export const SAMPLING_VERSION='mixed-zone-2-unrestricted';
/** Balance the total only. Fisher–Yates leaves consecutive outcomes completely unrestricted. */
export function createPracticePlan(seed:number):ZoneCall[]{
  const random=randomGenerator(seed),strikes=4+Math.floor(random()*3);
  const calls:ZoneCall[]=Array.from({length:10},(_,i)=>i<strikes?'strike':'ball');
  for(let i=calls.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[calls[i],calls[j]]=[calls[j],calls[i]];}
  return calls;
}

/** Choose a real solved flight matching the mix; never overwrite the physical zone assessment. */
export function generatePracticePitch(pitcher:Pitcher,kind:PitchKind,desired:ZoneCall,seed:number){
  const random=randomGenerator(seed);
  for(let attempt=0;attempt<64;attempt++){
    const pitch=generatePitch(pitcher,kind,attempt===0?seed:Math.floor(random()*4294967296),true);
    if(assessZone(pitch).call===desired)return pitch;
  }
  const pitch=generatePitch(pitcher,kind,seed,true,{
    targetX:desired==='strike'?0:random()<.5?-.65:.65,
    targetY:(STRIKE_ZONE.bottom+STRIKE_ZONE.top)/2+.03,
  });
  if(assessZone(pitch).call!==desired)throw new Error('연습 코스를 만들지 못했습니다.');
  return pitch;
}
