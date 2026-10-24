/**
 * 학습한 공 감지 모델(엔진 2.8, services/velocity-detector 1판) — 브라우저에서 onnxruntime-web(WASM)으로 돌린다.
 *
 * 모델: MobileNetV3-small 앞 조각 + 열지도 머리. 입력은 연속 세 장면의 밝기(t−2 · t−1 · t, 0~1)를 세 채널로 — 움직이는 것만 '색'을 띠어
 * 그물코 · 흰 기둥과 갈린다. 출력 [1, 2, H/4, W/4]: 0 = 공 중심 열지도(로짓), 1 = 지름의 log. 학습은 긴 변 960 그림이었고 여기서는 긴 변
 * BALL_NET_LONG(736)으로 줄여 돌린다(데스크톱 크롬 WASM 1스레드 59ms/장면 — 960 은 100~200ms. 지름 8px 넘는 공은 95%+, 그보다 작은
 * 먼 공은 7할쯤이라 '던졌다'를 알아채는 데는 넉넉하다).
 *
 * 왜 CDN 에서 불러오나: onnxruntime-web 을 번들하면 서버 쪽 빌드가 node 판을 끌어오고(serverExternalPackages 손질이 필요), WASM 14MB 는
 * 어차피 따로 받는다. 판을 못박은 주소 하나(ORT_BASE)에서 JS · WASM 을 받고, 모델(177KB)만 우리 public 에 둔다. 한 번 받으면 브라우저가 캐시한다.
 * 못 받으면(오프라인 · 옛 브라우저) null — 부르는 쪽이 거친 훑기로 되돌아간다.
 *
 * 순수 셈(findThrowRun · netInputSize)은 ORT 없이도 돈다 — 셀프테스트가 쓴다.
 */

export const BALL_NET_URL = '/velocity-detector/ball-v1.onnx';
export const ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
/** 모델 입력의 긴 변(px) */
export const BALL_NET_LONG = 736;
/** 입력 변은 32 의 배수(걸음 8 × 올리기 2 × 여유) */
const NET_MULTIPLE = 32;
/** 출력 걸음 */
export const NET_STRIDE = 4;
/** 이 점수부터 '공' */
export const BALL_NET_THRESHOLD = 0.5;

/** 원본 크기 → 모델 입력 크기(긴 변 736, 둘 다 32 의 배수 — 비율이 아주 조금 틀어지지만 공은 둥근 채로 남는다) */
export function netInputSize(
  srcW: number,
  srcH: number
): { w: number; h: number; scale: number } {
  const long = Math.max(srcW, srcH);
  const scale = BALL_NET_LONG / long;
  const round = (v: number) =>
    Math.max(NET_MULTIPLE, Math.round((v * scale) / NET_MULTIPLE) * NET_MULTIPLE);
  return { w: round(srcW), h: round(srcH), scale };
}

export type NetHit = {
  /** 장면 시각(초) */
  t: number;
  /** 공 중심 · 지름 — 모델 입력 px */
  x: number;
  y: number;
  d: number;
  /** 0~1 */
  score: number;
};

/** 훑기 표본 간격(초) — 공은 0.6~0.7초 날아가니 0.2초면 3~4번 보인다 */
export const NET_STEP_SEC = 0.2;
/** 세 장면 사이 간격(초) — 60fps 한 장 */
export const NET_FRAME_GAP_SEC = 1 / 60;
/** 센 표본은 있는데 묶음이 안 되면 그 둘레 ±DENSE_SPAN_SEC 를 DENSE_STEP_SEC 간격으로 한 번 더(짧은 조각 · 빠른 공은 0.2초 표본이 2~3개뿐) */
export const DENSE_SPAN_SEC = 0.3;
export const DENSE_STEP_SEC = 1 / 15;
export const DENSE_MAX_SEEDS = 3;
/** 한 묶음으로 볼 최대 간격(초) · 공이 날아가며 움직여야 하는 최소 속도(입력 px/초 — 0.2초에 6px, 바닥 2px) · 최소 표본 수 */
export const RUN_GAP_SEC = 0.45;
export const RUN_MIN_MOVE_PX_PER_SEC = 30;
export const RUN_MIN_MOVE_FLOOR_PX = 2;
export const RUN_MIN_HITS = 3;

/**
 * 공 감지 결과들 → 날아간 공 하나(가장 먼저 시작한 묶음). 점수가 문턱을 넘고 시간이 RUN_GAP_SEC 안에 이어지며, 표본마다 자리가 움직이고
 * (제자리 밝기 변화 · 그물 흔들림은 안 움직임) 지름이 크게 되돌아 커지지 않는(멀어지는 공은 작아지기만) 묶음이 RUN_MIN_HITS 개부터.
 * 돌려주는 t 는 묶음의 첫 표본 시각(릴리스 뒤 0~0.2초).
 */
export function findThrowRun(
  hits: NetHit[],
  thr = BALL_NET_THRESHOLD
): { t: number; n: number; first: NetHit; last: NetHit } | null {
  const good = hits.filter((h) => h.score >= thr).sort((a, b) => a.t - b.t);
  let run: NetHit[] = [];
  const done = (r: NetHit[]) =>
    r.length >= RUN_MIN_HITS
      ? { t: r[0].t, n: r.length, first: r[0], last: r[r.length - 1] }
      : null;
  for (const h of good) {
    const p = run[run.length - 1];
    /* 같은 시각 표본(두 번 훑은 것)은 하나로 */
    if (p && Math.abs(h.t - p.t) < 1e-3) continue;
    const joins =
      p != null &&
      h.t - p.t <= RUN_GAP_SEC &&
      Math.hypot(h.x - p.x, h.y - p.y) >=
        Math.max(RUN_MIN_MOVE_FLOOR_PX, RUN_MIN_MOVE_PX_PER_SEC * (h.t - p.t)) &&
      h.d <= p.d * 1.35;
    if (joins) run.push(h);
    else {
      const r = done(run);
      if (r) return r;
      run = [h];
    }
  }
  return done(run);
}

/** 장면마다 모델 봉우리 — 분석 px(엔진이 받는 꼴). 공 길 안내(netFlight)용 */
export type NetPoint = { t: number; u: number; v: number; d: number; score: number };

/** 공 길 안내 — 이어 붙일 최소 점수(센 점 NET_FLIGHT_STRONG 이 셋은 있어야), 건너뛸 장면 수, 날아간 공이면 줄어야 할 지름 배 */
export const NET_FLIGHT_WEAK = 0.3;
export const NET_FLIGHT_STRONG = BALL_NET_THRESHOLD;
export const NET_FLIGHT_MAX_GAP = 3;
export const NET_FLIGHT_MIN_SHRINK = 1.6;

/**
 * 장면마다의 모델 봉우리(points, 시각순 · 장면 하나에 하나) → 날아가는 공 길(가장 긴 것). 앞 점 둘레(지름의 2배 + 한 장 움직임)에
 * 있고 지름이 크게 되돌아 커지지 않는(×1.35) 점을 NET_FLIGHT_MAX_GAP 장까지 건너뛰며 잇는다. 센 점이 셋 넘고 지름이 NET_FLIGHT_MIN_SHRINK 배
 * 넘게 준 길만(멀어지는 공) — 팔 · 손에 쥔 공 · 되던진 공(커짐)은 여기서 빠진다. 없으면 null.
 * dt = 한 장 간격(초).
 */
export function netFlight(points: NetPoint[], dt: number): NetPoint[] | null {
  const pts = points.filter((p) => p.score >= NET_FLIGHT_WEAK);
  let best: NetPoint[] | null = null;
  const used = new Set<NetPoint>();
  for (const start of pts) {
    if (used.has(start)) continue;
    const run = [start];
    for (const p of pts) {
      const q = run[run.length - 1];
      if (p.t <= q.t) continue;
      if (p.t - q.t > (NET_FLIGHT_MAX_GAP + 0.5) * dt) break;
      const prev = run.length > 1 ? run[run.length - 2] : null;
      const step = prev ? Math.hypot(q.u - prev.u, q.v - prev.v) / Math.max(dt, q.t - prev.t) : 0;
      const gate = 2 * q.d + step * (p.t - q.t) * 1.5;
      if (Math.hypot(p.u - q.u, p.v - q.v) <= gate && p.d <= q.d * 1.35) run.push(p);
    }
    for (const p of run) used.add(p);
    const strong = run.filter((p) => p.score >= NET_FLIGHT_STRONG).length;
    if (strong < 3 || !(run[0].d >= NET_FLIGHT_MIN_SHRINK * run[run.length - 1].d)) continue;
    if (!best || run.length > best.length) best = run;
  }
  return best;
}

/* ───────────────────────── ORT ───────────────────────── */

type OrtTensor = { data: Float32Array; dims: number[] };
type OrtSession = {
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
};
type OrtModule = {
  env: { wasm: { wasmPaths: string; numThreads: number } };
  InferenceSession: {
    create(url: string, opts: { executionProviders: string[] }): Promise<OrtSession>;
  };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => unknown;
};

export type BallNet = {
  /** 세 장면(밝기 0~255, w × h — netInputSize 로 맞춘 크기) → 가장 센 봉우리 하나 */
  detect(
    frames: [Float32Array, Float32Array, Float32Array],
    w: number,
    h: number
  ): Promise<Omit<NetHit, 't'>>;
};

let loading: Promise<BallNet | null> | null = null;
let modelUrl = BALL_NET_URL;

/** 모델 주소 바꾸기(실험실 — 사이트 밖에서 돌릴 때). 받기 전에 부른다 */
export function configureBallNet(opts: { modelUrl?: string }) {
  if (opts.modelUrl) modelUrl = opts.modelUrl;
}

/** 모델 · 런타임을 받아 둔다(한 번). 못 받으면 null — 다음에 다시 부르면 또 시도한다 */
export function loadBallNet(): Promise<BallNet | null> {
  if (loading) return loading;
  loading = (async (): Promise<BallNet | null> => {
    try {
      if (typeof WebAssembly === 'undefined' || typeof window === 'undefined')
        return null;
      const ort = (await import(
        /* webpackIgnore: true */ /* turbopackIgnore: true */ `${ORT_BASE}ort.wasm.min.mjs`
      )) as OrtModule;
      ort.env.wasm.wasmPaths = ORT_BASE;
      /* 여러 스레드는 cross-origin isolation 이 있어야 한다 — 앱 웹뷰 · 사이트 둘 다 없다 */
      ort.env.wasm.numThreads = 1;
      const session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: ['wasm'],
      });
      let buf: Float32Array | null = null;
      return {
        async detect(frames, w, h) {
          const n = w * h;
          if (!buf || buf.length !== 3 * n) buf = new Float32Array(3 * n);
          for (let c = 0; c < 3; c++) {
            const f = frames[c];
            const o = c * n;
            for (let i = 0; i < n; i++) buf[o + i] = f[i] / 255;
          }
          const out = await session.run({
            frames: new ort.Tensor('float32', buf, [1, 3, h, w]),
          });
          const hs = out.heat_size;
          const hw = hs.dims[3];
          const plane = hs.dims[2] * hw;
          let best = -Infinity;
          let bi = 0;
          for (let i = 0; i < plane; i++)
            if (hs.data[i] > best) {
              best = hs.data[i];
              bi = i;
            }
          const iy = Math.floor(bi / hw);
          const ix = bi - iy * hw;
          return {
            x: (ix + 0.5) * NET_STRIDE,
            y: (iy + 0.5) * NET_STRIDE,
            d: Math.exp(hs.data[plane + bi]),
            score: 1 / (1 + Math.exp(-best)),
          };
        },
      };
    } catch (e) {
      console.info(
        '[velo] 공 감지 모델을 못 불러왔어요',
        e instanceof Error ? e.message : e
      );
      loading = null;
      return null;
    }
  })();
  return loading;
}
