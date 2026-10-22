/**
 * 구속 측정 세션 규칙(lib/velocity-session.ts) 시험 — `npm run velocity:session-test`. 웹 · 앱이 같이 쓰는 세션 거리 · 저장 거리 · 측정 불가 안내와
 * 엔진 2.8.0 의 공 크기 거리(자동) 판정을 지킨다. 2026-10-22 검토에서 이 규칙들을 바꿔도 어떤 시험도 안 깨진다는 것이 드러나 만들었다.
 */
import {
  MISS_REASONS,
  lowConfidenceFix,
  missReasonOf,
  sessionDistanceOf,
  withSessionDistance,
  type SessionPitchCore,
} from '@/lib/velocity-session';
import { rejudgeSize } from '@/lib/velocity-engine/analyze-distance';
import { STANDARD_TARGET_DIST_M } from '@/lib/velocity-setup';

let pass = 0;
let fail = 0;
const check = (ok: boolean, name: string) => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}`);
};

/* 공 크기 거리(자동)로 잰 공 — clean 은 튕김을 봤고 이어 찾기가 없는 공 */
const auto = (distM: number, kmh: number, clean = true): SessionPitchCore => ({
  source: 'camera',
  rawKmh: kmh,
  errorKmh: 2,
  releaseKmh: null,
  dist: { m: distM, auto: true },
  auto: { distM, kmh, releaseKmh: null, errorKmh: 2, clean },
  std: null,
});
/* 넣은 거리(20m 또는 줄자)로 잰 공 */
const std = (inputDistM: number, kmh: number, sizeDistM: number | null): SessionPitchCore => ({
  source: 'camera',
  rawKmh: kmh,
  errorKmh: 2,
  releaseKmh: null,
  analysis: { distance: { distanceM: inputDistM, inputDistM } } as SessionPitchCore['analysis'],
  dist: { m: inputDistM, auto: false },
  auto: null,
  std: {
    kmh,
    releaseKmh: null,
    errorKmh: 2,
    size: { sizeDistM, sizeSlope: -1, extended: 0, impact: 'rebound', confidence: 'high', frames: 30 },
  },
});

console.log('\n▶ 공마다 공 크기 거리 — 세션 가운데 거리로 옮기기(5% 안 · 끝이 깨끗한 공만)');
{
  const list = withSessionDistance([auto(20, 120), auto(20.4, 121), auto(19.2, 115), auto(21.6, 130), auto(19.6, 118, false)], null);
  /* 깨끗한 공 넷의 가운데 20.2 — 19.2(−5.0%)는 5% 안이라 옮기고, 21.6(+6.9%)은 받는 자리가 바뀐 것이라 둔다, 깨끗하지 않은 공도 둔다 */
  check(list[0].dist?.m === 20.2 && list[0].rawKmh > 120, '20m 공은 20.2m 로 옮겨 구속이 오른다');
  check(list[2].dist?.m === 20.2, '5% 안(19.2m)은 옮긴다');
  check(list[3].dist?.m === 21.6 && list[3].rawKmh === 130, '5% 넘게(21.6m) 다른 공은 제 거리 그대로 — 캐치볼 받는 자리가 바뀐 공');
  check(list[4].dist?.m === 19.6 && list[4].rawKmh === 118, '끝이 깨끗하지 않은 공은 제 거리 그대로');
  const back = withSessionDistance(list.slice(0, 1), null);
  check(back[0].dist?.m === 20 && back[0].rawKmh === 120, '다른 공을 지우면 처음 값으로 돌아온다');
}

console.log('\n▶ 넣은 거리 공 — 줄자 세션은 줄자 값을 적는다');
{
  const tape = withSessionDistance([std(18, 110, 18.4), std(18, 112, 18.2)], null, true);
  check(tape.every((p) => p.dist?.m === 18 && p.analysis?.distance?.distanceM === 18), '줄자 18m 세션 공의 거리는 18m(예전엔 20m 로 적혔다)');
  check(tape[0].rawKmh === 110, '줄자 세션은 값을 옮기지 않는다');
  const corr = withSessionDistance([std(20, 110, 21.5), std(20, 112, 21.5)], null);
  check(corr[0].dist?.m === 21.5 && corr[0].rawKmh > 110, '기준 20m 세션은 공 크기 가운데(3~15% 다름)로 옮긴다');
}

console.log('\n▶ 저장할 세션 거리 · 출처');
{
  const s = { cameraPos: 'behind-pitcher', distTape: false, targetDistM: STANDARD_TARGET_DIST_M };
  check(sessionDistanceOf([auto(20, 120), auto(21, 125)], s).distanceSource === 'auto', '자동 공이 있으면 출처 auto');
  check(sessionDistanceOf([auto(20, 120), auto(21, 125), auto(22, 130)], s).distanceM === 21, '자동 세션도 거리(공들의 가운데)를 남긴다');
  check(sessionDistanceOf([auto(20, 120)], { ...s, distTape: true, targetDistM: 18 }).distanceSource === 'tape', '줄자가 이긴다');
  check(sessionDistanceOf([std(20, 110, 20.1)], s).distanceM === STANDARD_TARGET_DIST_M, '보정이 안 걸린 기준 세션은 20m');
}

console.log('\n▶ 측정 불가 안내 — 까닭별 말이 먼저(이어 찾은 장면이 있어도)');
{
  type R = Parameters<typeof lowConfidenceFix>[0];
  const r = (why: string | undefined, extended = 0) =>
    ({ measure: { ok: true }, distance: { why, extended, shaky: false } }) as unknown as R;
  check(lowConfidenceFix(r('speed-unsure', 3), 'camera', false).includes('속도를 정하지 못했어요'), '속력 흔들림 + 이어 찾기 3장 → 속력 흔들림 말');
  check(lowConfidenceFix(r('late-start', 2), 'camera', false).includes('손을 떠난 직후'), '늦게 잡힘 + 이어 찾기 → 늦게 잡힘 말');
  check(lowConfidenceFix(r('extended', 12), 'camera', false).includes('흰 배경'), '이어 찾기가 까닭이면 흰 배경 말');
  check(lowConfidenceFix(r('no-size'), 'camera', false).includes('크기로 거리를 재지 못했어요'), 'no-size 말');
  check(lowConfidenceFix(r('short-flight'), 'camera', false).includes('1.5~2m'), '짧게 잡힘 말은 폰 자리 1.5~2m');
}

console.log('\n▶ 못 잰 공의 짧은 까닭(측정 중 집계 · 소리 안내)');
{
  type R = Parameters<typeof missReasonOf>[0];
  const low = (why: string | undefined, extended = 0, shaky = false) =>
    ({ measure: { ok: true }, distance: { why, extended, shaky, stabilized: false } }) as unknown as R;
  const no = (code: string) => ({ measure: { ok: false, code }, distance: {} }) as unknown as R;
  check(missReasonOf(low('speed-unsure', 3)) === MISS_REASONS.still, '속력 흔들림 → 공이 안 움직임(이어 찾기가 있어도)');
  check(missReasonOf(low('late-start')) === MISS_REASONS.late, '늦게 잡힘');
  check(missReasonOf(low('end-early')) === MISS_REASONS.end && missReasonOf(low('end-unseen')) === MISS_REASONS.end, '끝 일찍 · 끝 안 보임 → 끝을 놓침');
  check(missReasonOf(low('extended', 12)) === MISS_REASONS.bright, '이어 찾기 → 밝은 배경');
  check(missReasonOf(low('no-size')) === MISS_REASONS.blurry, 'no-size → 공이 흐림');
  check(missReasonOf(low(undefined, 0, true)) === MISS_REASONS.shake, '못 바로잡은 흔들림 → 폰 흔들림');
  check(missReasonOf(no('NOT_ENOUGH_FRAMES')) === MISS_REASONS.short, '장면 모자람 → 공 길이 짧음');
  check(missReasonOf(no('CAMERA_SHAKE')) === MISS_REASONS.shake, '카메라 흔들림');
  check(missReasonOf(low('speed-unsure'), true) === MISS_REASONS.catcher, '포수 뒤가 먼저');
  check(Object.values(MISS_REASONS).every((m) => m.label.length <= 12 && m.say.length <= 20), '짧은 까닭 · 읽을 말은 짧게(집계 칸 · 소리)');
}

console.log('\n▶ 엔진 — 공 크기 거리를 못 낸 자동 공은 세션 다시 판정에서도 낮음');
{
  /* 엔진 2.8.0 의 no-size 결과 모양: 넣은 거리로 잰 값 · 판정 전 값도 낮음 */
  const res = {
    measure: { ok: true, kmh: 120, errorKmh: 3, confidence: 'low', detail: { fitQuality: 0.9 } },
    distance: {
      distanceSource: 'input',
      distanceM: 20,
      inputDistM: 20,
      sizeDistM: null,
      impact: 'rebound',
      extended: 0,
      why: 'no-size',
      preSize: { confidence: 'low', errorKmh: 3, why: 'no-size' },
    },
  } as unknown as Parameters<typeof rejudgeSize>[0];
  const again = rejudgeSize(res, 20.5);
  check(again.measure.ok && again.measure.confidence === 'low', '세션 거리로 다시 판정해도 높음으로 안 돌아온다');
}

console.log(`\n통과 ${pass} / 실패 ${fail}`);
if (fail) process.exit(1);
