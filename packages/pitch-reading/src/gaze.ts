import type {Vec3} from './physics.ts';
export const GAZE_VERSION='partial-pursuit-1';
/** A fixed eye with partial head pursuit. Residual on-screen motion is retained,
 * rather than pinning the ball to the image centre. No future ball location is used. */
export function pursuitDirection(eye:Vec3,release:Vec3,ball:Vec3,time:number,horizontalFov:number,verticalFov:number):Vec3{
  const angles=(p:Vec3)=>({yaw:Math.atan2(p.x-eye.x,eye.z-p.z),pitch:Math.atan2(p.y-eye.y,Math.hypot(p.x-eye.x,p.z-eye.z))});
  const start=angles(release),current=angles(ball),u=Math.max(0,Math.min(1,time/.12)),blend=u*u*u*(10-15*u+6*u*u);
  const follow=(base:number,value:number,fov:number)=>{
    const limit=fov*Math.PI/180*.18;
    const residual=limit*Math.tanh((value-base)*.25/limit);
    return base+(value-residual-base)*blend;
  };
  const yaw=follow(start.yaw,current.yaw,horizontalFov),pitch=follow(start.pitch,current.pitch,verticalFov);
  return {x:Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)};
}
