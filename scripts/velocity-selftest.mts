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
import { BALL_DIAMETER_M, type BallObservation } from '../lib/velocity-engine/geometry.ts';

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

/**
 * 엔진이 실제로 쓴 거리 구간의 진짜 평균 구속(km/h).
 *
 * 엔진은 공이 9픽셀보다 작아진 뒤(멀리)는 버리므로, 시뮬레이션 전체(16m)의 평균과 견주면
 * 공기저항 때문에 정답이 더 낮게 나온다. 엔진이 돌려준 첫 거리 · 나아간 거리로 구간을 잘라 견준다.
 */
function trueAverageOver(
  sim: { trueDistances: { t: number; z: number }[] },
  startZ: number,
  travelM: number
) {
  const nearest = (z: number) =>
    sim.trueDistances.reduce((best, d) =>
      Math.abs(d.z - z) < Math.abs(best.z - z) ? d : best
    );
  const a = nearest(startZ);
  const b = nearest(startZ + travelM);
  return ((b.z - a.z) / (b.t - a.t)) * 3.6;
}

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
    const truth = trueAverageOver(
      sim,
      result.detail.releaseDistanceM,
      result.detail.travelM
    );
    const diff = Math.abs(result.kmh - truth);
    check(
      `${kmh}km/h @ ${fps}fps`,
      diff < 0.5,
      `측정 ${result.kmh} / 정답 ${truth.toFixed(1)} (차이 ${diff.toFixed(2)}) · 프레임 ${result.detail.frames} · 신뢰도 ${result.confidence}`
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
      if (!result.ok) {
        rejected++;
        continue;
      }
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
  check(
    '흔들리는 촬영 → 거부',
    !r.ok && r.code === 'CAMERA_SHAKE',
    !r.ok ? r.message : '통과돼버림'
  );
}

// 너무 멀리서 찍음
{
  const sim = simulatePitch({ kmh: 130, lens, fps: 60, releaseDistanceM: 6 });
  const r = measureVelocity({
    observations: sim.observations,
    lens,
    stability: { maxBackgroundShiftPx: 1 },
  });
  check(
    '투수에게서 6m 뒤 → 거부',
    !r.ok && r.code === 'TOO_FAR',
    !r.ok ? r.message : '통과돼버림'
  );
}

// 릴리스가 화면 구석
{
  const sim = simulatePitch({
    kmh: 130,
    lens,
    fps: 60,
    releaseOffsetPx: { x: 700, y: 400 },
  });
  const r = measureVelocity({
    observations: sim.observations,
    lens,
    stability: { maxBackgroundShiftPx: 1 },
  });
  check(
    '릴리스가 화면 구석 → 거부',
    !r.ok && r.code === 'RELEASE_NOT_CENTERED',
    !r.ok ? r.message : '통과돼버림'
  );
}

// 공이 조금만 날아가고 녹화가 끊김
{
  const sim = simulatePitch({ kmh: 130, lens, fps: 60, travelM: 1.5 });
  const r = measureVelocity({
    observations: sim.observations,
    lens,
    stability: { maxBackgroundShiftPx: 1 },
  });
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
  check(
    '공을 3프레임만 잡음 → 거부',
    !r.ok && r.code === 'NOT_ENOUGH_FRAMES',
    !r.ok ? r.message : '통과돼버림'
  );
}

// 공이 아닌 것을 따라감 (지름이 널뛰기)
{
  const sim = simulatePitch({ kmh: 130, lens, fps: 60 });
  const broken: BallObservation[] = sim.observations.map((o, i) =>
    i === 5 ? { ...o, diameterPx: o.diameterPx * 2.2 } : o
  );
  const r = measureVelocity({
    observations: broken,
    lens,
    stability: { maxBackgroundShiftPx: 1 },
  });
  check(
    '공이 아닌 것을 잡음 → 거부',
    !r.ok && r.code === 'UNSTABLE_TRACK',
    !r.ok ? r.message : '통과돼버림'
  );
}

// 렌즈 정보 없음
{
  const sim = simulatePitch({ kmh: 130, lens, fps: 60 });
  const r = measureVelocity({ observations: sim.observations, lens: null });
  check(
    '렌즈 정보 없음 → 거부',
    !r.ok && r.code === 'LENS_UNKNOWN',
    !r.ok ? r.message : '통과돼버림'
  );
}

console.log('\n════ 4. 공기저항이 엔진 가정과 다를 때 (습한 날 · 무거운 공) ════\n');
{
  /* 엔진은 K=0.006/m 을 가정한다. 실제가 0.0075 여도 릴리스 속도는 1.5km/h 안에서 되찾아야 한다 */
  const sim = simulatePitch({ kmh: 140, lens, fps: 240, dragPerM: 0.0075 });
  const r = measureVelocity({
    observations: sim.observations,
    lens,
    stability: { maxBackgroundShiftPx: 1 },
  });
  if (r.ok) {
    console.log(
      `  릴리스 140km/h로 던졌을 때 → 구간 평균 ${r.kmh}km/h · 첫 관측 시점 ${r.detail.startKmh}km/h (정답 평균 ${sim.trueAverageKmh.toFixed(1)})`
    );
    check(
      '릴리스 속도를 1.5km/h 안에서 되찾음',
      Math.abs(r.detail.startKmh - 140) < 1.5,
      `첫 관측 시점 ${r.detail.startKmh} · 신뢰도 ${r.confidence} · 오차범위 ±${r.errorKmh}`
    );
    {
      const truth = trueAverageOver(sim, r.detail.releaseDistanceM, r.detail.travelM);
      check(
        '구간 평균도 1km/h 안(K 가 달라도)',
        Math.abs(r.kmh - truth) < 1,
        `측정 ${r.kmh} / 정답 ${truth.toFixed(1)}`
      );
    }
  } else {
    check('공기저항 있어도 측정됨', false, r.code);
  }
}

console.log('\n════ 5. 맞춤(모델 1.6.0) — 두 끝 자르기 · 먼 쪽 곡률 · 무게 · 불확실성 ════\n');
{
  const K = 0.006;
  const fD = BALL_DIAMETER_M * lens.focalPx;
  /** 투수 뒤 가상 투구에서 관측 시각 t 의 참 속도(km/h) — simulatePitch 는 나아간 거리로 e^(−K·s) 만큼 느려진다 */
  const trueSpeedAt = (sim: ReturnType<typeof simulatePitch>, kmh: number, rel: number, t: number) => {
    const d = sim.trueDistances.find((x) => Math.abs(x.t - t) < 1e-9);
    return d ? kmh * Math.exp(-K * (d.z - rel)) : NaN;
  };
  /** 포수 뒤(다가옴) 관측 — z0 에서 카메라 쪽으로 공기저항을 받으며 온다. 화면 가운데 조금 위 */
  const approachingObs = (kmh: number, fps: number, z0: number, zEnd: number) => {
    const v0 = kmh / 3.6;
    const obs: BallObservation[] = [];
    const truth: { t: number; z: number; v: number }[] = [];
    for (let i = 0; ; i++) {
      const t = i / fps;
      const s = Math.log(1 + K * v0 * t) / K;
      const z = z0 - s;
      if (z < zEnd) break;
      obs.push({ t, x: lens.frameWidth / 2, y: lens.frameHeight / 2 - 40, diameterPx: fD / z });
      truth.push({ t, z, v: (v0 / (1 + K * v0 * t)) * 3.6 });
    }
    return { obs, truth };
  };

  // 5-1) 투수 뒤: 손과 한 덩어리로 잡힌 첫 장면(지름 ×1.45)과 손가락에 가린 첫 장면(×0.7)은 빠진다
  for (const f of [1.45, 0.7]) {
    const sim = simulatePitch({ kmh: 125, lens, fps: 60, releaseDistanceM: 2.2 });
    const obs = sim.observations.map((o, i) => (i === 0 ? { ...o, diameterPx: o.diameterPx * f } : o));
    const r = measureVelocity({ observations: obs, lens, stability: { maxBackgroundShiftPx: 1 } });
    const truth = r.ok ? trueSpeedAt(sim, 125, 2.2, r.detail.startT) : NaN;
    check(
      `투수 뒤 첫 장면 지름 ×${f} → 빼고 잰다`,
      r.ok && r.detail.startTrimmed === 1 && Math.abs(r.detail.startKmh - truth) < 1,
      r.ok ? `앞에서 뺀 장 ${r.detail.startTrimmed} · 첫 관측 시점 ${r.detail.startKmh} / 정답 ${truth.toFixed(1)}` : r.code
    );
  }

  // 5-2) 포수 뒤: 가장 먼 첫 장면(투수 몸이 붙음, ×1.5)과 가장 가까운 마지막 장면(미트가 붙음, ×1.3)은 빠진다 —
  //      다가오는 공은 거리가 줄므로 방향을 뒤집어 본다(뒤집지 않으면 커진 장면을 남긴다)
  for (const which of ['first', 'last'] as const) {
    const { obs, truth } = approachingObs(130, 60, 14, 1.6);
    const k = which === 'first' ? obs.findIndex((o) => o.diameterPx >= 9) : obs.length - 1;
    const bad = obs.map((o, i) => (i === k ? { ...o, diameterPx: o.diameterPx * (which === 'first' ? 1.5 : 1.3) } : o));
    const r = measureVelocity({ observations: bad, lens, stability: { maxBackgroundShiftPx: 1 }, approach: 'approaching' });
    const tr = r.ok ? truth.find((x) => Math.abs(x.t - r.detail.startT) < 1e-9) : undefined;
    const trimmed = r.ok ? (which === 'first' ? r.detail.startTrimmed : r.detail.endTrimmed) : 0;
    check(
      `포수 뒤 ${which === 'first' ? '첫(먼)' : '마지막(가까운)'} 장면이 부풀면 → 빼고 잰다`,
      r.ok && trimmed === 1 && tr != null && Math.abs(r.detail.startKmh - tr.v) < 1.5,
      r.ok ? `뺀 장 ${trimmed} · 첫 관측 시점 ${r.detail.startKmh} / 정답 ${tr?.v.toFixed(1)}` : r.code
    );
  }

  // 5-3) 먼 쪽 자가 틀어진 궤적(9m 밖에서 지름이 거리에 따라 최대 +4% — 실제 영상 a3df7d09 모양): 곡률 검사가 먼 장면을 뺀다
  {
    const sim = simulatePitch({ kmh: 110, lens, fps: 60, releaseDistanceM: 2.5 });
    const obs = sim.observations.map((o, i) => {
      const z = sim.trueDistances[i].z;
      return z > 9 ? { ...o, diameterPx: o.diameterPx * (1 + Math.min(0.04, (0.04 * (z - 9)) / 3)) } : o;
    });
    const r = measureVelocity({ observations: obs, lens, stability: { maxBackgroundShiftPx: 1 } });
    const truth = r.ok ? trueSpeedAt(sim, 110, 2.5, r.detail.startT) : NaN;
    check(
      '먼 쪽 자가 틀어진 궤적 → 먼 장면을 빼고 1km/h 안',
      r.ok && r.detail.farTrimmed > 0 && Math.abs(r.detail.startKmh - truth) < 1,
      r.ok ? `먼 쪽에서 뺀 장 ${r.detail.farTrimmed} · 첫 관측 시점 ${r.detail.startKmh} / 정답 ${truth.toFixed(1)}` : r.code
    );
  }

  // 5-4) 무게를 잰 거리로 내면 잡음이 곧 치우침이 된다 — 두 번 맞춤이면 지름 잡음 1px 에서도 치우치지 않고,
  //      잭나이프 SE 가 실제 흔들림과 같은 크기다(90% 구간이 80~97% 를 덮음). 60fps 는 릴리스 1.2m — 2.5m 면 절반이
  //      SE 문턱(5%)에 걸려, 남은 것이 SE 를 작게 본 쪽으로 쏠린다(고른 뒤에 덮는 비율은 따로 5-5 가 본다)
  for (const [fps, rel] of [
    [60, 1.2],
    [240, 2.5],
  ]) {
    const errs: number[] = [];
    const zs: number[] = [];
    for (let seed = 1; seed <= 100; seed++) {
      const sim = simulatePitch({ kmh: 125, lens, fps, diameterNoisePx: 1, seed, releaseDistanceM: rel });
      const r = measureVelocity({ observations: sim.observations, lens, stability: { maxBackgroundShiftPx: 1 } });
      if (!r.ok || r.detail.startSeKmh == null) continue;
      const e = r.detail.startKmh - trueSpeedAt(sim, 125, rel, r.detail.startT);
      errs.push(e);
      zs.push(e / r.detail.startSeKmh);
    }
    const mean = errs.reduce((a, b) => a + b, 0) / Math.max(1, errs.length);
    const cover = zs.filter((z) => Math.abs(z) <= 1.645).length / Math.max(1, zs.length);
    check(
      `${fps}fps · 릴리스 ${rel}m · 지름 잡음 1px — 치우침 없고 SE 가 맞는 크기`,
      errs.length >= 50 && Math.abs(mean) < 1 && cover >= 0.8 && cover <= 0.97,
      `잰 것 ${errs.length}/100 · 평균 치우침 ${mean.toFixed(2)}km/h · |오차| ≤ 1.645·SE 인 비율 ${(cover * 100).toFixed(0)}%`
    );
  }

  // 5-5) 믿음이 뜻을 가진다 — 잡음 0.3 · 1 · 2px 을 섞은 가상 투구에서 '높음'은 3% 안, '보통'은 6% 안, 숫자를 낸 것의 ± 가 90% 안팎을 덮는다
  {
    const byConf: Record<string, number[]> = { high: [], medium: [], low: [] };
    let covered = 0;
    let n = 0;
    let rejected = 0;
    for (const noise of [0.3, 1, 2])
      for (let seed = 1; seed <= 30; seed++) {
        const sim = simulatePitch({ kmh: 120, lens, fps: 60, diameterNoisePx: noise, seed, releaseDistanceM: 2.5 });
        const r = measureVelocity({ observations: sim.observations, lens, stability: { maxBackgroundShiftPx: 1 } });
        if (!r.ok) {
          rejected++;
          continue;
        }
        const truth = trueSpeedAt(sim, 120, 2.5, r.detail.startT);
        const rel = Math.abs(r.detail.startKmh - truth) / truth;
        byConf[r.confidence].push(rel);
        const pm = 1.645 * Math.hypot(r.detail.startSeKmh ?? Infinity, 0.01 * r.detail.startKmh);
        if (Math.abs(r.detail.startKmh - truth) <= pm) covered++;
        n++;
      }
    const worst = (a: number[]) => (a.length ? Math.max(...a) * 100 : 0);
    check(
      "믿음 '높음' 3% 안 · '보통' 6% 안 · ± 가 80% 이상 덮음",
      worst(byConf.high) < 3 && worst(byConf.medium) < 6 && covered / Math.max(1, n) >= 0.8,
      `높음 ${byConf.high.length}개 최대 ${worst(byConf.high).toFixed(1)}% · 보통 ${byConf.medium.length}개 최대 ${worst(byConf.medium).toFixed(1)}% · 낮음 ${byConf.low.length}개 최대 ${worst(byConf.low).toFixed(1)}% · 거부 ${rejected} · ± 가 덮음 ${covered}/${n}`
    );
  }
}

console.log(`\n${'═'.repeat(50)}`);
console.log(`통과 ${passed} / 실패 ${failed}`);
console.log(`${'═'.repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
