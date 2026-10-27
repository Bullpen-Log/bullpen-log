import { test } from 'node:test';
import assert from 'node:assert/strict';
import { at, ENGINE_VERSION, generatePitch, PITCHERS } from '../src/physics.ts';
import { finish, readHistory, recordAnswer, saveSession, score, STORAGE_KEY, type Session } from '../src/session.ts';

function newSession(): Session {
  return { id: 'one', startedAt: '2026-10-26T12:00:00.000Z', pitcherId: 'overhand', difficulty: 'easy',
    occlusionMs: 340, ballScale: 1.8, eye: 'R', targetCount: 10, trials: [], engineVersion: ENGINE_VERSION };
}
test('one answer per trial, exact score, and no more than ten trials', () => {
  const session = newSession(), pitch = generatePitch(PITCHERS[0], 'fastball', 1);
  assert.equal(recordAnswer(session, pitch, 't1', 'fastball', 345), true);
  assert.equal(recordAnswer(session, pitch, 't1', 'curve', 345), false);
  assert.equal(recordAnswer(session, pitch, 't2', 'curve', 345), true);
  assert.equal(score(session), 50);
  for (let n = 3; n <= 10; n++) assert.equal(recordAnswer(session, pitch, `t${n}`, 'fastball', 345), true);
  assert.equal(recordAnswer(session, pitch, 't11', 'fastball', 345), false);
  assert.equal(score(session), 90);
  assert.equal(finish(session).completed, true);
});
test('wrong-pitcher, invalid observation, completed and aborted sessions do not accept new scores', () => {
  const s = newSession();
  assert.equal(recordAnswer(s, generatePitch(PITCHERS[2], 'fastball', 1), 'foreign', 'fastball', 340), false);
  const p = generatePitch(PITCHERS[0], 'curve', 1);
  assert.equal(recordAnswer(s, p, 'bad', 'curve', NaN), false);
  assert.equal(recordAnswer(s, p, 'bad', 'curve', -10), false);
  recordAnswer(s, p, 'good', 'curve', 350);
  const finished = finish(s);
  assert.equal(finished.completed, false);
  assert.equal(recordAnswer(finished, p, 'after', 'curve', 350), false);
  assert.equal(finished.trials.length, 1);
});
test('history tolerates corrupt or unavailable storage, and upserts by session id', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  values.set(STORAGE_KEY, 'invalid json'); assert.deepEqual(readHistory(storage), []);
  values.set(STORAGE_KEY, JSON.stringify([{}, null])); assert.deepEqual(readHistory(storage), []);
  const s = newSession(); recordAnswer(s, generatePitch(PITCHERS[0], 'curve', 1), 't', 'curve', 345);
  const ended = finish(s); saveSession(storage, ended); saveSession(storage, ended);
  assert.equal(readHistory(storage).length, 1);
  assert.equal(readHistory(storage)[0].ballScale, 1.8);
  assert.equal(readHistory({getItem: () => {throw new Error('blocked');}}).length, 0);
  assert.throws(() => saveSession({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, ended));
});

test('old constant-acceleration practice remains readable alongside the new flight model',()=>{
  const s=newSession(),pitch=generatePitch(PITCHERS[0],'fastball',1);recordAnswer(s,pitch,'t','fastball',340);
  const old=finish(s);old.id='old';old.engineVersion='synthetic-ca-1';old.trials[0].pitch={...pitch,engineVersion:'synthetic-ca-1'};
  const values=new Map([[STORAGE_KEY,JSON.stringify([old])]]);
  const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
  const fresh=newSession();recordAnswer(fresh,pitch,'new','fastball',340);saveSession(storage,finish(fresh));
  assert.equal(readHistory(storage).length,2);assert.equal(readHistory(storage)[1].engineVersion,'synthetic-ca-1');
  assert.equal(recordAnswer(newSession(),old.trials[0].pitch,'foreign-engine','fastball',340),false);
});

test('previous aero-6 sessions keep their original flight and score after shape calibration',()=>{
  const s=newSession();s.id='previous-shape';s.engineVersion='synthetic-aero-6-kbo';
  const pitch={...generatePitch(PITCHERS[1],'slider',1,false,{ax:6.9,ay:-10.5}),engineVersion:s.engineVersion};
  s.pitcherId=pitch.pitcherId;recordAnswer(s,pitch,'previous','slider',260);
  const sample=at(pitch,.3),ended=finish(s);
  const values=new Map([[STORAGE_KEY,JSON.stringify([ended])]]);
  const stored=readHistory({getItem:k=>values.get(k)??null})[0];
  assert.equal(stored.engineVersion,'synthetic-aero-6-kbo');assert.equal(score(stored),100);
  assert.deepEqual(at(stored.trials[0].pitch,.3),sample);
});
