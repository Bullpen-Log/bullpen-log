import type { BallObservation } from './geometry.ts';
import { MIN_RELEASE_DISTANCE_M } from './validate.ts';

/**
 * 한 장면 사이에 공이 갈 수 있는 최대 속도(m/s) — 234km/h. 크기가 이보다 빨리 줄거나 커지는 두 덩어리는
 * 같은 공이 아니다(투수의 손 · 팔이 공보다 먼저 크게 잡혔다가 다음 장면에 공만 남는 경우 — 실제 60fps
 * 영상에서 팔(118px) → 공(30px)으로 이어 붙여 궤적이 흔들렸다, 2026-09-28 김민 보정 자료).
 */
const MAX_SPEED_MPS = 65;

/**
 * 영상 프레임에서 공을 찾아낸다.
 *
 * ── 어떻게 찾는가 ──
 *
 * 카메라가 삼각대에 고정돼 있으면 배경은 프레임마다 똑같다. 그래서 배경만 담긴
 * 기준 그림을 만들어 두고, 각 프레임에서 그것을 빼면 배경은 0으로 사라지고
 * 움직인 것만 남는다. 그중에서 "작고 동그랗고 밝은 덩어리"를 공으로 본다.
 *
 * ── 왜 바로 앞 프레임과 비교하지 않는가 ──
 *
 * 처음에는 앞 프레임과 뺐는데, 공을 첫 프레임에서만 찾고 그 뒤로는 하나도 못
 * 찾았다. 이 촬영에서 공은 화면 위를 가로지르지 않고 제자리에서 작아지기
 * 때문이다. 그래서 뒤 프레임의 공이 앞 프레임의 공 안에 통째로 들어가 버리고,
 * 두 프레임의 그 자리는 똑같이 밝아 차이가 0이 된다.
 *
 * 배경 기준선과 비교하면 공이 어디에 있든 매번 드러난다.
 *
 * 학습된 모델을 쓰지 않는다. 투수 뒤에서 찍는 조건이 강제돼 있어 공이 화면
 * 가운데에 또렷하게 찍히고, 배경이 고정이라 빼기만으로 충분하기 때문이다.
 * 모델을 쓰면 브라우저에서 무겁고, 무엇을 보고 판단했는지 설명할 수 없다.
 *
 * ── 왜 밝기 차이만 보는가 ──
 *
 * 색으로 찾으면 흰 공과 흰 유니폼·구름·조명을 구분하지 못한다. 움직임은
 * 공만의 성질이라 훨씬 안정적이다.
 */

/** 밝기 차이가 이 값을 넘으면 "움직였다"고 본다 (0~255). */
const DIFF_THRESHOLD = 28;

/**
 * 덩어리 하나로 볼 수 있는 최소·최대 픽셀 수.
 *
 * 아래 한계는 지름 4픽셀쯤에 해당한다. 이보다 작게 찍힌 공은 지름을 제대로 잴
 * 수 없어 어차피 계산에서 빠지므로(measure.ts의 MIN_USABLE_BALL_PX), 여기서
 * 미리 걸러 먼지·노이즈를 후보에 들이지 않는다.
 */
const MIN_BLOB_PIXELS = 12;
const MAX_BLOB_PIXELS = 12_000;

/**
 * 공은 둥글다. 덩어리를 감싸는 사각형의 가로세로 비가 이 범위를 벗어나면
 * 팔·몸통처럼 길쭉한 것이므로 뺀다.
 */
const MIN_ASPECT = 0.55;
const MAX_ASPECT = 1.8;

/**
 * 사각형을 채운 비율. 공은 사각형의 대부분을 채우지만(원은 약 0.785),
 * 팔처럼 비스듬한 것은 듬성듬성하다.
 */
const MIN_FILL_RATIO = 0.45;

/**
 * 한 프레임에서 후보를 이만큼까지만 본다. 더 많으면 화면 전체가 움직인 것이다.
 *
 * 넘치면 '픽셀 수 × 보이는 비율'이 큰 것부터 남긴다. 예전에는 훑다가 상한에서 멈췄는데, 훑는 순서가
 * 위에서 아래라 그물코 잡음(7×10px · 보이는 비율 0.2~0.5)이 위쪽에 40개 넘게 깔린 영상에서는 그 밑에
 * 있는 진짜 공(25×25 · 1.0)이 통째로 빠졌다(첫 보정 자료 675d2051).
 */
const MAX_CANDIDATES_PER_FRAME = 40;

export type Blob = {
  cx: number;
  cy: number;
  width: number;
  height: number;
  pixels: number;
  /** 닫힘 전(문턱값을 넘은) 픽셀 수 / 닫힘 뒤 픽셀 수 — 그물에 가려진 만큼 1 보다 작다 */
  visibleFrac: number;
  /** 배경보다 어두워져 잡힌 픽셀 수(닫힘 전) — 어두워짐까지 볼 때(findMovedBlobs 의 dark)만 */
  darkPixels?: number;
};

/**
 * ── 밝은 배경 — 공이 배경보다 어두울 때(극성, 2026-10-03) ──
 *
 * 감지는 '배경보다 밝아진 곳'만 본다. 실내 터널(배경 20~150)에서는 흰 공이 늘 더 밝아 그것으로 됐는데, 밖에서 투수 뒤로
 * 수평으로 찍으면 공은 하늘 앞에서 출발한다. 해를 마주하면 카메라 쪽 공 면이 그늘이라 하늘(200~255)보다 **어둡다** — 그러면
 * 공이 처음부터 안 보여 실시간 측정이 하나도 안 잡힌다(2026-10-03 사용자 — 밖에서 한 개도 안 잡혔다, 영상은 없다. 합성
 * 시험대 '밖-1~3'은 예전 감지로 6/6 거부).
 *
 * 그래서 '배경보다 DARK_THRESHOLD 넘게 어두워진 곳'도 본다 — 단 배경이 DARK_MIN_BACKGROUND 이상으로 밝고 가만한
 * (DARK_MAX_SPREAD) 자리에서만. 흰 공이 배경보다 어두워질 수 있는 것은 배경이 밝을 때뿐이고, 어두운 배경(실내 · 그늘 · 숲)에서
 * 어두워진 곳은 그림자 · 지나가는 몸이라 헛것만 는다.
 *
 * 어두워짐의 배경은 '가장 어두운 쪽'이 아니라 **중앙값**이다(buildDarkBackground). 가장 어두운 쪽(buildBackground)은
 * 밝은 공을 지우려고 고른 값이라, 어두운 공이 몇 장에 머문 자리는 배경이 곧 공이 돼 공이 사라진다. 거꾸로 두 번째로 밝은
 * 값을 쓰면 밝은 공이 머문 자리가 배경이 돼, 공이 없는 장면에 공 모양의 '어두운 유령'이 생긴다. 중앙값은 표본(던지기 전
 * 3장 + 구간 7장)의 절반 밑에만 공이 있으면 두 쪽 모두 참 배경이다.
 *
 * 쓰는 곳: 계산(analyze-frames.ts)은 예전 길로 못 쟀을 때의 두 번째 길에서만(밝아짐과 한 마스크로 잇는다), 실시간 알아채기
 * (live-meter.ts BallWatch)는 늘(밝아짐과 따로 잇고 한 극성으로만 궤적을 잇는다), 영상 파일의 던진 때 찾기(find-throw.ts)는 늘.
 */
/**
 * 이 밝기(0~255, 중앙값 배경) 이상인 자리에서만 어두워짐을 본다. 흰 공의 그늘진 면은 밖에서도 대개 110~180 이라(노출을 하늘에
 * 맞추면 어둡게) 그보다 DARK_THRESHOLD 넘게 밝은 배경 — 하늘 · 해 받은 벽 — 앞에서만 공이 '어두워진 곳'이 된다. 파란 하늘은
 * 밝기 140~190 이라 그보다 높게 두지 않는다. 실내 보정 영상에서는 가운데 정사각형의 15~25% 가 이 위(밝은 바닥 · 흰 천 · 조명)다.
 */
export const DARK_MIN_BACKGROUND = 130;
/** 어두워짐 문턱 — 밝아짐(DIFF_THRESHOLD)과 같다. 합성 시험대에서 하늘 230 앞 공 160 은 대비 70 이라 넉넉하다 */
export const DARK_THRESHOLD = 28;
/**
 * 그 자리 배경이 스스로 밝기를 바꾸면(흔들리는 흰 과녁 천 · 움직이는 투수의 흰 옷) 어두워짐을 보지 않는다 — 배경 표본의 '두 번째로
 * 밝은 값 − 중앙값'이 이보다 크면. 어두운 공은 표본의 아래쪽(어두운 쪽)만 끌어내리므로 이 폭을 바꾸지 않고, 밝은 공이 몇 장에 머문
 * 자리(공이 지나간 뒤 '어두운 유령'이 생길 자리)는 위쪽이 공이라 이 폭이 커서 저절로 빠진다. 하늘 · 벽은 잡음뿐이라 몇 안 된다.
 * 근거(실내 보정 영상의 거친 장면 18개, find-throw · 화각 62°): 문턱이 없으면 던진 공을 못 찾던 두 영상(3be4d460 · 675d2051)에서
 * 흔들리는 천 · 몸 자리(이 폭 22~43)의 밝아짐 · 어두워짐을 이은 헛궤적을 공으로 믿었다. 20 이면 675d2051 의 헛궤적이 끊기고,
 * 실제로 쓰는 화각(59.8°)으로는 18개 모두 구간 · 값이 예전과 같다.
 */
export const DARK_MAX_SPREAD = 20;

/** 어두워짐까지 볼 때 findMovedBlobs 에 주는 것 */
export type DarkDetect = {
  /** 중앙값 배경(buildDarkBackground) */
  background: Float32Array;
  /** 배경 표본의 '두 번째로 밝은 값 − 중앙값'(buildDarkBackground) — DARK_MAX_SPREAD 보다 크면 그 자리는 보지 않는다 */
  spread: Float32Array;
  /** 이 장면이 중앙값 배경보다 전체적으로 밝아진 양(자동 노출) */
  bias: number;
  /** 배경이 이 밝기 이상인 자리에서만 — 기본 DARK_MIN_BACKGROUND */
  minBackground?: number;
};

/**
 * 닫힘 반지름(픽셀) — 팽창한 뒤 침식하면 이 거리 안의 틈이 메워진다.
 *
 * 흰 그물(네트) 너머로 찍으면 그물 실이 공을 가늘게 가른다. 실은 가만히 있어 배경에 들어가므로
 * 공은 그물코 사이에서만 밝아진 조각들로 잡히고, 조각마다 따로 덩어리가 되어 공 하나를 못 잇는다
 * (2026-09-28 사용자 — "흰 망에서 측정이 잘 안 된다"). 분석 크기(짧은 변 720)에서 실 굵기는 1~3px
 * 라 2px 면 대부분 메워진다. 더 키우면 공 옆을 지나가는 손 · 팔이 공에 붙는다.
 */
const CLOSE_RADIUS = 2;

/**
 * 마스크의 닫힘 — 팽창(radius)한 뒤 침식(radius). 정사각형 구조 요소를 가로 · 세로로 나눠 돌린다. 결과는 새 배열,
 * 원본은 그대로. 창은 화면 가장자리에서 잘린다(잘린 창 안에서 '하나라도 1' · '모두 1').
 *
 * 빠르게(2026-09-30, 실시간 측정): 예전에는 픽셀마다 창을 다시 훑고 세로를 열 차례로 돌아(메모리를 720 칸씩 건너뛰어)
 * 장면 하나에 50ms 넘게 들었다 — 카메라로 잰 공 하나(44장)의 계산 4~6초 가운데 절반이 여기였다. 지금은 한 줄을 32픽셀씩
 * 비트로 묶어(Uint32) 밀기 · 논리합(팽창) · 논리곱(침식)으로 한 번에 32픽셀을 본다. 화면 밖은 팽창에서는 0, 침식에서는
 * 1 로 채워 '잘린 창'과 같게 한다. 결과는 예전과 한 픽셀도 다르지 않다(lab 의 무작위 · 실제 장면 비교, 셀프테스트).
 *
 * 더 빠르게(2026-10-03): 줄마다 켜진 칸(32픽셀 묶음)이 있는 범위[lo, hi]만 돈다. 팽창은 범위를 좌우 한 칸 · 위아래 radius 줄만큼
 * 넓히고(그 밖은 0), 침식은 좁힌다(창 안 줄들의 범위가 겹치는 곳 밖은 0). 실제 장면은 움직인 픽셀이 투수 몸 · 공 · 잡음뿐이라
 * 줄의 일부만 돈다. 줄 끝의 남는 비트(width 너머)는 예전에도 침식에서 쓰레기 값이 남았고 덩어리 찾기가 보지 않는다 — 화면 안의
 * 비트는 예전과 한 비트도 다르지 않다(wf 시험: 실제 장면 · 무작위 마스크 비교).
 */
function closeMask(
  bits: Uint32Array,
  width: number,
  height: number,
  radius: number
): Uint32Array {
  const wpr = (width + 31) >>> 5;
  /* 줄마다 켜진 칸의 범위 — 빈 줄은 lo > hi */
  const lo = new Int32Array(height).fill(wpr);
  const hi = new Int32Array(height).fill(-1);
  for (let y = 0; y < height; y++) {
    const o = y * wpr;
    let w = 0;
    while (w < wpr && bits[o + w] === 0) w++;
    if (w === wpr) continue;
    lo[y] = w;
    let e = wpr - 1;
    while (bits[o + e] === 0) e--;
    hi[y] = e;
  }
  const d = dilateBits(bits, width, height, wpr, radius, lo, hi);
  return erodeBits(d.out, width, height, wpr, radius, d.lo, d.hi);
}

/** 팽창 — 창 안에 1 이 하나라도. 결과와 결과의 줄 범위(넉넉히) */
function dilateBits(
  src: Uint32Array,
  width: number,
  height: number,
  wpr: number,
  r: number,
  lo: Int32Array,
  hi: Int32Array
): { out: Uint32Array; lo: Int32Array; hi: Int32Array } {
  const tailBits = width & 31;
  /* 줄 끝의 남는 비트는 0 으로 본다(화면 밖) */
  const keepLast = tailBits === 0 ? -1 : ~((0xffffffff << tailBits) >>> 0);
  const lastW = wpr - 1;
  const word = (o: number, w: number) =>
    w === lastW ? src[o + w] & keepLast : src[o + w];
  const tmp = new Uint32Array(src.length);
  const tlo = new Int32Array(height).fill(wpr);
  const thi = new Int32Array(height).fill(-1);
  for (let y = 0; y < height; y++) {
    if (lo[y] > hi[y]) continue;
    const o = y * wpr;
    const w0 = lo[y] > 0 ? lo[y] - 1 : 0;
    const w1 = hi[y] < lastW ? hi[y] + 1 : lastW;
    tlo[y] = w0;
    thi[y] = w1;
    let prev = w0 > 0 ? word(o, w0 - 1) : 0;
    let cur = word(o, w0);
    for (let w = w0; w <= w1; w++) {
      const next = w < lastW ? word(o, w + 1) : 0;
      if (cur !== 0 || prev !== 0 || next !== 0) {
        let acc = cur;
        for (let k = 1; k <= r; k++) {
          /* x 는 x−k 의 값(왼쪽 이웃) · x+k 의 값(오른쪽 이웃)을 본다 */
          acc |= (cur << k) | (prev >>> (32 - k)) | (cur >>> k) | (next << (32 - k));
        }
        tmp[o + w] = acc >>> 0;
      }
      prev = cur;
      cur = next;
    }
  }
  const out = new Uint32Array(src.length);
  const olo = new Int32Array(height).fill(wpr);
  const ohi = new Int32Array(height).fill(-1);
  for (let y = 0; y < height; y++) {
    const y0 = y - r > 0 ? y - r : 0;
    const y1 = y + r < height - 1 ? y + r : height - 1;
    /* 창 안 줄들의 범위를 합친 것 밖은 0 */
    let L = wpr;
    let H = -1;
    for (let yy = y0; yy <= y1; yy++) {
      if (tlo[yy] < L) L = tlo[yy];
      if (thi[yy] > H) H = thi[yy];
    }
    if (L > H) continue;
    olo[y] = L;
    ohi[y] = H;
    const o = y * wpr;
    for (let w = L; w <= H; w++) {
      let acc = tmp[y0 * wpr + w];
      for (let yy = y0 + 1; yy <= y1; yy++) acc |= tmp[yy * wpr + w];
      out[o + w] = acc >>> 0;
    }
  }
  return { out, lo: olo, hi: ohi };
}

/** 침식 — 창 안이 모두 1. 화면 밖은 1 로 본다(잘린 창) */
function erodeBits(
  src: Uint32Array,
  width: number,
  height: number,
  wpr: number,
  r: number,
  lo: Int32Array,
  hi: Int32Array
): Uint32Array {
  const tailBits = width & 31;
  /* 줄 끝의 남는 비트는 1 로 본다(화면 밖) */
  const tailMask = tailBits === 0 ? 0 : (0xffffffff << tailBits) | 0;
  const lastW = wpr - 1;
  const word = (o: number, w: number) =>
    w === lastW ? src[o + w] | tailMask : src[o + w];
  const tmp = new Uint32Array(src.length);
  for (let y = 0; y < height; y++) {
    if (lo[y] > hi[y]) continue;
    const o = y * wpr;
    for (let w = lo[y]; w <= hi[y]; w++) {
      const cur = word(o, w);
      if (cur === 0) continue;
      const prev = w > 0 ? word(o, w - 1) : -1;
      const next = w < lastW ? word(o, w + 1) : -1;
      let acc = cur;
      for (let k = 1; k <= r; k++) {
        acc &= ((cur << k) | (prev >>> (32 - k))) & ((cur >>> k) | (next << (32 - k)));
      }
      tmp[o + w] = acc >>> 0;
    }
  }
  const out = new Uint32Array(src.length);
  for (let y = 0; y < height; y++) {
    const y0 = y - r > 0 ? y - r : 0;
    const y1 = y + r < height - 1 ? y + r : height - 1;
    /* 창 안 줄들의 범위가 겹치는 곳 밖은 0(빈 줄이 하나라도 있으면 통째로 0) */
    let L = 0;
    let H = wpr - 1;
    for (let yy = y0; yy <= y1; yy++) {
      if (lo[yy] > L) L = lo[yy];
      if (hi[yy] < H) H = hi[yy];
    }
    if (L > H) continue;
    const o = y * wpr;
    for (let w = L; w <= H; w++) {
      let acc = tmp[y0 * wpr + w];
      for (let yy = y0 + 1; yy <= y1; yy++) acc &= tmp[yy * wpr + w];
      out[o + w] = acc >>> 0;
    }
  }
  return out;
}

/** 픽셀 배열에서 밝기만 뽑는다. 색은 조명에 따라 흔들려 밝기가 더 안정적이다. */
export function toLuma(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): Float32Array {
  const luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i++) {
    luma[i] =
      pixels[i * 4] * 0.299 + pixels[i * 4 + 1] * 0.587 + pixels[i * 4 + 2] * 0.114;
  }
  return luma;
}

/**
 * 여러 프레임에서 "배경만 담긴 기준 그림"을 만든다.
 *
 * 픽셀마다 여러 시점의 밝기를 모아 그중 어두운 축을 고른다. 공은 배경보다
 * 밝게 찍히므로, 어두운 쪽을 고르면 공이 지나간 자리에도 배경이 남는다.
 *
 * ── 왜 중앙값이 아니라 어두운 축인가 ──
 *
 * 처음에는 중앙값을 썼는데, 이 촬영에서는 공이 화면 한가운데에 계속 머물기
 * 때문에(카메라에서 멀어지는 방향으로 날아가므로) 가운데 픽셀은 거의 모든
 * 프레임에서 공이었다. 그래서 중앙값에도 공이 섞여, 정작 공을 못 찾았다.
 *
 * 가장 어두운 값 하나만 쓰면 잡티 하나에 휘둘리므로 두 번째로 어두운 값을 쓴다.
 */
export function buildBackground(samples: ArrayLike<number>[]): Float32Array {
  if (samples.length === 0) throw new Error('배경을 만들 프레임이 없습니다.');
  const size = samples[0].length;
  const rank = samples.length >= 4 ? 1 : 0;
  /*
   * 카메라 장면(Uint8Array)만이면 바이트 표로 센다 — 처음 값을 무한대 대신 255 로 두어도 가장 어두운 두 값은 같다(값이
   * 0~255 라 255 는 어느 장면 값보다 작지 않다. 장면이 둘 이상이면 둘째 값도 장면 값에서 나온다). 4분의 1 크기 표라
   * 조금 빠르다(실시간 일감 10장 배경 171 → 140ms, 부하 걸린 노드 — 2026-10-03). 결과는 예전과 같은 Float32Array 값이다.
   */
  if (samples.every((s) => s instanceof Uint8Array)) {
    const b1 = new Uint8Array(size).fill(255);
    const b2 = new Uint8Array(size).fill(255);
    for (const sample of samples as Uint8Array[]) {
      for (let i = 0; i < size; i++) {
        const v = sample[i];
        const a = b1[i];
        if (v < a) {
          b2[i] = a;
          b1[i] = v;
        } else if (v < b2[i]) {
          b2[i] = v;
        }
      }
    }
    const out = new Float32Array(size);
    out.set(rank === 0 ? b1 : b2);
    return out;
  }
  /*
   * 가장 어두운 값(m1)과 두 번째(m2)를 장면 차례로 한 번씩 훑어 센다 — 픽셀마다 배열을 정렬하던 것과 값이 똑같고(같은
   * 값이 둘이면 둘째도 그 값) 몇 배 빠르다(720×1280 × 12장이 0.8초 → 수십 ms, 실시간 측정의 계산 시간).
   */
  const m1 = new Float32Array(size).fill(Number.POSITIVE_INFINITY);
  const m2 = new Float32Array(size).fill(Number.POSITIVE_INFINITY);
  for (const sample of samples) {
    for (let i = 0; i < size; i++) {
      const v = sample[i];
      if (v < m1[i]) {
        m2[i] = m1[i];
        m1[i] = v;
      } else if (v < m2[i]) {
        m2[i] = v;
      }
    }
  }
  return rank === 0 ? m1 : m2;
}

/**
 * 정수 배경표 — 카메라 장면(Uint8Array)으로 만든 배경은 값이 모두 0~255 정수다. 그러면 장면(정수)과의 차이도 정수라
 * '밝기 − 배경 > 문턱' 이 '밝기 ≥ 배경 + ⌊문턱⌋ + 1' 과 같다(정수 d 에 대해 d > t ⇔ d > ⌊t⌋). 문턱(⌊문턱⌋)마다 '켜지려면
 * 넘어야 할 밝기' 표를 한 번 만들어 두고, 장면은 4픽셀씩 한 번에 견준다(findMovedBlobs). 문턱은 장면마다 노출 치우침만큼
 * 다르지만 정수로 내리면 한 공(40장 남짓)에 두세 가지뿐이다.
 */
export type BackgroundTable = {
  /** 배경(정수) · 가장 밝은 값 */
  u8: Uint8Array;
  max: number;
  /** ⌊문턱⌋ → 넘어야 할 밝기(0~255, 4픽셀씩 읽으려고 Uint32 로도) · 넘을 수 없는 픽셀(배경 + ⌊문턱⌋ + 1 > 255)의 비트 */
  lims: Map<number, { c32: Uint32Array; never: Uint32Array | null }>;
};

/** 배경이 0~255 정수뿐이면 정수 배경표, 아니면 null(영상 파일 길 — 밝기가 소수) */
export function backgroundTable(background: Float32Array): BackgroundTable | null {
  const n = background.length;
  const u8 = new Uint8Array(n);
  let max = 0;
  for (let i = 0; i < n; i++) {
    const v = background[i];
    /* v | 0 === v 는 정수인지(−0 · NaN · 무한대 · 소수는 걸린다) */
    if (!(v >= 0 && v <= 255 && (v | 0) === v)) return null;
    u8[i] = v;
    if (v > max) max = v;
  }
  return { u8, max, lims: new Map() };
}

/** 표의 ⌊문턱⌋ 칸 — 없으면 만든다(넷 넘게 쌓이면 오래된 것을 버린다) */
function limitsOf(
  table: BackgroundTable,
  T: number,
  width: number,
  height: number
): { c32: Uint32Array; never: Uint32Array | null } {
  const got = table.lims.get(T);
  if (got) return got;
  const n = width * height;
  const c = new Uint8Array(n);
  const wpr = (width + 31) >>> 5;
  const bg = table.u8;
  /* 배경 값 → 넘어야 할 밝기(0~255 로 자름) 표 하나로 */
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    const t = v + T + 1;
    lut[v] = t < 0 ? 0 : t > 255 ? 255 : t;
  }
  for (let i = 0; i < n; i++) c[i] = lut[bg[i]];
  /*
   * 배경 + ⌊문턱⌋ + 1 > 255 인 픽셀은 넘을 수 없다 — 255 로 두면 밝기 255 가 '넘었다'로 잘못 켜지므로 비트를 따로 지운다.
   * 그런 배경이 없으면(대개) 건너뛴다.
   */
  let never: Uint32Array | null = null;
  if (table.max + T + 1 > 255) {
    never = new Uint32Array(wpr * height);
    const limit = 255 - T - 1;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++)
        if (bg[row + x] > limit) never[y * wpr + (x >>> 5)] |= 1 << (x & 31);
    }
  }
  const entry = { c32: new Uint32Array(c.buffer, 0, n >>> 2), never };
  if (table.lims.size >= 4) table.lims.delete(table.lims.keys().next().value as number);
  table.lims.set(T, entry);
  return entry;
}

const HI = 0x80808080 | 0;
const LO7 = 0x7f7f7f7f;
/** 작은 끝(little-endian)인가 — 4픽셀씩 읽을 때 바이트 0 이 왼쪽 픽셀이어야 한다. 아니면 픽셀마다 견주는 길로 */
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

/**
 * 장면(바이트) ≥ 넘어야 할 밝기(바이트)를 4픽셀씩 — 32비트 한 칸에 네 픽셀을 담아 바이트마다 빼기 · 견주기를 한 번에 한다
 * (SWAR). 바이트 a ≥ c 의 높은 비트 = (a 의 높은 비트 > c 의 것) 또는 (둘이 같고 아래 7비트가 a ≥ c). 아래 7비트는
 * (a | 0x80) − (c & 0x7f) 의 높은 비트로 안다 — 이 빼기는 1~255 라 옆 바이트로 빌림이 넘어가지 않는다. 네 높은 비트를
 * 곱하기 한 번으로 모아(7 · 14 · 21 칸씩 밀어 겹치지 않게 더함) 마스크의 네 비트로 쓴다. 바이트를 하나씩 견준 것과 모든
 * (a, c) 짝에서 같다(wf 시험: 256 × 256 전부 · 실제 장면). 휴대폰 · PC 는 모두 작은 끝(little-endian)이라 바이트 0 이 왼쪽 픽셀이다.
 */
function thresholdBytes(
  luma: Uint8Array,
  c32: Uint32Array,
  never: Uint32Array | null,
  width: number,
  height: number,
  raw: Uint32Array
) {
  const L = new Uint32Array(luma.buffer, luma.byteOffset, (width * height) >>> 2);
  const wpr = (width + 31) >>> 5;
  const qpr = width >>> 2;
  for (let y = 0; y < height; y++) {
    const q0 = y * qpr;
    const qEnd = q0 + qpr;
    const wrow = y * wpr;
    for (let w = 0; w < wpr; w++) {
      const qs = q0 + (w << 3);
      const qe = qs + 8 < qEnd ? qs + 8 : qEnd;
      let bits = 0;
      for (let q = qs, sh = 0; q < qe; q++, sh += 4) {
        const f = L[q];
        const c = c32[q];
        const d = ((f | HI) - (c & LO7)) | 0;
        const ge = ((f & ~c) | (~(f ^ c) & d)) & HI;
        if (ge !== 0) bits |= ((Math.imul(ge >>> 7, 0x204081) >>> 21) & 15) << sh;
      }
      if (never !== null && bits !== 0) bits &= ~never[wrow + w];
      if (bits !== 0) raw[wrow + w] = bits;
    }
  }
}

/**
 * 어두워짐을 볼 때의 배경(위 '밝은 배경' 설명) — 픽셀마다 장면들의 중앙값과, 그 자리가 스스로 밝기를 바꾸는 폭('두 번째로 밝은
 * 값 − 중앙값', DARK_MAX_SPREAD). 표본이 짝수면 중앙값은 가운데 둘 가운데 위쪽(n/2 번째, 0 부터) — live-meter.ts BallWatch ·
 * find-throw.ts 의 중앙값과 같은 정의다. 표본이 셋 밑이면 폭은 0.
 */
export function buildDarkBackground(samples: ArrayLike<number>[]): {
  background: Float32Array;
  spread: Float32Array;
} {
  if (samples.length === 0) throw new Error('배경을 만들 프레임이 없습니다.');
  const size = samples[0].length;
  const m = samples.length;
  const background = new Float32Array(size);
  const spread = new Float32Array(size);
  const bucket = new Float32Array(m);
  for (let i = 0; i < size; i++) {
    /* 삽입 정렬 — 표본이 10장 안팎이라 typed array 의 sort 보다 빠르다 */
    for (let s = 0; s < m; s++) {
      const v = samples[s][i];
      let j = s - 1;
      while (j >= 0 && bucket[j] > v) {
        bucket[j + 1] = bucket[j];
        j--;
      }
      bucket[j + 1] = v;
    }
    background[i] = bucket[m >> 1];
    spread[i] = m >= 3 ? bucket[m - 2] - bucket[m >> 1] : 0;
  }
  return { background, spread };
}

/**
 * 배경보다 밝아진 덩어리들을 찾는다.
 *
 * 덩어리는 줄마다 켜진 구간을 이어 묶는다(blobsOf) — 예전의 흐름 채우기(flood fill)와 같은 덩어리 · 같은 차례다.
 */
/*
 * 프레임 밝기는 숫자 배열이면 된다(ArrayLike). 영상 파일은 Float32Array 로, 카메라에서
 * 바로 받는 프레임은 메모리를 4분의 1만 쓰는 Uint8Array 로 온다(live-capture.ts) — 같은
 * 0~255 눈금이라 문턱값(DIFF_THRESHOLD)은 그대로다.
 */
export function findMovedBlobs(
  background: Float32Array,
  currLuma: ArrayLike<number>,
  width: number,
  height: number,
  /** 이 프레임이 배경보다 전체적으로 밝아진 양(자동 노출) — 빼고 견준다(analyze-frames.ts) */
  exposureBias = 0,
  /** 배경의 정수 배경표(backgroundTable) — 있고 장면이 Uint8Array 면 4픽셀씩 견준다(결과는 같다) */
  table: BackgroundTable | null = null,
  /**
   * 어두워짐도 본다(위 '밝은 배경' 설명) — 밝은 배경 앞의 어두운 공. 비우면 예전처럼 밝아진 곳만(그림자를 거른다) — 실내
   * 보정 영상 · 밝은 공은 이 길 그대로다.
   */
  dark?: DarkDetect,
  /**
   * 그물코 잇기(닫힘)의 반지름 — 기본 CLOSE_RADIUS. 대비 길(analyze-frames.ts, 1.9.0)만 0 을 준다: 흔들리는 표적 그물의
   * 격자가 '움직인 픽셀'이 되면 닫힘이 공을 그 격자에 붙여 공 후보가 사라진다(밖 13개 중 8개 — docs/velocity/outdoor-2026-10-03.md).
   */
  closeRadius: number = CLOSE_RADIUS
): Blob[] {
  /*
   * 마스크는 한 줄을 32픽셀씩 비트로 묶어 쥔다(closeMask 설명) — 문턱값을 넘은 픽셀(raw)과 닫힌 마스크(moved). 덩어리 찾기도
   * 비트에서 바로 한다: 대부분이 0 이라 32픽셀씩 건너뛰고, 켜진 비트를 왼쪽부터 차례로 짚어 예전(픽셀 차례 훑기)과 같은
   * 차례 · 같은 덩어리가 나온다.
   */
  const wpr = (width + 31) >>> 5;
  const raw = movedMask(background, currLuma, width, height, exposureBias, table);
  /*
   * 어두워진 곳(밝은 배경 앞에서만) — 따로 쥐어 덩어리마다 어두워짐 픽셀을 센다. 밝아짐과 합쳐 한 마스크로 잇는다:
   * 지평선에 걸친 공은 위 반쪽이 하늘보다 어둡고 아래 반쪽이 땅보다 밝아, 따로 이으면 반원 둘이 되어 둥근 모양 검사에 걸린다
   */
  let darkRaw: Uint32Array | null = null;
  if (dark) {
    darkRaw = darkMask(currLuma, width, height, dark);
    for (let i = 0; i < raw.length; i++) raw[i] |= darkRaw[i];
  }
  /* 그물코 · 실밥에 갈린 조각을 잇는다(CLOSE_RADIUS). 덩어리는 이은 마스크에서 찾고, 보이는 비율은 원본으로 센다 */
  const moved = closeRadius > 0 ? closeMask(raw, width, height, closeRadius) : raw;
  return blobsOf(raw, moved, width, height, wpr, darkRaw);
}

/** 가만한 밝은 배경보다 문턱 넘게 어두워진 픽셀 — 한 줄을 32픽셀씩 비트로(findMovedBlobs 의 dark) */
function darkMask(
  currLuma: ArrayLike<number>,
  width: number,
  height: number,
  dark: DarkDetect
): Uint32Array {
  const wpr = (width + 31) >>> 5;
  const darkRaw = new Uint32Array(wpr * height);
  const bgD = dark.background;
  const spread = dark.spread;
  const minBg = dark.minBackground ?? DARK_MIN_BACKGROUND;
  const dTh = dark.bias - DARK_THRESHOLD;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const wrow = y * wpr;
    for (let x = 0; x < width; x++) {
      const b = bgD[row + x];
      if (b >= minBg && spread[row + x] <= DARK_MAX_SPREAD && currLuma[row + x] - b < dTh)
        darkRaw[wrow + (x >>> 5)] |= 1 << (x & 31);
    }
  }
  return darkRaw;
}

/** 배경보다 문턱 넘게 밝아진 픽셀 — 한 줄을 32픽셀씩 비트로. findMovedBlobs 의 첫 단계 */
export function movedMask(
  background: Float32Array,
  currLuma: ArrayLike<number>,
  width: number,
  height: number,
  exposureBias = 0,
  table: BackgroundTable | null = null
): Uint32Array {
  const wpr = (width + 31) >>> 5;
  const raw = new Uint32Array(wpr * height);
  const threshold = DIFF_THRESHOLD + exposureBias;
  if (
    table &&
    LITTLE_ENDIAN &&
    currLuma instanceof Uint8Array &&
    Number.isFinite(threshold) &&
    (width & 3) === 0 &&
    (currLuma.byteOffset & 3) === 0 &&
    currLuma.length === width * height &&
    table.u8.length === width * height
  ) {
    /* 카메라 장면 + 정수 배경 — 4픽셀씩(thresholdBytes) */
    const lim = limitsOf(table, Math.floor(threshold), width, height);
    thresholdBytes(currLuma, lim.c32, lim.never, width, height, raw);
  } else {
    /*
     * 문턱값 넘은 픽셀 — 32픽셀을 지역 변수에 모아 한 번에 쓴다(예전에는 픽셀마다 배열을 읽고 써서 장면 하나의 계산에서
     * 가장 무거운 곳이었다). 견주는 식(밝기 − 배경 > 문턱)은 예전 그대로라 결과가 한 비트도 다르지 않다.
     */
    for (let y = 0; y < height; y++) {
      const row = y * width;
      const wrow = y * wpr;
      for (let w = 0; w < wpr; w++) {
        const x0 = w << 5;
        const x1 = x0 + 32 < width ? x0 + 32 : width;
        let bits = 0;
        for (let x = x0, b = 1; x < x1; x++, b <<= 1) {
          // 공은 배경보다 밝게 찍히는 쪽이라 밝아진 곳만 본다. 그림자를 걸러준다.
          if (currLuma[row + x] - background[row + x] > threshold) bits |= b;
        }
        if (bits !== 0) raw[wrow + w] = bits;
      }
    }
  }
  return raw;
}

/**
 * 닫힌 마스크(moved)의 덩어리 — 줄마다 켜진 구간(run)을 뽑아 위 줄의 구간과 겹치면 같은 덩어리로 묶는다(구간 묶기).
 *
 * 왜(2026-10-03, 실시간 측정의 계산 시간): 예전에는 픽셀마다 쌓기에 넣고 빼며 흐름 채우기를 했다. 투수 몸이 움직이는 장면은
 * 닫힌 마스크가 장면마다 8.8만 픽셀 남짓이라(실제 보정 영상 일감 185장 평균, 문턱 넘은 픽셀 5.6만) 계산에서 가장 무거운 곳이
 * 됐다. 구간으로 묶으면 픽셀이 아니라 구간(장면마다 9천 개 남짓) 수만큼만 일한다.
 *
 * 같은가: 상하좌우로 이어진 픽셀 = 같은 줄에서 붙은 구간 + 위아래 줄에서 한 칸이라도 겹치는 구간(대각선은 잇지 않는다 — 예전과
 * 같다). 덩어리의 픽셀 수 · 합 · 상자 · 원본 비트 수는 모두 정수 합이라 더하는 차례와 상관없이 같은 값이다. 덩어리의 차례는
 * 예전(래스터 차례로 훑다 처음 만난 픽셀에서 채우기)과 같게 — 묶을 때 늘 앞선 구간을 뿌리로 두어, 덩어리의 뿌리가 그 덩어리의
 * 래스터 첫 구간이 되고 뿌리 차례로 내보낸다.
 */
let runCap = 0;
let runX0 = new Int32Array(0);
let runX1 = new Int32Array(0);
let runY = new Int32Array(0);
let runParent = new Int32Array(0);

function growRuns(need: number) {
  if (need <= runCap) return;
  const cap = Math.max(need, runCap * 2, 4096);
  const grow = (a: Int32Array) => {
    const b = new Int32Array(cap);
    b.set(a);
    return b;
  };
  runX0 = grow(runX0);
  runX1 = grow(runX1);
  runY = grow(runY);
  runParent = grow(runParent);
  runCap = cap;
}

function findRoot(i: number): number {
  let r = i;
  while (runParent[r] !== r) r = runParent[r];
  /* 길 줄이기 */
  while (runParent[i] !== r) {
    const next = runParent[i];
    runParent[i] = r;
    i = next;
  }
  return r;
}

/** 32비트 안의 켜진 비트 수 */
function popcount(v: number): number {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24) & 0xff;
}

/** 한 줄(wrow 부터)의 비트에서 x0 ~ x1(둘 다 포함) 사이 켜진 수 */
function countBits(bits: Uint32Array, wrow: number, x0: number, x1: number): number {
  const w0 = x0 >>> 5;
  const w1 = x1 >>> 5;
  let n = 0;
  for (let w = w0; w <= w1; w++) {
    let v = bits[wrow + w];
    if (v === 0) continue;
    if (w === w0) v &= ~((1 << (x0 & 31)) - 1);
    if (w === w1 && (x1 & 31) !== 31) v &= (1 << ((x1 & 31) + 1)) - 1;
    n += popcount(v);
  }
  return n;
}

function blobsOf(
  raw: Uint32Array,
  moved: Uint32Array,
  width: number,
  height: number,
  wpr: number,
  /** 어두워짐 비트(findMovedBlobs 의 dark) — 있으면 덩어리마다 darkPixels 를 센다 */
  darkRaw: Uint32Array | null = null
): Blob[] {
  const tailBits = width & 31;
  const tailKeep = tailBits === 0 ? -1 : (1 << tailBits) - 1;
  let n = 0;
  let prevStart = 0;
  let prevEnd = 0;
  for (let y = 0; y < height; y++) {
    const wrow = y * wpr;
    const rowStart = n;
    /* 켜진 구간 뽑기 — 0 칸은 32픽셀씩 건너뛴다. 줄 끝 너머 비트(width 밖)는 보지 않는다 */
    let open = -1;
    for (let w = 0; w < wpr; w++) {
      let v = moved[wrow + w];
      if (w === wpr - 1) v &= tailKeep;
      if (v === 0 && open < 0) continue;
      let pos = 0;
      while (pos < 32) {
        const above = pos === 0 ? -1 : ~((1 << pos) - 1);
        if (open < 0) {
          const m = v & above;
          if (m === 0) break;
          const p = 31 - Math.clz32(m & -m);
          open = (w << 5) + p;
          pos = p + 1;
        } else {
          const z = ~v & above;
          if (z === 0) break;
          const p = 31 - Math.clz32(z & -z);
          growRuns(n + 1);
          runX0[n] = open;
          runX1[n] = (w << 5) + p - 1;
          runY[n] = y;
          runParent[n] = n;
          n++;
          open = -1;
          pos = p + 1;
        }
      }
    }
    if (open >= 0) {
      growRuns(n + 1);
      runX0[n] = open;
      runX1[n] = width - 1;
      runY[n] = y;
      runParent[n] = n;
      n++;
    }
    /* 위 줄 구간과 겹치면 묶는다 — 두 줄 다 x 차례라 한 번 훑으면 된다. 앞선(번호가 작은) 뿌리를 남긴다 */
    let i = prevStart;
    let j = rowStart;
    while (i < prevEnd && j < n) {
      if (runX0[i] <= runX1[j] && runX0[j] <= runX1[i]) {
        const a = findRoot(i);
        const b = findRoot(j);
        if (a !== b) {
          if (a < b) runParent[b] = a;
          else runParent[a] = b;
        }
      }
      if (runX1[i] < runX1[j]) i++;
      else j++;
    }
    prevStart = rowStart;
    prevEnd = n;
  }

  /* 덩어리마다 더한다(뿌리 번호로) */
  const count = new Float64Array(n);
  const sumX = new Float64Array(n);
  const sumY = new Float64Array(n);
  const rawCount = new Float64Array(n);
  const minX = new Int32Array(n);
  const maxX = new Int32Array(n);
  const maxY = new Int32Array(n);
  for (let r = 0; r < n; r++) {
    const root = findRoot(r);
    const x0 = runX0[r];
    const x1 = runX1[r];
    const y = runY[r];
    const len = x1 - x0 + 1;
    if (root === r) {
      minX[r] = x0;
      maxX[r] = x1;
      maxY[r] = y;
    } else {
      if (x0 < minX[root]) minX[root] = x0;
      if (x1 > maxX[root]) maxX[root] = x1;
      if (y > maxY[root]) maxY[root] = y;
    }
    count[root] += len;
    sumX[root] += ((x0 + x1) * len) / 2;
    sumY[root] += y * len;
  }

  /* 거를 덩어리를 먼저 가린다(크기 · 모양) — 원본 비트 수(보이는 비율)는 남는 덩어리만 센다(투수 몸 같은 큰 덩어리는 안 센다) */
  const keep = new Uint8Array(n);
  for (let r = 0; r < n; r++) {
    if (runParent[r] !== r) continue;
    const c = count[r];
    if (c < MIN_BLOB_PIXELS || c > MAX_BLOB_PIXELS) continue;
    const w = maxX[r] - minX[r] + 1;
    /* 뿌리는 덩어리의 첫 구간이라 그 줄이 맨 위 줄이다 */
    const h = maxY[r] - runY[r] + 1;
    const aspect = w / h;
    if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) continue;
    if (c / (w * h) < MIN_FILL_RATIO) continue;
    keep[r] = 1;
  }
  const darkCount = darkRaw ? new Float64Array(n) : null;
  for (let r = 0; r < n; r++) {
    const root = runParent[r];
    if (keep[root] !== 1) continue;
    rawCount[root] += countBits(raw, runY[r] * wpr, runX0[r], runX1[r]);
    if (darkRaw && darkCount)
      darkCount[root] += countBits(darkRaw, runY[r] * wpr, runX0[r], runX1[r]);
  }

  const blobs: Blob[] = [];
  for (let r = 0; r < n; r++) {
    if (keep[r] !== 1) continue;
    const c = count[r];
    const w = maxX[r] - minX[r] + 1;
    const h = maxY[r] - runY[r] + 1;
    const blob: Blob = {
      cx: sumX[r] / c,
      cy: sumY[r] / c,
      width: w,
      height: h,
      pixels: c,
      visibleFrac: rawCount[r] / c,
    };
    if (darkCount) blob.darkPixels = darkCount[r];
    blobs.push(blob);
  }

  if (blobs.length > MAX_CANDIDATES_PER_FRAME) {
    blobs.sort((a, b) => b.pixels * b.visibleFrac - a.pixels * a.visibleFrac);
    blobs.length = MAX_CANDIDATES_PER_FRAME;
  }

  return blobs;
}

/** 덩어리 하나를 공으로 봤을 때의 지름(픽셀) */
export function blobDiameter(blob: Blob): number {
  // 가로세로 평균을 쓴다. 한쪽만 쓰면 살짝 잘린 덩어리에서 크게 틀린다.
  return (blob.width + blob.height) / 2;
}

export type FrameBlobs = {
  /** 영상 시작 기준 시각(초) */
  t: number;
  blobs: Blob[];
};

/**
 * 프레임별 후보 덩어리들 → 공 하나의 궤적.
 *
 * 프레임마다 여러 개가 잡히므로(투수 몸, 흔들린 나뭇잎 등) 그중 실제 공의
 * 궤적을 골라내야 한다. 조건이 강제돼 있어 공은 다음 성질을 가진다.
 *
 *  - 화면 가운데에서 시작한다 (릴리스가 중앙이므로)
 *  - 프레임마다 점점 작아진다 (멀어지므로)
 *  - 화면 위에서는 조금씩만 움직인다 (카메라에서 멀어지는 방향이므로)
 *
 * 그래서 "가운데에서 시작하는 큰 덩어리"를 씨앗으로 잡고, 다음 프레임에서
 * 가장 가깝고 크기가 비슷한 것을 이어붙인다.
 */
export type TrackOptions = {
  frameWidth: number;
  frameHeight: number;
  /** 이 비율 안쪽에서 시작한 것만 씨앗으로 삼는다 (짧은 변의 절반 기준) */
  seedCenterRatio?: number;
  /** 다음 프레임에서 공이 화면상 움직여도 되는 최대 픽셀 */
  maxStepPx?: number;
  /** 중간에 놓쳐도 되는 프레임 수 */
  maxGapFrames?: number;
  /**
   * 공이 카메라에서 멀어지나(투수 뒤, 기본) 다가오나(포수 뒤). 멀어지면 작아지고 다가오면
   * 커진다 — 크기 조건을 뒤집는 것 말고는 같다.
   */
  approach?: 'receding' | 'approaching';
  /**
   * 앞에서 몇 장까지를 씨앗(공이 처음 보이는 장면)으로 삼나. 기본 12 — 카메라로 잴 때는 던짐을
   * 감지한 바로 그 앞뒤를 넘겨 공이 앞쪽에 있다. 영상 파일은 던지기 한참 전부터 훑으므로 전부를
   * 본다(analyze-video.ts). 길고 많이 작아진 궤적을 고르므로 늦게 시작한 가짜가 이기지 못한다.
   */
  seedFrames?: number;
  /**
   * 초점거리 × 공 지름(분석 픽셀 · m) — 지름을 거리로 바꾸는 상수(z = 이것 / d). 있으면 씨앗은
   * 가장 가까운 릴리스 거리(MIN_RELEASE_DISTANCE_M)보다 큰 덩어리를 빼고, 장면 사이 크기 변화가
   * MAX_SPEED_MPS 를 넘는 이음을 막는다.
   */
  focalDiameterPx?: number;
};

/**
 * 공으로 인정할 최소 축소율 — 마지막 지름이 첫 지름의 이 값 이하여야 한다.
 *
 * 카메라에서 멀어지는 공은 반드시 작아진다. 이 조건이 없으면 벽의 밝은 점처럼
 * 가만히 있는 것이 공으로 뽑힌다. 실제로 실내 연습장 영상에서 크기가 그대로인
 * 점 하나를 119프레임 내내 공으로 따라간 적이 있다.
 */
const MAX_END_SIZE_RATIO = 0.85;

/**
 * 하나의 궤적으로 볼 수 있는 최대 시간(초).
 *
 * 던진 공이 실내 네트나 포수에 닿기까지는 아무리 느려도 1초를 넘지 않는다.
 * 그보다 긴 것은 공이 아니라 배경의 무언가다.
 */
const MAX_TRACK_SECONDS = 1.0;

/**
 * 궤적 전체의 평균 깊이 속도(m/s)가 이보다 느리면 공이 아니다(약 29km/h).
 *
 * 카메라 앞 2m 에 서 있는 투수의 몸통이 배경과 달라 80×113px 덩어리로 40장 넘게 가만히 있다가
 * 던지며 움직이면 '길고 작아진' 궤적이 돼, 13장짜리 진짜 공(33→9px)을 점수에서 이겼다(첫 보정
 * 자료 819baba0 · b3fb4050). 공은 어느 구간이든 빠르다 — 처음과 끝의 거리 차를 시간으로 나눈
 * 평균 속도는 몸통(0.7→1.8m 를 0.9초에, 1.2m/s)과 공(2.4→8m 를 0.2초에, 28m/s)을 확실히 가른다.
 * 씨앗 크기 상한(maxSeedPx)만으로는 몸통(원시 덩어리 96px)이 걸러지지 않았다.
 */
const MIN_TRACK_SPEED_MPS = 8;

/**
 * 같은 자리에 같은 크기로 이만큼(초) 머물면 공이 아니라 배경의 무언가다 — 머물기 시작한 자리에서
 * 궤적을 끊는다. 40km/h 공도 0.05초에 0.55m 나아가 8m 밖에서도 지름이 7% 는 줄고 자리도 옮긴다.
 *
 * 공이 사라진 뒤 그 근처의 가만히 있는 점(9×7px)을 20장 넘게 이어 붙여, 맞춤이 그 꼬리에 끌려
 * −11.6km/h 가 났다(첫 보정 자료 6487091a). 서 있는 투수 몸통도 이 규칙에서 씨앗부터 끊긴다.
 */
const STATIC_RUN_SEC = 0.1;
const STATIC_POS_PX = 1;
const STATIC_DIAMETER_PX = 0.75;

/**
 * 궤적 끝이 STATIC_RUN_SEC 동안 같은 자리 · 같은 크기였으면 그 머묾이 시작된 차례를, 아니면 -1.
 */
function staticRunStart(track: BallObservation[]): number {
  const last = track[track.length - 1];
  for (let i = track.length - 2; i >= 0; i--) {
    const o = track[i];
    if (
      Math.abs(o.x - last.x) >= STATIC_POS_PX ||
      Math.abs(o.y - last.y) >= STATIC_POS_PX ||
      Math.abs(o.diameterPx - last.diameterPx) >= STATIC_DIAMETER_PX
    ) {
      return -1;
    }
    if (last.t - o.t >= STATIC_RUN_SEC) return i;
  }
  return -1;
}

/**
 * 이음 문 — 궤적이 두 장 이상 이어진 뒤에는 다음 공이 '앞 이음의 화면 속도(px/초) × 지난 시간'의
 * GATE_SPEED_FACTOR 배 + 여유(GATE_MARGIN_PX + 지름의 GATE_MARGIN_DIAM 배) 안에 있어야 한다.
 *
 * 멀어지는 공의 화면 속도는 소실점으로 모이며 계속 준다(x = f·X/Z 라 화면 속도 ∝ 1/Z) — 앞 이음보다
 * 두 배 넘게 빨라질 일이 없다. 다가오는 공은 1/Z² ∝ 지름² 로 빨라지므로 지름 비의 제곱을 곱한다.
 *
 * 이 문이 없으면 공이 작아져 사라진 뒤에도 궤적이 한 장에 154px(긴 변의 12%)까지 뛰며 배경의 점 ·
 * 흔들리는 그물 조각으로 이어졌다(첫 보정 자료 74f6586f — 공 3~5px 뒤로 뜀). 그러면 궤적 전체로 보는
 * 검사(평균 깊이 속도 · 얼마나 작아졌나)를 그 꼬리가 좌우해 진짜 공 궤적이 통째로 버려지곤 했다
 * (2026-09-29, 1차 조사 coverage · 검증).
 *
 * 장면 수가 아니라 **시간**으로 잰다 — 카메라로 잴 때는 같은 장면 거르기 · 브라우저가 장면을 빠뜨림으로
 * 장면 사이 시간이 들쭉날쭉하다. 장면 수로 곱하면 빠진 장면을 모르는 채 한 장 간격으로 판정한다.
 */
const GATE_SPEED_FACTOR = 2;
const GATE_MARGIN_PX = 2;
const GATE_MARGIN_DIAM = 0.25;

export function trackBall(
  frames: FrameBlobs[],
  options: TrackOptions
): BallObservation[] {
  const {
    frameWidth,
    frameHeight,
    seedCenterRatio = 0.45,
    maxStepPx = Math.max(frameWidth, frameHeight) * 0.12,
    maxGapFrames = 2,
    approach = 'receding',
    seedFrames = 12,
    focalDiameterPx,
  } = options;
  /*
   * 씨앗이 될 수 있는 최대 지름 — 릴리스 0.8m 일 때의 공 크기. 검사의 최소 거리(0.4m)보다 빡빡하게 두는
   * 까닭: 실제 영상에서 투수의 손 · 팔이 100~120px 덩어리로 잡혀 궤적의 첫 점이 되곤 했다(0.4m 기준으로는
   * 200px 까지 허용돼 못 걸렀다). 폰을 0.8m 안쪽에 붙이는 일은 없다.
   */
  const maxSeedPx = focalDiameterPx
    ? focalDiameterPx / Math.max(MIN_RELEASE_DISTANCE_M, 0.8)
    : Infinity;

  const cx = frameWidth / 2;
  const cy = frameHeight / 2;
  const half = Math.min(frameWidth, frameHeight) / 2;

  let best: BallObservation[] = [];
  let bestScore = 0;

  // 앞쪽 프레임들을 차례로 씨앗 삼아 가장 긴 궤적을 찾는다.
  for (let s = 0; s < Math.min(frames.length, seedFrames); s++) {
    for (const seed of frames[s].blobs) {
      const offset = Math.hypot(seed.cx - cx, seed.cy - cy) / half;
      if (offset > seedCenterRatio) continue;
      /* 손 · 팔처럼 공일 수 없이 큰 덩어리는 씨앗이 아니다 */
      if (blobDiameter(seed) > maxSeedPx) continue;

      const track: BallObservation[] = [
        {
          t: frames[s].t,
          x: seed.cx,
          y: seed.cy,
          diameterPx: blobDiameter(seed),
          visibleFrac: seed.visibleFrac,
        },
      ];

      let last = track[0];
      let missed = 0;
      /* 앞 이음의 화면 속도(분석 px/초) — 두 번째 공부터 이음 문에 쓴다 */
      let prevSpeedPxPerSec: number | null = null;

      for (let f = s + 1; f < frames.length; f++) {
        let picked: Blob | null = null;
        let pickedScore = Infinity;

        for (const blob of frames[f].blobs) {
          const d = blobDiameter(blob);
          // 멀어지는 공은 커지지 않는다. 조금 커지는 것은 재기 흔들림으로 본다.
          if (
            approach === 'receding'
              ? d > last.diameterPx * 1.25
              : d < last.diameterPx / 1.25
          )
            continue;
          const step = Math.hypot(blob.cx - last.x, blob.cy - last.y);
          if (step > maxStepPx * (missed + 1)) continue;
          if (prevSpeedPxPerSec != null) {
            const growth =
              approach === 'receding' ? 1 : Math.max(1, (d / last.diameterPx) ** 2);
            const gate =
              GATE_SPEED_FACTOR * prevSpeedPxPerSec * (frames[f].t - last.t) * growth +
              GATE_MARGIN_PX +
              GATE_MARGIN_DIAM * last.diameterPx;
            if (step > gate) continue;
          }
          /*
           * 한 장면 사이 크기 변화가 최고 속도로도 안 되는 만큼이면 다른 물체다 — 손(118px)에서
           * 공(30px)으로 건너뛰는 이음을 막는다. z = fD/d 이니 다음 거리는 z ± vmax·dt 안이어야 한다.
           */
          /*
           * 크기가 크게(30% 넘게) 뛸 때만 본다 — 멀어져 몇 픽셀이 된 공은 잡음만으로도 한두 픽셀이
           * 흔들려, 작은 변화까지 물리로 따지면 정상 궤적이 끊긴다(시험대에서 프레임이 절반으로 줄었다).
           */
          const ratio = d / last.diameterPx;
          if (focalDiameterPx && (ratio < 0.7 || ratio > 1.4)) {
            const dt = frames[f].t - last.t;
            const dz = MAX_SPEED_MPS * Math.max(dt, 1e-3);
            const zPrev = focalDiameterPx / last.diameterPx;
            if (approach === 'receding') {
              if (d < focalDiameterPx / (zPrev + dz)) continue;
            } else if (zPrev - dz > 0 && d > focalDiameterPx / (zPrev - dz)) {
              continue;
            }
          }

          /*
           * 가까울수록, 크기가 비슷할수록 좋은 후보다.
           * 크기 차이를 함께 보는 이유는, 공 근처를 지나는 다른 움직임(장갑 등)에
           * 궤적을 빼앗기지 않기 위해서다.
           */
          const sizeChange =
            Math.abs(d - last.diameterPx) / Math.max(1, last.diameterPx);
          const score = step / maxStepPx + sizeChange;
          if (score < pickedScore) {
            pickedScore = score;
            picked = blob;
          }
        }

        if (!picked) {
          missed++;
          if (missed > maxGapFrames) break;
          continue;
        }

        {
          const linkDt = frames[f].t - last.t;
          prevSpeedPxPerSec =
            linkDt > 0 ? Math.hypot(picked.cx - last.x, picked.cy - last.y) / linkDt : null;
        }
        missed = 0;
        last = {
          t: frames[f].t,
          x: picked.cx,
          y: picked.cy,
          diameterPx: blobDiameter(picked),
          visibleFrac: picked.visibleFrac,
        };
        track.push(last);

        /* 같은 자리 · 같은 크기로 머무는 것은 배경이다 — 머물기 시작한 자리에서 궤적을 끊는다 */
        const stuck = staticRunStart(track);
        if (stuck >= 0) {
          track.length = stuck;
          break;
        }
      }

      /*
       * 궤적을 고를 때 "가장 긴 것"을 쓰면 안 된다.
       *
       * 가만히 있는 밝은 점은 영상 내내 이어져 아주 긴 궤적이 되는 반면,
       * 진짜 공은 0.2~0.4초 만에 지나간다. 길이만 보면 가짜가 항상 이긴다.
       * 그래서 "얼마나 작아졌는가"를 함께 본다 — 멀어지는 공만 가진 성질이다.
       */
      const trimmed = track.filter((o) => o.t - track[0].t <= MAX_TRACK_SECONDS);
      if (trimmed.length < 3) continue;

      const sizeRatio = trimmed[trimmed.length - 1].diameterPx / trimmed[0].diameterPx;
      /* 다가오는 공은 커진다 — 뒤집어서 '얼마나 작아졌나'로 같이 본다 */
      const shrank = approach === 'receding' ? sizeRatio : 1 / sizeRatio;
      if (shrank > MAX_END_SIZE_RATIO) continue; // 작아지지(커지지) 않았다 = 공이 아니다

      /* 궤적 전체가 공답게 빠른가 — 서 있는 몸통 · 배경의 점은 여기서 떨어진다 */
      if (focalDiameterPx) {
        const dt = trimmed[trimmed.length - 1].t - trimmed[0].t;
        const dz = Math.abs(
          focalDiameterPx / trimmed[trimmed.length - 1].diameterPx -
            focalDiameterPx / trimmed[0].diameterPx
        );
        if (dz < MIN_TRACK_SPEED_MPS * dt) continue;
      }

      const score = trimmed.length * (1 - shrank);
      if (score > bestScore) {
        bestScore = score;
        best = trimmed;
      }
    }
  }

  return best;
}
