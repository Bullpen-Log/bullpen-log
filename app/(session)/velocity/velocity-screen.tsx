'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Camera,
  Check,
  Copy,
  Film,
  Loader2,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import {
  analyzeVideo,
  DEFAULT_FOV_DEG,
  type AnalyzeResult,
} from '@/lib/velocity-engine/analyze-video';
import {
  LiveCapture,
  type CameraInfo,
  type LiveStatus,
} from '@/lib/velocity-engine/live-capture';
import {
  applyCalibration,
  fitCalibration,
  loadFov,
  loadPairs,
  pairsToText,
  saveFov,
  savePairs,
  type CalPair,
} from '@/lib/velocity-calibration';
import { SESSION_TYPES, DEFAULT_SESSION_TYPE, isRestSession } from '@/lib/session-type';
import { formatSpeed, speedLabel } from '@/lib/units';
import { useSpeedUnit } from '@/components/use-units';

/**
 * 구속 측정 화면 — 폰 화면 하나에 다 들어가는 모양(Smart Scout · PitchLab 처럼).
 *
 *   [← 투구 기록      구속 측정      ⚙]
 *   ┌──────────────────────────────┐
 *   │  카메라 화면                   │  ← 가운데 표적(릴리스 포인트), 상태 표시, 결과 숫자
 *   └──────────────────────────────┘
 *   이번 세션에서 잰 공들(최고 · 평균 · n구), 공마다 스피드건 값 칸
 *   [측정 시작 / 멈춤]  [기록하기]
 *
 * PC 에서는 이 전체를 폰 크기 틀(390×844) 안에 띄운다 — 이 기능은 폰이 기준이라
 * PC 화면에 맞춰 늘리지 않는다. 폰에서는 화면을 꽉 채운다.
 *
 * 잰 값은 브라우저에만 있다가 '기록하기'를 누를 때 투구 기록 한 건으로 저장된다
 * (/api/pitch-log — 투구수 = 잰 공 수, 최고 · 평균 구속). 영상은 어디에도 올리지 않는다.
 */

type Pitch = {
  id: number;
  /** 보정 전 카메라 값(km/h) */
  kmh: number;
  errorKmh: number;
  confidence: 'high' | 'medium' | 'low';
  source: 'camera' | 'file';
  /** 같이 잰 스피드건 값 — 보정 자료 */
  gun: string;
  detail: { frames: number; travelM: number; durationSec: number; fps: number | null };
};

const STATUS_TEXT: Record<LiveStatus, string> = {
  off: '카메라 꺼짐',
  starting: '카메라 켜는 중…',
  ready: '준비됨',
  settling: '자세를 잡으세요… 잠잠해지면 시작해요',
  armed: '던지세요',
  capturing: '담는 중',
  analyzing: '계산 중…',
};

const CONFIDENCE_TEXT = {
  high: '신뢰도 높음',
  medium: '신뢰도 보통',
  low: '신뢰도 낮음',
};

const THROW_TYPES = SESSION_TYPES.filter((t) => !isRestSession(t.name));

let pitchSeq = 0;

export function VelocityScreen({
  isAdmin,
  native,
  today,
}: {
  isAdmin: boolean;
  native: boolean;
  today: string;
}) {
  const router = useRouter();
  const unit = useSpeedUnit();
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureRef = useRef<LiveCapture | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<LiveStatus>('off');
  const [camera, setCamera] = useState<CameraInfo | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<AnalyzeResult | null>(null);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileProgress, setFileProgress] = useState(0);

  /*
   * 설정 — 화각과 보정 짝. 브라우저에 저장된 값을 읽는다(서버에서 그릴 때는 기본값 —
   * 이 화면은 카메라를 켜기 전까지 값이 보이지 않아 서버 · 브라우저 첫 그림이 달라도 된다).
   */
  const [fov, setFov] = useState(() => loadFov(DEFAULT_FOV_DEG));
  const [pairs, setPairs] = useState<CalPair[]>(() => loadPairs());
  const [useCal, setUseCal] = useState(true);
  const [panel, setPanel] = useState<'none' | 'settings' | 'save'>('none');
  const fit = useMemo(() => fitCalibration(pairs), [pairs]);
  const shown = (kmh: number) =>
    useCal && fit.n > 0 ? applyCalibration(kmh, fit) : kmh;

  /* 저장 폼 */
  const [sessionType, setSessionType] = useState<string>(DEFAULT_SESSION_TYPE);
  const [intensity, setIntensity] = useState(7);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  /* 페이지를 떠나면 카메라를 끈다 */
  useEffect(() => {
    return () => {
      captureRef.current?.stop();
      captureRef.current = null;
    };
  }, []);

  const addResult = (result: AnalyzeResult, source: Pitch['source']) => {
    setLast(result);
    if (!result.measure.ok) return;
    const m = result.measure;
    setPitches((prev) => [
      ...prev,
      {
        id: ++pitchSeq,
        kmh: m.kmh,
        errorKmh: m.errorKmh,
        confidence: m.confidence,
        source,
        gun: '',
        detail: {
          frames: m.detail.frames,
          travelM: m.detail.travelM,
          durationSec: m.detail.durationSec,
          fps: result.fps,
        },
      },
    ]);
    setSaved(false);
    if (navigator.vibrate) navigator.vibrate(30);
  };

  const startCamera = async () => {
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    setLast(null);
    const capture = new LiveCapture(
      video,
      {
        onStatus: setStatus,
        onResult: (r) => addResult(r, 'camera'),
        onError: setError,
        onFps: (f) => setFps(Math.round(f)),
      },
      fov
    );
    captureRef.current?.stop();
    captureRef.current = capture;
    try {
      setCamera(await capture.start());
    } catch (e) {
      setError(e instanceof Error ? e.message : '카메라를 켜지 못했습니다.');
      captureRef.current = null;
    }
  };

  const toggleArm = () => {
    const c = captureRef.current;
    if (!c) return;
    if (status === 'ready') {
      setLast(null);
      c.arm();
    } else {
      c.disarm();
    }
  };

  const pickFile = async (file: File) => {
    setFileBusy(true);
    setFileProgress(0);
    setError(null);
    setLast(null);
    try {
      const result = await analyzeVideo({
        file,
        fovDeg: fov,
        onProgress: setFileProgress,
      });
      addResult(result, 'file');
    } catch (e) {
      setError(e instanceof Error ? e.message : '영상을 분석하지 못했습니다.');
    } finally {
      setFileBusy(false);
    }
  };

  const changeFov = (next: number) => {
    setFov(next);
    saveFov(next);
    captureRef.current?.setFov(next);
  };

  /* 스피드건 값을 적은 공을 보정 짝으로 저장한다 */
  const storePairs = () => {
    const fresh: CalPair[] = pitches
      .filter((p) => p.gun.trim() !== '' && Number.isFinite(Number(p.gun)))
      .map((p) => ({
        measured: p.kmh,
        gun: Number(p.gun),
        at: new Date().toISOString(),
      }));
    if (fresh.length === 0) return;
    const next = [...pairs, ...fresh];
    setPairs(next);
    savePairs(next);
    setPitches((prev) => prev.map((p) => ({ ...p, gun: '' })));
  };

  const removePair = (i: number) => {
    const next = pairs.filter((_, k) => k !== i);
    setPairs(next);
    savePairs(next);
  };

  /* 이번 세션 요약 — 공이 몇 개 안 되니 그릴 때마다 센다 */
  const stats = (() => {
    if (pitches.length === 0) return null;
    const vals = pitches.map((p) => shown(p.kmh));
    const max = Math.max(...vals);
    const avg = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
    return { max, avg, n: pitches.length };
  })();

  const save = async () => {
    if (!stats || saving) return;
    setSaving(true);
    setError(null);
    const raw = pitches.map((p) => p.kmh).join(' · ');
    const memo =
      `앱 구속 측정 ${stats.n}구 — 카메라 값 ${raw} km/h` +
      (useCal && fit.n > 0
        ? ` · 보정 ×${fit.scale} ${fit.offset >= 0 ? '+' : ''}${fit.offset} (짝 ${fit.n})`
        : ' · 보정 없음') +
      ` · 화각 ${fov}°`;
    try {
      const res = await fetch('/api/pitch-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: today,
          sessionType,
          pitchCount: stats.n,
          intensity,
          maxVelocity: stats.max,
          avgVelocity: stats.avg,
          memo,
          videoPaths: [],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? '저장하지 못했습니다.');
      }
      storePairs();
      setSaved(true);
      setPitches([]);
      setPanel('none');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const measuring =
    status === 'settling' || status === 'armed' || status === 'capturing';
  const cameraOn = status !== 'off' && status !== 'starting';
  const lowFps = fps != null && fps < 60;

  return (
    /*
     * 폰 틀. PC(desk)에서는 390px 폭 · 둥근 모서리 · 두꺼운 테두리로 폰처럼 보이고,
     * 폰에서는 화면을 꽉 채운다. ui-chrome — PC 의 작아진 크기 기준을 쓰지 않고 폰 크기
     * 그대로 그린다.
     */
    <div className="ui-chrome flex min-h-0 flex-1 flex-col bg-zinc-950 text-white desk:mx-auto desk:my-4 desk:h-[calc(100dvh-2rem)] desk:max-h-[52.75rem] desk:w-[24.375rem] desk:flex-none desk:overflow-hidden desk:rounded-[2.25rem] desk:border-[6px] desk:border-zinc-800 desk:shadow-2xl">
      {/* 위 막대 */}
      <header className="flex h-12 shrink-0 items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
        <Link
          href="/videos"
          className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" />
          투구 기록
        </Link>
        <h1 className="text-heading text-base">구속 측정</h1>
        <button
          type="button"
          onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')}
          aria-label="설정"
          aria-expanded={panel === 'settings'}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Settings2 aria-hidden className="h-5 w-5" />
        </button>
      </header>

      {/* 카메라 */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`h-full w-full object-cover ${cameraOn ? '' : 'hidden'}`}
        />

        {!cameraOn && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <Camera aria-hidden className="h-10 w-10 text-white/40" />
            <p className="text-sm leading-relaxed text-white/70">
              폰을 <b className="text-white">투수 바로 뒤 1m 이내</b>에 고정하고, 공을
              놓는 지점이 화면 <b className="text-white">한가운데 표적</b>에 오게
              맞추세요.
            </p>
            {status === 'starting' && (
              <p className="inline-flex items-center gap-2 text-xs text-white/60">
                <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
                카메라 켜는 중…
              </p>
            )}
          </div>
        )}

        {/* 표적 — 릴리스 포인트 */}
        {cameraOn && (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div
              className={`absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors ${
                status === 'armed'
                  ? 'border-sky-soft shadow-[0_0_0_9999px_rgba(0,0,0,0.12)]'
                  : status === 'capturing'
                    ? 'border-warn'
                    : 'border-white/70'
              }`}
            >
              <span className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-current opacity-80" />
              <span className="absolute bottom-0 left-1/2 h-3 w-px -translate-x-1/2 bg-current opacity-80" />
              <span className="absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 bg-current opacity-80" />
              <span className="absolute right-0 top-1/2 h-px w-3 -translate-y-1/2 bg-current opacity-80" />
              <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
            </div>
            <p className="absolute left-1/2 top-[calc(50%+4.5rem)] -translate-x-1/2 text-[11px] font-semibold tracking-wide text-white/80 drop-shadow">
              릴리스 포인트
            </p>
          </div>
        )}

        {/* 상태 · 카메라 정보 */}
        {cameraOn && (
          <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2 text-[11px]">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold backdrop-blur ${
                status === 'armed'
                  ? 'bg-sky/90 text-white'
                  : status === 'capturing'
                    ? 'bg-warn/90 text-white'
                    : 'bg-black/55 text-white/90'
              }`}
            >
              {(status === 'analyzing' || status === 'settling') && (
                <Loader2 aria-hidden className="h-3 w-3 animate-spin" />
              )}
              {status === 'armed' && (
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              )}
              {STATUS_TEXT[status]}
            </span>
            {camera && (
              <span
                className={`rounded-full px-2.5 py-1 tabular-nums backdrop-blur ${
                  lowFps ? 'bg-warn/85 text-white' : 'bg-black/55 text-white/80'
                }`}
              >
                {camera.width}×{camera.height}
                {fps != null && ` · ${fps}fps`}
              </span>
            )}
          </div>
        )}

        {/* 결과 — 카메라 위에 크게 */}
        {last && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3">
            {last.measure.ok ? (
              <div className="motion-safe:animate-fade-in rounded-2xl bg-black/65 px-4 py-3 text-center backdrop-blur">
                <p className="text-display text-6xl leading-none tabular-nums">
                  {Math.round(shown(last.measure.kmh) * 10) / 10}
                  <span className="ml-1.5 text-lg text-white/70">
                    {speedLabel(unit)}
                  </span>
                </p>
                <p className="mt-1.5 text-xs text-white/70">
                  ± {last.measure.errorKmh} · {CONFIDENCE_TEXT[last.measure.confidence]}
                  {useCal && fit.n > 0 && ` · 보정 전 ${last.measure.kmh}`}
                </p>
              </div>
            ) : (
              <div className="motion-safe:animate-fade-in rounded-2xl border border-warn/50 bg-black/70 px-4 py-3 backdrop-blur">
                <p className="text-sm font-bold text-warn">재지 않았어요</p>
                <p className="mt-1 text-xs leading-relaxed text-white/85">
                  {last.measure.message}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-white/60">
                  {last.measure.fix}
                </p>
                <p className="mt-1.5 text-[10px] text-white/45 tabular-nums">
                  {last.sourceSize.width}×{last.sourceSize.height}
                  {last.fps != null && ` · ${Math.round(last.fps)}fps`} · 프레임{' '}
                  {last.frameCount}· 공 {last.track.length} · 흔들림 {last.shakePx}
                </p>
              </div>
            )}
          </div>
        )}

        {fileBusy && (
          <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-black/70 px-4 py-3 text-xs text-white/85 backdrop-blur">
            <p className="inline-flex items-center gap-2">
              <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
              영상을 한 장씩 살펴보는 중… {Math.round(fileProgress * 100)}%
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-sky transition-[width]"
                style={{ width: `${Math.round(fileProgress * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 웹 시험 모드 · 오류 */}
      {isAdmin && !native && (
        <p className="shrink-0 bg-warn/15 px-4 py-1.5 text-center text-[11px] leading-snug text-warn">
          웹 시험 모드(관리자) — 브라우저 카메라는 60fps 밑이면 숫자를 내지 않아요.
          앱에서는 폰의 고속 촬영을 써요. 슬로모션 영상 파일로는 지금도 잴 수 있어요.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="shrink-0 bg-danger/20 px-4 py-2 text-xs text-danger-bg"
        >
          {error}
        </p>
      )}
      {saved && (
        <p className="shrink-0 bg-ok/20 px-4 py-2 text-center text-xs text-white">
          <Check aria-hidden className="mr-1 inline h-3.5 w-3.5" />
          오늘 투구 기록에 남겼어요.{' '}
          <Link href={`/pitch-log/${today}`} className="font-semibold underline">
            기록 보기
          </Link>
        </p>
      )}

      {/* 이번 세션 */}
      <section className="shrink-0 border-t border-white/10 px-4 pt-2.5">
        <div className="flex items-baseline justify-between text-xs text-white/60">
          <span>이번 세션</span>
          {stats ? (
            <span className="tabular-nums">
              최고 <b className="text-white">{formatSpeed(stats.max, unit)}</b> · 평균{' '}
              <b className="text-white">{formatSpeed(stats.avg, unit)}</b> · {stats.n}구
            </span>
          ) : (
            <span>아직 잰 공이 없어요</span>
          )}
        </div>
        <ul className="mt-1.5 flex max-h-[7.5rem] flex-col gap-1 overflow-y-auto overscroll-contain pb-2">
          {pitches.map((p, i) => (
            <li
              key={p.id}
              className="motion-safe:animate-row-in flex items-center gap-2 rounded-xl bg-white/5 px-3 py-1.5 text-sm"
              style={{ '--row': i } as React.CSSProperties}
            >
              <span className="w-6 text-xs text-white/50 tabular-nums">#{i + 1}</span>
              <span className="text-display text-xl leading-none tabular-nums">
                {formatSpeed(shown(p.kmh), unit)}
              </span>
              <span className="text-[11px] text-white/50">
                ±{p.errorKmh} · {CONFIDENCE_TEXT[p.confidence]}
                {p.source === 'file' && ' · 파일'}
              </span>
              <label className="ml-auto flex items-center gap-1 text-[11px] text-white/60">
                건
                <input
                  inputMode="decimal"
                  value={p.gun}
                  onChange={(e) =>
                    setPitches((prev) =>
                      prev.map((q) =>
                        q.id === p.id
                          ? { ...q, gun: e.target.value.replace(/[^\d.]/g, '') }
                          : q
                      )
                    )
                  }
                  placeholder="km/h"
                  aria-label={`${i + 1}번째 공 스피드건 값`}
                  className="h-7 w-16 rounded-lg border border-white/15 bg-black/40 px-2 text-right text-xs tabular-nums text-white placeholder:text-white/30 focus:border-sky focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={() => setPitches((prev) => prev.filter((q) => q.id !== p.id))}
                aria-label={`${i + 1}번째 공 지우기`}
                className="-mr-1 rounded-lg p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* 아래 단추 */}
      <div className="flex shrink-0 items-center gap-2 border-t border-white/10 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickFile(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={fileBusy || measuring}
          aria-label="슬로모션 영상 파일로 재기"
          title="슬로모션 영상 파일로 재기"
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 text-white/80 transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          <Film aria-hidden className="h-5 w-5" />
        </button>

        {!cameraOn ? (
          <button
            type="button"
            onClick={startCamera}
            disabled={status === 'starting' || fileBusy}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-sky text-sm font-bold text-white transition-colors hover:bg-sky-strong disabled:opacity-50"
          >
            <Camera aria-hidden className="h-4 w-4" />
            카메라 켜기
          </button>
        ) : (
          <button
            type="button"
            onClick={toggleArm}
            disabled={status === 'analyzing'}
            className={`inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-bold transition-colors disabled:opacity-50 ${
              measuring
                ? 'bg-white/15 text-white hover:bg-white/25'
                : 'bg-sky text-white hover:bg-sky-strong'
            }`}
          >
            {status === 'analyzing' ? (
              <>
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                계산 중…
              </>
            ) : measuring ? (
              '측정 멈춤'
            ) : (
              '측정 시작'
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => setPanel(panel === 'save' ? 'none' : 'save')}
          disabled={!stats}
          className="inline-flex h-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          기록하기{stats ? ` ${stats.n}` : ''}
        </button>
      </div>

      {/* 기록하기 · 설정 — 아래에서 올라오는 칸 */}
      {panel !== 'none' && (
        <div className="motion-safe:animate-fade-in shrink-0 border-t border-white/10 bg-zinc-900 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 text-sm">
          {panel === 'save' && stats && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-bold">오늘 투구 기록으로 남기기</p>
                <button
                  type="button"
                  onClick={() => setPanel('none')}
                  aria-label="닫기"
                  className="rounded-lg p-1 text-white/60 hover:bg-white/10"
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-white/60">
                {today} · {stats.n}구 · 최고 {formatSpeed(stats.max, unit)} · 평균{' '}
                {formatSpeed(stats.avg, unit)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {THROW_TYPES.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => setSessionType(t.name)}
                    aria-pressed={sessionType === t.name}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      sessionType === t.name
                        ? 'bg-sky text-white'
                        : 'bg-white/10 text-white/80 hover:bg-white/20'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
              <label className="block">
                <span className="flex justify-between text-xs text-white/60">
                  강도 <b className="text-white tabular-nums">{intensity} / 10</b>
                </span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={intensity}
                  onChange={(e) => setIntensity(Number(e.target.value))}
                  className="mt-1 w-full accent-sky"
                />
              </label>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-sky text-sm font-bold text-white hover:bg-sky-strong disabled:opacity-50"
              >
                {saving && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
                저장
              </button>
              <p className="text-[11px] leading-relaxed text-white/45">
                스피드건 값을 적어 둔 공은 저장하면서 보정 자료로도 남아요.
              </p>
            </div>
          )}

          {panel === 'settings' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-bold">설정 · 보정</p>
                <button
                  type="button"
                  onClick={() => setPanel('none')}
                  aria-label="닫기"
                  className="rounded-lg p-1 text-white/60 hover:bg-white/10"
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              </div>

              <label className="flex items-center justify-between gap-3">
                <span>
                  카메라 가로 화각
                  <span className="block text-[11px] text-white/50">
                    아이폰 후면 기본 카메라 약 69°. 값이 크면 구속이 높게 나와요.
                  </span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <input
                    inputMode="decimal"
                    value={fov}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (n >= 30 && n <= 120) changeFov(n);
                    }}
                    className="h-9 w-16 rounded-lg border border-white/15 bg-black/40 px-2 text-right tabular-nums text-white focus:border-sky focus:outline-none"
                  />
                  °
                </span>
              </label>

              <div className="rounded-xl bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">
                    스피드건 보정{' '}
                    <span className="text-xs font-normal text-white/60">
                      {fit.n > 0
                        ? `×${fit.scale} ${fit.offset >= 0 ? '+' : ''}${fit.offset} (짝 ${fit.n})`
                        : '짝이 없어요'}
                    </span>
                  </p>
                  <label className="inline-flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={useCal}
                      onChange={(e) => setUseCal(e.target.checked)}
                      className="accent-sky"
                    />
                    적용
                  </label>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-white/50">
                  공마다 &lsquo;건&rsquo; 칸에 스피드건 값을 적고 기록하면 짝이 쌓여요.
                  셋 이상이면 기울기까지 맞춰요.
                </p>
                {pitches.some((p) => p.gun.trim() !== '') && (
                  <button
                    type="button"
                    onClick={storePairs}
                    className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
                  >
                    적어 둔 건 값을 짝으로 저장
                  </button>
                )}
                {pairs.length > 0 && (
                  <>
                    <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-xs tabular-nums">
                      {pairs.map((p, i) => (
                        <li key={`${p.at}-${i}`} className="flex items-center gap-2">
                          <span className="text-white/50">
                            {p.at.slice(5, 16).replace('T', ' ')}
                          </span>
                          <span>카메라 {p.measured}</span>
                          <span>건 {p.gun}</span>
                          <span className="text-white/50">
                            ({p.gun - p.measured >= 0 ? '+' : ''}
                            {Math.round((p.gun - p.measured) * 10) / 10})
                          </span>
                          <button
                            type="button"
                            onClick={() => removePair(i)}
                            aria-label="짝 지우기"
                            className="ml-auto rounded p-0.5 text-white/40 hover:text-white"
                          >
                            <Trash2 aria-hidden className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(pairsToText(pairs))}
                      className="mt-2 inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
                    >
                      <Copy aria-hidden className="h-3.5 w-3.5" />짝 목록 복사
                    </button>
                  </>
                )}
              </div>

              {cameraOn && (
                <button
                  type="button"
                  onClick={() => {
                    captureRef.current?.stop();
                    captureRef.current = null;
                    setCamera(null);
                    setFps(null);
                  }}
                  className="text-xs text-white/60 underline-offset-2 hover:underline"
                >
                  카메라 끄기
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
