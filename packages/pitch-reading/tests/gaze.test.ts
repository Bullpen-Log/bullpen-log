import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GAZE_VERSION} from '../src/gaze.ts';
import {battingCamera} from '../src/world.ts';
import {createTrainingPitcher,TRAINING_LEVELS} from '../src/training-profile.ts';
import {generatePitch,at,PLATE_Z} from '../src/physics.ts';
import {approachCutoff} from '../src/observation.ts';

test('fixed batter view preserves its release-window direction while four pitch paths move across it',()=>{
  assert.equal(GAZE_VERSION,'fixed-release-view-2');
  for(const eye of ['R','L'] as const)for(const hand of ['R','L'] as const)for(const level of TRAINING_LEVELS){
    const pitcher=createTrainingPitcher(level.id,hand,12),width=740,height=354;
    const cfg=battingCamera(eye,width/height,PLATE_Z,{width,calibration:{cssPixelsPerCm:460/3/2.54,viewDistanceCm:35,source:'device',version:'physical-window-1'}});
    const camera=new THREE.PerspectiveCamera(cfg.verticalFov,width/height,.04,2000);
    camera.position.set(cfg.position.x,cfg.position.y,cfg.position.z);camera.lookAt(cfg.target.x,cfg.target.y,cfg.target.z);camera.updateMatrixWorld();
    const rotation=camera.quaternion.toArray();
    for(const spec of pitcher.pitches){
      const pitch=generatePitch(pitcher,spec.kind,3),end=approachCutoff(pitch);
      const start=new THREE.Vector3(...Object.values(at(pitch,0)) as [number,number,number]).project(camera);
      const last=new THREE.Vector3(...Object.values(at(pitch,end)) as [number,number,number]).project(camera);
      assert.ok(start.distanceTo(last)>.1,`${hand}/${eye}/${level.id}/${spec.kind}: ball must move relative to fixed scene`);
      assert.deepEqual(camera.quaternion.toArray(),rotation);
      assert.deepEqual(camera.position.toArray(),[cfg.position.x,cfg.position.y,cfg.position.z]);
    }
  }
});
