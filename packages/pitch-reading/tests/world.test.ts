import {test} from 'node:test';
import assert from 'node:assert/strict';
import {battingCamera,DEFAULT_BATTING_VIEW,moundHeight} from '../src/world.ts';
import {REFERENCE_BATTER,REFERENCE_STRIKE_ZONE,KBO_ABS} from '../src/batter-reference.ts';
import {PLATE_Z,PLATE_FRONT_Z} from '../src/physics.ts';

test('eyes are in the batters box adjacent to the plate, rather than the old catcher position',()=>{
  const right=battingCamera('R',2,PLATE_Z),left=battingCamera('L',2,PLATE_Z);
  assert.equal(right.position.x,-.70);assert.equal(left.position.x,.70);
  assert.equal(right.position.y,1.6);assert.ok(right.position.z>PLATE_FRONT_Z&&right.position.z<PLATE_Z);
  assert.ok(right.target.y>=1.7);
  assert.deepEqual(right.target,left.target);assert.equal(right.position.z,left.position.z);
});
test('portrait and landscape preserve the fixed 35 degree horizontal scale',()=>{
  for(const aspect of [.48,.9,1.5,2.3,3.5]){
    const view=battingCamera('R',aspect,PLATE_Z);
    const actual=2*Math.atan(Math.tan(view.verticalFov*Math.PI/360)*aspect)*180/Math.PI;
    assert.ok(Math.abs(actual-35)<1e-9);
    assert.equal(view.position.y,REFERENCE_BATTER.eyeHeight);
  }
});
test('mound geometry and planted feet share a sloped 25.4cm surface',()=>{
  assert.equal(moundHeight(0,0),.254);
  assert.ok(Math.abs(moundHeight(0,1.35)-.154)<1e-8);
  assert.equal(moundHeight(0,2.75),0);assert.equal(moundHeight(3,0),0);
  assert.ok(moundHeight(0,1)<moundHeight(0,0));
});

test('home distance is measured to the rear apex and flight ends at the broad front edge',()=>{
  assert.ok(Math.abs(PLATE_Z-60.5*.3048)<1e-10);
  assert.ok(Math.abs(PLATE_Z-PLATE_FRONT_Z-17*.0254)<1e-10);
});
test('KBO ABS dimensions use measured-height ratios without changing the fixed camera',()=>{
  assert.ok(Object.isFrozen(DEFAULT_BATTING_VIEW));
  assert.ok(Math.abs(REFERENCE_STRIKE_ZONE.halfWidth*2-.4718)<1e-12);
  assert.ok(Math.abs(REFERENCE_STRIKE_ZONE.bottom-.48672)<1e-12);
  assert.ok(Math.abs(REFERENCE_STRIKE_ZONE.top-1.0035)<1e-12);
  assert.equal(KBO_ABS.endBottomDrop,.015);
  assert.deepEqual(DEFAULT_BATTING_VIEW,{eyeHeight:1.6,plateDistance:.7,plateDepth:-.15,horizontalFov:35});
});
