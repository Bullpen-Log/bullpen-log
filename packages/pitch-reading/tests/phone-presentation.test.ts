import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {phoneBallScale,PHONE_MIN_BALL_PIXELS} from '../src/phone-presentation.ts';
import {battingCamera} from '../src/world.ts';
import {createTrainingPitcher,TRAINING_LEVELS} from '../src/training-profile.ts';
import {generatePracticePitch} from '../src/practice-sequence.ts';
import {approachCutoff} from '../src/observation.ts';
import {at,BALL_RADIUS,PLATE_Z} from '../src/physics.ts';

const calibration={cssPixelsPerCm:460/3/2.54,viewDistanceCm:35,source:'device' as const,version:'physical-window-1'};
test('phone framing keeps both hands and every pitch family in the usable iPhone window through the observation cutoff',()=>{
  let pitches=0,minEdgePixels=Infinity;
  for(const eye of ['R','L'] as const)for(const hand of ['R','L'] as const)for(const level of TRAINING_LEVELS)for(const seed of [0,1,3,14,29,61,121,509]){
    const pitcher=createTrainingPitcher(level.id,hand,seed);
    for(const spec of pitcher.pitches)for(const call of ['strike','ball'] as const){
      const pitch=generatePracticePitch(pitcher,spec.kind,call,seed),end=approachCutoff(pitch);pitches++;
      for(const [width,height] of [[814,409],[740,354],[568,320]]){
        const config=battingCamera(eye,width/height,PLATE_Z,{width,calibration,phone:true});
        const camera=new THREE.PerspectiveCamera(config.verticalFov,width/height,.04,2000);
        camera.position.set(config.position.x,config.position.y,config.position.z);camera.lookAt(config.target.x,config.target.y,config.target.z);camera.updateMatrixWorld();
        const rotation=camera.quaternion.toArray();
        for(let frame=0;frame<=32;frame++){
          const p=at(pitch,end*frame/32),world=new THREE.Vector3(p.x,p.y,p.z);
          const depth=-world.clone().applyMatrix4(camera.matrixWorldInverse).z;
          const diameter=BALL_RADIUS*height/(depth*Math.tan(config.verticalFov*Math.PI/360));
          const visibleDiameter=diameter*phoneBallScale(1,diameter);
          const screen=world.project(camera),x=(screen.x+1)*width/2,y=(1-screen.y)*height/2;
          const edge=Math.min(x,y,width-x,height-y)-visibleDiameter/2;
          minEdgePixels=Math.min(minEdgePixels,edge);
          assert.ok(edge>4,`${eye}/${hand}/${level.id}/${spec.kind}/${call}/${seed} ${width}x${height} frame ${frame}: ball clipped, edge ${edge}px`);
          assert.ok(visibleDiameter>=PHONE_MIN_BALL_PIXELS-1e-8);
          assert.deepEqual(camera.quaternion.toArray(),rotation);
        }
      }
    }
  }
  console.log(JSON.stringify({phonePitches:pitches,viewports:3,minEdgePixels}));
});
test('rotating a phone preserves vertical coverage, eye point, real-world ball radius and visual scale continuity',()=>{
  const landscape=battingCamera('R',814/409,PLATE_Z,{width:814,calibration,phone:true});
  const narrower=battingCamera('R',568/320,PLATE_Z,{width:568,calibration,phone:true});
  assert.equal(landscape.verticalFov,narrower.verticalFov);
  assert.deepEqual(landscape.position,narrower.position);assert.deepEqual(landscape.target,narrower.target);
  assert.equal(BALL_RADIUS,.0366);
  for(const diameter of [2,3,4,4.999,5,5.001,8,24])assert.ok(Math.abs(diameter*phoneBallScale(1,diameter)-Math.max(diameter,5))<1e-8);
});
