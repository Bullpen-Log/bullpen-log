/**
 * 공 감지 자가 시험.
 *
 *   npm run velocity:detect-test
 *
 * 가짜 프레임을 그려서(배경 + 공 + 방해물) 감지기가 공만 골라내는지 본다.
 * 브라우저 없이 픽셀 배열을 직접 만들어 확인하므로, 실제 영상 없이도 감지
 * 규칙이 맞게 도는지 알 수 있다.
 *
 * 다만 여기서 통과했다고 실제 영상에서 잘 잡힌다는 뜻은 아니다. 진짜 확인은
 * 촬영본으로 해야 한다. 여기서 잡는 것은 "규칙 자체의 논리 오류"다.
 */
import {
  buildBackground,
  findMovedBlobs,
  toLuma,
  trackBall,
  blobDiameter,
  type FrameBlobs,
} from '../lib/velocity-engine/detect.ts';
import { measureVelocity } from '../lib/velocity-engine/measure.ts';
import { focalPxFromFov, BALL_DIAMETER_M } from '../lib/velocity-engine/geometry.ts';

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

const W = 640;
const H = 360;

/** 회색 배경에 얼룩을 조금 넣은 프레임 */
function makeBackground(): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    // 위치에 따라 조금씩 다른 회색 — 완전 단색이면 시험이 너무 쉬워진다
    const x = i % W;
    const y = (i - x) / W;
    const v = 90 + ((x * 7 + y * 13) % 25);
    px[i * 4] = v;
    px[i * 4 + 1] = v;
    px[i * 4 + 2] = v;
    px[i * 4 + 3] = 255;
  }
  return px;
}

/** 프레임에 밝은 원을 그린다 */
function drawCircle(
  px: Uint8ClampedArray,
  cx: number,
  cy: number,
  diameter: number,
  brightness = 235
) {
  const r = diameter / 2;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
        const i = (y * W + x) * 4;
        px[i] = brightness;
        px[i + 1] = brightness;
        px[i + 2] = brightness;
      }
    }
  }
}

/** 팔처럼 길쭉한 밝은 막대 */
function drawBar(
  px: Uint8ClampedArray,
  cx: number,
  cy: number,
  w: number,
  h: number,
  brightness = 220
) {
  for (let y = Math.max(0, cy - h / 2); y <= Math.min(H - 1, cy + h / 2); y++) {
    for (let x = Math.max(0, cx - w / 2); x <= Math.min(W - 1, cx + w / 2); x++) {
      const i = (Math.round(y) * W + Math.round(x)) * 4;
      px[i] = brightness;
      px[i + 1] = brightness;
      px[i + 2] = brightness;
    }
  }
}

console.log('\n════ 1. 움직인 공을 찾아내는가 ════\n');
{
  const bg = makeBackground();
  const f1 = new Uint8ClampedArray(bg);
  const f2 = new Uint8ClampedArray(bg);
  drawCircle(f2, 320, 180, 40);
  const blobs = findMovedBlobs(toLuma(f1, W, H), toLuma(f2, W, H), W, H);
  check(
    '가만있던 배경에 공이 나타남',
    blobs.length === 1,
    blobs.length
      ? `중심 (${blobs[0].cx.toFixed(0)}, ${blobs[0].cy.toFixed(0)}) 지름 ${blobDiameter(blobs[0]).toFixed(1)}px`
      : '못 찾음'
  );
  if (blobs.length === 1) {
    const d = blobDiameter(blobs[0]);
    check(
      '지름을 맞게 재는가',
      Math.abs(d - 40) < 3,
      `측정 ${d.toFixed(1)}px / 실제 40px`
    );
    check('중심을 맞게 잡는가', Math.hypot(blobs[0].cx - 320, blobs[0].cy - 180) < 2);
  }
}

console.log('\n════ 2. 공이 아닌 것을 걸러내는가 ════\n');
{
  const bg = makeBackground();
  const f1 = new Uint8ClampedArray(bg);
  const f2 = new Uint8ClampedArray(bg);
  drawBar(f2, 150, 200, 12, 90); // 팔처럼 세로로 긴 것
  const blobs = findMovedBlobs(toLuma(f1, W, H), toLuma(f2, W, H), W, H);
  check('길쭉한 것(팔)은 후보에서 뺌', blobs.length === 0, `후보 ${blobs.length}개`);
}
{
  const bg = makeBackground();
  const f1 = new Uint8ClampedArray(bg);
  const f2 = new Uint8ClampedArray(bg);
  drawCircle(f2, 100, 100, 3); // 먼지처럼 아주 작은 것
  const blobs = findMovedBlobs(toLuma(f1, W, H), toLuma(f2, W, H), W, H);
  check('너무 작은 것은 후보에서 뺌', blobs.length === 0, `후보 ${blobs.length}개`);
}

console.log('\n════ 3. 여러 개가 움직여도 공을 따라가는가 ════\n');
{
  // 공: 화면 중앙에서 시작해 점점 작아짐. 방해물: 구석에서 크기 그대로 움직임
  const fps = 60;
  const lumas: Float32Array[] = [];

  for (let i = 0; i < 14; i++) {
    const curr = makeBackground();
    const d = 60 / (1 + i * 0.42); // 멀어지며 작아짐
    drawCircle(curr, 320 + i * 1.2, 180 + i * 0.6, d);
    // 방해물 — 크기가 그대로인 동그란 것이 구석에서 이동
    drawCircle(curr, 80 + i * 6, 300, 22);
    lumas.push(toLuma(curr, W, H));
  }

  const background = buildBackground(lumas);
  const frames: FrameBlobs[] = lumas.map((luma, i) => ({
    t: i / fps,
    blobs: findMovedBlobs(background, luma, W, H),
  }));

  const track = trackBall(frames, { frameWidth: W, frameHeight: H });
  check('공 궤적을 이어붙임', track.length >= 10, `${track.length}프레임 추적`);
  if (track.length > 3) {
    const startsCenter = Math.hypot(track[0].x - 320, track[0].y - 180) < 30;
    check(
      '중앙에서 시작한 것을 골랐는가',
      startsCenter,
      `시작 (${track[0].x.toFixed(0)}, ${track[0].y.toFixed(0)})`
    );
    let shrinking = true;
    for (let i = 1; i < track.length; i++) {
      if (track[i].diameterPx > track[i - 1].diameterPx * 1.1) shrinking = false;
    }
    check('계속 작아지는 궤적인가 (방해물로 안 새는가)', shrinking);
  }
}

console.log('\n════ 3-1. 가만히 있는 밝은 점을 공으로 착각하지 않는가 ════\n');
{
  /*
   * 실제 실내 연습장 영상에서, 크기가 그대로인 밝은 점 하나를 119프레임 내내
   * 공으로 따라간 적이 있다. 가장 긴 궤적을 고르는 규칙 때문이었다.
   * 멀어지는 공은 반드시 작아지므로, 그 조건으로 걸러야 한다.
   */
  const fps = 60;
  const lumas: Float32Array[] = [];
  for (let i = 0; i < 40; i++) {
    const curr = makeBackground();
    drawCircle(curr, 300, 200, 12); // 크기·위치 그대로인 점 (조명 등)
    lumas.push(toLuma(curr, W, H));
  }
  const background = buildBackground(lumas);
  const frames: FrameBlobs[] = lumas.map((luma, i) => ({
    t: i / fps,
    blobs: findMovedBlobs(background, luma, W, H),
  }));
  const track = trackBall(frames, { frameWidth: W, frameHeight: H });
  check(
    '작아지지 않는 것은 공으로 뽑지 않음',
    track.length === 0,
    track.length ? `${track.length}프레임을 공으로 착각함` : '궤적 없음'
  );
}

console.log('\n════ 4. 감지부터 구속까지 한 번에 ════\n');
{
  /*
   * 실제와 같은 조건으로 프레임을 그려서, 감지 → 추적 → 구속까지 이어지는지 본다.
   * 카메라 화각 69도, 1.2m에서 릴리스, 130km/h로 60fps 촬영을 640px로 줄인 상황.
   */
  const fps = 60;
  const sourceW = 1920;
  const scale = W / sourceW;
  const focalPxSource = focalPxFromFov(sourceW, 69);
  const kmh = 130;
  const speed = kmh / 3.6;

  const times: number[] = [];
  const lumas: Float32Array[] = [];
  for (let i = 0; i < 20; i++) {
    const t = i / fps;
    const z = 1.2 + speed * t;
    const dSource = (BALL_DIAMETER_M * focalPxSource) / z;
    const dSmall = dSource * scale;
    if (dSmall < 4) break;
    const curr = makeBackground();
    drawCircle(curr, W / 2, H / 2, dSmall);
    times.push(t);
    lumas.push(toLuma(curr, W, H));
  }

  const background = buildBackground(lumas);
  const frames: FrameBlobs[] = lumas.map((luma, i) => ({
    t: times[i],
    blobs: findMovedBlobs(background, luma, W, H),
  }));

  const track = trackBall(frames, { frameWidth: W, frameHeight: H });
  const scaled = track.map((o) => ({
    t: o.t,
    x: o.x / scale,
    y: o.y / scale,
    diameterPx: o.diameterPx / scale,
  }));
  const result = measureVelocity({
    observations: scaled,
    lens: { focalPx: focalPxSource, frameWidth: sourceW, frameHeight: 1080 },
    stability: { maxBackgroundShiftPx: 1 },
  });

  if (result.ok) {
    const diff = Math.abs(result.kmh - kmh);
    check(
      '그린 대로 구속이 나오는가',
      diff < 8,
      `측정 ${result.kmh}km/h / 실제 ${kmh}km/h (차이 ${diff.toFixed(1)}) · ${result.detail.frames}프레임 · 신뢰도 ${result.confidence}`
    );
  } else {
    check(
      '그린 대로 구속이 나오는가',
      false,
      `거부됨: ${result.code} (${result.message})`
    );
  }
}

console.log(`\n${'═'.repeat(50)}`);
console.log(`통과 ${passed} / 실패 ${failed}`);
console.log(`${'═'.repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
