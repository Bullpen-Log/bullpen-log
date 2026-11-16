'use client';

import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Maximize2, Minimize2, Pause, Play } from '@/components/icon';
import styles from './guide-player.module.css';

export const guideTime = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
export const guideSeek = (time: number, duration: number) =>
  Math.min(guideTime(duration), Math.max(0, guideTime(time)));

/** 안내 전용: 원래 비율 · 자동 무음 재생 · 정지/재생 · 탐색 · 전체화면만 제공한다. */
export function GuidePlayer({
  src,
  poster,
  title,
  paused = false,
  controlsTopUntil = 0,
}: {
  src: string;
  poster?: string;
  title: string;
  paused?: boolean;
  controlsTopUntil?: number;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const userPaused = useRef(false);
  const externalPaused = useRef(paused);
  useLayoutEffect(() => {
    externalPaused.current = paused;
  }, [paused]);
  const resumeScrub = useRef(false);
  const [aspect, setAspect] = useState(590 / 1196);
  const [scrubAtTop, setScrubAtTop] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const play = () => {
    const el = video.current;
    if (!el || externalPaused.current || document.visibilityState === 'hidden') return;
    if (el.ended) el.currentTime = 0;
    void el.play().then(
      () => setBlocked(false),
      () => {
        setPlaying(false);
        setBlocked(true);
      }
    );
  };
  useEffect(() => {
    const el = video.current;
    const visibility = () => {
      if (document.visibilityState === 'hidden') video.current?.pause();
      else if (!userPaused.current) play();
    };
    const stop = () => video.current?.pause();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', stop);
    play();
    return () => {
      el?.pause();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', stop);
    };
    // src/재시도마다 새 안내만 시작한다. 사용자가 누른 정지는 유지한다.
  }, [src, attempt]);
  useEffect(() => {
    if (paused) video.current?.pause();
    else if (!userPaused.current) play();
  }, [paused]);
  useEffect(() => {
    const change = () => {
      if (!document.fullscreenElement) setExpanded(false);
    };
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  const closeFull = () => {
    if (document.fullscreenElement === box.current)
      void document.exitFullscreen().catch(() => {});
    setExpanded(false);
    expandButton.current?.focus({ preventScroll: true });
  };
  return (
    <div
      ref={box}
      className={`${styles.player} ${expanded ? styles.expanded : ''}`}
      role={expanded ? 'dialog' : 'group'}
      aria-modal={expanded || undefined}
      aria-label={`${title} 안내 영상`}
      data-guide-player=""
      onKeyDown={(e) => {
        if (!expanded) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          closeFull();
        }
        if (e.key === 'Tab') {
          const controls = box.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled)'
          );
          if (!controls?.length) return;
          const first = controls[0],
            last = controls[controls.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }}
    >
      {failed ? (
        <div className={styles.error}>
          <p>안내 영상을 불러오지 못했습니다. 아래 설명을 따라 진행합니다.</p>
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            다시 재생
          </button>
        </div>
      ) : (
        <div
          className={styles.picture}
          style={{ '--guide-aspect': aspect } as CSSProperties}
        >
          <video
            key={`${src}-${attempt}`}
            ref={video}
            src={src}
            poster={poster}
            autoPlay
            muted
            playsInline
            preload="metadata"
            aria-label={title}
            controlsList="nodownload noplaybackrate noremoteplayback"
            disablePictureInPicture
            onPlay={() => {
              setPlaying(true);
              setBlocked(false);
            }}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onLoadedMetadata={({ currentTarget: el }) => {
              setDuration(guideTime(el.duration));
              if (el.videoWidth && el.videoHeight)
                setAspect(el.videoWidth / el.videoHeight);
            }}
            onDurationChange={(e) => setDuration(guideTime(e.currentTarget.duration))}
            onTimeUpdate={(e) => setTime(guideTime(e.currentTarget.currentTime))}
            onError={() => {
              setPlaying(false);
              setFailed(true);
            }}
          />
          <div
            className={styles.controls}
            data-top={(scrubAtTop ?? time < controlsTopUntil) || undefined}
          >
            <button
              type="button"
              aria-label={playing ? '안내 영상 정지' : '안내 영상 재생'}
              disabled={failed}
              onClick={() => {
                const el = video.current;
                if (!el) return;
                if (!el.paused) {
                  userPaused.current = true;
                  el.pause();
                } else {
                  userPaused.current = false;
                  play();
                }
              }}
            >
              {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
            </button>
            <input
              type="range"
              min="0"
              max={duration || 1}
              step="0.01"
              value={Math.min(time, duration || 1)}
              disabled={failed || duration === 0}
              aria-label="안내 영상 재생 위치"
              aria-valuetext={`${time.toFixed(1)}초 / ${duration.toFixed(1)}초`}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setScrubAtTop(time < controlsTopUntil);
                resumeScrub.current = video.current?.paused === false;
                video.current?.pause();
              }}
              onChange={(e) => {
                const next = guideSeek(Number(e.currentTarget.value), duration);
                if (video.current) video.current.currentTime = next;
                setTime(next);
              }}
              onPointerUp={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  e.currentTarget.releasePointerCapture(e.pointerId);
                if (resumeScrub.current && !userPaused.current) play();
                resumeScrub.current = false;
                setScrubAtTop(null);
              }}
              onPointerCancel={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  e.currentTarget.releasePointerCapture(e.pointerId);
                if (resumeScrub.current && !userPaused.current) play();
                resumeScrub.current = false;
                setScrubAtTop(null);
              }}
            />
            <button
              ref={expandButton}
              type="button"
              aria-label={expanded ? '안내 영상 전체화면 닫기' : '안내 영상 전체화면'}
              onClick={() => {
                if (expanded) {
                  closeFull();
                  return;
                }
                setExpanded(true);
                /* iPhone의 요소 전체화면 미지원 시에도 같은 플레이어를 화면 가득 표시한다. */
                try {
                  const promise = box.current?.requestFullscreen?.();
                  if (promise) void promise.catch(() => {});
                } catch {
                  /* 미지원 환경에서도 같은 조작부로 화면을 채운다. */
                }
              }}
            >
              {expanded ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
            </button>
          </div>
        </div>
      )}
      {failed && expanded && (
        <button className={styles.exitError} type="button" onClick={closeFull}>
          전체화면 닫기
        </button>
      )}
      {blocked && !failed && (
        <span className="sr-only" role="status">
          재생 버튼을 누르면 안내가 시작됩니다.
        </span>
      )}
    </div>
  );
}
