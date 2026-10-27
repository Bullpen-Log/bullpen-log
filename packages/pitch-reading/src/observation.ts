import {assessZone} from './strike-zone.ts';
import {at,PLATE_FRONT_Z,type Pitch} from './physics.ts';
export const OBSERVATION_VERSION='fixed-window-150cm-2';
export const LAST_VISIBLE_DISTANCE_M=1.5;
/** Legacy spatial cutoff, retained for old-condition validation. */
export function approachCutoff(pitch:Pitch):number{
  let lo=0,hi=pitch.duration;
  for(let i=0;i<36;i++){const mid=(lo+hi)/2;if(at(pitch,mid).z<PLATE_FRONT_Z-LAST_VISIBLE_DISTANCE_M)lo=mid;else hi=mid;}
  return (lo+hi)/2;
}

export const HOME_OBSERVATION_VERSION='batter-home-full-1';
export const POST_PITCH_HOLD_SECONDS=.18;
/** Continue at the original clock through the complete home-plane crossing. */
export const homeObservationEnd=(pitch:Pitch)=>assessZone(pitch).decisionTime;
