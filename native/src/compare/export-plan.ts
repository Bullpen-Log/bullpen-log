/**
 * 내보내기 · 해설 녹화의 '무엇을 만들지' 계획(순수 — R16 · R17 · R18). 실제 장면을 뽑아 영상 파일로 엮는 일(AVFoundation 합성)은
 * 아직 앱에 없다 — 이 계획은 그 합성기가 받을 입력이고, 시험은 계획이 맞는지(구간 · 속도 · 길이 · 멈춤 · 건너뜀)만 본다.
 * 계획이 맞아도 실제 파일이 만들어진 것은 아니다(화면은 '준비 중'으로 둔다 — 빈 파일 · 화면 갈무리로 대신하지 않는다).
 */
import type { RelRange } from '~/compare/timing';

export type ExportLayout = 'stack' | 'side' | 'overlay';
export type CompositionSegment = { outFrom: number; outTo: number; aFrom: number; aTo: number; bFrom: number | null; bTo: number | null; speed: number };
export type CompositionPlan = {
  durationSec: number;
  segments: CompositionSegment[];
  layout: ExportLayout;
  /** 대략 크기(바이트) — 1080p H.264 대략 비트레이트로 */
  estimateBytes: number;
  disclosures: string[];
};

const MBPS: Record<ExportLayout, number> = { stack: 10, side: 10, overlay: 8 };

/**
 * 고른 구간(상대 시간)을 한 속도로 내보내는 계획. 기준 장면 ma · mb 로 A · B 시각을 셈한다(B 가 없으면 한 영상).
 * 공통 구간 밖은 자른다 — 한쪽이 끝난 뒤 다른 쪽만 흐르지 않게.
 */
export function planComposition(opts: {
  range: RelRange;
  from: number;
  to: number;
  ma: number;
  mb: number | null;
  speed: number;
  layout: ExportLayout;
  normalized?: boolean;
  approxSync?: boolean;
  startBased?: boolean;
}): CompositionPlan | null {
  const from = Math.max(opts.range.min, Math.min(opts.from, opts.to));
  const to = Math.min(opts.range.max, Math.max(opts.from, opts.to));
  if (!(to > from) || !(opts.speed > 0) || !Number.isFinite(opts.speed)) return null;
  const durationSec = (to - from) / opts.speed;
  const seg: CompositionSegment = {
    outFrom: 0,
    outTo: durationSec,
    aFrom: opts.ma + from,
    aTo: opts.ma + to,
    bFrom: opts.mb != null ? opts.mb + from : null,
    bTo: opts.mb != null ? opts.mb + to : null,
    speed: opts.speed,
  };
  const disclosures: string[] = [];
  if (opts.speed !== 1) disclosures.push(`재생 속도 ${opts.speed}×`);
  if (opts.normalized) disclosures.push('동작 길이 맞춤 · 실제 시간과 다름');
  if (opts.startBased) disclosures.push('시작점 기준(같은 동작으로 맞추지 않음)');
  if (opts.approxSync) disclosures.push('대략 맞춤');
  return { durationSec, segments: [seg], layout: opts.layout, estimateBytes: Math.round((durationSec * MBPS[opts.layout] * 1e6) / 8), disclosures };
}

/* ---- 해설 녹화 — 사람이 한 조작(재생 · 멈춤 · 옮김 · 속도 · 그림)을 시간 줄로 ---- */

export type NarrationEvent =
  | { at: number; type: 'play' }
  | { at: number; type: 'pause' }
  | { at: number; type: 'seek'; rel: number }
  | { at: number; type: 'rate'; rate: number }
  | { at: number; type: 'draw'; annotationId: string }
  | { at: number; type: 'stop' };

/** 출력 시간 줄 한 칸 — play 는 상대 시각 relFrom → relTo 를 그 속도로, hold 는 relFrom 장면을 멈춘 채(목소리는 이어짐) */
export type NarrationSegment =
  | { kind: 'play'; outFrom: number; outTo: number; relFrom: number; relTo: number; rate: number }
  | { kind: 'hold'; outFrom: number; outTo: number; rel: number };
export type NarrationTimeline = { durationSec: number; segments: NarrationSegment[]; drawings: { out: number; annotationId: string }[]; cuts: number[] };

/**
 * 조작 기록 → 출력 시간 줄. at 은 녹화 시작부터의 초(목소리와 같은 시계). 처음은 startRel 에 멈춘 상태.
 * 재생 중 상대 시각은 rate 만큼 흐르고 구간 끝(range.max)에서 멈춘다. 옮김(seek)은 건너뜀(cut)으로 남긴다 — 이어 붙이지 않는다.
 */
export function planNarration(events: readonly NarrationEvent[], startRel: number, startRate: number, range: RelRange): NarrationTimeline | null {
  const evs = [...events].filter((e) => Number.isFinite(e.at) && e.at >= 0).sort((a, b) => a.at - b.at);
  const stop = evs.find((e) => e.type === 'stop');
  if (!stop) return null;
  const segments: NarrationSegment[] = [];
  const drawings: { out: number; annotationId: string }[] = [];
  const cuts: number[] = [];
  let rel = Math.min(range.max, Math.max(range.min, startRel));
  let rate = startRate > 0 ? startRate : 1;
  let playing = false;
  let t = 0;
  const flush = (until: number) => {
    if (until <= t) return;
    if (playing) {
      const want = rel + (until - t) * rate;
      const relTo = Math.min(range.max, want);
      const playOut = relTo > rel ? (relTo - rel) / rate : 0;
      if (playOut > 0) segments.push({ kind: 'play', outFrom: t, outTo: t + playOut, relFrom: rel, relTo, rate });
      if (t + playOut < until) segments.push({ kind: 'hold', outFrom: t + playOut, outTo: until, rel: relTo });
      rel = relTo;
      if (relTo >= range.max) playing = false;
    } else segments.push({ kind: 'hold', outFrom: t, outTo: until, rel });
    t = until;
  };
  for (const e of evs) {
    if (e.at > stop.at) break;
    flush(e.at);
    if (e.type === 'play') playing = rel < range.max;
    else if (e.type === 'pause') playing = false;
    else if (e.type === 'seek') {
      rel = Math.min(range.max, Math.max(range.min, e.rel));
      cuts.push(t);
    } else if (e.type === 'rate' && e.rate > 0) rate = e.rate;
    else if (e.type === 'draw') drawings.push({ out: t, annotationId: e.annotationId });
    else if (e.type === 'stop') break;
  }
  /* 이웃한 같은 멈춤은 하나로 */
  const merged: NarrationSegment[] = [];
  for (const s of segments) {
    const last = merged[merged.length - 1];
    if (last && last.kind === 'hold' && s.kind === 'hold' && Math.abs(last.rel - s.rel) < 1e-9 && Math.abs(last.outTo - s.outFrom) < 1e-9) last.outTo = s.outTo;
    else merged.push({ ...s });
  }
  return { durationSec: stop.at, segments: merged, drawings, cuts };
}
