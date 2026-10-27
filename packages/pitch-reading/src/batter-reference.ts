/** Authored adult batting stance, metres. These are model landmarks, not measured user anatomy. */
export const REFERENCE_BATTER=Object.freeze({
  id:'adult-180-right-v1',height:1.80,eye:'R' as const,
  eyeHeight:1.60,shoulderHeight:1.44,pantsTopHeight:1.00,kneecapBottomHeight:.46,
  plateDistance:.70,plateDepth:-.15,horizontalFov:35,
});
export const HOME_PLATE=Object.freeze({width:.4318,depth:.4318,sideDepth:.2159});
export const ZONE_VERSION='kbo-abs-2026-180-v1';
/** KBO public ABS specifications; end-plane LOWER boundary only is 1.5cm lower. */
export const KBO_ABS=Object.freeze({topRatio:.5575,bottomRatio:.2704,sideExpansion:.02,endBottomDrop:.015});
export const REFERENCE_STRIKE_ZONE=Object.freeze({
  halfWidth:HOME_PLATE.width/2+KBO_ABS.sideExpansion,
  bottom:REFERENCE_BATTER.height*KBO_ABS.bottomRatio,
  top:REFERENCE_BATTER.height*KBO_ABS.topRatio,
});
export function plateOutline(front:number,apex:number){
  const x=HOME_PLATE.width/2;
  return [[-x,front],[x,front],[x,front+HOME_PLATE.sideDepth],[0,apex],[-x,front+HOME_PLATE.sideDepth]];
}
