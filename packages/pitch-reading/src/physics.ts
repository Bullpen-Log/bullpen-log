import {HOME_PLATE,REFERENCE_STRIKE_ZONE} from './batter-reference.ts';
/** Synthetic gravity, quadratic-drag and spin-lift pitches, SI units. No measured player data.
 * x = catcher's right, y = up, z = rubber toward home plate.
 * All camera views sample the SAME world-space curve and clock.
 */
/** Rear apex of home plate, 60 ft 6 in from the front of the rubber. */
export const PLATE_Z = 18.4404;
export const PLATE_FRONT_Z = PLATE_Z-HOME_PLATE.depth;
export const BALL_RADIUS = 0.0366;
export const ENGINE_VERSION = 'reference-aero-8';
export const SUPPORTED_ENGINES=[ENGINE_VERSION,'synthetic-aero-7-shapes','synthetic-aero-6-kbo','synthetic-aero-5-reference','synthetic-aero-4-command','synthetic-aero-3-frontplate','synthetic-aero-2','synthetic-ca-1'];
export type Vec3 = { x: number; y: number; z: number };
export type PitchKind = 'fastball' | 'curve' | 'sinker' | 'slider' | 'changeup';
export type PitchSpec = {
  kind: PitchKind; name: string; english: string;
  speed: readonly [number, number]; ax: number; ay: number;
  description: string;
  aerodynamics?:{drag:number;liftX:number;liftY:number};
};
export type Pitcher = {
  id: string; number: string; name: string; subtitle: string; hand: 'R' | 'L';
  release: Vec3; armSlot: number; color: string; pitches: readonly PitchSpec[];referenceProfile?:string;
};

export const PITCHERS: readonly Pitcher[] = [
  {
    id: 'overhand', number: '01', name: '우완 A', subtitle: '투구 4 동작 · 포심과 커브',
    hand: 'R', release: { x: -0.46, y: 1.79, z: 1.81 }, armSlot: 0.9, color: '#e4a873',
    pitches: [
      { kind: 'fastball', name: '포심', english: 'FOUR-SEAM', speed: [118, 126], ax: -2.0, ay: -6.2, description: '팔 쪽으로 조금 흐르며 커브보다 낙하가 작은 가상 포심입니다.' },
      { kind: 'curve', name: '커브', english: 'CURVEBALL', speed: [94, 102], ax: 1.2, ay: -11.6, description: '느린 속도로 글러브 쪽과 아래로 연속해서 휘는 가상 커브입니다.' },
    ],
  },
  {
    id: 'threequarter', number: '02', name: '우완 B', subtitle: '투구 4 동작 · 싱커와 슬라이더',
    hand: 'R', release: { x: -0.46, y: 1.79, z: 1.81 }, armSlot: 0.55, color: '#9dc9be',
    pitches: [
      { kind: 'sinker', name: '싱커', english: 'SINKER', speed: [109, 117], ax: -3.2, ay: -8.5, description: '팔 쪽으로 흐르고 포심보다 뜨는 힘이 작은 가상 싱커입니다.' },
      { kind: 'slider', name: '슬라이더', english: 'SLIDER', speed: [99, 107], ax: .6, ay: -9.7, description: '글러브 쪽으로 짧게 휘며 낙하하는 가상 슬라이더입니다. 스위퍼와 구분합니다.' },
    ],
  },
  {
    id: 'lefty', number: '03', name: '좌완', subtitle: '투구 3 동작 · 포심과 체인지업',
    hand: 'L', release: { x: 0.60, y: 1.71, z: 2.20 }, armSlot: 0.7, color: '#aeb7df',
    pitches: [
      { kind: 'fastball', name: '포심', english: 'FOUR-SEAM', speed: [113, 121], ax: 2.1, ay: -6.4, description: '좌완의 팔 쪽으로 조금 흐르는 가상 포심입니다. 체인지업과 속도를 비교해 보세요.' },
      { kind: 'changeup', name: '체인지업', english: 'CHANGEUP', speed: [93, 101], ax: 2.4, ay: -9.3, description: '포심보다 느리고 팔 쪽 흐름과 낙하가 큰 가상 체인지업입니다.' },
    ],
  },
];

export const DIFFICULTIES = [
  { id: 'easy', name: '입문', milliseconds: 340, description: '340ms 보고 판단' },
  { id: 'normal', name: '기본', milliseconds: 260, description: '260ms 보고 판단' },
  { id: 'hard', name: '도전', milliseconds: 180, description: '180ms 보고 판단' },
] as const;

export type Pitch = {
  seed: number; pitcherId: string; kind: PitchKind; name: string; engineVersion: string;
  release: Vec3; velocity: Vec3; acceleration: Vec3; target: Vec3;
  duration: number; speedKmh: number; endSpeedKmh: number;
  aerodynamics?: {drag:number;spin:Vec3};
};
export type Overrides = { speedKmh?: number; height?: number; ax?: number; ay?: number; targetX?: number; targetY?: number };

export function randomGenerator(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let n = Math.imul(value ^ value >>> 15, 1 | value);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
function centered(random: () => number): number {
  return ((random() + random() + random()) / 3 - 0.5) * 2;
}
const GRAVITY=9.80665,DRAG=.0065,STEP=1/480;
type State={t:number;p:Vec3;v:Vec3};
const trajectories=new WeakMap<Pitch,State[]>();
const magnitude=(v:Vec3)=>Math.hypot(v.x,v.y,v.z);
function force(v:Vec3,aero:NonNullable<Pitch['aerodynamics']>):Vec3{
  const speed=magnitude(v),w=aero.spin;
  // Lift stays perpendicular to instantaneous velocity; drag always opposes it.
  return {x:-aero.drag*speed*v.x+speed*(w.y*v.z-w.z*v.y),
    y:-GRAVITY-aero.drag*speed*v.y+speed*(w.z*v.x-w.x*v.z),
    z:-aero.drag*speed*v.z+speed*(w.x*v.y-w.y*v.x)};
}
function step(s:State,dt:number,aero:NonNullable<Pitch['aerodynamics']>):State{
  const advance=(a:Vec3,b:Vec3,k:number):Vec3=>({x:a.x+b.x*k,y:a.y+b.y*k,z:a.z+b.z*k});
  const a=force(s.v,aero),v2=advance(s.v,a,dt/2),b=force(v2,aero),v3=advance(s.v,b,dt/2),c=force(v3,aero),v4=advance(s.v,c,dt),d=force(v4,aero);
  const p={} as Vec3,v={} as Vec3;
  for(const k of ['x','y','z'] as const){p[k]=s.p[k]+dt*(s.v[k]+2*v2[k]+2*v3[k]+v4[k])/6;v[k]=s.v[k]+dt*(a[k]+2*b[k]+2*c[k]+d[k])/6;}
  return {t:s.t+dt,p,v};
}
function integrate(release:Vec3,velocity:Vec3,aero:NonNullable<Pitch['aerodynamics']>,keep=false,targetZ=PLATE_FRONT_Z){
  let s:State={t:0,p:{...release},v:{...velocity}};const path=[s];
  while(s.p.z<targetZ&&s.t<1.5){
    const next=step(s,STEP,aero);
    if(next.p.z>=targetZ){
      let lo=0,hi=STEP;for(let i=0;i<30;i++){const mid=(lo+hi)/2;if(step(s,mid,aero).p.z<targetZ)lo=mid;else hi=mid;}
      s=step(s,(lo+hi)/2,aero);if(keep)path.push(s);return {end:s,path};
    }
    s=next;if(keep)path.push(s);
  }
  throw new Error('공이 홈 평면에 도착하지 못했습니다.');
}
function stateAt(pitch:Pitch,t:number):State{
  const time=Math.max(0,Math.min(pitch.duration,t));
  if(pitch.engineVersion==='synthetic-ca-1'||!pitch.aerodynamics){
    const p={} as Vec3,v={} as Vec3;for(const k of ['x','y','z'] as const){p[k]=pitch.release[k]+pitch.velocity[k]*time+.5*pitch.acceleration[k]*time*time;v[k]=pitch.velocity[k]+pitch.acceleration[k]*time;}return {t:time,p,v};
  }
  let path=trajectories.get(pitch);if(!path){path=integrate(pitch.release,pitch.velocity,pitch.aerodynamics,true,pitch.target.z).path;trajectories.set(pitch,path);}
  if(time<=0)return path[0];if(time>=pitch.duration)return path[path.length-1];
  const i=Math.min(path.length-2,Math.floor(time/STEP)),a=path[i],b=path[i+1],dt=b.t-a.t,u=(time-a.t)/dt;
  const p={} as Vec3,v={} as Vec3;
  for(const k of ['x','y','z'] as const){
    p[k]=(2*u*u*u-3*u*u+1)*a.p[k]+(u*u*u-2*u*u+u)*dt*a.v[k]+(-2*u*u*u+3*u*u)*b.p[k]+(u*u*u-u*u)*dt*b.v[k];
    v[k]=((6*u*u-6*u)*a.p[k]+(3*u*u-4*u+1)*dt*a.v[k]+(-6*u*u+6*u)*b.p[k]+(3*u*u-2*u)*dt*b.v[k])/dt;
  }
  return {t:time,p,v};
}
export function at(pitch:Pitch,t:number):Vec3{return {...stateAt(pitch,t).p};}
export function velocityAt(pitch:Pitch,t:number):Vec3{return {...stateAt(pitch,t).v};}
export function speedAt(pitch:Pitch,t:number):number{return magnitude(velocityAt(pitch,t))*3.6;}

/** Continue the SAME flight past the plate for tracking and volume-based calls. */
export function trackingAt(pitch:Pitch,t:number):Vec3{
  if(t<=pitch.duration)return at(pitch,t);
  let state=stateAt(pitch,pitch.duration),remaining=Math.min(.08,t-pitch.duration);
  if(!pitch.aerodynamics){return {x:state.p.x+state.v.x*remaining+.5*pitch.acceleration.x*remaining**2,y:state.p.y+state.v.y*remaining+.5*pitch.acceleration.y*remaining**2,z:state.p.z+state.v.z*remaining+.5*pitch.acceleration.z*remaining**2};}
  while(remaining>1e-10){const dt=Math.min(STEP,remaining);state=step(state,dt,pitch.aerodynamics);remaining-=dt;}return state.p;
}
export const trackingEnd=(pitch:Pitch)=>pitch.duration+.065;
/** Same distribution for every repertoire: in-zone, borderline, and clear misses. */
export function randomCommand(seed:number){
  const random=randomGenerator(seed^0xa531be49),sample=random(),edge=Math.floor(random()*4),side=random()<.5?-1:1;
  const {halfWidth,bottom,top}=REFERENCE_STRIKE_ZONE;
  if(sample<.42)return {x:(random()-.5)*(halfWidth-.036)*2,y:bottom+.04+random()*(top-bottom-.08)};
  if(sample<.70){
    const near=(random()-.5)*.12;
    return edge<2?{x:(edge===0?-1:1)*(halfWidth+near),y:bottom-.06+random()*(top-bottom+.12)}:{x:(random()-.5)*(halfWidth+.054)*2,y:(edge===2?bottom:top)+near};
  }
  return edge<2?{x:side*(halfWidth+.1041+random()*.32),y:bottom-.20+random()*(top-bottom+.40)}:{x:(random()-.5)*.76,y:edge===2?bottom-.30+random()*.22:top+.12+random()*.26};
}

export function generatePitch(pitcher: Pitcher, kind: PitchKind, seed: number,
  jitter = true, overrides: Overrides = {}): Pitch {
  const spec = pitcher.pitches.find(p => p.kind === kind);
  if (!spec) throw new Error('이 투수가 던지지 않는 구종입니다.');
  const random = randomGenerator(seed);
  const release = { ...pitcher.release };
  if (jitter) {
    release.x += centered(random) * 0.035;
    release.y += centered(random) * 0.025;
    release.z += centered(random) * 0.05;
  }
  if (overrides.height != null) release.y = overrides.height;
  const speedKmh = overrides.speedKmh ?? (jitter
    ? spec.speed[0] + random() * (spec.speed[1] - spec.speed[0])
    : (spec.speed[0] + spec.speed[1]) / 2);
  // Profiles are calibrated at their midpoint speed. Scale aerodynamic force with
  // speed², keeping gravity fixed: a slower pitch must not gain enormous sideways
  // break merely from spending more time in flight. Lab acceleration overrides
  // remain explicit initial net accelerations, in m/s².
  const speedScale=(speedKmh/((spec.speed[0]+spec.speed[1])/2))**2;
  const acceleration = {
    x: overrides.ax ?? spec.ax * speedScale * (1 + (jitter ? centered(random) * 0.1 : 0)),
    y: overrides.ay ?? -GRAVITY+(spec.ay+GRAVITY)*speedScale*(1+(jitter?centered(random)*.07:0)),
    z: 0,
  };
  // Target distributions do not encode pitch type. Flight, not a fixed destination, is the cue.
  const command=randomCommand(seed);
  const target = {x:overrides.targetX??(jitter?command.x:0),y:overrides.targetY??(jitter?command.y:(REFERENCE_STRIKE_ZONE.bottom+REFERENCE_STRIKE_ZONE.top)/2),z:PLATE_FRONT_Z};
  if (![speedKmh, ...Object.values(release), ...Object.values(acceleration), ...Object.values(target)].every(Number.isFinite)
    || speedKmh < 60 || speedKmh > 180 || release.y < 0.8 || release.y > 2.5
    || acceleration.x < -20 || acceleration.x > 20 || acceleration.y < -25 || acceleration.y > 2) {
    throw new Error('가상 투구 설정의 허용 범위를 벗어났습니다.');
  }
  const speed=speedKmh/3.6,drag=spec.aerodynamics?.drag??DRAG;
  const approximateTime=(target.z-release.z)/(speed*.95);
  let vx=(target.x-release.x-.5*acceleration.x*approximateTime**2)/approximateTime;
  let vy=(target.y-release.y-.5*acceleration.y*approximateTime**2)/approximateTime;
  const shoot=(x:number,y:number,keep=false)=>{
    const z=Math.sqrt(Math.max(1,speed*speed-x*x-y*y)),velocity={x,y,z};
    const spin={x:-(acceleration.y+GRAVITY+(!spec.aerodynamics||overrides.ay!=null?drag*speed*y:0))/(speed*z),y:(acceleration.x+(!spec.aerodynamics||overrides.ax!=null?drag*speed*x:0))/(speed*z),z:0};
    const aero={drag,spin};return {...integrate(release,velocity,aero,keep,target.z),velocity,aero};
  };
  for(let i=0;i<9;i++){
    const base=shoot(vx,vy),ex=base.end.p.x-target.x,ey=base.end.p.y-target.y;
    if(Math.hypot(ex,ey)<1e-10)break;
    const delta=.001,dx=shoot(vx+delta,vy).end.p,dy=shoot(vx,vy+delta).end.p;
    const a=(dx.x-base.end.p.x)/delta,b=(dy.x-base.end.p.x)/delta,c=(dx.y-base.end.p.y)/delta,d=(dy.y-base.end.p.y)/delta,det=a*d-b*c;
    if(Math.abs(det)<1e-8)throw new Error('이 설정에서 궤적을 계산할 수 없습니다.');
    vx-=(d*ex-b*ey)/det;vy-=(-c*ex+a*ey)/det;
  }
  const solved=shoot(vx,vy,true),end=solved.end;
  if(Math.hypot(end.p.x-target.x,end.p.y-target.y)>1e-6||Math.abs(magnitude(solved.velocity)-speed)>1e-6)throw new Error('이 설정에서 궤적을 계산할 수 없습니다.');
  const pitch:Pitch={seed,pitcherId:pitcher.id,kind,name:spec.name,engineVersion:ENGINE_VERSION,
    release,velocity:solved.velocity,acceleration:force(solved.velocity,solved.aero),aerodynamics:solved.aero,target,
    duration:end.t,speedKmh,endSpeedKmh:magnitude(end.v)*3.6};
  trajectories.set(pitch,solved.path);return pitch;
}

export function movement(pitch: Pitch): { horizontalCm: number; verticalCm: number } {
  const t = pitch.duration;
  const end=at(pitch,t);
  return {horizontalCm:100*(end.x-pitch.release.x-pitch.velocity.x*t),verticalCm:100*(end.y-pitch.release.y-pitch.velocity.y*t)};
}

/** Model-only spin movement: compare with a gravity + drag flight launched with the
 * same initial velocity, at the SAME home plane. Not an exact Statcast IVB replica.
 */
export function inducedMovement(pitch:Pitch):{horizontalCm:number;verticalCm:number}{
  if(!pitch.aerodynamics){
    const m=movement(pitch);return {horizontalCm:m.horizontalCm,verticalCm:m.verticalCm+50*GRAVITY*pitch.duration**2};
  }
  const baseline=integrate(pitch.release,pitch.velocity,{drag:pitch.aerodynamics.drag,spin:{x:0,y:0,z:0}},false,pitch.target.z).end.p;
  const end=at(pitch,pitch.duration);
  return {horizontalCm:(end.x-baseline.x)*100,verticalCm:(end.y-baseline.y)*100};
}
