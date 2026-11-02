import type { VideoPlayer, VideoPlayerStatus } from 'expo-video';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { useIsFocused } from 'expo-router';
import { INITIAL_TRANSPORT, step, type TransportEffect, type TransportEvent, type TransportState } from '~/compare/transport';
import { buildNormalized, normalizedOfA, normalizedTimes, phaseStretch, type NormalizedMap, type RelRange } from '~/compare/timing';
import { playerCall } from '~/videos/player-parts';

/** 공통 구간 끝 여유(초) — 시간 알림이 0.1초마다라 끝 장면 바로 앞에서 멈춘다 */
const END_EPS = 0.03;
/** 이만큼 넘게 어긋나면 B 를 A 에 다시 붙인다(시간 알림마다 — 매 장면 그리기가 아니라) */
const DRIFT_FIX_SEC = 0.06;
const SAMPLE_LIMIT = 120;

/**
 * 두 재생기가 요청한 자리에 닿고 둘 다 재생 준비가 됐는지(최대 1.5초) — expo-video 에는 '옮기기 끝' 알림이 없어 위치 · 상태를 장면마다 읽는다.
 * 시간이 지났다고 성공으로 치지 않는다(실패 → 재생하지 않음).
 */
async function waitSeek(pa: VideoPlayer, pb: VideoPlayer | null, ta: number, tb: number, alive: () => boolean): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < 1500) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    if (!alive()) return false;
    try {
      const okA = pa.status === 'readyToPlay' && Math.abs(pa.currentTime - ta) < 0.08;
      const okB = !pb || (pb.status === 'readyToPlay' && Math.abs(pb.currentTime - tb) < 0.08);
      if (okA && okB) return true;
    } catch {
      return false;
    }
  }
  return false;
}

export type Clock = {
  /** 기준 장면(초) — B 가 없으면 mb 는 null */
  ma: number;
  mb: number | null;
  range: RelRange;
  loop: RelRange | null;
  /** 동작 길이 맞춤 장면(R36) — 있으면 B 자리를 구간마다 늘여 셈 */
  normalized: { a: number[]; b: number[] } | null;
};

/**
 * 비교 재생 한 줄기(compare/transport.ts 상태 기계를 재생기에 잇는다). A 가 주인 시계 — B 는 A 의 상대 자리를 따른다.
 * 맞춤 정도는 재생기 시간 알림 기준 어긋남 표본(ms)으로 모은다(화면에 실제 보인 장면의 어긋남은 아니다).
 */
export function useCompareTransport(opts: {
  pa: VideoPlayer | null;
  pb: VideoPlayer | null;
  clock: Clock | null;
  rate: number;
  enabled: boolean;
  onTimes: (t: { a: number; b: number }) => void;
}) {
  const { pa, pb, clock, rate, enabled, onTimes } = opts;
  const [tr, setTr] = useState<TransportState>(INITIAL_TRANSPORT);
  const trRef = useRef(tr);
  const target = useRef(0);
  const lastFix = useRef(0);
  const samples = useRef<number[]>([]);
  const [driftMs, setDriftMs] = useState<number[]>([]);
  const map = useRef<NormalizedMap | null>(null);
  const stretchIdx = useRef(-1);

  const norm = clock?.normalized;
  const normKey = norm ? `${norm.a.join(',')}|${norm.b.join(',')}` : '';
  useEffect(() => {
    const r = norm ? buildNormalized(norm.a, norm.b) : null;
    map.current = r && r.ok ? r.map : null;
    stretchIdx.current = -1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normKey]);

  /** 상대 자리 → 두 영상 시각(동작 길이 맞춤이면 B 는 구간마다 늘인 자리) */
  const timesFor = (ck: Clock | null, rel: number) => {
    if (!ck) return { a: 0, b: 0 };
    const ta = ck.ma + rel;
    if (ck.mb == null) return { a: ta, b: 0 };
    const m = map.current;
    if (m) return { a: ta, b: normalizedTimes(m, normalizedOfA(m, ta)).b };
    return { a: ta, b: ck.mb + rel };
  };
  const timesAt = (rel: number) => timesFor(clock, rel);
  const clampRel = (r: number) => (clock ? Math.min(clock.range.max, Math.max(clock.range.min, r)) : 0);
  const relNow = () => (clock && pa ? clampRel(playerCall.time(pa) - clock.ma) : 0);

  /*
   * 기계가 시킨 일 — 재생기 · 시계는 마지막 그림의 값(live)으로. 알림 · 단추에서만 불린다(그리는 중엔 안 부름).
   * 함수는 효과(useEffect)에서 갈아 끼워 늘 최신 값을 본다.
   */
  const live = useRef({ pa, pb, clock, rate, onTimes });
  const runRef = useRef<(fx: TransportEffect, gen: number) => void>(() => undefined);
  const dispatch = (e: TransportEvent) => {
    const r = step(trRef.current, e);
    trRef.current = r.state;
    setTr(r.state);
    if (r.effect !== 'none') runRef.current(r.effect, r.state.gen);
    if (r.state.phase === 'ended' && e.type === 'end') AccessibilityInfo.announceForAccessibility('함께 볼 수 있는 구간이 끝났어요.');
    if (r.state.phase === 'error' && r.state.error === 'seek') AccessibilityInfo.announceForAccessibility('두 영상을 같은 자리로 맞추지 못했어요.');
  };
  useEffect(() => {
    live.current = { pa, pb, clock, rate, onTimes };
    runRef.current = (fx, gen) => {
      const v = live.current;
      if (fx === 'pauseBoth') {
        playerCall.pause(v.pa);
        playerCall.pause(v.pb);
        if (v.pa) v.onTimes({ a: playerCall.time(v.pa), b: v.pb ? playerCall.time(v.pb) : 0 });
        return;
      }
      if (fx === 'playBoth') {
        playerCall.rate(v.pa, v.rate);
        playerCall.rate(v.pb, v.rate);
        stretchIdx.current = -1;
        playerCall.play(v.pa);
        playerCall.play(v.pb);
        return;
      }
      if (fx === 'seekThenConfirm') {
        const pa0 = v.pa;
        const ck = v.clock;
        if (!pa0 || !ck) return dispatch({ type: 'seekDone', gen, ok: false });
        playerCall.pause(pa0);
        playerCall.pause(v.pb);
        const t = timesFor(ck, target.current);
        playerCall.seek(pa0, t.a);
        if (v.pb && ck.mb != null) playerCall.seek(v.pb, t.b);
        v.onTimes(t);
        void waitSeek(pa0, ck.mb != null ? v.pb : null, t.a, t.b, () => trRef.current.gen === gen).then((ok) => dispatch({ type: 'seekDone', gen, ok }));
      }
    };
  });

  const play = () => {
    if (!enabled || !clock) return;
    let r = relNow();
    const lo = clock.loop ?? clock.range;
    if (r >= lo.max - END_EPS || r < lo.min) r = lo.min;
    target.current = r;
    dispatch({ type: 'play' });
  };
  const pause = () => dispatch({ type: 'pause' });
  /** 옮기기(멈춘 채) — 함께 재생 중이면 멈추고 옮긴다 */
  const seekRel = (rel: number) => {
    if (!clock) return;
    if (trRef.current.phase !== 'idle') dispatch({ type: 'scrub' });
    const t = timesAt(clampRel(rel));
    playerCall.seek(pa, t.a);
    if (clock.mb != null) playerCall.seek(pb, t.b);
    onTimes(t);
  };

  /* ---- 재생기 알림 ---- */
  const onTimeA = useEffectEvent((ta: number) => {
    if (trRef.current.phase !== 'playing' || !clock || !pa) return;
    const rel = ta - clock.ma;
    const lo = clock.loop;
    if (lo && rel >= lo.max - END_EPS) {
      /* 반복 구간 — 둘 다 처음으로 맞춰 다시(한쪽만 되풀이하지 않는다) */
      target.current = lo.min;
      dispatch({ type: 'pause' });
      dispatch({ type: 'play' });
      return;
    }
    if (rel >= clock.range.max - END_EPS) return dispatch({ type: 'end' });
    const tb = pb ? playerCall.time(pb) : 0;
    if (pb && clock.mb != null) {
      const m = map.current;
      const want = m ? normalizedTimes(m, normalizedOfA(m, ta)).b : clock.mb + rel;
      if (m) {
        /* 구간마다 B 속도 = A 속도 × 늘임 */
        const u = normalizedOfA(m, ta);
        const i = Math.min(m.a.length - 2, Math.floor(u));
        if (i !== stretchIdx.current) {
          stretchIdx.current = i;
          playerCall.rate(pb, rate * (phaseStretch(m)[i] ?? 1));
        }
      } else if (tb - clock.mb >= clock.range.max - END_EPS) return dispatch({ type: 'end' });
      const drift = tb - want;
      samples.current.push(drift * 1000);
      if (samples.current.length > SAMPLE_LIMIT) samples.current.shift();
      if (samples.current.length % 10 === 0) setDriftMs([...samples.current]);
      if (Math.abs(drift) > DRIFT_FIX_SEC) {
        lastFix.current = Date.now();
        playerCall.seek(pb, want);
      }
    }
    onTimes({ a: ta, b: tb });
  });
  const onPlaying = useEffectEvent((p: VideoPlayer, isPlaying: boolean) => {
    if (isPlaying || trRef.current.phase !== 'playing') return;
    /* 우리가 멈추지 않았는데 한쪽이 섰다 — 받는 중이면 둘 다 기다리고, 아니면(끝 · 시스템) 둘 다 멈춘다 */
    if (p.status === 'loading') return dispatch({ type: 'buffering' });
    if (clock && pa && playerCall.time(pa) - clock.ma >= clock.range.max - 0.2) dispatch({ type: 'end' });
    else dispatch({ type: 'pause' });
  });
  const onStatus = useEffectEvent((s: VideoPlayerStatus) => {
    if (s === 'error' && trRef.current.phase !== 'idle') return dispatch({ type: 'playerError' });
    if (s === 'loading' && trRef.current.phase === 'playing' && Date.now() - lastFix.current > 500) return dispatch({ type: 'buffering' });
    if (trRef.current.phase === 'buffering' && pa?.status === 'readyToPlay' && (!pb || clock?.mb == null || pb.status === 'readyToPlay')) dispatch({ type: 'bothReady' });
  });
  const onEnd = useEffectEvent(() => {
    if (trRef.current.phase === 'playing') dispatch({ type: 'end' });
  });
  useEffect(() => {
    if (!pa) return;
    const subs = [
      pa.addListener('timeUpdate', ({ currentTime }) => onTimeA(currentTime)),
      pa.addListener('playingChange', ({ isPlaying }) => onPlaying(pa, isPlaying)),
      pa.addListener('statusChange', ({ status }) => onStatus(status)),
      pa.addListener('playToEnd', () => onEnd()),
    ];
    if (pb)
      subs.push(
        pb.addListener('playingChange', ({ isPlaying }) => onPlaying(pb, isPlaying)),
        pb.addListener('statusChange', ({ status }) => onStatus(status)),
        pb.addListener('playToEnd', () => onEnd())
      );
    return () => subs.forEach((s) => s.remove());
  }, [pa, pb]);

  /* B 가 바뀌면(바꾸기 · 되돌리기) 옛 맞춤 · 재생을 버린다 */
  const onSource = useEffectEvent(() => {
    samples.current = [];
    setDriftMs([]);
    if (trRef.current.phase !== 'idle') dispatch({ type: 'sourceChanged' });
  });
  useEffect(() => {
    /* 다음 장면에 — 효과 안에서 바로 상태를 바꾸지 않는다 */
    const id = requestAnimationFrame(() => onSource());
    return () => cancelAnimationFrame(id);
  }, [pa, pb]);

  /* 화면을 떠나거나 앱이 뒤로 가면 멈춘다 — 돌아와도 저절로 다시 틀지 않는다 */
  const focused = useIsFocused();
  const onHide = useEffectEvent(() => {
    if (trRef.current.phase !== 'idle') dispatch({ type: 'background' });
  });
  useEffect(() => {
    if (!focused) onHide();
  }, [focused]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s !== 'active' && onHide());
    return () => sub.remove();
  }, []);

  /* 속도를 바꾸면 재생 중에도 바로 */
  useEffect(() => {
    if (trRef.current.phase === 'playing') {
      playerCall.rate(pa, rate);
      if (!map.current) playerCall.rate(pb, rate);
      stretchIdx.current = -1;
    }
  }, [rate, pa, pb]);

  return { state: tr, play, pause, seekRel, relNow, driftMs };
}
