/**
 * 거리 측정(엔진 2.0)의 던짐 알아채기 — 반 해상도 전체 화면에서, 둥근 큰 밝은 덩어리가 다음 장면들에 조금씩 작아지며(멀어지며)
 * 바로 옆에 두 장 이어지면 막 던진 공이다. 계산의 씨앗 규칙(ball-track.ts findSeeds)과 같은 문턱을 반 해상도에 옮겼다.
 *
 * 왜 따로: 1.x 의 판단(live-meter.ts BallWatch)은 1배 줌 · 가운데 네모 · 공 지름으로 잰 깊이(0.8~5.5m) · 옆 속도 상한에 맞춰
 * 다듬어져, 2배 줌 영상(엔진 2.0 을 맞춘 촬영)에서 위로 띄워 화면 위쪽으로 들어오는 공 · 큰 공을 놓쳤다(되돌려 보기 19개 중 8개).
 * 이 규칙은 19개 모두에서 씨앗을 찾았다(engine2-lab.mts). 헛 알아챔(흰 글러브가 멀어지며 작아짐 등)은 계산이 물리 궤적으로
 * 거른다 — 값을 내지 않고 다음 공을 기다린다.
 */
import { findBlobs, medianBackground, type Blob } from './ball-track.ts';

export type SeedPoint = { t: number; x: number; y: number; d: number };

/** 배경을 쥐는 간격 · 장 수 · 다시 만드는 간격(초) — 판단(1.x)과 같은 결 */
const HIST_STEP_SEC = 0.1;
const HIST_FAST_SEC = 1 / 30;
const HIST_KEEP = 9;
const BG_REFRESH_SEC = 0.25;
const BG_MIN = 5;
/** 배경에서 막 지난 장면은 뺀다(던지기 직전 손 · 공이 배경에 들지 않게) */
const BG_SKIP_SEC = 0.05;

const round = (b: Blob) => b.fill > 0.72 && b.bw / b.bh > 0.7 && b.bw / b.bh < 1.4;
/** 이어 가는 덩어리는 조금 너그럽게 — 멀어져 반 해상도 지름 6px 밑이 되면 모양이 거칠어진다(실내 114) */
const roundish = (b: Blob) => b.fill > 0.5 && b.bw / b.bh > 0.55 && b.bw / b.bh < 1.8;

export class SeedWatch {
  private readonly w: number;
  private readonly h: number;
  private readonly W: number;
  private readonly s: number;
  private img: Uint8Array;
  private hist: { t: number; img: Uint8Array }[] = [];
  private bg: Uint8Array | null = null;
  private bgAt = -Infinity;
  /** 이어 가는 궤적들 — 반 해상도 덩어리 */
  private chains: { t: number; b: Blob }[][] = [];

  constructor(width: number, height: number) {
    this.W = width;
    this.w = Math.floor(width / 2);
    this.h = Math.floor(height / 2);
    /* 원본 짧은 변 1080 을 1 로 — 반 해상도면 1/3(720 분석의 반) */
    this.s = Math.min(this.w, this.h) / 1080;
    this.img = new Uint8Array(this.w * this.h);
  }

  reset() {
    this.hist = [];
    this.bg = null;
    this.bgAt = -Infinity;
    this.chains = [];
  }

  hasBackground(): boolean {
    return this.bg != null;
  }

  /** 담기를 마친 뒤 — 이어 가던 것을 버린다(배경은 둔다) */
  clearFollow() {
    this.chains = [];
  }

  /** 분석 해상도 밝기를 반 해상도로(2×2 평균) */
  private half(luma: ArrayLike<number>): Uint8Array {
    const { w, h, W } = this;
    const out = this.img;
    for (let j = 0; j < h; j++) {
      const r0 = 2 * j * W;
      const r1 = r0 + W;
      for (let i = 0; i < w; i++) {
        const a = r0 + 2 * i;
        const b = r1 + 2 * i;
        out[j * w + i] = (luma[a] + luma[a + 1] + luma[b] + luma[b + 1] + 2) >> 2;
      }
    }
    return out;
  }

  /** 장면 하나 — 공을 알아챘으면 그 궤적(분석 px), 아니면 null */
  step(t: number, luma: ArrayLike<number>): SeedPoint[] | null {
    const img = this.half(luma);
    const last = this.hist[this.hist.length - 1];
    /* 배경이 없을 때(처음 · 카메라가 움직여 버린 뒤)는 빨리 채운다 — 0.1초 간격이면 0.5초 동안 공을 못 본다 */
    if (!last || t - last.t >= (this.bg ? HIST_STEP_SEC : HIST_FAST_SEC)) {
      this.hist.push({ t, img: img.slice() });
      if (this.hist.length > HIST_KEEP) this.hist.shift();
    }
    if (t - this.bgAt >= BG_REFRESH_SEC || !this.bg) {
      const use = this.hist.filter((q) => q.t <= t - BG_SKIP_SEC);
      if (use.length >= BG_MIN) {
        const pick = use.length % 2 ? use : use.slice(1);
        this.bg = medianBackground(pick.map((q) => q.img), this.w, this.h);
        this.bgAt = t;
      }
    }
    const bg = this.bg;
    if (!bg) return null;
    const s = this.s;
    const all = findBlobs(img, bg, this.w, [0, 0, this.w, Math.round(this.h * 0.85)], 22, Math.max(3, 30 * s * s));
    const blobs = all.filter(roundish);
    /* 이어 가기 — 앞 장면 끝 덩어리보다 조금 작고(0.3~0.97) 바로 옆(1.5r)이며 움직였거나 줄어든 것 */
    const next: { t: number; b: Blob }[][] = [];
    for (const ch of this.chains) {
      const lastB = ch[ch.length - 1].b;
      const r = Math.sqrt(lastB.area / Math.PI);
      const m = blobs.find((c) => {
        const d = Math.hypot(c.cx - lastB.cx, c.cy - lastB.cy);
        return c.area < lastB.area * 0.97 && c.area > lastB.area * 0.3 && d < 1.5 * r && (d > 2 * s || c.area < lastB.area * 0.85);
      });
      if (m) next.push([...ch, { t, b: m }]);
    }
    /* 새 씨앗 — 둥글고 큰(원본 면적 150px 넘게) 덩어리 */
    for (const b of blobs)
      if (round(b) && b.area > 150 * s * s && !next.some((ch) => ch[ch.length - 1].b === b)) next.push([{ t, b }]);
    /* 세 장(씨앗 + 두 번 작아짐) 이어지면 공 — 지름이 처음의 0.85배 밑으로 줄었어야(제자리 · 흔들림 덩어리는 아니다) */
    const hit = next.find((ch) => ch.length >= 3 && ch[ch.length - 1].b.area < ch[0].b.area * 0.72);
    if (hit) {
      this.chains = [];
      return hit.map(({ t: tt, b }) => ({ t: tt, x: b.cx * 2 + 0.5, y: b.cy * 2 + 0.5, d: 2 * 2 * Math.sqrt(b.area / Math.PI) }));
    }
    /* 너무 많이 쥐지 않는다 — 큰 것부터 30 */
    this.chains = next.sort((a, b) => b[b.length - 1].b.area - a[a.length - 1].b.area).slice(0, 30);
    return null;
  }
}
