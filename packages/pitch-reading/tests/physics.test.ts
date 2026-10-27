import { test } from 'node:test';
import assert from 'node:assert/strict';
import { at, generatePitch, inducedMovement, movement, PITCHERS, PLATE_FRONT_Z, speedAt, velocityAt } from '../src/physics.ts';

test('all six synthetic repertoires reach their target at the requested initial speed', () => {
  for (const pitcher of PITCHERS) for (const spec of pitcher.pitches) for (let seed = 1; seed <= 100; seed++) {
    const pitch = generatePitch(pitcher, spec.kind, seed);
    const start = at(pitch, 0), end = at(pitch, pitch.duration);
    assert.deepEqual(start, pitch.release);
    assert.ok(Math.abs(end.x - pitch.target.x) < 1e-9);
    assert.ok(Math.abs(end.y - pitch.target.y) < 1e-9);
    assert.ok(Math.abs(end.z - PLATE_FRONT_Z) < 1e-9);
    assert.ok(Math.abs(speedAt(pitch, 0) - pitch.speedKmh) < 1e-6);
    assert.ok(pitch.speedKmh >= spec.speed[0] && pitch.speedKmh <= spec.speed[1]);
    assert.ok(pitch.duration > 0.43 && pitch.duration < 0.75);
    assert.ok(pitch.endSpeedKmh < pitch.speedKmh);
    // There is no hidden teleport, mid-flight kink, or crossing through the ground.
    let previousZ = start.z;
    for (let sample = 1; sample <= 100; sample++) {
      const p = at(pitch, pitch.duration * sample / 100);
      assert.ok(p.z > previousZ); assert.ok(p.y > 0); previousZ = p.z;
    }
  }
});

test('same seed reproduces the exact curve, while new seeds vary within one pitcher profile', () => {
  const p = PITCHERS[0];
  assert.deepEqual(generatePitch(p, 'fastball', 33), generatePitch(p, 'fastball', 33));
  assert.notDeepEqual(generatePitch(p, 'fastball', 33), generatePitch(p, 'fastball', 34));
  for (let seed = 0; seed < 100; seed++) {
    const pitch = generatePitch(p, 'fastball', seed);
    assert.ok(Math.abs(pitch.release.x - p.release.x) <= 0.035);
    assert.ok(Math.abs(pitch.release.y - p.release.y) <= 0.025);
    assert.ok(Math.abs(pitch.release.z - p.release.z) <= 0.05);
    const speedScale=(pitch.speedKmh/122)**2;
    assert.ok(Math.abs(pitch.acceleration.x / (p.pitches[0].ax*speedScale) - 1) <= 0.1);
  }
});

test('default synthetic shapes stay close to the 2025 handed Statcast reference scale',()=>{
  // Published league_break_x_standard / league_break_z_induced_standard, inches.
  // MLB horizontal sign is hand-normalized; our scene uses catcher's-right x.
  const reference=[[-7.6,15.8],[9,-10.2],[-15.1,7.4],[4.2,1.9],[8.1,15.9],[14.2,5.2]];
  let i=0;
  for(const pitcher of PITCHERS)for(const spec of pitcher.pitches){
    const m=inducedMovement(generatePitch(pitcher,spec.kind,1,false)),[x,y]=reference[i++];
    assert.ok(Math.abs(m.horizontalCm-x*2.54)<1.2,`${pitcher.name} ${spec.kind}: lateral movement`);
    assert.ok(Math.abs(m.verticalCm-y*2.54)<1.2,`${pitcher.name} ${spec.kind}: induced lift/drop`);
  }
});

test('slowing a profile does not inflate its lateral break, and every pitch bends continuously to its proper side',()=>{
  for(const pitcher of PITCHERS)for(const spec of pitcher.pitches){
    const nominal=inducedMovement(generatePitch(pitcher,spec.kind,1,false)).horizontalCm;
    for(const speedKmh of [80,150]){
      const pitch=generatePitch(pitcher,spec.kind,1,false,{speedKmh});
      const m=inducedMovement(pitch);
      assert.ok(Math.abs(m.horizontalCm/nominal-1)<.1);
      let previous=velocityAt(pitch,0),slope=previous.x/previous.z;
      for(let n=1;n<=100;n++){
        const v=velocityAt(pitch,pitch.duration*n/100),next=v.x/v.z;
        assert.ok((next-slope)*Math.sign(nominal)>0,`${spec.kind}: sudden/reversed sideways bend`);
        slope=next;previous=v;
      }
    }
  }
});

test('drag and spin flights have continuous derivatives and lose speed gradually', () => {
  const pitch = generatePitch(PITCHERS[1], 'slider', 900);
  const dt = 0.00001;
  for (const t of [0.05, 0.15, 0.25, 0.35]) {
    const a = at(pitch, t - dt), b = at(pitch, t + dt);
    for (const axis of ['x', 'y', 'z'] as const) {
      assert.ok(Math.abs((b[axis] - a[axis]) / (2 * dt) - velocityAt(pitch,t)[axis]) < 1e-6);
    }
  }
  assert.ok(speedAt(pitch,pitch.duration)<pitch.speedKmh*.96);
  assert.ok(speedAt(pitch,pitch.duration)>pitch.speedKmh*.83);
  const v1=velocityAt(pitch,.1),v2=velocityAt(pitch,.3);
  assert.ok(Math.abs((v1.z-pitch.velocity.z)/.1-(v2.z-pitch.velocity.z)/.3)>.01);
});

test('movement uses initial-line deflection and includes gravity in the vertical component', () => {
  const pitch = generatePitch(PITCHERS[0], 'curve', 1, false);
  const m = movement(pitch), end = at(pitch, pitch.duration);
  assert.ok(Math.abs(m.horizontalCm - (end.x - pitch.release.x - pitch.velocity.x * pitch.duration) * 100) < 1e-8);
  assert.ok(Math.abs(m.verticalCm - (end.y - pitch.release.y - pitch.velocity.y * pitch.duration) * 100) < 1e-8);
});

test('lab extremes remain solvable and reach the selected target', () => {
  for (const speedKmh of [80, 150]) for (const height of [1.15, 2.15])
    for (const ax of [-12, 12]) for (const ay of [-18, 0]) {
      const pitch = generatePitch(PITCHERS[2], 'changeup', 1, false, { speedKmh, height, ax, ay, targetX: 0.144, targetY: 0.6167 });
      assert.ok(Math.abs(speedAt(pitch, 0) - speedKmh) < 1e-6);
      assert.ok(Math.abs(at(pitch, pitch.duration).y - 0.6167) < 1e-9);
    }
  assert.throws(() => generatePitch(PITCHERS[0], 'slider', 1));
  assert.throws(() => generatePitch(PITCHERS[0], 'fastball', 1, false, { speedKmh: NaN }));
});
