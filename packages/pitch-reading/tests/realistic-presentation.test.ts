import {test} from 'node:test';
import assert from 'node:assert/strict';
import {physicalFov,cardCalibration,estimateDisplay,validCalibration} from '../src/display-calibration.ts';
import {approachCutoff,LAST_VISIBLE_DISTANCE_M} from '../src/observation.ts';
import {at,generatePitch,PLATE_FRONT_Z,velocityAt} from '../src/physics.ts';
import {createTrainingPitcher,TRAINING_LEVELS} from '../src/training-profile.ts';
import reference from '../src/data/pitch-reference.json' with {type:'json'};

test('physical projection produces the same central angular scale for phone, tablet and desktop, without a ball-size multiplier',()=>{
  for(const widthCm of [6.5,14,28.6,53])for(const distance of [35,60]){
    const display=cardCalibration(5.398*50,distance),fov=physicalFov(widthCm*50,display);
    assert.ok(Math.abs(Math.tan(fov*Math.PI/360)-widthCm/(2*distance))<1e-12);
  }
  assert.equal(estimateDisplay(true,393).source,'estimated');assert.equal(validCalibration({cssPixelsPerCm:NaN}),false);
});
test('all empirical four-pitch families stay within grade speed ranges and reach 1.5m approach at real time',()=>{
  const found=new Set();
  for(const hand of ['R','L'] as const)for(const level of TRAINING_LEVELS)for(let seed=0;seed<16;seed++){
    const p=createTrainingPitcher(level.id,hand,seed);found.add(p.referenceProfile);
    for(const spec of p.pitches){
      const pitch=generatePitch(p,spec.kind,seed),cutoff=approachCutoff(pitch);
      assert.ok(pitch.speedKmh>=level.speeds[spec.kind as keyof typeof level.speeds][0]);
      assert.ok(pitch.speedKmh<=level.speeds[spec.kind as keyof typeof level.speeds][1]);
      assert.ok(cutoff>pitch.duration*.8&&cutoff<pitch.duration);
      assert.ok(Math.abs(at(pitch,cutoff).z-(PLATE_FRONT_Z-LAST_VISIBLE_DISTANCE_M))<1e-8);
      assert.ok(pitch.aerodynamics!.drag>.003&&pitch.aerodynamics!.drag<.009);
      assert.ok(Math.abs(Math.hypot(...Object.values(velocityAt(pitch,0)))*3.6-pitch.speedKmh)<1e-7);
    }
  }
  assert.equal(found.size,8);assert.equal(reference.profiles.length,8);
});
