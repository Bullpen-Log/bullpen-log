'use client';

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  AlertTriangle,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Upload,
  VolumeX,
  X,
} from 'lucide-react';
import { captureThumbnail } from '@/lib/capture-thumbnail';
import { haptic } from '@/lib/haptics';
import {
  clampTrim,
  clipTimeText,
  estimateBytes,
  initialTrim,
  lowResolution,
  pickTarget,
  sizeText,
  snapTime,
  type ClipInfo,
} from '@/lib/clip/plan';
import type { ExportedClip } from '@/lib/clip/edit';
import { useWakeLock } from '@/components/use-wake-lock';

/** 편집 띠의 작은 장면 수 */
const THUMBS = 10;

/** kept — 폰에 맡겨 두었나(실패해도 닫은 뒤 다시 올릴 수 있나) */
export type ClipSubmitResult = { ok: true } | { ok: false; error: string; kept?: boolean };
/** 다 만든 소리 없는 영상을 넘겨받아 올린다 — 진행(0~1)을 report 로 알린다. 성공하면 부르는 쪽이 창을 닫는다 */
export type ClipSubmit = (
  clip: ExportedClip,
  thumb: Blob | null,
  report: (p: number) => void
) => Promise<ClipSubmitResult>;

type EditModule = typeof import('@/lib/clip/edit');

type Phase =
  | { kind: 'edit' }
  /** shrink — 크기가 넘어 한 번 더 줄이는 중 */
  | { kind: 'export'; p: number; shrink: boolean }
  | { kind: 'upload'; p: number }
  | {
      kind: 'failed';
      error: string;
      /** 만든 것이 있으면 다시 올리기만 하면 된다 */
      clip: ExportedClip | null;
      thumb: Blob | null;
      /** 폰에 맡겨 두었나 */
      kept: boolean;
    };

/** 첫 장면 이미지를 기다리는 한도 — 못 뜨면 이미지 없이 올린다 */
const THUMB_WAIT_MS = 5000;

/** 손잡이를 잡는 거리(px) — 손가락 하나 너비의 절반쯤 */
const GRAB_PX = 24;

/**
 * 짧은 영상 컷 편집 창 — 찍은(고른) 영상의 앞뒤를 잘라 **소리 없이** 올린다. 화면 가득 검은 바탕(사진 앱처럼).
 *
 * 위: 운동 번호 · 이름, '소리 없음'. 가운데: 영상(누르면 재생 — 자른 구간만 돈다). 아래: 장면 띠와 시작 · 끝 손잡이(끌거나
 * 화살표 키), '여기서 시작 · 여기서 끝'(재생 중 멈춘 자리로), [다시 찍기][올리기]. 올리기를 누르면 소리 빼고 자르기(lib/clip/edit.ts)
 * → 올리기(부르는 쪽)의 진행을 같은 자리에서 보인다. 실패하면 까닭과 [다시 올리기].
 *
 * <dialog> 라 뒤 화면이 잠기고(html:has(dialog:modal)) ESC 로 닫힌다 — 만드는 · 올리는 중에는 닫히지 않는다.
 */
export function ClipEditor({
  open,
  file,
  loading = null,
  fileKey,
  title,
  cue,
  from,
  onClose,
  onRetake,
  onSubmit,
  children,
}: {
  open: boolean;
  file: File | null;
  /** 파일을 아직 받는 중(앱 카메라에서 넘겨받기, 0~1) — file 이 null 일 때 '가져오는 중'을 보인다 */
  loading?: number | null;
  /** 새 파일마다 바뀌는 값 — 편집 상태를 처음부터 */
  fileKey: string | number;
  /** '1-24 하프닐링 레터럴 레이즈' */
  title: string;
  /** 시범 방법 '3회 · 한쪽' */
  cue?: string;
  /** 어디서 왔나 — 앨범 · 앱 카메라 */
  from: 'album' | 'native';
  onClose: () => void;
  onRetake?: () => void;
  onSubmit: ClipSubmit;
  /** 창 안에 같이 둘 것 — 숨은 파일 고르기. 열린 창 밖은 눌리지 않아(inert) [다시 찍기]가 카메라를 못 연다 */
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  useWakeLock(open);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={`영상 자르기 — ${title}`}
      onCancel={(e) => {
        // 안의 파일 고르기(다시 찍기)를 취소해도 cancel 이 올라온다 — 창 자신의 것(ESC · 뒤로)만 받는다
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        if (!busy.current) onClose();
      }}
      onClose={(e) => {
        // 브라우저가 스스로 닫았다(안드로이드 뒤로 등) — 만드는 · 올리는 중이면 다시 연다, 아니면 상태를 맞춘다
        if (e.target !== e.currentTarget || !open) return;
        if (busy.current) e.currentTarget.showModal();
        else onClose();
      }}
      className="theme-dark m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-black p-0 text-ink backdrop:bg-black/70 desk:m-auto desk:h-[min(54rem,94dvh)] desk:w-[min(64rem,94vw)] desk:rounded-3xl"
    >
      {children}
      {!file && loading !== null && (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-center">
          <Loader2 aria-hidden className="h-8 w-8 animate-spin text-muted" />
          <p className="text-sm font-semibold text-ink" role="status" aria-live="polite">
            {loading > 0 ? `영상을 가져오는 중 ${Math.round(loading * 100)}%` : '카메라에서 찍는 중'}
          </p>
          <p className="text-xs text-muted">{title}</p>
        </div>
      )}
      {file && (
        <EditorBody
          key={fileKey}
          file={file}
          title={title}
          cue={cue}
          from={from}
          onClose={onClose}
          onRetake={onRetake}
          onSubmit={onSubmit}
          onBusy={(b) => {
            busy.current = b;
          }}
        />
      )}
    </dialog>
  );
}

function EditorBody({
  file,
  title,
  cue,
  from,
  onClose,
  onRetake,
  onSubmit,
  onBusy,
}: {
  file: File;
  title: string;
  cue?: string;
  from: 'album' | 'native';
  onClose: () => void;
  onRetake?: () => void;
  onSubmit: ClipSubmit;
  onBusy: (busy: boolean) => void;
}) {
  const [info, setInfo] = useState<ClipInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<(string | null)[]>([]);
  const [trim, setTrim] = useState({ start: 0, end: 0 });
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [dragging, setDragging] = useState<'start' | 'end' | 'scrub' | null>(null);
  /** 영상이 아직 앞 자리로 옮기는 중일 때 들어온 마지막 자리 — 옮기기가 끝나면(seeked) 그리로. 아이폰 WebKit 은 옮기는 중에 새 자리를 주면 앞의 것을 버려 끄는 동안 화면이 멈춰 보였다 */
  const pendingSeek = useRef<number | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'edit' });
  const videoRef = useRef<HTMLVideoElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const modRef = useRef<EditModule | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const trimRef = useRef(trim);
  useEffect(() => {
    trimRef.current = trim;
  }, [trim]);

  /* 영상 읽기 · 장면 띠 — 편집 모듈(mediabunny)은 이 창을 열 때 불러온다 */
  useEffect(() => {
    let alive = true;
    const urls: string[] = [];
    (async () => {
      try {
        const m = await import('@/lib/clip/edit');
        modRef.current = m;
        const i = await m.probeClip(file);
        if (!alive) return;
        setInfo(i);
        setTrim(initialTrim(i.duration));
        for await (const t of m.clipThumbnails(file, i, THUMBS)) {
          if (!alive) break;
          const url = t.blob ? URL.createObjectURL(t.blob) : null;
          if (url) urls.push(url);
          setThumbs((prev) => {
            const next = [...prev];
            next[t.index] = url;
            return next;
          });
        }
      } catch (err) {
        if (!alive) return;
        const m = modRef.current;
        setLoadError(m ? m.clipErrorText(err) : '편집 도구를 불러오지 못했어요. 연결을 확인해 주세요.');
      }
    })();
    return () => {
      alive = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [file]);

  /* 미리보기 — 원본에는 소리가 있지만 늘 음소거로 본다 */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const url = URL.createObjectURL(file);
    v.src = url;
    return () => {
      v.pause();
      v.removeAttribute('src');
      v.load();
      URL.revokeObjectURL(url);
    };
  }, [file]);

  /* 재생 중 — 재생 막대를 따라가고, 끝 손잡이에 닿으면 시작으로(자른 구간만 돈다) */
  useEffect(() => {
    if (!playing) return;
    const v = videoRef.current;
    if (!v) return;
    let id = 0;
    const tick = () => {
      const { start, end } = trimRef.current;
      if (v.currentTime >= end - 0.03 || v.currentTime < start - 0.05) {
        v.currentTime = start;
      }
      setTime(v.currentTime);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing]);

  const duration = info?.duration ?? 0;
  const busy = phase.kind === 'export' || phase.kind === 'upload';
  const length = Math.max(0, trim.end - trim.start);
  const target = info ? pickTarget(info, length) : null;
  const estimate = target ? estimateBytes(target.bitrate, length) : 0;
  /** 720p 보다 작으면 올리지 않는다 — 웹 카메라(480×360) 영상이 라이브러리에 들어가지 않게 */
  const lowRes = info ? lowResolution(info) : false;

  function seek(t: number) {
    const v = videoRef.current;
    if (v && Number.isFinite(t)) {
      if (v.seeking) pendingSeek.current = t;
      else v.currentTime = t;
    }
    setTime(t);
  }

  function onSeeked() {
    const v = videoRef.current;
    const t = pendingSeek.current;
    pendingSeek.current = null;
    if (v && t !== null && Math.abs(v.currentTime - t) > 0.001) v.currentTime = t;
  }

  function pause() {
    videoRef.current?.pause();
    setPlaying(false);
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v || !info || busy) return;
    if (playing) {
      pause();
      return;
    }
    if (v.currentTime < trim.start || v.currentTime >= trim.end - 0.05) {
      v.currentTime = trim.start;
    }
    void v
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  }

  function timeAt(clientX: number): number {
    const r = stripRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 0;
    return (Math.min(Math.max(clientX - r.left, 0), r.width) / r.width) * duration;
  }

  function moveHandle(which: 'start' | 'end', t: number) {
    const next = clampTrim(
      which === 'start' ? t : trim.start,
      which === 'end' ? t : trim.end,
      duration,
      which
    );
    if (next.start !== trim.start || next.end !== trim.end) {
      setTrim(next);
      seek(which === 'start' ? next.start : next.end);
    }
  }

  /**
   * 띠를 누르면 — 손잡이 가까이(GRAB_PX 안)면 더 가까운 손잡이를 끈다(구간이 짧아 둘이 겹쳐도 누른 쪽이 잡힌다),
   * 아니면 그 자리로 옮긴다(구간 안으로).
   */
  function stripDown(e: PointerEvent<HTMLDivElement>) {
    if (!info || busy) return;
    const r = stripRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const px = e.clientX - r.left;
    const sx = (trim.start / duration) * r.width;
    const ex = (trim.end / duration) * r.width;
    const ds = Math.abs(px - sx);
    const de = Math.abs(px - ex);
    pause();
    if (Math.min(ds, de) <= GRAB_PX) {
      // 같은 거리면 바깥쪽 — 시작보다 왼쪽이면 시작, 끝보다 오른쪽이면 끝, 가운데면 가까운 쪽
      const which: 'start' | 'end' =
        ds < de || (ds === de && px <= (sx + ex) / 2) ? 'start' : 'end';
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(which);
      haptic('selection');
      return;
    }
    /* 손잡이가 아니면 재생 자리를 손가락으로 끌어 본다 */
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging('scrub');
    seek(Math.min(Math.max(timeAt(e.clientX), trim.start), trim.end));
  }

  function stripMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    if (dragging === 'scrub') {
      seek(Math.min(Math.max(timeAt(e.clientX), trim.start), trim.end));
      return;
    }
    moveHandle(dragging, snapTime(timeAt(e.clientX)));
  }

  function stripUp() {
    if (!dragging) return;
    setDragging(null);
    haptic('light');
  }

  const handleProps = (which: 'start' | 'end') => ({
    role: 'slider' as const,
    tabIndex: 0,
    'aria-label': which === 'start' ? '시작 자리' : '끝 자리',
    'aria-valuemin': 0,
    'aria-valuemax': Math.round(duration * 10) / 10,
    'aria-valuenow': which === 'start' ? trim.start : trim.end,
    'aria-valuetext': clipTimeText(which === 'start' ? trim.start : trim.end),
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      if (busy || !info) return;
      const step = e.shiftKey ? 1 : 0.1;
      const now = which === 'start' ? trim.start : trim.end;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        pause();
        moveHandle(which, snapTime(now - step));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        pause();
        moveHandle(which, snapTime(now + step));
      }
    },
  });

  function setHere(which: 'start' | 'end') {
    if (!info || busy) return;
    pause();
    const t = snapTime(videoRef.current?.currentTime ?? time);
    const next = clampTrim(
      which === 'start' ? t : trim.start,
      which === 'end' ? t : trim.end,
      duration,
      which
    );
    setTrim(next);
    seek(which === 'start' ? next.start : next.end);
    haptic('selection');
  }

  async function upload(clip: ExportedClip, thumb: Blob | null) {
    setPhase({ kind: 'upload', p: 0 });
    onBusy(true);
    const res = await onSubmit(clip, thumb, (p) =>
      setPhase((ph) => (ph.kind === 'upload' ? { kind: 'upload', p } : ph))
    );
    onBusy(false);
    if (!res.ok) {
      setPhase({ kind: 'failed', error: res.error, clip, thumb, kept: !!res.kept });
    }
  }

  async function submit() {
    const m = modRef.current;
    if (!info || !m || busy || lowRes) return;
    pause();
    haptic('medium');
    const ac = new AbortController();
    abortRef.current = ac;
    onBusy(true);
    setPhase({ kind: 'export', p: 0, shrink: false });
    let clip: ExportedClip;
    try {
      clip = await m.exportMutedClip(file, trim, {
        signal: ac.signal,
        onProgress: (p, stage) =>
          setPhase((ph) =>
            ph.kind === 'export' ? { kind: 'export', p, shrink: stage === 'shrink' } : ph
          ),
      });
    } catch (err) {
      onBusy(false);
      if (err instanceof m.ConversionCanceledError || ac.signal.aborted) {
        setPhase({ kind: 'edit' });
        return;
      }
      setPhase({
        kind: 'failed',
        error: m.clipErrorText(err),
        clip: null,
        thumb: null,
        kept: false,
      });
      return;
    } finally {
      abortRef.current = null;
    }
    // 여기부터는 취소가 없다 — 바로 '올리는 중'으로 바꾸고, 썸네일은 잠깐만 기다린다.
    // 썸네일은 자른 영상의 가운데 장면 — 운동하는 모습(앞쪽은 준비 자세라 목록에서 다 비슷해 보였다)
    setPhase({ kind: 'upload', p: 0 });
    const thumb = await Promise.race([
      captureThumbnail(clip.file, clip.duration / 2).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), THUMB_WAIT_MS)),
    ]);
    await upload(clip, thumb);
  }

  const x = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);

  return (
    <div className="flex h-full flex-col pt-[env(safe-area-inset-top)] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {/* ── 위 ── */}
      <header className="flex shrink-0 items-center gap-2 px-2 py-2">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="닫기"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink hover:bg-white/10 disabled:opacity-40"
        >
          <X aria-hidden className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{title}</p>
          <p className="truncate text-xs text-muted">
            {cue ? `시범 ${cue} · ` : ''}앞뒤를 잘라 올려요
          </p>
        </div>
        <span className="mr-2 inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-ink">
          <VolumeX aria-hidden className="h-3.5 w-3.5" />
          소리 없음
        </span>
      </header>

      {/* ── 영상 ── */}
      <div className="relative min-h-0 flex-1 bg-black">
        <video
          ref={videoRef}
          muted
          playsInline
          preload="auto"
          onClick={togglePlay}
          onPause={() => setPlaying(false)}
          onLoadedData={() => seek(trimRef.current.start)}
          onSeeked={onSeeked}
          className="absolute inset-0 h-full w-full object-contain"
        />
        {!info && !loadError && (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 aria-label="영상을 여는 중" className="h-8 w-8 animate-spin text-muted" />
          </div>
        )}
        {info && phase.kind === 'edit' && !playing && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label="자른 구간 재생"
            className="motion-safe:animate-fade-in absolute top-1/2 left-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md transition-transform motion-safe:active:scale-90"
          >
            <Play aria-hidden className="ml-1 h-7 w-7" fill="currentColor" />
          </button>
        )}
        {(busy || phase.kind === 'failed' || loadError) && (
          <div className="motion-safe:animate-fade-in absolute inset-0 grid place-items-center bg-black/70 px-6 backdrop-blur-sm">
            <div className="w-full max-w-xs space-y-3 text-center" role="status" aria-live="polite">
              {busy && (
                <>
                  <p className="text-base font-bold text-ink">
                    {phase.kind === 'export'
                      ? phase.shrink
                        ? '조금 더 작게 만드는 중'
                        : '소리 빼고 자르는 중'
                      : '올리는 중'}
                  </p>
                  <p className="text-numeric text-3xl text-ink">
                    {Math.round(phase.p * 100)}%
                  </p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                    <div
                      className="h-full rounded-full bg-sky transition-[width] duration-300 ease-out"
                      style={{ width: `${Math.round(phase.p * 100)}%` }}
                    />
                  </div>
                  {phase.kind === 'export' && (
                    <button
                      type="button"
                      onClick={() => abortRef.current?.abort()}
                      className="min-h-11 rounded-full px-5 text-sm font-semibold text-muted hover:bg-white/10"
                    >
                      취소
                    </button>
                  )}
                  {phase.kind === 'upload' && (
                    <p className="text-xs text-muted">화면을 끄지 마세요</p>
                  )}
                </>
              )}
              {(phase.kind === 'failed' || loadError) && (
                <>
                  <AlertTriangle aria-hidden className="mx-auto h-8 w-8 text-warn" />
                  <p className="text-sm font-semibold break-keep text-ink">
                    {loadError ?? (phase.kind === 'failed' ? phase.error : '')}
                  </p>
                  {phase.kind === 'failed' && phase.clip && (
                    <p
                      className={`text-xs break-keep ${phase.kept ? 'text-muted' : 'font-semibold text-warn'}`}
                    >
                      {phase.kept
                        ? '만든 영상은 폰에 맡겨 두었어요. 닫아도 촬영 화면 위에서 다시 올릴 수 있어요.'
                        : '폰에 저장하지 못했어요 — 닫으면 이 영상이 사라져요. 여기서 다시 올려 주세요.'}
                    </p>
                  )}
                  <div className="flex justify-center gap-2 pt-1">
                    {phase.kind === 'failed' && (
                      <button
                        type="button"
                        onClick={() =>
                          phase.clip
                            ? void upload(phase.clip, phase.thumb)
                            : setPhase({ kind: 'edit' })
                        }
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-sky px-5 text-sm font-bold text-white"
                      >
                        <RotateCcw aria-hidden className="h-4 w-4" />
                        {phase.clip ? '다시 올리기' : '다시 하기'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onClose}
                      className="min-h-11 rounded-full bg-white/10 px-5 text-sm font-semibold text-ink"
                    >
                      닫기
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 자르기 ── */}
      <section className="shrink-0 space-y-3 px-4 pt-3" aria-label="자를 구간">
        {lowRes && info && (
          <p
            role="alert"
            className="flex gap-2 rounded-xl bg-warn/15 px-3 py-2 text-xs break-keep text-warn"
          >
            <AlertTriangle aria-hidden className="mt-px h-4 w-4 shrink-0" />
            화질이 낮아({info.width}×{info.height}) 올리지 않아요. 앱 카메라로 다시 찍어 주세요 — 웹 카메라로 찍은 영상은 이렇게
            작아요.
          </p>
        )}
        <div className="flex items-baseline justify-between text-xs tabular-nums text-muted">
          <span>{clipTimeText(trim.start)}</span>
          <span className="text-sm font-semibold text-ink">
            {length.toFixed(1)}초
            {info && <span className="ml-1.5 text-xs font-normal text-muted">약 {sizeText(estimate)}</span>}
          </span>
          <span>{clipTimeText(trim.end)}</span>
        </div>

        {/* 장면 띠 — 누르면 그 자리로, 양끝 손잡이를 끌어 자른다 */}
        <div
          ref={stripRef}
          onPointerDown={stripDown}
          onPointerMove={stripMove}
          onPointerUp={stripUp}
          onPointerCancel={stripUp}
          className="relative h-14 touch-none select-none"
        >
          <div className="absolute inset-0 flex overflow-hidden rounded-lg bg-white/8">
            {Array.from({ length: THUMBS }, (_, i) =>
              thumbs[i] ? (
                // eslint-disable-next-line @next/next/no-img-element -- 방금 만든 blob 그림
                <img
                  key={i}
                  src={thumbs[i]!}
                  alt=""
                  className="motion-safe:animate-fade-in h-full min-w-0 flex-1 object-cover"
                />
              ) : (
                <span key={i} className="h-full min-w-0 flex-1 border-r border-black/40" />
              )
            )}
          </div>
          {info && (
            <>
              {/* 잘려 나갈 곳은 어둡게 */}
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 rounded-l-lg bg-black/65"
                style={{ width: `${x(trim.start)}%` }}
              />
              <div
                aria-hidden
                className="absolute inset-y-0 right-0 rounded-r-lg bg-black/65"
                style={{ width: `${100 - x(trim.end)}%` }}
              />
              {/* 고른 구간 테 */}
              <div
                aria-hidden
                className="absolute inset-y-0 border-y-[3px] border-sky"
                style={{ left: `${x(trim.start)}%`, right: `${100 - x(trim.end)}%` }}
              />
              {/* 재생 막대 */}
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-white shadow"
                style={{ left: `${x(time)}%` }}
              />
              {(['start', 'end'] as const).map((which) => (
                <div
                  key={which}
                  {...handleProps(which)}
                  className="group pointer-events-none absolute inset-y-0 z-10 flex w-11 -translate-x-1/2 items-stretch justify-center outline-none"
                  style={{ left: `${x(which === 'start' ? trim.start : trim.end)}%` }}
                >
                  <span
                    className={`grid w-4 place-items-center bg-sky transition-transform duration-150 group-focus-visible:ring-2 group-focus-visible:ring-white ${
                      which === 'start' ? 'translate-x-1.5 rounded-l-lg' : '-translate-x-1.5 rounded-r-lg'
                    } ${dragging === which ? 'scale-y-110' : ''}`}
                  >
                    <span className="h-5 w-0.5 rounded-full bg-white/90" />
                  </span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="grid grid-cols-3 items-center gap-2">
          <button
            type="button"
            onClick={() => setHere('start')}
            disabled={!info || busy}
            className="min-h-11 rounded-xl bg-white/8 px-2 text-xs font-semibold text-ink disabled:opacity-40"
          >
            여기서 시작
          </button>
          <button
            type="button"
            onClick={togglePlay}
            disabled={!info || busy}
            aria-label={playing ? '멈춤' : '자른 구간 재생'}
            className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white/12 text-ink disabled:opacity-40"
          >
            {playing ? (
              <Pause aria-hidden className="h-5 w-5" fill="currentColor" />
            ) : (
              <Play aria-hidden className="ml-0.5 h-5 w-5" fill="currentColor" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setHere('end')}
            disabled={!info || busy}
            className="min-h-11 rounded-xl bg-white/8 px-2 text-xs font-semibold text-ink disabled:opacity-40"
          >
            여기서 끝
          </button>
        </div>
      </section>

      {/* ── 아래 ── */}
      <footer className="flex shrink-0 gap-2 px-4 pt-3">
        {onRetake && (
          <button
            type="button"
            onClick={onRetake}
            disabled={busy}
            className="min-h-14 shrink-0 rounded-full bg-white/10 px-5 text-sm font-semibold text-ink disabled:opacity-40"
          >
            {from === 'album' ? '다른 영상' : '다시 찍기'}
          </button>
        )}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!info || busy || !!loadError || lowRes}
          className="inline-flex min-h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-sky text-base font-bold text-white transition-transform disabled:opacity-40 motion-safe:active:scale-[0.98]"
        >
          {busy ? (
            <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
          ) : (
            <Upload aria-hidden className="h-5 w-5" />
          )}
          올리기
        </button>
      </footer>
    </div>
  );
}
