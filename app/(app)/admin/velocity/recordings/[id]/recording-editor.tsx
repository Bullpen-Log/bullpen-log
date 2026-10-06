'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  EyeOff,
  Gauge,
  Loader2,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  Trash2,
} from 'lucide-react';
import {
  deleteRecordingCut,
  saveRecordingCut,
  saveRecordingCutResult,
  saveRecordingMemo,
} from '@/app/actions/velocity-recording';
import { Badge, Button, Card } from '@/components/ui';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { analyzeVideo, DEFAULT_FOV_DEG } from '@/lib/velocity-engine/analyze-video';
import { reject as rejection, type RejectCode } from '@/lib/velocity-engine/validate';
import { analysisOf } from '@/lib/velocity-analysis';
import { approachOf } from '@/lib/velocity-setup';
import { PITCH_TYPES, pitchTypeLabel } from '@/lib/velocity-meta';
import type {
  RecordingCutRow,
  RecordingDetail,
  RecordingPartRow,
} from '@/lib/velocity-recording-load';

/**
 * 엔진 개발용 녹화 편집기 — 2026-10-03 사용자: "녹화를 구속 측정 관리자에서 클립 형태로 공별로 나눠 구속이 몇이었는지 기록".
 *
 * 왼쪽(휴대폰은 위): 지금 조각의 영상 · 조각 고르기 · 시간 막대(공 범위가 파란 띠) · 재생 단추(1프레임 · 1초 · 느리게).
 * '공 표시'를 누르면 지금 시각을 손에서 떠난 때로 보고 앞 0.6 · 뒤 1.4초를 공 하나로 잡는다(조각 안으로 자른다).
 * 오른쪽(아래): 공 목록 — 스피드건 값 · 구종 · 범위 손질 · 이 범위만 되풀이해 보기 · 지금 모델로 재기 · 빼기 · 지우기.
 * 재기는 이 브라우저가 조각 파일을 내려받아 그 범위만 영상 파일 엔진에 넘긴다(녹화 때의 화각 · 렌즈 보정 · 카메라 위치로).
 *
 * 키보드(입력칸 밖): 스페이스 재생 · ←/→ 1프레임 · Shift+←/→ 1초 · M 공 표시.
 */

const PRE_SEC = 0.6;
const POST_SEC = 1.4;

type Cut = RecordingCutRow & { tmp?: boolean };
type Busy = { kind: 'save' | 'measure'; progress?: number };

const sec1 = (s: number) => s.toFixed(2);
const clock = (s: number) => {
  if (!Number.isFinite(s)) return '—';
  const t = Math.max(0, s);
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`;
};
const signed = (v: number) =>
  `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(1)}`;

function rejectText(code: string | null) {
  if (!code) return '못 쟀어요';
  try {
    return rejection(code as RejectCode).message;
  } catch {
    return `못 쟀어요(${code})`;
  }
}

export function RecordingEditor({
  detail,
  engineVersion,
}: {
  detail: RecordingDetail;
  engineVersion: string;
}) {
  const { meta, parts } = detail;
  const fps = meta.camera?.measuredFps ?? meta.camera?.frameRate ?? 60;
  const approach = approachOf({ cameraPos: meta.cameraPos });

  const [cuts, setCuts] = useState<Cut[]>(detail.cuts);
  const [partId, setPartId] = useState<string | null>(parts[0]?.id ?? null);
  const part = parts.find((p) => p.id === partId) ?? null;
  const [t, setT] = useState(0);
  const [dur, setDur] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [loop, setLoop] = useState<{ start: number; end: number } | null>(null);
  const [busy, setBusy] = useState<Record<string, Busy>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [gunDraft, setGunDraft] = useState<Record<string, string>>({});
  const [memo, setMemo] = useState(detail.memo ?? '');
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const blobs = useRef(new Map<string, Blob>());
  const loopRef = useRef(loop);
  const draggingRef = useRef(false);
  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(id);
  }, [msg]);

  /* 재생 중에는 화면 주기마다 시각을 읽는다(timeupdate 는 1초에 네 번뿐) — 되풀이 범위도 여기서 지킨다 */
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const step = () => {
      const v = videoRef.current;
      if (v) {
        const l = loopRef.current;
        if (l && v.currentTime >= l.end) v.currentTime = l.start;
        setT(v.currentTime);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = rate;
  }, [rate, partId]);

  /* MediaRecorder 파일은 길이를 안 적어 Infinity 로 읽힐 때가 있다 — 끝으로 한 번 보내 길이를 알아낸다 */
  const onMeta = () => {
    const v = videoRef.current;
    if (!v) return;
    if (Number.isFinite(v.duration) && v.duration > 0) {
      setDur(v.duration);
      return;
    }
    const fix = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) {
        v.removeEventListener('durationchange', fix);
        setDur(v.duration);
        v.currentTime = 0;
      }
    };
    v.addEventListener('durationchange', fix);
    v.currentTime = 1e9;
  };

  const seek = (to: number) => {
    const v = videoRef.current;
    if (!v) return;
    const max = dur ?? v.duration;
    const next = Math.max(0, Math.min(Number.isFinite(max) ? max : to, to));
    v.currentTime = next;
    setT(next);
  };
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  };
  const stepFrames = (n: number) => {
    videoRef.current?.pause();
    seek((videoRef.current?.currentTime ?? t) + n / fps);
  };

  const choosePart = (id: string) => {
    if (id === partId) return;
    videoRef.current?.pause();
    setPartId(id);
    setDur(null);
    setT(0);
    setLoop(null);
  };

  /* ── 공 남기기 ── */
  const persist = async (c: Cut): Promise<string | null> => {
    setBusy((b) => ({ ...b, [c.id]: { kind: 'save' } }));
    const res = await orOffline(
      saveRecordingCut({
        id: c.tmp ? null : c.id,
        recordingId: detail.id,
        partId: c.partId,
        startSec: c.startSec,
        endSec: c.endSec,
        eventSec: c.eventSec,
        gunKmh: c.gunKmh,
        pitchType: c.pitchType,
        memo: c.memo,
        excluded: c.excluded,
      }),
      { ok: false as const, error: OFFLINE_MESSAGE }
    );
    setBusy((b) => {
      const next = { ...b };
      delete next[c.id];
      return next;
    });
    if (!res.ok) {
      setMsg(res.error);
      return null;
    }
    if (c.tmp) {
      const later = afterCreate.current.get(c.id);
      afterCreate.current.delete(c.id);
      if (later === 'deleted') {
        void orOffline(deleteRecordingCut(res.id), null);
        return null;
      }
      setCuts((list) =>
        list.map((x) => (x.id === c.id ? { ...x, id: res.id, tmp: false } : x))
      );
      setSelected((s) => (s === c.id ? res.id : s));
      setGunDraft((d) => {
        if (d[c.id] == null) return d;
        const next = { ...d, [res.id]: d[c.id] };
        delete next[c.id];
        return next;
      });
      if (later) void persist({ ...later, id: res.id, tmp: false });
    }
    return res.id;
  };

  /*
   * 막 표시한 공(서버 번호를 아직 못 받음)을 그새 고치거나 지우면 — 받은 뒤에 이어서 한다(먼저 보내면 줄이 둘 생긴다).
   * 열쇠는 임시 번호.
   */
  const afterCreate = useRef(new Map<string, Cut | 'deleted'>());
  /** 막 표시한 공의 임시 번호 */
  const tmpSeq = useRef(0);

  const update = (id: string, patch: Partial<Cut>) => {
    const c = cuts.find((x) => x.id === id);
    if (!c) return;
    const moved =
      (patch.startSec != null && patch.startSec !== c.startSec) ||
      (patch.endSec != null && patch.endSec !== c.endSec);
    const next: Cut = {
      ...c,
      ...patch,
      ...(moved
        ? {
            ok: null,
            rawKmh: null,
            releaseKmh: null,
            errorKmh: null,
            reject: null,
            engineVersion: null,
          }
        : {}),
    };
    setCuts((list) => list.map((x) => (x.id === id ? next : x)));
    if (c.tmp) afterCreate.current.set(id, next);
    else void persist(next);
  };

  const markHere = () => {
    if (!part) return;
    const v = videoRef.current;
    const now = v?.currentTime ?? t;
    v?.pause();
    const max = dur ?? part.durationSec ?? now + POST_SEC;
    const startSec = Math.max(0, now - PRE_SEC);
    const endSec = Math.min(max, now + POST_SEC);
    if (endSec - startSec < 0.4) {
      setMsg('조각 끝이라 범위가 너무 짧아요 — 다음 조각에서 표시해 주세요');
      return;
    }
    const cut: Cut = {
      id: `tmp-${++tmpSeq.current}`,
      tmp: true,
      partId: part.id,
      startSec,
      endSec,
      eventSec: now,
      gunKmh: null,
      pitchType: null,
      memo: null,
      excluded: false,
      ok: null,
      rawKmh: null,
      releaseKmh: null,
      errorKmh: null,
      reject: null,
      engineVersion: null,
      measuredAt: null,
      createdAt: '',
    };
    setCuts((list) => [...list, cut]);
    setSelected(cut.id);
    if (endSec - startSec < PRE_SEC + POST_SEC - 0.05)
      setMsg(
        '조각 끝에 걸려 범위를 줄였어요 — 겹친 다음 조각에서 표시하면 온전히 잡혀요'
      );
    void persist(cut);
  };

  const removeCut = async (c: Cut) => {
    setCuts((list) => list.filter((x) => x.id !== c.id));
    if (selected === c.id) setSelected(null);
    if (c.tmp) {
      afterCreate.current.set(c.id, 'deleted');
      return;
    }
    const res = await orOffline(deleteRecordingCut(c.id), {
      ok: false as const,
      error: OFFLINE_MESSAGE,
    });
    if (!res.ok) {
      setMsg(res.error);
      setCuts((list) => [...list, c]);
    }
  };

  const watch = (c: Cut) => {
    setSelected(c.id);
    if (c.partId !== partId) choosePart(c.partId);
    setLoop({ start: c.startSec, end: c.endSec });
    /* 조각을 바꿨으면 영상이 다시 읽힌 뒤에 — loadeddata 에서 이어 간다 */
    pendingWatch.current = c;
    if (c.partId === partId) startWatch();
  };
  const pendingWatch = useRef<Cut | null>(null);
  const startWatch = () => {
    const c = pendingWatch.current;
    const v = videoRef.current;
    if (!c || !v) return;
    pendingWatch.current = null;
    v.currentTime = c.startSec;
    setT(c.startSec);
    void v.play().catch(() => undefined);
  };

  /* ── 지금 모델로 재기 ── */
  const blobOf = async (p: RecordingPartRow) => {
    const kept = blobs.current.get(p.id);
    if (kept) return kept;
    if (!p.url) throw new Error('조각 주소가 없어요(저장소 설정)');
    const res = await fetch(p.url);
    if (!res.ok) throw new Error('조각을 내려받지 못했어요');
    const blob = await res.blob();
    blobs.current.set(p.id, blob);
    return blob;
  };

  const measure = async (c: Cut) => {
    const p = parts.find((x) => x.id === c.partId);
    if (!p || c.tmp) return;
    setBusy((b) => ({ ...b, [c.id]: { kind: 'measure', progress: 0 } }));
    try {
      const blob = await blobOf(p);
      const file = new File(
        [blob],
        `part-${p.index}.${/webm/.test(p.mime) ? 'webm' : 'mp4'}`,
        {
          type: p.mime || blob.type || 'video/mp4',
        }
      );
      const result = await analyzeVideo({
        file,
        startSec: c.startSec,
        endSec: c.endSec,
        fps,
        fovDeg: meta.fovDeg ?? DEFAULT_FOV_DEG,
        focalPerLongSide: meta.focalRatio,
        approach,
        releaseDistanceM: approach === 'approaching' ? meta.releaseDistM : null,
        /* 엔진 2.0 — 녹화 때 넣은 거리(없으면 기본: 투수 뒤 20m · 포수 뒤 18.5m) */
        distanceM:
          approach === 'approaching'
            ? (meta.releaseDistM ?? 18.5)
            : (meta.targetDistM ?? 20),
        onProgress: (r) =>
          setBusy((b) => ({
            ...b,
            [c.id]: { kind: 'measure', progress: Math.round(r * 100) },
          })),
      });
      const m = result.measure;
      const row = {
        ok: m.ok,
        rawKmh: m.ok ? m.kmh : null,
        releaseKmh: m.ok ? (result.release?.releaseKmh ?? null) : null,
        errorKmh: m.ok ? m.errorKmh : null,
        reject: m.ok ? null : m.code,
        engineVersion,
      };
      const res = await orOffline(
        saveRecordingCutResult(c.id, {
          ...row,
          analysis: analysisOf(result, approach),
        }),
        { ok: false as const, error: OFFLINE_MESSAGE }
      );
      if (!res.ok) setMsg(res.error);
      setCuts((list) =>
        list.map((x) =>
          x.id === c.id ? { ...x, ...row, measuredAt: new Date().toISOString() } : x
        )
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '재지 못했어요');
    } finally {
      setBusy((b) => {
        const next = { ...b };
        delete next[c.id];
        return next;
      });
    }
  };

  const measureAll = async () => {
    const todo = cuts.filter((c) => !c.tmp && !c.excluded);
    setBatch({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length; i++) {
      await measure(todo[i]);
      setBatch({ done: i + 1, total: todo.length });
    }
    setBatch(null);
  };

  /* ── 키보드 ── */
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
      )
        return;
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) seek(t - 1);
        else stepFrames(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) seek(t + 1);
        else stepFrames(1);
      } else if (e.key === 'm' || e.key === 'M' || e.key === 'ㅡ') {
        markHere();
      }
    };
  });
  useEffect(() => {
    const on = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  /* ── 시간 막대 ── */
  const seekFromPointer = (clientX: number) => {
    const bar = barRef.current;
    const d = dur;
    if (!bar || !d) return;
    const r = bar.getBoundingClientRect();
    seek(((clientX - r.left) / r.width) * d);
  };

  const partCuts = cuts.filter((c) => c.partId === partId);
  const numberOf = new Map(cuts.map((c, i) => [c.id, i + 1]));

  /* ── 통계 — 건 값과 잰 값이 둘 다 있고 빼지 않은 공 ── */
  const pairs = cuts.filter(
    (c) => !c.excluded && c.ok && c.rawKmh != null && c.gunKmh != null
  ) as (Cut & { rawKmh: number; gunKmh: number })[];
  const diffs = pairs.map((c) => c.rawKmh - c.gunKmh);
  const mean = diffs.length ? diffs.reduce((s, d) => s + d, 0) / diffs.length : null;
  const meanAbs = diffs.length
    ? diffs.reduce((s, d) => s + Math.abs(d), 0) / diffs.length
    : null;
  const measuredN = cuts.filter((c) => c.ok != null).length;
  const failedN = cuts.filter((c) => c.ok === false).length;

  const cam = meta.camera;
  return (
    <div className="grid gap-block lg:grid-cols-[minmax(0,1fr)_24rem]">
      {/* ── 왼쪽: 영상 ── */}
      <div className="stack-block min-w-0">
        <Card className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-heading text-lg">
              {detail.date} 녹화
              {detail.status !== 'done' && (
                <span className="ml-2 text-xs font-normal text-warn">
                  끊김(멈춤 없이 끝남)
                </span>
              )}
            </h1>
            <p className="text-xs text-muted tabular-nums">
              {detail.userName ?? '관리자'} · 조각 {parts.length}개 · 모델 v
              {meta.engineVersion ?? '—'}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-muted tabular-nums">
            {cam?.label || '카메라'} · {cam?.width ?? '?'}×{cam?.height ?? '?'} ·{' '}
            {Math.round(fps)}fps · 화각{' '}
            {meta.fovDeg != null ? `${Math.round(meta.fovDeg)}°` : '기본'}
            {meta.focalRatio != null && ' · 렌즈 보정'} ·{' '}
            {meta.cameraPos === 'behind-catcher' ? '포수 뒤' : '투수 뒤'}
            {meta.net != null && (meta.net ? ' · 네트' : ' · 네트 없음')}
            {meta.mime && ` · ${meta.mime.split(';')[0]}`}
          </p>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onBlur={() => {
              if ((detail.memo ?? '') !== memo)
                void orOffline(saveRecordingMemo(detail.id, memo), null);
            }}
            placeholder="메모(장소 · 날씨 · 투수 …)"
            className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-sky focus:outline-none"
          />
        </Card>

        {/* 조각 고르기 */}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="조각">
          {parts.map((p) => {
            const on = p.id === partId;
            const n = cuts.filter((c) => c.partId === p.id).length;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => choosePart(p.id)}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-sm tabular-nums transition-colors ${
                  on
                    ? 'border-sky bg-sky/10 font-medium text-sky'
                    : 'border-line bg-surface-2 text-muted hover:border-sky-soft hover:text-ink'
                }`}
              >
                조각 {p.index + 1}
                <span className="text-xs opacity-70">{clock(p.offsetSec)}</span>
                {n > 0 && (
                  <span className="rounded-full bg-sky px-1.5 text-xs font-semibold text-white">
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {part ? (
          <div className="overflow-hidden rounded-2xl bg-black">
            <video
              key={part.id}
              ref={videoRef}
              src={part.url ?? undefined}
              playsInline
              muted
              preload="auto"
              onLoadedMetadata={onMeta}
              onLoadedData={startWatch}
              onPlay={() => setPlaying(true)}
              onPause={() => {
                setPlaying(false);
                setT(videoRef.current?.currentTime ?? 0);
              }}
              onSeeked={() => setT(videoRef.current?.currentTime ?? 0)}
              onClick={togglePlay}
              className="mx-auto max-h-[62dvh] w-full cursor-pointer object-contain"
            />
          </div>
        ) : (
          <p className="text-sm text-muted">올라온 조각이 없어요.</p>
        )}

        {/* 시간 막대 — 파란 띠 = 공 범위, 빨간 선 = 지금 */}
        <div>
          <div
            ref={barRef}
            role="slider"
            aria-label="시간"
            aria-valuemin={0}
            aria-valuemax={dur ?? 0}
            aria-valuenow={t}
            tabIndex={-1}
            onPointerDown={(e) => {
              draggingRef.current = true;
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              videoRef.current?.pause();
              seekFromPointer(e.clientX);
            }}
            onPointerMove={(e) => draggingRef.current && seekFromPointer(e.clientX)}
            onPointerUp={() => {
              draggingRef.current = false;
            }}
            className="relative h-12 cursor-pointer touch-none select-none overflow-hidden rounded-xl bg-ink/8"
          >
            {dur != null &&
              partCuts.map((c) => {
                const on = c.id === selected;
                return (
                  <div
                    key={c.id}
                    className={`pointer-events-none absolute inset-y-1.5 rounded-md border ${
                      c.excluded
                        ? 'border-line-strong bg-ink/10'
                        : on
                          ? 'border-sky bg-sky/45'
                          : 'border-sky/60 bg-sky/20'
                    }`}
                    style={{
                      left: `${(c.startSec / dur) * 100}%`,
                      width: `${((c.endSec - c.startSec) / dur) * 100}%`,
                    }}
                  >
                    <span className="absolute left-1 top-0.5 text-xs font-semibold text-sky-strong">
                      {numberOf.get(c.id)}
                    </span>
                  </div>
                );
              })}
            {dur != null &&
              partCuts
                .filter((c) => c.eventSec != null)
                .map((c) => (
                  <span
                    key={`e-${c.id}`}
                    className="pointer-events-none absolute inset-y-0 w-px bg-sky"
                    style={{ left: `${((c.eventSec as number) / dur) * 100}%` }}
                  />
                ))}
            {dur != null && (
              <span
                className="pointer-events-none absolute inset-y-0 w-0.5 bg-danger"
                style={{ left: `${Math.min(100, (t / dur) * 100)}%` }}
              />
            )}
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted tabular-nums">
            <span>0:00.0</span>
            <span className="font-medium text-ink">
              {clock(t)} · {Math.round(t * fps)}번째 장면
              {loop && (
                <button
                  type="button"
                  onClick={() => setLoop(null)}
                  className="ml-2 inline-flex items-center gap-1 text-sky"
                >
                  <Repeat aria-hidden className="h-3 w-3" />
                  되풀이 끄기
                </button>
              )}
            </span>
            <span>{dur != null ? clock(dur) : '…'}</span>
          </div>
        </div>

        {/* 재생 단추 */}
        <div className="flex flex-wrap items-center gap-2">
          <CtlButton label="1초 뒤로" onClick={() => seek(t - 1)} icon={SkipBack} />
          <CtlButton
            label="1프레임 뒤로"
            onClick={() => stepFrames(-1)}
            icon={ChevronLeft}
          />
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? '멈춤' : '재생'}
            className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-ink text-surface transition-transform active:scale-95"
          >
            {playing ? (
              <Pause aria-hidden className="h-5 w-5" />
            ) : (
              <Play aria-hidden className="h-5 w-5" />
            )}
          </button>
          <CtlButton
            label="1프레임 앞으로"
            onClick={() => stepFrames(1)}
            icon={ChevronRight}
          />
          <CtlButton
            label="1초 앞으로"
            onClick={() => seek(t + 1)}
            icon={SkipForward}
          />
          <div
            className="ml-1 inline-flex rounded-lg bg-ink/6 p-0.5"
            role="group"
            aria-label="재생 속도"
          >
            {[0.25, 0.5, 1].map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={rate === r}
                onClick={() => setRate(r)}
                className={`min-h-9 rounded-md px-2.5 text-xs tabular-nums transition-colors ${
                  rate === r
                    ? 'bg-surface font-semibold text-ink shadow-sm'
                    : 'text-muted'
                }`}
              >
                {r}×
              </button>
            ))}
          </div>
          <Button
            onClick={markHere}
            disabled={!part || dur == null}
            className="ml-auto"
          >
            <Crosshair aria-hidden className="h-4 w-4" />공 표시
          </Button>
        </div>
        <p className="text-xs text-muted">
          손에서 공이 떠나는 장면에서 &lsquo;공 표시&rsquo;(M) — 앞 {PRE_SEC} · 뒤{' '}
          {POST_SEC}초를 공 하나로 잡아요. 스페이스 재생 · ←/→ 1프레임 · Shift+←/→ 1초.
        </p>
      </div>

      {/* ── 오른쪽: 공 목록 ── */}
      <div className="stack-block min-w-0">
        <Card className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="공" value={String(cuts.length)} />
            <Stat
              label="잰 것"
              value={`${measuredN - failedN}/${measuredN}`}
              hint={failedN ? `못 잼 ${failedN}` : undefined}
            />
            <Stat
              label="건과 차이"
              value={mean != null ? signed(mean) : '—'}
              hint={
                meanAbs != null
                  ? `|평균| ${meanAbs.toFixed(1)} · ${pairs.length}개`
                  : undefined
              }
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => void measureAll()}
            disabled={batch != null || cuts.length === 0}
            className="w-full"
          >
            {batch ? (
              <>
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                재는 중 {batch.done}/{batch.total}
              </>
            ) : (
              <>
                <Gauge aria-hidden className="h-4 w-4" />
                모두 지금 모델(v{engineVersion})로 재기
              </>
            )}
          </Button>
        </Card>

        {msg && (
          <p
            role="status"
            className="rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn"
          >
            {msg}
          </p>
        )}

        {cuts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            영상에서 공이 손을 떠나는 장면을 찾아 &lsquo;공 표시&rsquo;를 눌러요.
          </p>
        ) : (
          <ul className="space-y-2">
            {cuts.map((c, i) => (
              <CutItem
                key={c.id}
                cut={c}
                n={i + 1}
                partNo={(parts.find((p) => p.id === c.partId)?.index ?? 0) + 1}
                selected={c.id === selected}
                busy={busy[c.id] ?? null}
                engineVersion={engineVersion}
                gunText={gunDraft[c.id] ?? (c.gunKmh != null ? String(c.gunKmh) : '')}
                onGunText={(v) => setGunDraft((d) => ({ ...d, [c.id]: v }))}
                onGunCommit={() => {
                  const raw = (gunDraft[c.id] ?? '').trim();
                  if (gunDraft[c.id] == null) return;
                  const val = raw === '' ? null : Number(raw.replace(',', '.'));
                  if (val != null && !(val >= 20 && val <= 200)) {
                    setMsg('스피드건 값은 20~200km/h 예요');
                    return;
                  }
                  setGunDraft((d) => {
                    const next = { ...d };
                    delete next[c.id];
                    return next;
                  });
                  if (val !== c.gunKmh) update(c.id, { gunKmh: val });
                }}
                onSelect={() => {
                  setSelected(c.id);
                  if (c.partId !== partId) choosePart(c.partId);
                }}
                onWatch={() => watch(c)}
                onMeasure={() => void measure(c)}
                onPatch={(patch) => update(c.id, patch)}
                onRemove={() => void removeCut(c)}
                here={c.partId === partId ? t : null}
                style={{ '--row': i } as CSSProperties}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CtlButton({
  label,
  onClick,
  icon: Icon,
}: {
  label: string;
  onClick: () => void;
  icon: typeof Play;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-ink/6 text-ink transition-colors hover:bg-ink/10 active:bg-ink/15"
    >
      <Icon aria-hidden className="h-4 w-4" />
    </button>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-numeric text-lg font-semibold tabular-nums text-ink">
        {value}
      </p>
      {hint && <p className="text-xs text-muted tabular-nums">{hint}</p>}
    </div>
  );
}

function CutItem({
  cut: c,
  n,
  partNo,
  selected,
  busy,
  engineVersion,
  gunText,
  onGunText,
  onGunCommit,
  onSelect,
  onWatch,
  onMeasure,
  onPatch,
  onRemove,
  here,
  style,
}: {
  cut: Cut;
  n: number;
  partNo: number;
  selected: boolean;
  busy: Busy | null;
  engineVersion: string;
  gunText: string;
  onGunText: (v: string) => void;
  onGunCommit: () => void;
  onSelect: () => void;
  onWatch: () => void;
  onMeasure: () => void;
  onPatch: (patch: Partial<Cut>) => void;
  onRemove: () => void;
  /** 이 공의 조각을 보고 있으면 지금 시각(시작 · 끝을 여기로) */
  here: number | null;
  style: CSSProperties;
}) {
  const [armDelete, setArmDelete] = useState(false);
  useEffect(() => {
    if (!armDelete) return;
    const id = setTimeout(() => setArmDelete(false), 3000);
    return () => clearTimeout(id);
  }, [armDelete]);
  const nudge = (which: 'startSec' | 'endSec', by: number) => {
    const next = Math.round((c[which] + by) * 100) / 100;
    if (which === 'startSec' && (next < 0 || c.endSec - next < 0.3)) return;
    if (which === 'endSec' && next - c.startSec < 0.3) return;
    onPatch({ [which]: next });
  };
  const stale = c.ok != null && c.engineVersion !== engineVersion;
  const diff =
    c.ok && c.rawKmh != null && c.gunKmh != null ? c.rawKmh - c.gunKmh : null;
  return (
    <li
      style={style}
      onClick={onSelect}
      className={`space-y-2.5 rounded-2xl border p-3 transition-colors motion-safe:animate-row-in ${
        selected ? 'border-sky bg-sky/5' : 'border-line bg-surface'
      } ${c.excluded ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-sky px-1.5 text-xs font-semibold text-white tabular-nums">
          {n}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted tabular-nums">
          조각 {partNo} · {sec1(c.startSec)}–{sec1(c.endSec)}초
          {c.pitchType && ` · ${pitchTypeLabel(c.pitchType)}`}
        </span>
        {busy?.kind === 'save' && (
          <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin text-muted" />
        )}
        {c.excluded && <Badge>뺌</Badge>}
      </div>

      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="sr-only">스피드건 값</span>
          <input
            inputMode="decimal"
            value={gunText}
            placeholder="스피드건"
            onChange={(e) => onGunText(e.target.value)}
            onBlur={onGunCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full min-w-0 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-sm text-ink tabular-nums placeholder:text-muted/60 focus:border-sky focus:outline-none"
          />
          <span className="text-xs text-muted">km/h</span>
        </label>
        <select
          value={c.pitchType ?? ''}
          onChange={(e) => onPatch({ pitchType: e.target.value || null })}
          onClick={(e) => e.stopPropagation()}
          aria-label="구종"
          className="min-h-9 rounded-lg border border-line bg-surface-2 px-2 text-sm text-ink focus:border-sky focus:outline-none"
        >
          <option value="">구종</option>
          {PITCH_TYPES.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* 결과 */}
      <div className="text-sm tabular-nums">
        {busy?.kind === 'measure' ? (
          <span className="inline-flex items-center gap-1.5 text-muted">
            <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
            재는 중 {busy.progress ?? 0}%
          </span>
        ) : c.ok == null ? (
          <span className="text-muted">아직 안 쟀어요</span>
        ) : c.ok ? (
          <span className="text-ink">
            카메라 <b>{c.rawKmh?.toFixed(1)}</b>
            {c.errorKmh != null && (
              <span className="text-muted"> ±{c.errorKmh.toFixed(1)}</span>
            )}
            {c.releaseKmh != null && (
              <span className="text-muted"> · 릴리스 {c.releaseKmh.toFixed(1)}</span>
            )}
            {diff != null && (
              <span
                className={
                  Math.abs(diff) > 5
                    ? 'font-semibold text-danger'
                    : 'font-semibold text-ok'
                }
              >
                {' '}
                · 건과 {signed(diff)}
              </span>
            )}
          </span>
        ) : (
          <span className="text-warn">{rejectText(c.reject)}</span>
        )}
        {stale && (
          <span className="ml-1.5 text-xs text-muted">(v{c.engineVersion} 때 값)</span>
        )}
      </div>

      {/* 범위 손질 · 단추 */}
      <div
        className="flex flex-wrap items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <RangeNudge
          label="시작"
          onMinus={() => nudge('startSec', -0.1)}
          onPlus={() => nudge('startSec', 0.1)}
        />
        <RangeNudge
          label="끝"
          onMinus={() => nudge('endSec', -0.1)}
          onPlus={() => nudge('endSec', 0.1)}
        />
        {here != null && (
          <>
            <SmallButton
              onClick={() =>
                here < c.endSec - 0.3 &&
                onPatch({ startSec: Math.round(here * 100) / 100 })
              }
            >
              시작=지금
            </SmallButton>
            <SmallButton
              onClick={() =>
                here > c.startSec + 0.3 &&
                onPatch({ endSec: Math.round(here * 100) / 100 })
              }
            >
              끝=지금
            </SmallButton>
          </>
        )}
      </div>
      <div
        className="flex flex-wrap items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <SmallButton onClick={onWatch}>
          <Repeat aria-hidden className="h-3.5 w-3.5" />
          되풀이 보기
        </SmallButton>
        <SmallButton onClick={onMeasure} disabled={busy != null || !!c.tmp}>
          <Gauge aria-hidden className="h-3.5 w-3.5" />
          재기
        </SmallButton>
        <SmallButton
          onClick={() => onPatch({ excluded: !c.excluded })}
          pressed={c.excluded}
        >
          <EyeOff aria-hidden className="h-3.5 w-3.5" />
          {c.excluded ? '뺌 풀기' : '통계에서 빼기'}
        </SmallButton>
        <SmallButton
          onClick={() => (armDelete ? onRemove() : setArmDelete(true))}
          danger
          className="ml-auto"
        >
          <Trash2 aria-hidden className="h-3.5 w-3.5" />
          {armDelete ? '한 번 더 눌러 지우기' : '지우기'}
        </SmallButton>
      </div>
    </li>
  );
}

function RangeNudge({
  label,
  onMinus,
  onPlus,
}: {
  label: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <span className="inline-flex items-center rounded-lg bg-ink/6 text-xs">
      <button
        type="button"
        onClick={onMinus}
        className="min-h-8 px-2 text-ink hover:text-sky"
        aria-label={`${label} 0.1초 앞으로`}
      >
        −
      </button>
      <span className="px-0.5 text-muted">{label}</span>
      <button
        type="button"
        onClick={onPlus}
        className="min-h-8 px-2 text-ink hover:text-sky"
        aria-label={`${label} 0.1초 뒤로`}
      >
        +
      </button>
    </span>
  );
}

function SmallButton({
  children,
  onClick,
  disabled,
  pressed,
  danger,
  className = '',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={`inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition-colors disabled:opacity-40 ${
        danger
          ? 'text-danger hover:bg-danger-bg'
          : pressed
            ? 'bg-ink/12 text-ink'
            : 'bg-ink/6 text-ink hover:bg-ink/10'
      } ${className}`}
    >
      {children}
    </button>
  );
}
