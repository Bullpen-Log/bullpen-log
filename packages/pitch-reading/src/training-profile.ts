import referenceData from './data/pitch-reference.json' with {type:'json'};
import {generatePitch,PITCHERS,randomGenerator,type Pitcher,type PitchKind,type PitchSpec} from './physics.ts';

export const TRAINING_PROFILE_VERSION='four-level-reference-2';
export type LevelId='middle'|'high'|'kbo'|'mlb';
export type TrainingConfig={pitchHand:'R'|'L';eye:'R'|'L';level:LevelId};
export const TRAINING_KINDS=['fastball','curve','slider','changeup'] as const;
export type TrainingKind=typeof TRAINING_KINDS[number];
export type TrainingLevel={id:LevelId;name:string;description:string;evidence:string;speeds:Record<TrainingKind,readonly [number,number]>};
export const TRAINING_LEVELS:readonly TrainingLevel[]=[
  {id:'middle',name:'중학교',description:'낮은 구속부터 차이를 읽어요',evidence:'청소년 측정 연구 참고 · 국내 실측 검증 전',speeds:{fastball:[100,120],curve:[80,96],slider:[88,105],changeup:[85,100]}},
  {id:'high',name:'고등학교',description:'구속과 변화구를 함께 읽어요',evidence:'청소년 측정 연구 참고 · 국내 실측 검증 전',speeds:{fastball:[115,135],curve:[92,110],slider:[100,120],changeup:[98,115]}},
  {id:'kbo',name:'KBO',description:'빠른 공에 판단 시간을 줄여요',evidence:'프로 구속 자료 참고 · 연습 범위 설계',speeds:{fastball:[140,150],curve:[112,128],slider:[126,139],changeup:[122,136]}},
  {id:'mlb',name:'MLB',description:'가장 짧은 시간 안에 읽어요',evidence:'2025 Statcast 구속 자료 참고',speeds:{fastball:[148,158],curve:[124,136],slider:[134,146],changeup:[132,144]}},
];
export const levelFor=(id:LevelId)=>TRAINING_LEVELS.find(level=>level.id===id)!;
const names:Record<TrainingKind,readonly [string,string]>={fastball:['직구','FASTBALL'],curve:['커브','CURVEBALL'],slider:['슬라이더','SLIDER'],changeup:['체인지업','CHANGEUP']};

export function createTrainingPitcher(levelId:LevelId,hand:'R'|'L',seed?:number):Pitcher {
  const level=levelFor(levelId),source=hand==='R'?PITCHERS[0]:PITCHERS[2];
  const random=randomGenerator(seed??0),families=referenceData.profiles.filter(p=>p.hand===hand);
  const family=families[seed===undefined?0:Math.floor(random()*families.length)];
  const ability=seed===undefined?.5:.15+.7*random(),types={fastball:'FF',curve:'CU',slider:'SL',changeup:'CH'} as const;
  const pitches:PitchSpec[]=TRAINING_KINDS.map(kind=>{
    const range=level.speeds[kind],r=family.pitches[types[kind]],center=range[0]+ability*(range[1]-range[0]);
    const spread=Math.min((range[1]-range[0])/2,Math.max(.8,r.speedSdKmh*1.8));
    const speed:readonly [number,number]=seed===undefined?range:[Math.max(range[0],center-spread),Math.min(range[1],center+spread)];
    const v=(speed[0]+speed[1])/2/3.6;
    return {kind,name:names[kind][0],english:names[kind][1],speed,ax:r.liftX*v*v,ay:-9.80665+r.liftY*v*v,
      aerodynamics:{drag:r.drag,liftX:r.liftX,liftY:r.liftY},description:`실측 자료를 참고한 가상 ${names[kind][0]}`};
  });
  return {...source,id:`training-${levelId}-${hand}`,number:hand==='R'?'R':'L',name:`${level.name} · ${hand==='R'?'우투':'좌투'}`,subtitle:'직구 · 커브 · 슬라이더 · 체인지업',referenceProfile:`${referenceData.version}:${family.id}`,pitches};
}

/** A fixed limit within one level/hand: masking time cannot disclose pitch type. */
export function trainingObservationMs(pitcher:Pitcher):number {
  return Math.round(generatePitch(pitcher,'fastball',1,false).duration*.6*1000/5)*5;
}
export function resolvePitcher(id:string):Pitcher|undefined {
  const legacy=PITCHERS.find(p=>p.id===id);if(legacy)return legacy;
  const match=/^training-(middle|high|kbo|mlb)-(R|L)$/.exec(id);
  return match?createTrainingPitcher(match[1] as LevelId,match[2] as 'R'|'L'):undefined;
}
export function createPitchPlan(seed:number):PitchKind[]{
  const random=randomGenerator(seed),extra=[...TRAINING_KINDS];
  for(let i=extra.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[extra[i],extra[j]]=[extra[j],extra[i]];}
  const plan:PitchKind[]=[...TRAINING_KINDS,...TRAINING_KINDS,...extra.slice(0,2)];
  for(let i=plan.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[plan[i],plan[j]]=[plan[j],plan[i]];}
  return plan;
}
