import {test} from 'node:test';
import assert from 'node:assert/strict';
import {homeObservationEnd,approachCutoff} from '../src/observation.ts';
import {createTrainingPitcher,TRAINING_LEVELS} from '../src/training-profile.ts';
import {generatePracticePitch} from '../src/practice-sequence.ts';
import {trackingAt,PLATE_Z,BALL_RADIUS} from '../src/physics.ts';
import {assessZone} from '../src/strike-zone.ts';

test('all public pitches continue through home instead of stopping at the former 1.5m cutoff',()=>{
  for(const hand of ['R','L'] as const)for(const level of TRAINING_LEVELS){
    const pitcher=createTrainingPitcher(level.id,hand,14);
    for(const spec of pitcher.pitches)for(const call of ['strike','ball'] as const){
      const pitch=generatePracticePitch(pitcher,spec.kind,call,14),end=homeObservationEnd(pitch);
      assert.equal(end,assessZone(pitch).decisionTime);
      assert.ok(end>pitch.duration);assert.ok(end-approachCutoff(pitch)>.02);
      assert.ok(Math.abs(trackingAt(pitch,end).z-(PLATE_Z+BALL_RADIUS))<1e-8);
    }
  }
});
