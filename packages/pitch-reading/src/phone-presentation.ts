import type {Vec3} from './physics.ts';

export const PHONE_PRESENTATION_VERSION='phone-fit-1';
export const PHONE_MIN_BALL_PIXELS=5;

/** A fixed overview of the approach. A phone is a small training display, not a
 * life-size transparent window: its vertical coverage must not collapse when rotated. */
export function phoneCamera(position:Vec3,aspect:number){
  const yaw=(position.x<0?8:-8)*Math.PI/180,pitch=-11*Math.PI/180;
  const verticalFov=48;
  const horizontalFov=2*Math.atan(Math.tan(verticalFov*Math.PI/360)*aspect)*180/Math.PI;
  return {verticalFov,horizontalFov,target:{
    x:position.x+4*Math.sin(yaw)*Math.cos(pitch),
    y:position.y+4*Math.sin(pitch),
    z:position.z-4*Math.cos(yaw)*Math.cos(pitch),
  }};
}

/** Visual identification aid only. Physics, timing and strike assessment use the
 * regulation radius. Apply to the held ball too, so release has no size jump. */
export function phoneBallScale(baseScale:number,baseDiameterPixels:number){
  return baseDiameterPixels>0&&Number.isFinite(baseDiameterPixels)
    ?baseScale*Math.max(1,PHONE_MIN_BALL_PIXELS/baseDiameterPixels):baseScale;
}
