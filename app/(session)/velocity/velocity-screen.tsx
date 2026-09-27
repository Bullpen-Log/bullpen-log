'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Film,
  Loader2,
  Settings2,
  Trash2,
  Volume2,
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
  calibrationText,
  loadFov,
  saveFov,
  type CalFit,
} from '@/lib/velocity-calibration';
import {
  CONFIDENCE_TEXT,
  PITCH_TYPES,
  pitchTypeLabel,
  summarize,
  zoneLabel,
  type PitchEdit,
} from '@/lib/velocity-meta';
import {
  approachOf,
  DEFAULT_SETUP,
  frameToView,
  loadSetup,
  modeLabel,
  saveSetup,
  SETUP_KEY,
  setupSummary,
  zoneOfPoint,
  type VelocitySetup,
  type ZoneRect,
} from '@/lib/velocity-setup';
import { LEVEL_OK_DEG, useDeviceLevel } from '@/lib/use-device-level';
import { SESSION_TYPES, DEFAULT_SESSION_TYPE, isRestSession } from '@/lib/session-type';
import { formatSpeed, speedLabel, toSpeed } from '@/lib/units';
import { useSpeedUnit } from '@/components/use-units';
import {
  BottomSheet,
  PitchEditorFields,
  ZoneGrid,
} from '@/components/velocity/pitch-editor';
import {
  AskPreviousStep,
  ChoicesStep,
  LevelBubble,
  PrimaryButton,
  TipsStep,
  ZoneOverlay,
  type Choices,
} from '@/components/velocity/setup-steps';
import { saveVelocitySession, type SavePitchInput } from '@/app/actions/velocity';

/**
 * 구속 측정 화면 — Smart Scout · PitchLab 의 흐름을 우리 모양(아이폰 느낌)으로.
 *
 *   1 지난 설정 그대로?  → 2 투구/타격 · 투수 뒤/포수 뒤 · 네트  → 3 주의사항 카드(자세히)
 *   → 4 카메라: 수평계 · 릴리스 포인트를 표적에  → 5 반투명 스트라이크 존 놓기  → 6 측정
 *
 * 카메라는 4에서 켜져 6까지 같은 <video> 로 이어진다. 고른 것과 존 자리는 브라우저에 남겨
 * 다음에는 1에서 바로 4로 간다. 6의 설정에서 소리 안내 · 화각 · 보정 · 처음부터 다시.
 *
 * PC 에서는 이 전체를 폰 크기 틀(390px) 안에 띄운다 — 폰이 기준이라 PC 화면에 맞춰 늘리지
 * 않는다. 잰 값은 '저장'을 누를 때 서버로 간다(app/actions/velocity.ts). 영상은 어디에도 안 올린다.
 */

type Step = 'choices' | 'tips' | 'align' | 'zone' | 'measure';
type LocalPitch = SavePitchInput & { id: number; source: 'camera' | 'file' };

const STATUS_TEXT: Record<LiveStatus, string> = {
  off: '카메라 꺼짐',
  starting: '카메라 켜는 중…',
  ready: '준비됨',
  settling: '잠잠해지면 시작해요',
  armed: '던지세요',
  capturing: '담는 중',
  analyzing: '계산 중…',
};

const THROW_TYPES = SESSION_TYPES.filter((t) => !isRestSession(t.name));
const EMPTY_EDIT: PitchEdit = {
  pitchType: null,
  zone: null,
  result: null,
  gunKmh: null,
  memo: null,
};

let seq = 0;

/* 저장된 설정을 그리는 동안 읽는다 — 서버에서는 없음, 브라우저에서는 있으면 '지난 설정' 단계 */
const subscribeStorage = (cb: () => void) => {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
};
const readSetupRaw = () => {
  try {
    return localStorage.getItem(SETUP_KEY);
  } catch {
    return null;
  }
};

export function VelocityScreen({
  isAdmin,
  native,
  today,
  calibration,
}: {
  isAdmin: boolean;
  native: boolean;
  today: string;
  /** 서버가 그 사람의 스피드건 짝으로 맞춘 보정식 */
  calibration: CalFit;
}) {
  const router = useRouter();
  const unit = useSpeedUnit();
  const videoRef = useRef<HTMLVideoElement>(null);
  const finderRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<LiveCapture | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── 설정 단계 ── */
  const storedRaw = useSyncExternalStore(subscribeStorage, readSetupRaw, () => null);
  const stored = useMemo(() => (storedRaw ? loadSetup() : null), [storedRaw]);
  const [decided, setDecided] = useState(false);
  const [step, setStep] = useState<Step>('choices');
  const [choices, setChoices] = useState<Choices>({
    mode: DEFAULT_SETUP.mode,
    cameraPos: DEFAULT_SETUP.cameraPos,
    net: DEFAULT_SETUP.net,
  });
  const [zone, setZone] = useState<ZoneRect>(DEFAULT_SETUP.zone);
  const [voice, setVoice] = useState(false);
  const showAsk = stored != null && !decided;
  const approach = approachOf(choices);

  /* ── 카메라 · 측정 ── */
  const [status, setStatus] = useState<LiveStatus>('off');
  const [camera, setCamera] = useState<CameraInfo | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<AnalyzeResult | null>(null);
  const [pitches, setPitches] = useState<LocalPitch[]>([]);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileProgress, setFileProgress] = useState(0);
  const { level, requestPermission } = useDeviceLevel(step === 'align');

  const [fov, setFov] = useState(() => loadFov(DEFAULT_FOV_DEG));
  const [useCal, setUseCal] = useState(true);
  const fit = calibration;
  const shown = (raw: number) =>
    useCal && fit.n > 0 ? applyCalibration(raw, fit) : raw;

  const [sheet, setSheet] = useState<'none' | 'settings' | 'save' | 'pitch'>('none');
  const [editing, setEditing] = useState<number | null>(null);
  const [sessionType, setSessionType] = useState<string>(DEFAULT_SESSION_TYPE);
  const [intensity, setIntensity] = useState(7);
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    return () => {
      captureRef.current?.stop();
      captureRef.current = null;
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    };
  }, []);

  /* 소리로 알린다 — 설정에서 켰을 때만. 폰 스피커로 '백삼십이' 하고 읽는다 */
  const speak = (text: string) => {
    if (!voice || typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = 1.05;
    speechSynthesis.speak(u);
  };

  const persistSetup = (patch: Partial<Omit<VelocitySetup, 'savedAt'>> = {}) =>
    saveSetup({ ...choices, zone, voice, ...patch });

  const addResult = (result: AnalyzeResult, source: LocalPitch['source']) => {
    setLast(result);
    if (!result.measure.ok) {
      speak('못 쟀어요');
      return;
    }
    const m = result.measure;
    const r = result.release;
    const value = shown(m.kmh);

    /*
     * 코스 짐작 — 마지막으로 잡힌 공이 스트라이크 존의 어느 칸에 있었나. 포수 뒤에서는 마지막
     * 공이 미트 근처라 잘 맞고, 투수 뒤에서는 공이 멀어 어림일 뿐이다. 사람이 고칠 수 있다.
     */
    let guessedZone: number | null = null;
    const finder = finderRef.current;
    const tail = result.track[result.track.length - 1];
    if (finder && tail && source === 'camera') {
      const k = result.sourceSize.width / result.analyzeSize.width;
      const view = finder.getBoundingClientRect();
      const p = frameToView({ x: tail.x * k, y: tail.y * k }, result.sourceSize, {
        width: view.width,
        height: view.height,
      });
      guessedZone = zoneOfPoint(p.x, p.y, zone, choices.cameraPos);
    }

    setPitches((prev) => [
      ...prev,
      {
        id: ++seq,
        source,
        rawKmh: m.kmh,
        errorKmh: m.errorKmh,
        confidence: m.confidence,
        releaseKmh: r?.releaseKmh ?? null,
        releaseDxCm: r?.dxCm ?? null,
        releaseDyCm: r?.dyCm ?? null,
        releaseDistM: r?.distanceM ?? m.detail.releaseDistanceM,
        travelM: m.detail.travelM,
        durationSec: m.detail.durationSec,
        frames: m.detail.frames,
        fps: result.fps,
        ...EMPTY_EDIT,
        zone: guessedZone,
      },
    ]);
    setSaved(false);
    if (navigator.vibrate) navigator.vibrate(30);
    speak(`${Math.round(toSpeed(value, unit))}`);
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
      fov,
      approach
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

  const stopCamera = () => {
    captureRef.current?.stop();
    captureRef.current = null;
    setCamera(null);
    setFps(null);
  };

  /* 단계 옮기기 */
  const usePrevious = () => {
    if (!stored) return;
    setChoices({ mode: stored.mode, cameraPos: stored.cameraPos, net: stored.net });
    setZone(stored.zone);
    setVoice(stored.voice);
    setDecided(true);
    setStep('align');
    void startCamera();
  };
  const startFresh = () => {
    setDecided(true);
    setStep('choices');
  };
  const goAlign = () => {
    setStep('align');
    void startCamera();
  };
  const goZone = () => setStep('zone');
  const goMeasure = () => {
    persistSetup();
    captureRef.current?.setApproach(approach);
    setStep('measure');
  };
  const restart = () => {
    captureRef.current?.disarm();
    stopCamera();
    setSheet('none');
    setDecided(true);
    setStep('choices');
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
      addResult(
        await analyzeVideo({
          file,
          fovDeg: fov,
          onProgress: setFileProgress,
          approach,
        }),
        'file'
      );
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

  const patch = (id: number, edit: Partial<PitchEdit>) =>
    setPitches((prev) => prev.map((p) => (p.id === id ? { ...p, ...edit } : p)));
  const remove = (id: number) => {
    setPitches((prev) => prev.filter((p) => p.id !== id));
    setSheet('none');
    setEditing(null);
  };

  const shownPitches = pitches.map((p) => ({ ...p, kmh: shown(p.rawKmh) }));
  const stats = summarize(shownPitches);
  const lastPitch = pitches[pitches.length - 1] ?? null;
  const editingPitch =
    editing == null ? null : (pitches.find((p) => p.id === editing) ?? null);

  const save = () => {
    if (!stats || saving) return;
    setError(null);
    startSaving(async () => {
      const res = await saveVelocitySession({
        date: today,
        sessionType,
        intensity,
        fovDeg: fov,
        source: pitches.every((p) => p.source === 'file') ? 'file' : 'camera',
        device: camera
          ? `${camera.label} ${camera.width}×${camera.height}`.trim()
          : null,
        mode: choices.mode,
        cameraPos: choices.cameraPos,
        net: choices.net,
        pitches: pitches.map((p) => ({
          rawKmh: p.rawKmh,
          errorKmh: p.errorKmh,
          confidence: p.confidence,
          releaseKmh: p.releaseKmh,
          releaseDxCm: p.releaseDxCm,
          releaseDyCm: p.releaseDyCm,
          releaseDistM: p.releaseDistM,
          travelM: p.travelM,
          durationSec: p.durationSec,
          frames: p.frames,
          fps: p.fps,
          pitchType: p.pitchType,
          zone: p.zone,
          result: p.result,
          gunKmh: p.gunKmh,
          memo: p.memo,
        })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setPitches([]);
      setSheet('none');
      router.refresh();
    });
  };

  const measuring =
    status === 'settling' || status === 'armed' || status === 'capturing';
  const cameraOn = status !== 'off' && status !== 'starting';
  const lowFps = fps != null && fps < 60;
  const speedNum = (kmh: number) => Math.round(toSpeed(kmh, unit) * 10) / 10;
  const levelOk =
    !level.supported ||
    (Math.abs(level.roll ?? 0) <= LEVEL_OK_DEG &&
      Math.abs(level.pitch ?? 0) <= LEVEL_OK_DEG);
  const targetText =
    choices.mode === 'hit'
      ? '배트에 맞는 지점'
      : choices.cameraPos === 'behind-pitcher'
        ? '릴리스 포인트'
        : '미트가 오는 자리';

  /* 뷰파인더 — 4 · 5 · 6 단계가 같은 <video> 를 쓴다 */
  const finder = (
    <div
      ref={finderRef}
      className="relative aspect-[3/4] w-full overflow-hidden rounded-[1.75rem] bg-black shadow-sm"
    >
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`h-full w-full object-cover ${cameraOn ? '' : 'hidden'}`}
      />

      {!cameraOn && (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-white">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
            <Camera aria-hidden className="h-6 w-6 text-white/80" />
          </span>
          {status === 'starting' ? (
            <p className="inline-flex items-center gap-2 text-xs text-white/60">
              <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
              카메라 켜는 중…
            </p>
          ) : (
            <button
              type="button"
              onClick={startCamera}
              className="rounded-full bg-white/15 px-4 py-2 text-[13px] font-semibold text-white hover:bg-white/25"
            >
              카메라 다시 켜기
            </button>
          )}
        </div>
      )}

      {/* 스트라이크 존 — 5에서 놓고 6에서 비쳐 보인다 */}
      {cameraOn && step !== 'align' && (
        <ZoneOverlay rect={zone} onChange={setZone} editable={step === 'zone'} />
      )}

      {/* 표적 — 릴리스 포인트 */}
      {cameraOn && step !== 'zone' && (
        <div aria-hidden className="pointer-events-none absolute inset-0 text-white">
          <div
            className={`absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors ${
              status === 'armed'
                ? 'border-sky-soft shadow-[0_0_0_9999px_rgba(0,0,0,0.15)]'
                : status === 'capturing'
                  ? 'border-warn-line'
                  : 'border-white/70'
            }`}
          >
            <span className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-current opacity-80" />
            <span className="absolute bottom-0 left-1/2 h-3 w-px -translate-x-1/2 bg-current opacity-80" />
            <span className="absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 bg-current opacity-80" />
            <span className="absolute right-0 top-1/2 h-px w-3 -translate-y-1/2 bg-current opacity-80" />
            <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
          </div>
          <p className="absolute left-1/2 top-[calc(50%+4.5rem)] -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold tracking-wide text-white/85 drop-shadow">
            {targetText}
          </p>
        </div>
      )}

      {/* 위 줄 — 상태 · 수평계 · 카메라 정보 */}
      {cameraOn && (
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2 text-[11px]">
          {step === 'measure' ? (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold backdrop-blur ${
                status === 'armed'
                  ? 'bg-sky text-white'
                  : status === 'capturing'
                    ? 'bg-warn text-white'
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
          ) : step === 'align' ? (
            <LevelBubble level={level} />
          ) : (
            <span />
          )}
          {camera && (
            <span
              className={`rounded-full px-2.5 py-1 tabular-nums backdrop-blur ${
                lowFps ? 'bg-warn text-white' : 'bg-black/55 text-white/80'
              }`}
            >
              {camera.width}×{camera.height}
              {fps != null && ` · ${fps}fps`}
            </span>
          )}
        </div>
      )}

      {/* 수평계 허락(아이폰) */}
      {step === 'align' && cameraOn && level.needsPermission && (
        <button
          type="button"
          onClick={requestPermission}
          className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-ink shadow"
        >
          기울기 허용하기
        </button>
      )}

      {/* 결과 — 6에서 카메라 위에 크게 */}
      {step === 'measure' && last && !fileBusy && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-5 pb-5 pt-12 text-white">
          {last.measure.ok ? (
            <div className="motion-safe:animate-fade-in">
              <p className="text-display text-[4.25rem] leading-none tabular-nums">
                {speedNum(shown(last.measure.kmh))}
                <span className="ml-2 text-lg text-white/70">{speedLabel(unit)}</span>
              </p>
              <p className="mt-1.5 text-xs text-white/75">
                ± {last.measure.errorKmh} · {CONFIDENCE_TEXT[last.measure.confidence]}
                {last.release &&
                  ` · 릴리스 추정 ${speedNum(shown(last.release.releaseKmh))}`}
                {useCal && fit.n > 0 && ` · 보정 전 ${last.measure.kmh}`}
              </p>
            </div>
          ) : (
            <div className="motion-safe:animate-fade-in">
              <p className="text-sm font-bold text-warn-line">재지 않았어요</p>
              <p className="mt-1 text-xs leading-relaxed text-white/90">
                {last.measure.message}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-white/60">
                {last.measure.fix}
              </p>
              <p className="mt-1.5 text-[10px] text-white/45 tabular-nums">
                {last.sourceSize.width}×{last.sourceSize.height}
                {last.fps != null && ` · ${Math.round(last.fps)}fps`} · 프레임{' '}
                {last.frameCount} · 공 {last.track.length} · 흔들림 {last.shakePx}
              </p>
            </div>
          )}
        </div>
      )}

      {fileBusy && (
        <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-black/70 px-4 py-3 text-xs text-white/85 backdrop-blur">
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
  );

  return (
    /*
     * 폰 틀. PC(desk)에서는 390px 폭 · 둥근 모서리 · 테두리로 폰처럼 보이고, 폰에서는 화면을
     * 꽉 채운다. ui-chrome — PC 의 작아진 크기 기준을 쓰지 않고 폰 크기 그대로 그린다.
     */
    <div className="ui-chrome relative flex min-h-0 flex-1 flex-col bg-page text-ink desk:mx-auto desk:my-4 desk:h-[calc(100dvh-2rem)] desk:max-h-[52.75rem] desk:w-[24.375rem] desk:flex-none desk:overflow-hidden desk:rounded-[2.5rem] desk:border-[6px] desk:border-ink/85 desk:shadow-2xl">
      {/* 내비게이션 바 */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-line bg-surface/90 px-1 pt-[env(safe-area-inset-top)] backdrop-blur">
        {step === 'align' && !showAsk ? (
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setStep('tips');
            }}
            className="inline-flex h-10 items-center gap-0.5 rounded-full pl-1 pr-3 text-[15px] text-sky hover:bg-sky-tint"
          >
            <ChevronLeft aria-hidden className="h-5 w-5" />
            주의사항
          </button>
        ) : step === 'zone' ? (
          <button
            type="button"
            onClick={() => setStep('align')}
            className="inline-flex h-10 items-center gap-0.5 rounded-full pl-1 pr-3 text-[15px] text-sky hover:bg-sky-tint"
          >
            <ChevronLeft aria-hidden className="h-5 w-5" />
            수평
          </button>
        ) : (
          <Link
            href="/videos"
            className="inline-flex h-10 items-center gap-0.5 rounded-full pl-1 pr-3 text-[15px] text-sky transition-colors hover:bg-sky-tint"
          >
            <ChevronLeft aria-hidden className="h-5 w-5" />
            투구 기록
          </Link>
        )}
        <h1 className="text-heading text-[17px]">{modeLabel(choices.mode)} 측정</h1>
        {step === 'measure' ? (
          <button
            type="button"
            onClick={() => setSheet('settings')}
            aria-label="설정"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-sky transition-colors hover:bg-sky-tint"
          >
            <Settings2 aria-hidden className="h-5 w-5" />
          </button>
        ) : (
          <span className="h-10 w-10" />
        )}
      </header>

      {/* 1 · 2 · 3 — 카메라 앞 단계 */}
      {showAsk && stored && (
        <AskPreviousStep setup={stored} onUse={usePrevious} onFresh={startFresh} />
      )}
      {!showAsk && step === 'choices' && (
        <ChoicesStep
          value={choices}
          onChange={setChoices}
          onNext={() => setStep('tips')}
        />
      )}
      {!showAsk && step === 'tips' && (
        <TipsStep
          choices={choices}
          onNext={goAlign}
          onBack={() => setStep('choices')}
        />
      )}

      {/* 4 · 5 — 카메라 맞추기 · 존 놓기 */}
      {!showAsk && (step === 'align' || step === 'zone') && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">
            <p className="text-[11px] font-semibold tracking-wide text-sky">
              {step === 'align' ? '4' : '5'} / 6
            </p>
            <h2 className="text-heading mt-1 text-[1.5rem] leading-tight">
              {step === 'align'
                ? '수평을 맞추고 표적을 맞추세요'
                : '스트라이크 존을 놓으세요'}
            </h2>
            <p className="mb-3 mt-1 text-[13px] leading-relaxed text-muted">
              {step === 'align'
                ? `${withGa(targetText)} 가운데 표적에 오게 폰 높이와 방향을 맞추세요.${
                    level.supported ? ' 위 수평계가 초록이 되면 좋아요.' : ''
                  }`
                : '끌어서 옮기고 오른쪽 아래 손잡이로 크기를 바꾸세요. 뒤가 비쳐 보여요. 잰 공의 코스를 짐작하는 데 써요.'}
            </p>
            {finder}
            {error && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-danger-line bg-danger-bg px-4 py-2.5 text-[13px] text-danger"
              >
                {error}
              </p>
            )}
            {step === 'align' && cameraOn && !levelOk && (
              <p className="mt-3 rounded-xl bg-warn-bg px-4 py-2.5 text-[13px] text-warn">
                아직 기울어 있어요. 그대로 가도 되지만 코스와 궤적이 비뚤게 보여요.
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2 border-t border-line bg-surface/90 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur">
            {step === 'zone' && (
              <PrimaryButton tone="quiet" onClick={() => setZone(DEFAULT_SETUP.zone)}>
                기본 자리
              </PrimaryButton>
            )}
            <PrimaryButton
              onClick={step === 'align' ? goZone : goMeasure}
              disabled={!cameraOn}
            >
              {step === 'align' ? '다음' : '측정 시작하기'}
              <ChevronRight aria-hidden className="h-4 w-4" />
            </PrimaryButton>
          </div>
        </>
      )}

      {/* 6 — 측정 */}
      {!showAsk && step === 'measure' && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">
            {finder}

            <p className="mt-2 flex items-center justify-between px-1 text-[11px] text-muted">
              <span>{setupSummary(choices)}</span>
              {voice && (
                <span className="inline-flex items-center gap-1">
                  <Volume2 aria-hidden className="h-3 w-3" />
                  소리 안내
                </span>
              )}
            </p>
            {isAdmin && !native && (
              <p className="mt-1 text-center text-[11px] leading-snug text-warn">
                웹 시험 모드(관리자) — 브라우저 카메라는 60fps 밑이면 숫자를 내지
                않아요. 앱은 폰의 고속 촬영을 써요.
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-danger-line bg-danger-bg px-4 py-2.5 text-[13px] leading-relaxed text-danger"
              >
                {error}
              </p>
            )}
            {saved && (
              <p className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] text-ink">
                <Check aria-hidden className="h-4 w-4 text-ok" />
                오늘 투구 기록에 남겼어요.
                <Link
                  href={`/pitch-log/${today}`}
                  className="ml-auto font-semibold text-sky"
                >
                  기록 보기
                </Link>
              </p>
            )}

            {/* 방금 공 — 구종을 한 번에 */}
            {lastPitch && (
              <section className="mt-4">
                <p className="mb-1.5 px-1 text-[13px] font-semibold text-muted">
                  방금 공 · {formatSpeed(shown(lastPitch.rawKmh), unit)}
                  {lastPitch.zone != null && ` · ${zoneLabel(lastPitch.zone)}(짐작)`} —
                  구종은?
                </p>
                <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5">
                  {PITCH_TYPES.map((t) => {
                    const on = lastPitch.pitchType === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() =>
                          patch(lastPitch.id, { pitchType: on ? null : t.key })
                        }
                        aria-pressed={on}
                        className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                          on
                            ? 'bg-sky text-white'
                            : 'bg-surface text-ink shadow-sm hover:bg-sky-tint'
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 이번 세션 */}
            <section className="mt-4">
              <p className="mb-1.5 px-1 text-[13px] font-semibold text-muted">
                이번 세션
              </p>
              <div className="overflow-hidden rounded-2xl bg-surface shadow-sm">
                {stats ? (
                  <dl className="grid grid-cols-4 divide-x divide-line">
                    <Stat
                      label="최고"
                      value={speedNum(stats.max)}
                      unit={speedLabel(unit)}
                    />
                    <Stat
                      label="평균"
                      value={speedNum(stats.avg)}
                      unit={speedLabel(unit)}
                    />
                    <Stat label="공" value={stats.n} unit="구" />
                    <Stat
                      label="스트라이크"
                      value={stats.strikeRate == null ? '—' : stats.strikeRate}
                      unit={stats.strikeRate == null ? '' : '%'}
                    />
                  </dl>
                ) : (
                  <p className="px-4 py-5 text-center text-[13px] text-muted">
                    아직 잰 공이 없어요. 측정을 시작하고 던지세요.
                  </p>
                )}
                {stats?.spreadCm != null && (
                  <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
                    릴리스 포인트 흩어짐 평균 {stats.spreadCm}cm — 작을수록 같은
                    자리에서 놓아요.
                  </p>
                )}
              </div>

              {shownPitches.length > 0 && (
                <ul className="mt-2 overflow-hidden rounded-2xl bg-surface shadow-sm">
                  {shownPitches.map((p, i) => (
                    <li key={p.id} className={i > 0 ? 'border-t border-line' : ''}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(p.id);
                          setSheet('pitch');
                        }}
                        className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors active:bg-surface-2"
                      >
                        <span className="w-6 text-xs text-muted tabular-nums">
                          {i + 1}
                        </span>
                        <span className="text-display text-2xl leading-none tabular-nums">
                          {speedNum(p.kmh)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold">
                            {pitchTypeLabel(p.pitchType) ?? (
                              <span className="text-muted">구종 —</span>
                            )}
                            {p.result === 'strike' && (
                              <span className="ml-1.5 text-ok">S</span>
                            )}
                            {p.result === 'ball' && (
                              <span className="ml-1.5 text-warn">B</span>
                            )}
                          </span>
                          <span className="block truncate text-[11px] text-muted">
                            {zoneLabel(p.zone) ?? '코스 —'} · ±{p.errorKmh}
                            {p.gunKmh != null && ` · 건 ${p.gunKmh}`}
                            {p.source === 'file' && ' · 파일'}
                          </span>
                        </span>
                        <ZoneGrid value={p.zone} size="sm" />
                        <ChevronRight
                          aria-hidden
                          className="h-4 w-4 text-line-strong"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* 아래 단추 — 고정 */}
          <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface/90 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur">
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
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-ink transition-colors hover:bg-line disabled:opacity-40"
            >
              <Film aria-hidden className="h-5 w-5" />
            </button>

            {!cameraOn ? (
              <PrimaryButton
                onClick={startCamera}
                disabled={status === 'starting' || fileBusy}
              >
                <Camera aria-hidden className="h-4 w-4" />
                카메라 켜기
              </PrimaryButton>
            ) : (
              <button
                type="button"
                onClick={toggleArm}
                disabled={status === 'analyzing'}
                className={`inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-[15px] font-bold transition-colors disabled:opacity-50 ${
                  measuring
                    ? 'bg-ink text-white hover:bg-ink/85'
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
              onClick={() => setSheet('save')}
              disabled={!stats}
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-2xl bg-surface-2 px-4 text-[15px] font-semibold text-ink transition-colors hover:bg-line disabled:opacity-40"
            >
              저장{stats ? ` ${stats.n}` : ''}
            </button>
          </div>
        </>
      )}

      {/* 공 하나 — 구종 · 코스 · 결과 · 건 값 · 메모 · 자세한 값 */}
      <BottomSheet
        open={sheet === 'pitch' && editingPitch != null}
        onClose={() => {
          setSheet('none');
          setEditing(null);
        }}
        title={
          editingPitch
            ? `${pitches.indexOf(editingPitch) + 1}번째 공 · ${formatSpeed(shown(editingPitch.rawKmh), unit)}`
            : '공'
        }
      >
        {editingPitch && (
          <div className="space-y-5">
            <PitchEditorFields
              value={editingPitch}
              onChange={(next) => patch(editingPitch.id, next)}
            />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-2xl bg-surface-2 px-4 py-3 text-xs">
              <Detail
                label="카메라 값(보정 전)"
                value={`${editingPitch.rawKmh} km/h`}
              />
              <Detail
                label="릴리스 구속 추정"
                value={
                  editingPitch.releaseKmh != null
                    ? `${speedNum(shown(editingPitch.releaseKmh))} ${speedLabel(unit)}`
                    : '—'
                }
              />
              <Detail
                label="릴리스 포인트"
                value={
                  editingPitch.releaseDxCm != null && editingPitch.releaseDyCm != null
                    ? `${sideText(editingPitch.releaseDxCm)} · ${upText(editingPitch.releaseDyCm)}`
                    : '—'
                }
              />
              <Detail
                label={approach === 'receding' ? '릴리스까지 거리' : '미트까지 거리'}
                value={
                  editingPitch.releaseDistM != null
                    ? `${editingPitch.releaseDistM}m`
                    : '—'
                }
              />
              <Detail
                label="날아간 구간"
                value={
                  editingPitch.travelM != null
                    ? `${editingPitch.travelM}m · ${editingPitch.durationSec ?? '?'}초`
                    : '—'
                }
              />
              <Detail
                label="프레임"
                value={`${editingPitch.frames ?? '?'}장${
                  editingPitch.fps != null
                    ? ` · ${Math.round(editingPitch.fps)}fps`
                    : ''
                }`}
              />
            </dl>
            <button
              type="button"
              onClick={() => remove(editingPitch.id)}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-danger-bg text-[15px] font-semibold text-danger transition-colors hover:bg-danger-line/60"
            >
              <Trash2 aria-hidden className="h-4 w-4" />이 공 지우기
            </button>
          </div>
        )}
      </BottomSheet>

      {/* 저장 */}
      <BottomSheet
        open={sheet === 'save'}
        onClose={() => setSheet('none')}
        title="오늘 투구 기록으로 남기기"
      >
        {stats && (
          <div className="space-y-4">
            <p className="text-[13px] text-muted">
              {today} · {stats.n}구 · 최고 {formatSpeed(stats.max, unit)} · 평균{' '}
              {formatSpeed(stats.avg, unit)}
              {useCal && fit.n > 0 ? ` · 보정 ${calibrationText(fit)}` : ' · 보정 없음'}
            </p>
            <div>
              <p className="mb-1.5 text-[13px] font-semibold">종류</p>
              <div className="flex flex-wrap gap-1.5">
                {THROW_TYPES.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => setSessionType(t.name)}
                    aria-pressed={sessionType === t.name}
                    className={`min-h-9 rounded-full px-3.5 text-[13px] font-semibold transition-colors ${
                      sessionType === t.name
                        ? 'bg-sky text-white'
                        : 'bg-surface-2 text-ink hover:bg-line'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="flex justify-between text-[13px] font-semibold">
                강도 <b className="tabular-nums">{intensity} / 10</b>
              </span>
              <input
                type="range"
                min={1}
                max={10}
                value={intensity}
                onChange={(e) => setIntensity(Number(e.target.value))}
                className="mt-2 w-full accent-sky"
              />
            </label>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky text-[15px] font-bold text-white hover:bg-sky-strong disabled:opacity-50"
            >
              {saving && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
              저장
            </button>
            <p className="text-[11px] leading-relaxed text-muted">
              투구 기록 한 건(투구수 {stats.n} · 최고 · 평균)과 공마다 한 줄이 남아요.
              그날 화면에서 공마다 고치고 지울 수 있어요. 스피드건 값을 적은 공은 보정
              자료로도 쓰여요.
            </p>
          </div>
        )}
      </BottomSheet>

      {/* 설정 */}
      <BottomSheet
        open={sheet === 'settings'}
        onClose={() => setSheet('none')}
        title="설정"
      >
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl bg-surface-2">
            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="block text-[15px]">소리로 구속 알려주기</span>
                <span className="block text-[11px] text-muted">
                  공을 잴 때마다 폰이 숫자를 읽어요. 카메라를 볼 필요 없이 던질 수
                  있어요.
                </span>
              </span>
              <input
                type="checkbox"
                checked={voice}
                onChange={(e) => {
                  setVoice(e.target.checked);
                  persistSetup({ voice: e.target.checked });
                  if (e.target.checked && typeof speechSynthesis !== 'undefined') {
                    const u = new SpeechSynthesisUtterance('소리 안내를 켰어요');
                    u.lang = 'ko-KR';
                    speechSynthesis.speak(u);
                  }
                }}
                className="h-5 w-5 accent-sky"
              />
            </label>
            <label className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
              <span>
                <span className="block text-[15px]">카메라 가로 화각</span>
                <span className="block text-[11px] text-muted">
                  아이폰 후면 기본 카메라 약 69°. 크게 잡으면 구속이 높게 나와요.
                </span>
              </span>
              <span className="inline-flex items-center gap-1 text-[15px]">
                <input
                  inputMode="decimal"
                  defaultValue={fov}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (n >= 30 && n <= 120) changeFov(n);
                    else e.target.value = String(fov);
                  }}
                  className="h-10 w-16 rounded-xl border border-line bg-surface px-2 text-right tabular-nums focus:border-sky focus:outline-none"
                />
                °
              </span>
            </label>
            <label className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
              <span>
                <span className="block text-[15px]">스피드건 보정 적용</span>
                <span className="block text-[11px] text-muted">
                  {fit.n > 0
                    ? `내 짝 ${fit.n}개로 맞춘 식 ${calibrationText(fit)}`
                    : '아직 짝이 없어요 — 공에 스피드건 값을 적고 저장하면 쌓여요.'}
                </span>
              </span>
              <input
                type="checkbox"
                checked={useCal}
                disabled={fit.n === 0}
                onChange={(e) => setUseCal(e.target.checked)}
                className="h-5 w-5 accent-sky"
              />
            </label>
          </div>

          <div className="rounded-2xl bg-surface-2 px-4 py-3 text-[13px] text-muted">
            <p className="font-semibold text-ink">지금 설정</p>
            <p className="mt-0.5">
              {setupSummary(choices)} · 스트라이크 존 자리 저장됨
            </p>
          </div>

          <div className="flex gap-2">
            <PrimaryButton
              tone="quiet"
              onClick={() => {
                setSheet('none');
                setStep('zone');
              }}
            >
              존 다시 놓기
            </PrimaryButton>
            <PrimaryButton tone="quiet" onClick={restart}>
              처음부터 다시 설정
            </PrimaryButton>
          </div>

          {cameraOn && (
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setSheet('none');
              }}
              className="w-full text-center text-[13px] text-muted underline-offset-2 hover:underline"
            >
              카메라 끄기
            </button>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | string;
  unit: string;
}) {
  return (
    <div className="px-2 py-3 text-center">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="text-display mt-0.5 text-2xl leading-none tabular-nums">
        {value}
        {unit && (
          <span className="ml-0.5 font-sans text-[11px] text-muted">{unit}</span>
        )}
      </dd>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="text-right tabular-nums text-ink">{value}</dd>
    </>
  );
}

/** '릴리스 포인트가' · '지점이' — 받침이 있으면 '이', 없으면 '가' */
const withGa = (word: string) => {
  const last = word.charCodeAt(word.length - 1);
  const hangul = last >= 0xac00 && last <= 0xd7a3;
  return word + (hangul && (last - 0xac00) % 28 !== 0 ? '이' : '가');
};

const sideText = (dx: number) =>
  Math.abs(dx) < 1 ? '가운데' : `${dx > 0 ? '오른쪽' : '왼쪽'} ${Math.abs(dx)}cm`;
const upText = (dy: number) =>
  Math.abs(dy) < 1 ? '표적 높이' : `${dy > 0 ? '위' : '아래'} ${Math.abs(dy)}cm`;
