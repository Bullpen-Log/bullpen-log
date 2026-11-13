'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CommandTracker,
  LiveSeek,
  PlaybackIntent,
  beginScrub,
  clampTime,
  endScrub,
  onProviderPaused,
  onProviderPlaying,
  seekRange,
  stepTime,
  supportedRates,
  youtubeErrorText,
  ytActiveForPause,
  ytSeekMayStart,
  type InterruptReason,
  type PlayTicket,
  type ScrubSession,
  type YtState,
} from '@/lib/exercise-video-state';
import { referencePlayerVars, referenceWatchUrl } from '@/lib/reference-video';
import { activeExercisePlayer, nextPlayerId } from './active-player';
import { ExerciseControls } from './controls';

/**
 * YouTube 참고 영상(웹) — 공식 IFrame Player API(VP01).
 *
 * 공식 재생기의 조작부 · 표시 · 광고 · 링크는 그대로 둔다. iframe 위에 입력을 가로채는 덮개를 두지 않는다 — 오류 안내도
 * 영상 밖(밑)에 둔다. 우리 조작부는 영상 밑 바깥에만 두고, API 가 준비된 뒤에만 켠다. 반복은 공식 규칙(loop=1 + 같은 영상 playlist).
 *
 * 공식 재생 단추로 튼 재생은 사용자의 재생 요청으로 받는다(멈춰 버리지 않는다). 공식 멈춤도 우리 의도에 맞춘다.
 * 우리가 멈춘 뒤 늦게 처리된 재생 명령만 다시 멈춘다(CommandTracker).
 */

/* 공식 API 의 최소 형태 — 전역 타입 패키지를 새로 들이지 않는다. */
type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlaybackRate(): number;
  setPlaybackRate(r: number): void;
  getAvailablePlaybackRates(): number[];
  isMuted(): boolean;
  mute(): void;
  unMute(): void;
  destroy(): void;
  setLoop(on: boolean): void;
};
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      host?: string;
      videoId: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, string | number>;
      events?: Record<string, (e: { data: number; target: YTPlayer }) => void>;
    }
  ) => YTPlayer;
};
type YTWindow = Window & { YT?: Partial<YTNamespace> & { loading?: number }; onYouTubeIframeAPIReady?: () => void };

const API_SRC = 'https://www.youtube.com/iframe_api';
const API_WAIT_MS = 12_000;
/** 재생기를 만든 뒤 준비(onReady)를 기다리는 한도 — 넘기면 다시 불러오기를 보인다. */
const READY_WAIT_MS = 15_000;
/** 소리 단추를 누른 뒤 이 시간 동안은 0.5초 조회가 화면 값을 덮지 않는다(공식 isMuted 는 늦게 바뀐다). */
const MUTE_PIN_MS = 1500;
let apiPromise: Promise<YTNamespace> | null = null;

/**
 * 공식 스크립트는 한 번만 심고, 이미 있던 전역 콜백을 덮어쓰지 않고 이어 부른다. 기다림은 제한 시간 안.
 * 실패 · 시간 넘김이면 심은 스크립트와 반쯤 만든 YT 자리표시를 걷어 다음 시도가 처음부터 다시 받게 한다.
 */
function loadYouTubeApi(): Promise<YTNamespace> {
  const w = window as YTWindow;
  if (w.YT?.Player) return Promise.resolve(w.YT as YTNamespace);
  if (apiPromise) return apiPromise;
  const me: Promise<YTNamespace> = new Promise<YTNamespace>((resolve, reject) => {
    const prev = w.onYouTubeIframeAPIReady;
    const giveUp = (why: string) => {
      window.clearTimeout(timer);
      if (apiPromise === me) apiPromise = null;
      try {
        if (!w.YT?.Player) {
          document.querySelectorAll(`script[src="${API_SRC}"], script#www-widgetapi-script`).forEach((n) => n.remove());
          // 공식 스텁은 전역 var YT 로 만들어 delete 할 수 없다(엄격 모드면 던진다) — 값만 비워 다음 시도가 위젯 API 를 다시 받게 한다.
          w.YT = undefined;
        }
      } catch {
        /* 정리 실패여도 아래 거절은 반드시 */
      } finally {
        reject(new Error(why));
      }
    };
    const timer = window.setTimeout(() => giveUp('timeout'), API_WAIT_MS);
    w.onYouTubeIframeAPIReady = () => {
      try {
        prev?.();
      } finally {
        window.clearTimeout(timer);
        if (w.YT?.Player) resolve(w.YT as YTNamespace);
        else giveUp('no-api');
      }
    };
    if (!document.querySelector(`script[src="${API_SRC}"]`)) {
      const s = document.createElement('script');
      s.src = API_SRC;
      s.async = true;
      s.onerror = () => giveUp('script');
      document.head.appendChild(s);
    }
  });
  apiPromise = me;
  return me;
}

export function YouTubeExercisePlayer(props: { videoId: string; title: string; frame: string }) {
  /* 다시 불러오기 = 공식 재생기를 통째로 새로 만든다(이전 재생기 · 이벤트는 정리) */
  const [attempt, setAttempt] = useState(0);
  return <YouTubeInner key={`${props.videoId}-${attempt}`} {...props} onRetry={() => setAttempt((n) => n + 1)} />;
}

function YouTubeInner({ videoId, title, frame, onRetry }: { videoId: string; title: string; frame: string; onRetry: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const intent = useRef(new PlaybackIntent());
  const tracker = useRef(new CommandTracker());
  const ticket = useRef<PlayTicket | null>(null);
  const scrub = useRef<ScrubSession | null>(null);
  const preview = useRef(new LiveSeek(160));
  const loopRef = useRef(true);
  const [loop, setLoop] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const visibleHalf = useRef(true);
  const playingRef = useRef(false);
  const lastState = useRef<YtState | null>(null);
  const hasPlayed = useRef(false);
  const failed = useRef(false);
  const mutePinnedUntil = useRef(0);
  const [id] = useState(() => nextPlayerId('yt'));

  /* 누른 뒤 마운트(첫 활성화) — 처음 의도는 재생 */
  const [want, setWant] = useState(true);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [rates, setRates] = useState<number[]>([]);
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<{ text: string; code: number | null } | null>(null);
  const [blocked, setBlocked] = useState(false);

  const syncWant = () => setWant(intent.current.desired);
  const markPlaying = (on: boolean) => {
    playingRef.current = on;
    if (on) hasPlayed.current = true;
    setPlaying(on);
  };
  const fail = (text: string, code: number | null) => {
    failed.current = true;
    intent.current.pause('source');
    ticket.current = null;
    syncWant();
    markPlaying(false);
    setError({ text, code });
    try {
      playerRef.current?.pauseVideo();
    } catch {
      /* 준비 전 */
    }
  };

  const pausePlayer = () => {
    tracker.current.sentPause(ytActiveForPause(lastState.current, playingRef.current, hasPlayed.current));
    try {
      playerRef.current?.pauseVideo();
    } catch {
      /* 정리 중 */
    }
  };

  /** 멈춤. 끄는 중이어도 끌기 세션은 남긴다 — 놓을 때 이동은 하고 재개만 막는다(endScrub). */
  const interrupt = (reason: InterruptReason) => {
    preview.current.cancel();
    intent.current.pause(reason);
    ticket.current = null;
    syncWant();
    pausePlayer();
  };

  /** 스크립트 시작. gesture = 사용자가 방금 누른 시작(과반 조건 대신 누른 행동이 보이는 자리라고 본다). */
  const tryPlay = (gesture: boolean) => {
    const p = playerRef.current;
    if (!p || failed.current || !intent.current.allows(ticket.current)) return;
    if (!gesture && !visibleHalf.current) return;
    activeExercisePlayer.activate(id, () => interrupt('other-player'));
    tracker.current.sentPlay();
    p.playVideo();
  };

  /* 공식 재생기 만들기 · 정리. attempt 가 바뀌면(다시 불러오기) 새로 만든다. */
  useEffect(() => {
    let disposed = false;
    let readyTimer: number | undefined;
    const it = intent.current;
    const previews = preview.current;
    it.setSource();
    ticket.current = it.requestPlay(); // 누른 뒤 마운트 = 첫 활성화
    loadYouTubeApi().then(
      (YT) => {
        if (disposed || !hostRef.current) return;
        const mount = document.createElement('div');
        hostRef.current.replaceChildren(mount);
        readyTimer = window.setTimeout(() => {
          if (!disposed) fail('유튜브 재생기가 준비되지 않았어요.', null);
        }, READY_WAIT_MS);
        playerRef.current = new YT.Player(mount, {
          host: 'https://www.youtube-nocookie.com',
          videoId,
          width: '100%',
          height: '100%',
          playerVars: referencePlayerVars(videoId, window.location.origin),
          events: {
            onReady: (e) => {
              window.clearTimeout(readyTimer);
              if (disposed || failed.current) return; // 시간 넘김 뒤 늦게 온 준비는 무시(다시 불러오기로만 회복)
              const p = e.target;
              p.setLoop(loopRef.current);
              setReady(true);
              const d = p.getDuration();
              setDuration(Number.isFinite(d) && d > 0 ? d : null);
              setRates(supportedRates(p.getAvailablePlaybackRates()));
              setRate(p.getPlaybackRate());
              setMuted(p.isMuted());
              tryPlay(true); // 첫 활성화(누른 뒤) — 그새 화면을 떠났으면 의도가 이미 멈춤이다
            },
            onStateChange: (e) => {
              if (disposed) return;
              const p = e.target;
              lastState.current = e.data as YtState;
              if (failed.current) {
                // 실패 안내 중에도 공식 표면은 남아 있다 — 거기서 튼 재생은 멈춰 두 영상이 함께 나지 않게(다시 불러오기로만 회복).
                if (e.data === 1) pausePlayer();
                return;
              }
              if (e.data === 1) {
                const r = onProviderPlaying(intent.current, tracker.current, { acceptExternal: !scrub.current && document.visibilityState !== 'hidden' && visibleHalf.current });
                if (r.verdict === 'stop') {
                  pausePlayer();
                  return;
                }
                if (r.ticket) {
                  // 공식 재생 단추로 튼 것 — 사용자의 재생 요청으로 받는다.
                  ticket.current = r.ticket;
                  syncWant();
                }
                markPlaying(true);
                setBlocked(false);
                activeExercisePlayer.activate(id, () => interrupt('other-player'));
              } else {
                if (e.data === 0 && !loopRef.current) { it.pause('user'); ticket.current = null; syncWant(); }
                markPlaying(false);
                if (e.data === 2 && onProviderPaused(intent.current, tracker.current, !!scrub.current)) {
                  ticket.current = null;
                  syncWant();
                }
              }
              const d = p.getDuration();
              if (Number.isFinite(d) && d > 0) setDuration(d);
              if (Date.now() >= mutePinnedUntil.current) setMuted(p.isMuted());
            },
            onPlaybackRateChange: (e) => !disposed && setRate(e.data),
            onError: (e) => {
              if (disposed) return;
              window.clearTimeout(readyTimer);
              fail(youtubeErrorText(e.data), e.data);
            },
            onAutoplayBlocked: () => {
              if (disposed) return;
              tracker.current.clear(); // 우리 재생이 거절됨 — 곧 공식 단추로 튼 재생을 '우리 재생'으로 오해하지 않게
              intent.current.pause('user');
              ticket.current = null;
              syncWant();
              setBlocked(true);
            },
          },
        });
      },
      () => {
        if (!disposed) fail('유튜브 재생기를 불러오지 못했어요.', null);
      }
    );
    return () => {
      disposed = true;
      window.clearTimeout(readyTimer);
      previews.cancel();
      it.pause('unmount');
      activeExercisePlayer.release(id);
      try {
        playerRef.current?.destroy();
      } catch {
        /* 이미 정리됨 */
      }
      playerRef.current = null;
    };
    // tryPlay · interrupt · fail 은 ref 만 만진다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, id]);

  /* 시간 · 소리 상태 — 재생 중일 때만 0.5초마다 묻는다(공식 API 에 시간 이벤트가 없다) */
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      const p = playerRef.current;
      if (!p || scrub.current) return;
      setTime(p.getCurrentTime());
      if (Date.now() >= mutePinnedUntil.current) setMuted(p.isMuted());
    }, 500);
    return () => window.clearInterval(t);
  }, [playing]);

  /*
   * 화면 이탈 · 과반 가시성. 스크립트로 시작 · 반복할 때는 절반 넘게 보여야 한다 — 절반 이하로 줄면 멈춘다.
   * 처음 알림은 기록만 한다: 사용자가 방금 이 자리를 눌러 틀었다(세로 영상이 낮은 창에서 45% 만 보여도 그 누름은 유효).
   */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') interrupt('hidden');
    };
    const onHide = () => interrupt('hidden');
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    let io: IntersectionObserver | null = null;
    let first = true;
    if (stageRef.current && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const before = visibleHalf.current;
            visibleHalf.current = e.intersectionRatio > 0.5;
            const gone = !e.isIntersecting || e.intersectionRatio === 0;
            // 완전히 화면 밖이면 언제나 멈춘다. 절반 이하로 줄어든 것은 처음 알림(방금 누른 자리)이 아닐 때만.
            if (gone && intent.current.desired) interrupt('offscreen');
            else if (!first && before && !visibleHalf.current && intent.current.desired) interrupt('offscreen');
          }
          first = false;
        },
        { threshold: [0, 0.5, 0.51, 1] }
      );
      io.observe(stageRef.current);
    }
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
      io?.disconnect();
    };
    // interrupt 는 ref 만 만진다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const changed = () => setFull(document.fullscreenElement === wrapRef.current && !!wrapRef.current);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);

  const range = seekRange(duration);
  const seekTo = (t: number, live = false) => {
    const p = playerRef.current;
    if (!p || !range) return;
    const to = clampTime(t, range);
    const mayStart = ytSeekMayStart(lastState.current);
    p.seekTo(to, !live);
    // 시작 전 · 대기 상태의 seekTo 는 재생을 시작한다 — 의도가 멈춤이면 그 재생을 늦은 재생으로 보고 멈추게 한다.
    if (!intent.current.desired) {
      if (mayStart || live) tracker.current.sentPause(true);
      p.pauseVideo();
    }
    setTime(to);
  };

  const embedBlocked = error?.code === 101 || error?.code === 150;
  return (
    <div ref={wrapRef} className={full ? 'flex h-full flex-col justify-center bg-black p-4' : ''}>
      {/* 무대: 공식 재생기 자리. 최소 200×200 을 지키려 너비만 줄이고 자르지 않는다. 위에 아무것도 덮지 않는다. */}
      <div ref={stageRef} className={`relative ${full ? 'min-h-0 flex-1' : frame} min-h-[200px] min-w-[200px] overflow-hidden rounded-xl border border-line bg-black`}>
        <div ref={hostRef} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" title={title} />
      </div>
      {error && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink" role="alert">
          <p className="mr-auto">{error.text}</p>
          {embedBlocked ? (
            <a
              href={referenceWatchUrl(videoId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-full px-3 font-semibold text-sky"
            >
              유튜브에서 보기
            </a>
          ) : null}
          <button type="button" className="min-h-11 rounded-full bg-surface px-4 font-semibold" onClick={onRetry}>
            다시 불러오기
          </button>
        </div>
      )}
      <ExerciseControls
        title={title}
        playing={want}
        ready={ready && !error}
        duration={duration}
        time={time}
        onToggle={() => {
          if (!ready || error) return;
          if (intent.current.desired) interrupt('user');
          else {
            setBlocked(false);
            ticket.current = intent.current.requestPlay();
            syncWant();
            tryPlay(true);
          }
        }}
        onScrubStart={() => {
          const p = playerRef.current;
          if (!p) return;
          scrub.current = beginScrub(intent.current, p.getCurrentTime(), scrub.current);
          syncWant();
          pausePlayer();
        }}
        onScrubDraft={(t) => {
          const s = scrub.current;
          if (!s || s.ticket.interrupt !== intent.current.interrupt) return;
          s.draft = t;
          preview.current.request(() => seekTo(t, true));
        }}
        onScrubEnd={(commit, t) => {
          preview.current.cancel();
          const s = scrub.current;
          scrub.current = null;
          if (!s) return;
          if (commit) s.draft = t;
          const r = endScrub(intent.current, s, commit, range);
          if (r.seekTo != null) seekTo(r.seekTo); // final exact seek supersedes pending previews
          syncWant();
          if (r.resume) {
            ticket.current = intent.current.ticket();
            tryPlay(true); // 놓기도 사용자 조작 — 절반 조건으로 막혀 의도만 재생인 채 멈춰 있지 않게
          }
        }}
        onStep={(dir) => seekTo(stepTime(playerRef.current?.getCurrentTime() ?? 0, dir, range))}
        onEdge={(edge) => range && seekTo(edge === 'start' ? range.min : range.max)}
        loop={loop}
        onLoop={() => {
          const next = !loopRef.current;
          loopRef.current = next;
          setLoop(next);
          playerRef.current?.setLoop(next);
        }}
        onExpand={() => {
          if (document.fullscreenElement === wrapRef.current) void document.exitFullscreen();
          else void wrapRef.current?.requestFullscreen?.().catch(() => undefined);
        }}
        expanded={full}
        expandLabel={full ? '전체화면 닫기' : '전체화면 (지원 브라우저)'}
        onRestart={() => seekTo(0)}
        rates={rates}
        rate={rate}
        onRate={(r) => playerRef.current?.setPlaybackRate(r)}
        muted={muted}
        onMute={() => {
          const p = playerRef.current;
          if (!p) return;
          // 방금 우리가 바꾼 직후면 우리 값을, 아니면 재생기의 실제 값을 기준으로 뒤집는다 —
          // 공식 isMuted 는 메시지로 늦게 바뀌고, 멈춘 동안 공식 소리 단추로 바꾼 것은 화면 값이 모른다.
          const next = Date.now() < mutePinnedUntil.current ? !muted : !p.isMuted();
          if (next) p.mute();
          else p.unMute();
          mutePinnedUntil.current = Date.now() + MUTE_PIN_MS;
          setMuted(next);
        }}
        status={error ? '오류' : blocked ? '재생을 눌러 주세요' : !ready ? '유튜브 준비 중' : want && !playing ? '불러오는 중' : null}
      />
    </div>
  );
}
