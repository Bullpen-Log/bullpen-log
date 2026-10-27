import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {at,BALL_RADIUS,generatePitch,PITCHERS,PLATE_Z,PLATE_FRONT_Z,speedAt} from '../src/physics.ts';
import {battingCamera} from '../src/world.ts';

test('regulation ball diameter and perspective growth are the same physical scale for both pitching hands',()=>{
  assert.ok(2*Math.PI*BALL_RADIUS>=9*.0254&&2*Math.PI*BALL_RADIUS<=9.25*.0254);
  for(const [width,height] of [[1440,840],[844,278],[390,604]]){
    const config=battingCamera('R',width/height,PLATE_Z);
    const camera=new THREE.PerspectiveCamera(config.verticalFov,width/height,.04,2000);
    camera.position.set(config.position.x,config.position.y,config.position.z);
    camera.lookAt(config.target.x,config.target.y,config.target.z);camera.updateMatrixWorld();
    for(const pitcher of PITCHERS)for(const spec of pitcher.pitches){
      const pitch=generatePitch(pitcher,spec.kind,1,false);let previous=0;
      for(const time of [0,.1,.2,.3]){
        const p=at(pitch,time),center=new THREE.Vector3(p.x,p.y,p.z),distance=center.distanceTo(camera.position);
        const angularDiameter=2*Math.asin(BALL_RADIUS/distance)*180/Math.PI;
        assert.ok(angularDiameter>previous);previous=angularDiameter;
        const local=center.applyMatrix4(camera.matrixWorldInverse),depth=-local.z;
        const diameterPixels=width*BALL_RADIUS*Math.sqrt(depth*depth+local.x*local.x-BALL_RADIUS**2)
          /((depth*depth-BALL_RADIUS**2)*Math.tan(35*Math.PI/360));
        // At release: about 0.25°, 10px desktop / 6px landscape phone.
        if(time===0){assert.ok(angularDiameter>.24&&angularDiameter<.27);assert.ok(diameterPixels/width>.0069&&diameterPixels/width<.0074);}
      }
    }
  }
});

test('flight duration uses actual extension and release velocity without handed time scaling',()=>{
  for(const pitcher of PITCHERS)for(const spec of pitcher.pitches){
    const pitch=generatePitch(pitcher,spec.kind,1,false);
    const distance=PLATE_FRONT_Z-pitch.release.z;
    const straightTime=distance/(pitch.speedKmh/3.6);
    assert.ok(pitch.duration>straightTime&&pitch.duration<straightTime*1.08);
    assert.ok(Math.abs(speedAt(pitch,0)-pitch.speedKmh)<1e-6);
    assert.ok(Math.abs(at(pitch,pitch.duration).z-PLATE_FRONT_Z)<1e-9);
    assert.ok(pitch.endSpeedKmh<pitch.speedKmh);
  }
});
