import { SUPPORTED_ENGINES, type Pitch, type PitchKind } from './physics.ts';
import {assessZone,type ZoneCall} from './strike-zone.ts';
import type { BattingView } from './world.ts';

export const STORAGE_KEY = 'sinker-pitch-reading-v1';
export type Trial = {
  id: string; pitch: Pitch; answer: PitchKind; correct: boolean; observedMs: number;
  pitchCorrect?:boolean;call?:ZoneCall;actualCall?:ZoneCall;callCorrect?:boolean;
  view?:BattingView & {width:number;height:number;immersive:boolean};
};
export type Session = {
  id: string; startedAt: string; pitcherId: string; difficulty: string; occlusionMs: number;
  ballScale: number; eye: 'R' | 'L'; trials: Trial[]; targetCount: number;
  endedAt?: string; completed?: boolean; engineVersion: string;
  motionVersion?: string;
  modelVersion?: string;
  trainingLevel?:'middle'|'high'|'kbo'|'mlb';
  pitchHand?:'R'|'L';
  trainingProfileVersion?:string;
  speedRanges?:Record<string,readonly [number,number]>;
  motionSample?:number;
  pitchReferenceProfile?:string;
  observationVersion?:string;
  gazeVersion?:string;
  presentationVersion?:string;
  minBallPixels?:number;
  displayCalibration?:import('./display-calibration.ts').DisplayCalibration;
  taskVersion?:string;
  samplingVersion?:string;
  cameraVersion?:string;
  batterProfileId?:string;
  zoneVersion?:string;
  zoneRules?:{middleZ:number;endZ:number;endBottom:number;ballRadius:number};
  strikeZone?:{halfWidth:number;bottom:number;top:number};
  battingView?:BattingView;
};
export function recordAnswer(session: Session, pitch: Pitch, trialId: string,
  answer: PitchKind, observedMs: number,call?:ZoneCall): boolean {
  if ((session.taskVersion==='pitch-and-zone-v1'&&!call)||(call!==undefined&&call!=='strike'&&call!=='ball'))return false;
  if (session.endedAt || session.trials.length >= session.targetCount || pitch.engineVersion!==session.engineVersion || pitch.pitcherId !== session.pitcherId
    || session.trials.some(t => t.id === trialId) || !Number.isFinite(observedMs) || observedMs < 0) return false;
  const pitchCorrect=pitch.kind===answer,actualCall=call?assessZone(pitch).call:undefined,callCorrect=call?call===actualCall:undefined;
  session.trials.push({id:trialId,pitch,answer,pitchCorrect,call,actualCall,callCorrect,correct:pitchCorrect&&(callCorrect??true),observedMs});
  return true;
}
export function finish(session: Session): Session {
  return { ...session, trials: [...session.trials], endedAt: new Date().toISOString(),
    completed: session.trials.length === session.targetCount };
}
export function score(session: Session): number {
  return session.trials.length ? Math.round(session.trials.filter(t => t.correct).length / session.trials.length * 100) : 0;
}
export function isStoredSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false;
  const s = value as Session;
  return typeof s.id === 'string' && typeof s.startedAt === 'string' && typeof s.endedAt === 'string'
    && typeof s.pitcherId === 'string' && typeof s.difficulty === 'string' && SUPPORTED_ENGINES.includes(s.engineVersion)
    && typeof s.occlusionMs === 'number' && Number.isFinite(s.occlusionMs)
    && typeof s.ballScale === 'number' && Number.isFinite(s.ballScale)
    && (s.eye === 'R' || s.eye === 'L') && s.targetCount === 10 && typeof s.completed === 'boolean'
    && Array.isArray(s.trials) && s.trials.length > 0 && s.trials.length <= 10
    && s.trials.every(t => typeof t.id === 'string' && typeof t.correct === 'boolean'
      && SUPPORTED_ENGINES.includes(t.pitch?.engineVersion) && typeof t.pitch.kind === 'string'
      && typeof t.answer === 'string' && Number.isFinite(t.observedMs))
    && s.completed === (s.trials.length === 10);
}
export function readHistory(storage: Pick<Storage, 'getItem'>): Session[] {
  try {
    const data: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(data) ? data.filter(isStoredSession).slice(0, 30) : [];
  } catch { return []; }
}
export function saveSession(storage: Pick<Storage, 'getItem' | 'setItem'>, session: Session): Session[] {
  const history = [session, ...readHistory(storage).filter(s => s.id !== session.id)].slice(0, 30);
  storage.setItem(STORAGE_KEY, JSON.stringify(history));
  return history;
}
