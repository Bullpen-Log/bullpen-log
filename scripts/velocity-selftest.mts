/**
 * 구속 엔진 자가 시험.
 *
 *   npm run velocity:test
 *
 * 정답을 아는 가상 투구를 만들어 엔진이 그 값을 되찾아내는지 확인한다.
 * 실제 영상에서 공을 잘 찾는지는 여기서 알 수 없다 — 그건 촬영본으로 따로 본다.
 * 여기서 보는 것은 "계산이 맞는가"와 "잘못된 촬영을 제대로 거부하는가" 둘이다.
 *
 * 나중에 이 엔진을 아이폰 앱(Swift)으로 옮길 때, 옮긴 쪽도 같은 시험을 통과해야
 * 한다. 그래서 이 파일이 곧 이식용 시험지 노릇을 한다.
 */
import { measureVelocity } from '../lib/velocity-engine/measure.ts';
import { iphoneLens, simulatePitch } from '../lib/velocity-engine/simulate.ts';
import type { BallObservation } from '../lib/velocity-engine/geometry.ts';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

const lens = iphoneLens(1920, 1080);

console.log('\n════ 1. 이상적인 조건에서 구속을 맞히는가 ════\n');
for (const kmh of [100, 120, 130, 140, 150]) {
  for (const fps of [30, 60, 240]) {
    const sim = simulatePitch({ kmh, lens, fps });
    const result = measureVelocity({
      observations: sim.observations,
      lens,
      stability: { maxBackgroundShiftPx: 1 },
    });
    if (!result.ok) {
      check(`${kmh}km/h @ ${fps}fps`, false, `거부됨: ${result.code}`);
      continue;
    }
    const diff = Math.abs(result.kmh - sim.trueAverageKmh);
    check(
      `${kmh}km/h @ ${fps}fps`,
      diff < 0.5,
      `측정 ${result.kmh} / 정답 ${sim.trueAverageKmh.toFixed(1)} (차이 ${diff.toFixed(2)}) · 프레임 ${result.detail.frames} · 신뢰도 ${result.confidence}`
    );
  }
}

console.log('\n════ 2. 측정 오차가 섞여도 견디는가 (지름 재기 잡음) ════\n');
for (const fps of [30, 60, 240]) {
  for (const noise of [0.3, 0.5, 1.0]) {
    const diffs: number[] = [];
    let rejected = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const sim = simulatePitch({ kmh: 130, lens, fps, diameterNoisePx: noise, seed });
      const result = measureVelocity({
        observations: sim.observations,
        lens,
        stability: { maxBackgroundShiftPx: 1 },
      });
      if (!result.ok) { rejected++; continue; }
      diffs.push(Math.abs(result.kmh - sim.trueAverageKmh));
    }
    if (diffs.length === 0) {
      check(`${fps}fps · 잡음 ${noise}px`, false, `30번 모두 거부됨`);
      continue;
    }
    const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const max = Math.max(...diffs);
    check(
      `${fps}fps · 잡음 ${noise}px`,
      avg < 5,
      `평균오차 ${avg.toFixed(2)}km/h · 최대 ${max.toFixed(2)} · 거부 ${rejected}/30`
    );
  }
}

console.log('\n════ 3. 잘못된 촬영을 거부하는가 (가장 중요) ════\n');

// 손으로 들고 찍음
{
  const sim = simulatePitch({ kmh: 130, lens, fps: 60 });
  const r = measureVelocity({
    observations: sim.observations,
    lens,
    stability: { maxBackgroundShiftPx: 25 },
  });
  check('흔들리는 촬영 → 거부', !r.ok && r.code === 'CAMERA_SHAKE', !r.ok ? r.message : '통과돼버림');
}

// 너무 멀리서 찍음
{
  const sim = simulatePitch({ kmh: 130, lens, fps: 60, releaseDistanceM: 6 });
  const r = measureVelocity({ observations: sim.observations, lens, stability: { maxBackgroundShiftPx: 1 } });
  check('투수에게서 6m 뒤 → 거부', !r.ok && r.code === 'TOO_FAR', !r.ok ? r.message : '통과돼버림');
}

// 릴리스가 화면 구석
{
  const sim = simulatePitch({
    kmh: 130, lens, fps: 60,
    releaseOffsetPx: { x: 700, y: 400 },
  });
  const r = measureVelocity({ observations: sim.observations, lens, stability: { maxBackgroundShiftPx: 1 } });
  check('릴리스가 화면 구석 → 거부', !r.ok && r.code === 'RELEASE_NOT_CENTERED', !r.ok ? r.message : '통과돼버림');
}

// 공이 조금만 날아가고 녹화가 끊김
{
  const sim = simulatePitch({ kmh: 130, lens, fps: 60, travelM: 1.5 });
  const r = measureVelocity({ observations: sim.observations, lens, stability: { maxBackgroundShiftPx: 1 } });
  check('녹화가 일찍 끊김 → 거부', !r.ok, !r.ok ? r.code : '통과돼버림');
}

// 프레임이 너무 적음
{
  const sim = simulatePitch({ kmh: 130, lens, fps: 60 });
  const r = measureVelocity({
    observations: sim.observations.slice(0, 3),
    lens,
    stability: { maxBackgroundShiftPx: 1 },
  });
  check('공을 3프레임만 잡음 → 거부', !r.ok && r.code === 'NOT_ENOUGH_FRAMES', !r.ok ? r.message : '통과돼버림');
}

// 공이 아닌 것을 따라감 (지름이 널뛰기)
{
  const sim = simulatePitch({ kmh: 130, lens, fps: 60 });
  const broken: BallObservation[] = sim.observations.map((o, i) =>
    i === 5 ? { ...o, diameterPx: o.diameterPx * 2.2 } : o
  );
  const r = measureVelocity({ observations: broken, lens, stability: { maxBackgroundShiftPx: 1 } });
  check('공이 아닌 것을 잡음 → 거부', !r.ok && r.code === 'UNSTABLE_TRACK', !r.ok ? r.message : '통과돼버림');
}

// 렌즈 정보 없음
{
  const sim = simulatePitch({ kmh: 130, lens, fps: 60 });
  const r = measureVelocity({ observations: sim.observations, lens: null });
  check('렌즈 정보 없음 → 거부', !r.ok && r.code === 'LENS_UNKNOWN', !r.ok ? r.message : '통과돼버림');
}

console.log('\n════ 4. 공기저항이 있을 때 (실제와 가장 비슷) ════\n');
{
  const sim = simulatePitch({ kmh: 140, lens, fps: 240, dragPerSec: 0.35 });
  const r = measureVelocity({ observations: sim.observations, lens, stability: { maxBackgroundShiftPx: 1 } });
  if (r.ok) {
    console.log(`  릴리스 140km/h로 던졌을 때 → 측정 ${r.kmh}km/h (구간 평균)`);
    console.log(`  차이 ${(140 - r.kmh).toFixed(1)}km/h — 레이더건 값과의 이 차이는 보정 단계에서 다룬다.`);
    check('공기저항 있어도 측정됨', true, `신뢰도 ${r.confidence} · 오차범위 ±${r.errorKmh}`);
  } else {
    check('공기저항 있어도 측정됨', false, r.code);
  }
}

console.log(`\n${'═'.repeat(50)}`);
console.log(`통과 ${passed} / 실패 ${failed}`);
console.log(`${'═'.repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
