import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {pursuitDirection} from '../src/gaze.ts';
import {battingCamera} from '../src/world.ts';
import {createTrainingPitcher,TRAINING_LEVELS} from '../src/training-profile.ts';
import {generatePitch,at,PLATE_Z,BALL_RADIUS} from '../src/physics.ts';
import {approachCutoff} from '../src/observation.ts';

test('partial pursuit keeps both eyes fixed, preserves visible pitch motion, and fits the whole approach on a physical phone window',()=>{
  let visibleMotion=0;
  for(const eye of ['R','L'] as const)for(const hand of ['R','L'] as const)for(const level of TRAINING_LEVELS){
    const p=createTrainingPitcher(level.id,hand,12),width=393,height=480,display={cssPixelsPerCm:460/3/2.54,viewDistanceCm:35,source:'device' as const,version:'physical-window-1'};
    const cfg=battingCamera(eye,width/height,PLATE_Z,{width,calibration:display});
    const camera=new THREE.PerspectiveCamera(cfg.verticalFov,width/height,.04,2000);camera.position.set(cfg.position.x,cfg.position.y,cfg.position.z);
    for(const spec of p.pitches)for(const seed of [3,14,29]){
      const pitch=generatePitch(p,spec.kind,seed),end=approachCutoff(pitch);
      for(let i=0;i<=24;i++){
        const time=end*i/24,ball=at(pitch,time),d=pursuitDirection(cfg.position,pitch.release,ball,time,cfg.horizontalFov,cfg.verticalFov);
        camera.lookAt(cfg.position.x+d.x,cfg.position.y+d.y,cfg.position.z+d.z);camera.updateMatrixWorld();
        const local=new THREE.Vector3(ball.x,ball.y,ball.z).applyMatrix4(camera.matrixWorldInverse),screen=new THREE.Vector3(ball.x,ball.y,ball.z).project(camera),radius=BALL_RADIUS/(-local.z*Math.tan(camera.fov*Math.PI/360));
        assert.ok(Math.abs(screen.x)+radius/camera.aspect<1&&Math.abs(screen.y)+radius<1,`${hand}/${eye}/${level.id}/${spec.kind}/${time}: clipped ball`);
        if(time>.15&&Math.hypot(screen.x,screen.y)>.01)visibleMotion++;
        assert.deepEqual(camera.position.toArray(),[cfg.position.x,cfg.position.y,cfg.position.z]);
      }
    }
  }
  assert.ok(visibleMotion>500);
});
