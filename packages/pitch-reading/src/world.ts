import {physicalFov,type DisplayCalibration} from './display-calibration.ts';
import {REFERENCE_BATTER} from './batter-reference.ts';
/** World dimensions in metres. Home-plate distance is measured to its rear apex. */
export function moundHeight(x:number,z:number):number {
  const radius=Math.hypot(x,z),rim=1-Math.max(0,Math.min(1,(radius-1.55)/1.2));
  const slope=.254-Math.max(0,z-.15)/12;
  return Math.max(0,slope)*rim*rim*(3-2*rim);
}

export const CAMERA_VERSION='batters-eyes-fixed-v3';
export type BattingView={eyeHeight:number;plateDistance:number;plateDepth:number;horizontalFov:number;screenWidthCm?:number;viewDistanceCm?:number};
export const DEFAULT_BATTING_VIEW:Readonly<BattingView>=Object.freeze({
  eyeHeight:REFERENCE_BATTER.eyeHeight,plateDistance:REFERENCE_BATTER.plateDistance,
  plateDepth:REFERENCE_BATTER.plateDepth,horizontalFov:REFERENCE_BATTER.horizontalFov,
});
export function battingCamera(eye:'R'|'L',aspect:number,plateApexZ:number,display?:{width:number;calibration:DisplayCalibration}){
  const settings=DEFAULT_BATTING_VIEW;
  const side=eye==='R'?-1:1;
  // A fixed eye point beside the rear half of home plate, looking at the upper-body/release window.
  const position={x:side*settings.plateDistance,y:settings.eyeHeight,z:plateApexZ+settings.plateDepth};
  const target={x:0,y:1.75,z:1.10};
  const horizontalFov=display?physicalFov(display.width,display.calibration):settings.horizontalFov;
  const verticalFov=2*Math.atan(Math.tan(horizontalFov*Math.PI/360)/Math.max(.2,aspect))*180/Math.PI;
  return {position,target,verticalFov,horizontalFov};
}
