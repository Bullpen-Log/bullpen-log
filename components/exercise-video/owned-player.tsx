'use client';

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Play } from '@/components/icon';
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
  type InterruptReason,
  type PlayTicket,
  type ScrubSession,
} from '@/lib/exercise-video-state';
import { activeExercisePlayer, nextPlayerId } from './active-player';
import { ExerciseControls } from './controls';

/**
 * 우리가 올린 운동영상(웹, HTMLVideoElement) — VP01.
 *
 * 관리자 · 일반 사용자 모두: 현재 영상 반복(loop), 소리 꺼짐으로 시작, 영상 한 번 클릭으로 멈춤/재생,
 * 영상 밑 바깥 조작부. 화면 이탈(탭 숨김 · 페이지 떠남 · 화면 밖) · 다른 영상 재생 · 해제 때 멈추고 돌아와도 저절로 틀지 않는다.
 *
 * 재생/멈춤 단추의 모양과 동작은 '사용자 의도'(want)를 따른다 — 불러오는 중 · 버퍼링 중에도 의도가 재생이면 멈춤 단추.
 * 그래야 한 번 누르면 보이는 대로 한 번 바뀐다(VP01 검토: 로딩 중 '재생'을 누르면 멈춰 두 번 눌러야 하던 것).
 */
export function OwnedExercisePlayer({
  url,
  poster,
  title,
  frame,
  onRetry,
}: {
  url: string;
  poster?: string | null;
  title: string;
  /** 영상 무대 크기 클래스(lib/reference-video videoFrameClass). 조작부는 이 밖에 둔다. */
  frame: string;
  /** 주소를 새로 받아 이 영상만 다시 불러온다. */
  onRetry: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const intent = useRef(new PlaybackIntent());
  const tracker = useRef(new CommandTracker());
  const ticket = useRef<PlayTicket | null>(null);
  const scrub = useRef<ScrubSession | null>(null);
  const preview = useRef(new LiveSeek());
  const [id] = useState(() => nextPlayerId('owned'));

  /* 누른 뒤 마운트(첫 활성화) — 처음 의도는 재생. 아래 마운트 효과가 같은 값으로 의도를 연다. */
  const [want, setWant] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [seekable, setSeekable] = useState<{ start: number; end: number } | null>(null);
  const [rate, setRateState] = useState(1);
  const [loop, setLoop] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [nativeFull, setNativeFull] = useState(false);

  const v = () => videoRef.current;
  /** 의도가 바뀔 때마다 화면 값(want)을 맞춘다. */
  const syncWant = () => setWant(intent.current.desired);

  const pauseElement = () => {
    const el = v();
    if (!el) return;
    tracker.current.sentPause(!el.paused);
    el.pause();
  };

  /** 멈춤(사용자 · 화면 이탈 · 다른 영상). 끄는 중이어도 끌기 세션은 남긴다 — 놓을 때 이동은 하고 재개만 막는다(endScrub). */
  const interrupt = (reason: InterruptReason) => {
    preview.current.cancel();
    intent.current.pause(reason);
    ticket.current = null;
    syncWant();
    pauseElement();
  };

  const tryPlay = () => {
    const el = v();
    const t = ticket.current;
    if (!el || !intent.current.allows(t)) return;
    activeExercisePlayer.activate(id, () => interrupt('other-player'));
    tracker.current.sentPlay();
    el.play().then(
      () => setBlocked(false),
      (err: unknown) => {
        if (!intent.current.allows(t)) return;
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          intent.current.pause('user');
          ticket.current = null;
          syncWant();
          setBlocked(true);
        }
      }
    );
  };

  const requestPlay = () => {
    setBlocked(false);
    ticket.current = intent.current.requestPlay();
    syncWant();
    tryPlay();
  };

  const toggle = () => {
    if (error) return;
    if (intent.current.desired) interrupt('user');
    else requestPlay();
  };

  /* 새 주소 = 새 소스. 첫 활성화(누른 뒤 마운트)라 재생을 한 번 요청한다. */
  useEffect(() => {
    // 부모가 주소마다 key 로 새로 마운트하므로 화면 상태는 처음 값 그대로다. 여기서는 의도만 새로 연다.
    const it = intent.current;
    const previews = preview.current;
    const el = videoRef.current;
    it.setSource();
    ticket.current = it.requestPlay();
    // 빠른 소스(폰 blob · 캐시)는 이 효과보다 먼저 머리를 다 받았을 수 있다 — 그때는 준비 알림이 다시 오지 않으니 여기서 튼다.
    if (el && el.readyState >= 1) tryPlay();
    return () => {
      previews.cancel();
      it.pause('unmount');
      ticket.current = null;
      activeExercisePlayer.release(id);
      el?.pause();
    };
    // tryPlay 는 ref 만 쓴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, id]);

  /* 화면 이탈: 탭 숨김 · 페이지 떠남 · 화면 밖(교차 0) */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') interrupt('hidden');
    };
    const onHide = () => interrupt('hidden');
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    let io: IntersectionObserver | null = null;
    if (stageRef.current && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) if ((!e.isIntersecting || e.intersectionRatio === 0) && intent.current.desired) interrupt('offscreen');
        },
        { threshold: [0] }
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
    const onFs = () => setNativeFull(document.fullscreenElement === wrapRef.current && !!wrapRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  /* 앱 안 크게 보기: 초점을 안으로 옮기고 닫을 때 돌려준다, 뒤 화면 스크롤을 잠근다 */
  useEffect(() => {
    if (!expanded) return;
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.documentElement;
    const oldOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    wrapRef.current?.focus();
    return () => {
      root.style.overflow = oldOverflow;
      prev?.focus?.();
    };
  }, [expanded]);

  /* 크게 보기 안 키보드: Esc 는 이 창만 닫는다(바깥 창으로 번지지 않게), Tab 은 안에서 돈다 */
  const onExpandedKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!expanded) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setExpanded(false);
      return;
    }
    if (e.key !== 'Tab') return;
    const root = wrapRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const readRange = () => {
    const el = v();
    if (!el) return;
    setDuration(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null);
    const s = el.seekable;
    setSeekable(s && s.length > 0 ? { start: s.start(0), end: s.end(s.length - 1) } : null);
  };

  const range = seekRange(duration, seekable);
  const seekTo = (t: number) => {
    const el = v();
    if (!el || !range) return;
    const to = clampTime(t, range);
    el.currentTime = to;
    setTime(to);
  };

  const expand = () => {
    const w = wrapRef.current;
    if (nativeFull) {
      void document.exitFullscreen?.().catch(() => undefined);
      return;
    }
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (w && document.fullscreenEnabled && w.requestFullscreen) {
      w.requestFullscreen().catch(() => setExpanded(true));
    } else setExpanded(true);
  };

  const errorText = (el: HTMLVideoElement) => {
    const code = el.error?.code;
    if (code === 2) return '네트워크가 끊겨 영상을 받지 못했어요.';
    if (code === 3) return '영상 파일을 읽지 못했어요.';
    if (code === 4) return '영상 주소가 만료됐거나 이 브라우저에서 열 수 없어요.';
    return '영상을 재생하지 못했어요.';
  };

  const big = expanded || nativeFull;
  const loadingFirst = want && !playing && !error && !blocked;
  return (
    <div
      ref={wrapRef}
      className={big ? 'fixed inset-0 z-50 flex flex-col justify-center bg-black p-3 outline-none sm:p-6' : ''}
      role={expanded ? 'dialog' : undefined}
      aria-label={expanded ? `${title} 크게 보기` : undefined}
      aria-modal={expanded || undefined}
      tabIndex={expanded ? -1 : undefined}
      onKeyDown={expanded ? onExpandedKey : undefined}
    >
      <div
        ref={stageRef}
        className={big ? 'relative min-h-0 w-full flex-1' : `relative ${frame}`}
        onClick={toggle}
        data-exercise-stage=""
      >
        <video
          ref={videoRef}
          src={url}
          poster={poster ?? undefined}
          loop={loop}
          muted
          playsInline
          preload="auto"
          aria-label={title}
          className="h-full w-full rounded-xl border border-line bg-black object-contain"
          onLoadedMetadata={() => {
            setReady(true);
            readRange();
            tryPlay();
          }}
          onCanPlay={() => {
            setBuffering(false);
            tryPlay();
          }}
          onDurationChange={readRange}
          onProgress={readRange}
          onTimeUpdate={(e) => {
            if (!scrub.current) setTime(e.currentTarget.currentTime);
          }}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => {
            setBuffering(false);
            const r = onProviderPlaying(intent.current, tracker.current, { acceptExternal: false });
            if (r.verdict === 'stop') {
              pauseElement();
              return;
            }
            setPlaying(true);
            setBlocked(false);
            activeExercisePlayer.activate(id, () => interrupt('other-player'));
          }}
          onPause={() => {
            setPlaying(false);
            // 우리가 시키지 않은 멈춤(브라우저 · 미디어 키 · 시스템)이면 의도도 멈춤 — 다음 한 번 누름이 재생이 되게.
            if (onProviderPaused(intent.current, tracker.current, !!scrub.current)) {
              ticket.current = null;
              syncWant();
            }
          }}
          onRateChange={(e) => setRateState(e.currentTarget.playbackRate)}
          onEnded={() => {
            if (!v()?.loop) { interrupt('user'); setPlaying(false); }
          }}
          onError={(e) => {
            setError(errorText(e.currentTarget));
            setPlaying(false);
            intent.current.pause('source');
            ticket.current = null;
            syncWant();
          }}
        />
        {(blocked || error) && (
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-black/50 p-4 text-center text-sm text-white">
            {error ? (
              <div className="space-y-3">
                <p>{error}</p>
                <button
                  type="button"
                  className="min-h-11 rounded-full bg-white/20 px-4 font-semibold"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry();
                  }}
                >
                  다시 불러오기
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="flex min-h-11 items-center gap-2 rounded-full bg-sky px-4 font-semibold"
                onClick={(e) => {
                  e.stopPropagation();
                  requestPlay();
                }}
              >
                <Play className="h-4 w-4 fill-current" />
                재생을 눌러 주세요
              </button>
            )}
          </div>
        )}
      </div>
      <div className={big ? 'mx-auto w-full max-w-3xl' : ''}>
        <ExerciseControls
          title={title}
          playing={want}
          ready={ready && !error}
          duration={duration}
          time={time}
          seekable={seekable}
          onToggle={toggle}
          onScrubStart={() => {
            const el = v();
            if (!el) return;
            scrub.current = beginScrub(intent.current, el.currentTime, scrub.current);
            syncWant();
            pauseElement();
          }}
          onScrubDraft={(t) => {
            const s = scrub.current;
            if (!s || s.ticket.interrupt !== intent.current.interrupt) return;
            s.draft = t;
            preview.current.request(() => seekTo(t));
          }}
          onScrubEnd={(commit, t) => {
            preview.current.cancel();
            const s = scrub.current;
            scrub.current = null;
            if (!s) return;
            if (commit) s.draft = t;
            const r = endScrub(intent.current, s, commit, range);
            if (r.seekTo != null) seekTo(r.seekTo);
            syncWant();
            if (r.resume) {
              ticket.current = intent.current.ticket();
              tryPlay();
            }
          }}
          onStep={(dir) => seekTo(stepTime(v()?.currentTime ?? 0, dir, range))}
          onEdge={(edge) => range && seekTo(edge === 'start' ? range.min : range.max)}
          loop={loop}
          onLoop={() => setLoop((on) => !on)}
          rates={[0.5, 1]}
          rate={rate}
          onRate={(r) => {
            const el = v();
            if (el) el.playbackRate = r;
          }}
          expanded={big}
          onExpand={expand}
          status={error ? '오류' : blocked ? '재생 막힘' : buffering || loadingFirst ? '불러오는 중' : null}
        />
      </div>
    </div>
  );
}
