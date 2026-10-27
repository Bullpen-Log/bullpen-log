import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TRAINING_LEVELS,TRAINING_KINDS,createTrainingPitcher,createPitchPlan,resolvePitcher,trainingObservationMs} from '../src/training-profile.ts';
import {generatePracticePitch} from '../src/practice-sequence.ts';
import {assessZone} from '../src/strike-zone.ts';
import {generatePitch} from '../src/physics.ts';
import {motionSample} from '../src/motion.ts';

test('eight level/hand profiles keep all four pitch types, real speed ranges, actual source hand and physically valid calls',()=>{
  for(const hand of ['R','L'] as const){
    let previous=Infinity,previousMask=Infinity;
    for(const level of TRAINING_LEVELS){
      const p=createTrainingPitcher(level.id,hand);
      assert.deepEqual(p.pitches.map(s=>s.kind),TRAINING_KINDS);
      assert.equal(motionSample(p),hand==='R'?4:3);
      assert.deepEqual(resolvePitcher(p.id),p);
      const fast=generatePitch(p,'fastball',1,false),mask=trainingObservationMs(p);
      assert.ok(fast.duration<previous);assert.ok(mask<previousMask);
      assert.ok(Math.abs(mask/1000-fast.duration*.6)<.003);
      previous=fast.duration;previousMask=mask;
      for(const spec of p.pitches)for(const call of ['strike','ball'] as const){
        for(let seed=0;seed<12;seed++){
          const pitch=generatePracticePitch(p,spec.kind,call,seed);
          assert.equal(assessZone(pitch).call,call);
          assert.ok(pitch.speedKmh>=spec.speed[0]&&pitch.speedKmh<=spec.speed[1]);
          assert.equal(pitch.kind,spec.kind);
          assert.ok(Number.isFinite(pitch.duration)&&pitch.duration>0);
        }
      }
      assert.ok(p.pitches.find(s=>s.kind==='changeup')!.ax*(hand==='R'?-1:1)>0);
      assert.ok(p.pitches.find(s=>s.kind==='slider')!.ax*(hand==='R'?1:-1)>0);
    }
  }
});
test('four pitch plan is balanced and independently shuffled reproducibly',()=>{
  const sequences=new Set<string>();
  for(let seed=0;seed<200;seed++){
    const plan=createPitchPlan(seed);assert.equal(plan.length,10);assert.deepEqual(plan,createPitchPlan(seed));
    for(const kind of TRAINING_KINDS){const count=plan.filter(k=>k===kind).length;assert.ok(count===2||count===3);}
    sequences.add(plan.join(','));
  }
  assert.ok(sequences.size>100);assert.equal(resolvePitcher('training-bogus-R'),undefined);
});
