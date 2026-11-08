import type { VideoPlayer } from 'expo-video';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from 'expo-router';
import { playerCall } from '~/videos/player-parts';

export type Side = 'a' | 'b';

/**
 * A 만 · B 만 재생(SS05 · SS06) — 함께 재생 상태 기계(transport-hook) 밖의 한 영상 재생도 같은 생명주기 규칙을 따른다.
 * - 앱이 뒤로 감 · 화면을 떠남 · 화면이 닫힘 · 영상(재생기)이 바뀜 · 재생기 오류면 두 재생기를 다 멈추고(interval 만 지우지 않는다),
 *   기다리던 자리 읽기를 버린다(gen). 돌아와도 저절로 다시 틀지 않는다 — 멈춘 그 자리 그대로.
 * - 끝까지 가면(playToEnd) 멈춘 것으로. 속도를 바꾸면 재생 중에도 바로.
 * - 자리는 0.1초마다 읽어 위(onTime)에 알린다. 위는 그 자리로 타임라인 · 기준 표시를 그린다.
 */
export function useSidePlayback(opts: { pa: VideoPlayer | null; pb: VideoPlayer | null; rate: number; onTime: (side: Side, t: number) => void }) {
  const { pa, pb, rate, onTime } = opts;
  const [playing, setPlaying] = useState<Side | null>(null);
  const playingRef = useRef<Side | null>(null);
  const gen = useRef(0);
  const live = useRef({ pa, pb, rate, onTime });
  useEffect(() => {
    live.current = { pa, pb, rate, onTime };
  });
  const playerOf = (s: Side) => (s === 'a' ? live.current.pa : live.current.pb);
  const set = (s: Side | null) => {
    playingRef.current = s;
    setPlaying(s);
  };
  /** 하나만 멈춤(사용자가 멈춤 · 대상을 바꿈) — 멈춘 자리를 알린다 */
  const stop = () => {
    gen.current++;
    const s = playingRef.current;
    if (!s) return;
    const p = playerOf(s);
    playerCall.pause(p);
    if (p) live.current.onTime(s, playerCall.time(p));
    set(null);
  };
  /** 둘 다 멈춤(생명주기 — 뒤로 감 · 떠남 · 바뀜 · 오류). 재생 중이 아니어도 재생기를 멈춘다 */
  const stopAll = () => {
    gen.current++;
    const s = playingRef.current;
    playerCall.pause(live.current.pa);
    playerCall.pause(live.current.pb);
    if (s) {
      const p = playerOf(s);
      if (p) live.current.onTime(s, playerCall.time(p));
      set(null);
    }
  };
  const play = (s: Side) => {
    if (playingRef.current && playingRef.current !== s) stop();
    const p = playerOf(s);
    if (!p) return;
    gen.current++;
    playerCall.rate(p, live.current.rate);
    playerCall.play(p);
    set(s);
  };
  const toggle = (s: Side) => (playingRef.current === s ? stop() : play(s));

  /* 자리 읽기 — 재생 중일 때만, 세대가 바뀌면 그만 */
  const player = playing ? (playing === 'a' ? pa : pb) : null;
  useEffect(() => {
    if (!playing || !player) return;
    const my = gen.current;
    const s = playing;
    const id = setInterval(() => {
      if (gen.current !== my) return;
      live.current.onTime(s, playerCall.time(player));
      let on = true;
      try {
        on = player.playing;
      } catch {
        on = false;
      }
      if (!on && gen.current === my) set(null);
    }, 100);
    return () => clearInterval(id);
  }, [playing, player]);

  /* 끝 · 오류 알림 */
  const onEnd = useEffectEvent((s: Side) => {
    if (playingRef.current === s) stop();
  });
  const onError = useEffectEvent(() => stopAll());
  useEffect(() => {
    if (!playing || !player) return;
    const s = playing;
    const subs = [player.addListener('playToEnd', () => onEnd(s)), player.addListener('statusChange', ({ status }) => status === 'error' && onError())];
    return () => subs.forEach((x) => x.remove());
  }, [playing, player]);

  /* 속도 */
  useEffect(() => {
    const s = playingRef.current;
    if (s) playerCall.rate(s === 'a' ? pa : pb, rate);
  }, [rate, pa, pb]);

  /* 재생기가 바뀌면(영상 바꿈 · 다시 잇기 · A·B 바꾸기) 옛 재생기를 멈춘다 */
  const shown = useRef<{ pa: VideoPlayer | null; pb: VideoPlayer | null }>({ pa, pb });
  const onSource = useEffectEvent((next: { pa: VideoPlayer | null; pb: VideoPlayer | null }) => {
    const prev = shown.current;
    shown.current = next;
    if (prev.pa === next.pa && prev.pb === next.pb) return;
    gen.current++;
    playerCall.pause(prev.pa);
    playerCall.pause(prev.pb);
    if (playingRef.current) set(null);
  });
  useEffect(() => onSource({ pa, pb }), [pa, pb]);

  /* 앱이 뒤로 감 · 화면을 떠남 · 닫힘 */
  const focused = useIsFocused();
  const onHide = useEffectEvent(() => stopAll());
  useEffect(() => {
    if (!focused) onHide();
  }, [focused]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => st !== 'active' && onHide());
    return () => sub.remove();
  }, []);
  useEffect(
    () => () => {
      gen.current++;
      playerCall.pause(live.current.pa);
      playerCall.pause(live.current.pb);
    },
    []
  );

  return { playing, play, stop, stopAll, toggle };
}
