'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, ChevronLeft, ChevronRight, Loader2, Play, Pause } from 'lucide-react';
import { extractPoseTrack, frameAt } from '@/lib/pose/extract';
import { detectPitchEvents } from '@/lib/pose/detect';
import {
  measurePitchMetrics,
  MIN_PLAUSIBLE_STRIDE_PCT,
  type PitchMetric,
} from '@/lib/pose/measure';
import { compareMetrics, type SavedAnalysisView } from '@/lib/pose/saved';
import { savePoseAnalysis } from '@/app/actions/pose-analysis';
import { LM, QUALITY_THRESHOLD, type PoseTrack } from '@/lib/pose/types';
import { getContentBox } from '@/components/video-canvas';
import type { VideoWithFrameCallback } from '@/components/use-frame-duration';

/**
 * 폼 분석 (베타) — 영상에서 관절을 뽑아 스켈레톤을 겹쳐 보여준다.
 *
 * 분석은 전부 이 기기 안에서 돌아가고 영상은 어디로도 전송되지 않는다.
 * 지금 단계(v0)는 추출·표시까지이고, 구간 검출과 수치 측정은 다음 단계다.
 */

const BODY_START = 11; // 얼굴 세부 관절(0~10)은 선을 긋지 않는다.

type EventKey = 'kneeUp' | 'footPlant' | 'release';

const EVENT_ORDER: EventKey[] = ['kneeUp', 'footPlant', 'release'];

const EVENT_LABELS: Record<EventKey, string> = {
  kneeUp: '니업',
  footPlant: '착지',
  release: '릴리스',
};

/** "현재 프레임을 ~로 지정" 버튼 문구용 조사 처리 */
const EVENT_AS: Record<EventKey, string> = {
  kneeUp: '니업으로',
  footPlant: '착지로',
  release: '릴리스로',
};

/**
 * 이보다 멀리 떨어진 프레임밖에 없으면 스켈레톤을 그리지 않는다.
 * 인식이 끊긴 구간에서 엉뚱한(마지막으로 인식된) 자세를 몸 위에
 * 고정해 보여주는 것보다 비워두는 쪽이 정직하다.
 */
const MAX_DRAW_GAP_SECONDS = 0.3;

/*
 * 좌우를 색으로 가른다.
 *
 * 한 가지 색으로 그리면 옆에서 찍은 영상에서 두 팔과 두 다리가 겹쳐 보여
 * 어느 쪽이 던지는 팔인지 알 수가 없다.
 */
const SIDE_COLOR = {
  left: 'rgba(56, 189, 248, 0.95)',
  right: 'rgba(251, 146, 60, 0.95)',
  center: 'rgba(226, 232, 240, 0.9)',
} as const;

const LEFT_POINTS = new Set<number>([
  LM.leftShoulder, LM.leftElbow, LM.leftWrist,
  LM.leftHip, LM.leftKnee, LM.leftAnkle,
]);
const RIGHT_POINTS = new Set<number>([
  LM.rightShoulder, LM.rightElbow, LM.rightWrist,
  LM.rightHip, LM.rightKnee, LM.rightAnkle,
]);

function sideOf(a: number, b?: number): keyof typeof SIDE_COLOR {
  const left = LEFT_POINTS.has(a) && (b == null || LEFT_POINTS.has(b));
  const right = RIGHT_POINTS.has(a) && (b == null || RIGHT_POINTS.has(b));
  return left ? 'left' : right ? 'right' : 'center';
}

/**
 * 관절 옆에 띄우는 각도.
 *
 * 부위마다 색을 달리해 어느 숫자가 무엇인지 색만 보고 알게 한다. 몸통
 * 기울기(수직 대비)만 좌우가 없어 이름표를 안 붙인다.
 */
type AngleSpec = {
  /** 각을 재는 세 점 — 가운데가 꼭짓점 */
  a: number;
  v: number;
  b: number;
  color: string;
};

const ANGLE_SPECS: AngleSpec[] = [
  /* 팔꿈치 — 어깨·팔꿈치·손목 */
  { a: LM.leftShoulder, v: LM.leftElbow, b: LM.leftWrist, color: '#f472b6' },
  { a: LM.rightShoulder, v: LM.rightElbow, b: LM.rightWrist, color: '#f472b6' },
  /* 어깨 — 팔꿈치·어깨·골반 */
  { a: LM.leftElbow, v: LM.leftShoulder, b: LM.leftHip, color: '#fb923c' },
  { a: LM.rightElbow, v: LM.rightShoulder, b: LM.rightHip, color: '#fb923c' },
  /* 고관절 — 어깨·골반·무릎 */
  { a: LM.leftShoulder, v: LM.leftHip, b: LM.leftKnee, color: '#4ade80' },
  { a: LM.rightShoulder, v: LM.rightHip, b: LM.rightKnee, color: '#4ade80' },
  /* 무릎 — 골반·무릎·발목 */
  { a: LM.leftHip, v: LM.leftKnee, b: LM.leftAnkle, color: '#facc15' },
  { a: LM.rightHip, v: LM.rightKnee, b: LM.rightAnkle, color: '#facc15' },
];

/** 세 점이 이루는 각(도). 가운데가 꼭짓점이다. */
function angleBetween(
  a: { x: number; y: number },
  v: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const a1 = Math.atan2(a.y - v.y, a.x - v.x);
  const a2 = Math.atan2(b.y - v.y, b.x - v.x);
  let deg = Math.abs((a1 - a2) * (180 / Math.PI));
  if (deg > 180) deg = 360 - deg;
  return Math.round(deg);
}

/**
 * 아주 작게 그린다.
 *
 * 관절 열 곳에 숫자가 붙으므로 크면 폼이 안 보인다. 대신 어두운 판을 깔아
 * 밝은 배경(흙·잔디) 위에서도 읽히게 한다.
 */
function angleLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  scale: number
) {
  const size = Math.max(8, Math.round(9 * scale));
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const padX = Math.max(2, size * 0.3);
  const w = ctx.measureText(text).width + padX * 2;
  const h = size + padX;

  ctx.fillStyle = 'rgba(8, 12, 20, 0.62)';
  ctx.beginPath();
  ctx.roundRect(x, y - h / 2, w, h, Math.max(2, size * 0.25));
  ctx.fill();

  ctx.fillStyle = color;
  ctx.fillText(text, x + padX, y + 0.5);
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  track: PoseTrack,
  t: number,
  canvasW: number,
  canvasH: number,
  showAngles: boolean
) {
  const frame = frameAt(track, t);
  if (!frame) return;
  if (Math.abs(frame.t - t) > Math.max(MAX_DRAW_GAP_SECONDS, track.sampleStep * 3)) return;

  const box = getContentBox(canvasW, canvasH, track.videoWidth, track.videoHeight);
  const px = (x: number) => box.ox + x * box.dw;
  const py = (y: number) => box.oy + y * box.dh;
  const pts = frame.landmarks;

  // 연결선
  ctx.lineWidth = Math.max(1.5, canvasW / 480);
  for (const { start, end } of track.connections) {
    if (start < BODY_START && start !== LM.nose) continue;
    if (end < BODY_START && end !== LM.nose) continue;
    const a = pts[start];
    const b = pts[end];
    if (!a || !b) continue;
    const ok = Math.min(a.visibility, b.visibility) >= QUALITY_THRESHOLD;
    ctx.strokeStyle = ok ? SIDE_COLOR[sideOf(start, end)] : 'rgba(252, 165, 165, 0.5)';
    ctx.beginPath();
    ctx.moveTo(px(a.x), py(a.y));
    ctx.lineTo(px(b.x), py(b.y));
    ctx.stroke();
  }

  // 관절점
  const r = Math.max(2, canvasW / 320);
  for (let i = 0; i < pts.length; i++) {
    if (i < BODY_START && i !== LM.nose) continue;
    const p = pts[i];
    ctx.fillStyle =
      p.visibility >= QUALITY_THRESHOLD
        ? SIDE_COLOR[sideOf(i)]
        : 'rgba(252, 165, 165, 0.6)';
    ctx.beginPath();
    ctx.arc(px(p.x), py(p.y), r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!showAngles) return;

  /*
   * 각도.
   *
   * 인식이 흐린 관절은 숫자를 내지 않는다. 값이 크게 튀는데 화면에는 그럴듯한
   * 숫자로 보여, 없는 것보다 나쁘다.
   */
  const scale = canvasW / 640;
  for (const spec of ANGLE_SPECS) {
    const a = pts[spec.a];
    const v = pts[spec.v];
    const b = pts[spec.b];
    if (!a || !v || !b) continue;
    if (Math.min(a.visibility, v.visibility, b.visibility) < QUALITY_THRESHOLD) continue;
    const side = LEFT_POINTS.has(spec.v) ? 'L' : 'R';
    angleLabel(
      ctx,
      `${side} ${angleBetween(a, v, b)}°`,
      px(v.x) + r * 1.6,
      py(v.y) - r * 1.6,
      spec.color,
      scale
    );
  }

  /* 몸통 기울기 — 어깨 가운데와 골반 가운데를 잇는 선이 수직에서 얼마나 벗어났나 */
  const ls = pts[LM.leftShoulder];
  const rs = pts[LM.rightShoulder];
  const lh = pts[LM.leftHip];
  const rh = pts[LM.rightHip];
  if (ls && rs && lh && rh) {
    const vis = Math.min(ls.visibility, rs.visibility, lh.visibility, rh.visibility);
    if (vis >= QUALITY_THRESHOLD) {
      const sx = (ls.x + rs.x) / 2;
      const sy = (ls.y + rs.y) / 2;
      const hx = (lh.x + rh.x) / 2;
      const hy = (lh.y + rh.y) / 2;
      const tilt = Math.round(Math.atan2(sx - hx, hy - sy) * (180 / Math.PI));
      angleLabel(
        ctx,
        `${tilt}°`,
        px((sx + hx) / 2) + r * 1.6,
        py((sy + hy) / 2),
        '#f87171',
        scale
      );
    }
  }
}

/** 지표 카드 그리드 — 새 분석과 저장된 분석 양쪽에서 같은 모양으로 쓴다. */
function MetricsGrid({ metrics }: { metrics: PitchMetric[] }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      {metrics.map((m) => (
        <div
          key={`${m.phase}-${m.key}`}
          className="rounded-xl border border-line bg-surface-2 px-3 py-2.5"
        >
          <p className="text-[10px] tracking-normal text-muted">
            {EVENT_LABELS[m.phase as EventKey]} · {m.label}
          </p>
          {m.display ? (
            <p className="mt-1 text-sm font-semibold text-ink">{m.display}</p>
          ) : (
            <p className="mt-1 text-xs text-muted">
              {m.reason === '구간 없음'
                ? '구간 지정 필요'
                : m.reason === '기준 없음'
                  ? '측정 불가 (전신 필요)'
                  : '측정 불가 (흐림)'}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/** 지난 저장 분석과의 변화. 둘 다 측정된 지표만 나온다. */
function DeltaBlock({
  current,
  previous,
}: {
  current: PitchMetric[];
  previous: SavedAnalysisView;
}) {
  const deltas = compareMetrics(current, previous.metrics);
  if (deltas.length === 0) return null;
  return (
    <div className="space-y-1 rounded-xl border border-sky-soft/40 bg-sky/[0.04] px-3 py-2.5">
      <p className="text-[10px] tracking-normal text-sky">
        지난 분석 대비 · {previous.date}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {deltas.map((d) => (
          <span key={`${d.phase}-${d.key}`} className="text-[11px] text-ink/90">
            {EVENT_LABELS[d.phase as EventKey]} {d.label}{' '}
            <span className={d.delta === 0 ? 'text-muted' : 'font-semibold text-sky'}>
              {d.delta > 0 ? '+' : ''}
              {d.delta}
              {d.unit}
            </span>
          </span>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-muted/60">
        같은 조건(측면·같은 거리)으로 찍었을 때만 의미 있는 비교입니다.
      </p>
    </div>
  );
}

export function PoseAnalysis({
  src,
  label,
  heightCm,
  pitchLogId,
  videoPath,
  saved,
  previous,
}: {
  src: string;
  label: string;
  heightCm?: number | null;
  /** 저장·비교용 — 없으면 저장 기능이 숨겨진다 (비교 화면 등) */
  pitchLogId?: string;
  videoPath?: string;
  saved?: SavedAnalysisView | null;
  previous?: SavedAnalysisView | null;
}) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'analyzing' | 'ready' | 'error'>(
    'idle'
  );
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [track, setTrack] = useState<PoseTrack | null>(null);
  const [playing, setPlaying] = useState(false);

  // 구간(니업·착지·릴리스) — 자동 감지 결과 + 사용자가 프레임으로 직접 보정한 값
  // 뒤에서 찍은 영상은 인식 모델이 좌우 라벨을 뒤집으므로 표기만 고칠 수 있게 한다.
  const [handedLabel, setHandedLabel] = useState<'left' | 'right' | null>(null);
  const [overrides, setOverrides] = useState<Partial<Record<EventKey, number>>>({});
  const [selected, setSelected] = useState<EventKey | null>(null);
  const [now, setNow] = useState(0);

  const videoRef = useRef<VideoWithFrameCallback>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /*
   * 각도를 켜고 끈다.
   *
   * 관절 열 곳에 숫자가 붙으므로, 폼 자체를 볼 때는 끄는 편이 낫다. 기본은
   * 켬이다 — 있는 줄 모르면 안 쓰게 된다.
   */
  const [showAngles, setShowAngles] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const router = useRouter();
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string>();

  const events = useMemo(
    () => (track ? detectPitchEvents(track, handedLabel ?? undefined) : null),
    [track, handedLabel]
  );

  const effectiveTime = (key: EventKey): number | null =>
    overrides[key] ?? events?.[key]?.t ?? null;

  // 지표 — 수동 보정된 구간 기준으로 다시 계산된다.
  // 좌/우투 표기(throwingSide)가 아니라 실제로 감지된 팔(wristSide)로 잰다.
  const metrics = useMemo(() => {
    if (!track || !events) return null;
    return measurePitchMetrics(
      track,
      {
        kneeUp: overrides.kneeUp ?? events.kneeUp?.t ?? null,
        footPlant: overrides.footPlant ?? events.footPlant?.t ?? null,
        release: overrides.release ?? events.release?.t ?? null,
      },
      events.wristSide,
      events.direction,
      heightCm,
      events.leadSide
    );
  }, [track, events, overrides, heightCm]);

  const seekTo = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = t;
    setNow(t);
  };

  const stepFrame = (dir: 1 | -1) => {
    const v = videoRef.current;
    if (!v || !track) return;
    v.pause();
    const max = Number.isFinite(v.duration) ? v.duration : Infinity;
    const t = Math.min(Math.max(v.currentTime + dir * track.sampleStep, 0), max);
    v.currentTime = t;
    setNow(t);
  };

  const run = async () => {
    setPhase('loading');
    setError(undefined);
    setProgress(0);
    abortRef.current = new AbortController();

    try {
      const result = await extractPoseTrack(
        src,
        (ratio) => {
          setPhase('analyzing');
          setProgress(ratio);
        },
        abortRef.current.signal
      );
      setTrack(result);
      setPhase('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석에 실패했습니다.');
      setPhase('error');
    }
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleSave = () => {
    if (!track || !events || !metrics || !pitchLogId || !videoPath) return;
    setSaveState('saving');
    setSaveError(undefined);
    savePoseAnalysis({
      pitchLogId,
      videoPath,
      throwingSide: events.throwingSide,
      wristSide: events.wristSide,
      leadSide: events.leadSide,
      direction: events.direction,
      quality: track.quality,
      coverage: track.coverage,
      kneeUpT: events.kneeUp?.t ?? null,
      footPlantT: events.footPlant?.t ?? null,
      releaseT: events.release?.t ?? null,
      kneeUpManualT: overrides.kneeUp ?? null,
      footPlantManualT: overrides.footPlant ?? null,
      releaseManualT: overrides.release ?? null,
      metrics,
    })
      .then((res) => {
        if ('error' in res) {
          setSaveState('error');
          setSaveError(res.error);
        } else {
          setSaveState('saved');
          router.refresh();
        }
      })
      .catch(() => {
        setSaveState('error');
        setSaveError('저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
      });
  };

  // 재생 시각에 맞춰 스켈레톤을 계속 다시 그린다.
  const draw = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !track) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    drawSkeleton(ctx, track, video.currentTime, w, h, showAngles);
  }, [track, showAngles]);

  useEffect(() => {
    if (phase !== 'ready') return;
    const video = videoRef.current;
    if (!video) return;

    let raf = 0;
    const loop = () => {
      // 한 프레임에서 예외가 나도 그리기 루프가 영원히 죽지 않게 한다.
      try {
        draw();
      } catch {
        // 다음 프레임에서 다시 시도
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, draw]);

  if (phase === 'idle' || phase === 'error') {
    return (
      <div className="space-y-2">
        {/* 저장된 분석이 있으면 재분석 없이 바로 보여준다 */}
        {saved && (
          <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[10px] font-medium tracking-normal text-sky">
                저장된 폼 분석
              </p>
              <span className="text-[10px] text-muted">
                {saved.throwingSide === 'right' ? '우투' : '좌투'} · 인식 신뢰도{' '}
                {Math.round(saved.quality * 100)}%
              </span>
            </div>
            <MetricsGrid metrics={saved.metrics} />
            {previous && <DeltaBlock current={saved.metrics} previous={previous} />}
          </div>
        )}
        <button
          type="button"
          onClick={run}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-xs text-ink transition-colors hover:border-sky hover:text-sky"
        >
          <Activity className="h-3.5 w-3.5" />
          {saved ? '다시 분석 (스켈레톤 보기)' : '폼 분석 (베타)'}
        </button>
        {phase === 'error' && (
          <p className="rounded-lg border border-danger-line bg-danger-bg px-3 py-2 text-xs leading-relaxed text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (phase === 'loading' || phase === 'analyzing') {
    return (
      <div className="space-y-2 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <p className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-sky" />
          {phase === 'loading'
            ? '분석 도구 준비 중… (처음 한 번만 내려받습니다)'
            : `관절 위치 추출 중… ${Math.round(progress * 100)}%`}
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-sky transition-[width] duration-200"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <p className="text-[11px] text-muted/60">
          영상은 전송되지 않고 이 기기 안에서만 분석됩니다.
        </p>
      </div>
    );
  }

  // ready
  const lowQuality = track && track.quality < QUALITY_THRESHOLD;

  // 스트라이드가 비정상적으로 짧으면 측면(90도) 촬영이 아니라는 신호다.
  const strideMetric = metrics?.find((m) => m.key === 'stride');
  const badCameraAngle =
    strideMetric?.value != null && strideMetric.value < MIN_PLAUSIBLE_STRIDE_PCT;

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border border-sky-soft/50 bg-black">
        <video
          ref={videoRef}
          src={src}
          playsInline
          muted
          onClick={() => {
            const v = videoRef.current;
            if (!v) return;
            if (v.paused) v.play().catch(() => {});
            else v.pause();
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
          className="block aspect-video w-full cursor-pointer object-contain"
          aria-label={`${label} 스켈레톤 보기`}
        />
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />

        {/*
          각도 켜고 끄기.

          영상 위에 둔다 — 숫자를 끄고 싶어지는 순간은 영상을 보고 있을 때다.
          아래 단추 줄까지 내려가서 찾게 하면 안 쓴다.

          왼쪽 위다. 오른쪽에 두었더니 인식 신뢰도 표시와 겹쳐 둘 다 안 읽혔다.
          아래 왼쪽은 재생 단추가 쓰고 있다.
        */}
        <button
          type="button"
          onClick={() => setShowAngles((v) => !v)}
          aria-pressed={showAngles}
          className={`absolute top-2 left-2 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold shadow-lg transition-colors ${
            showAngles
              ? 'bg-sky text-white'
              : 'bg-shade/70 text-white/70 hover:text-white'
          }`}
        >
          각도 {showAngles ? '켬' : '끔'}
        </button>

        <button
          type="button"
          onClick={() => {
            const v = videoRef.current;
            if (!v) return;
            if (v.paused) v.play().catch(() => {});
            else v.pause();
          }}
          aria-label={playing ? '일시정지' : '재생'}
          className="absolute bottom-2 left-2 flex h-9 w-9 items-center justify-center rounded-full bg-sky text-white shadow-lg"
        >
          {playing ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="ml-0.5 h-4 w-4 fill-current" />
          )}
        </button>

        <span className="absolute right-2 top-2 rounded-full bg-shade/70 px-2.5 py-1 text-[10px] text-teal-300">
          스켈레톤 · 인식 신뢰도 {Math.round((track?.quality ?? 0) * 100)}%
        </span>
      </div>

      {/* 인식이 많이 끊겼으면 스켈레톤이 사라지는 구간이 생긴다 — 이유를 알려주고 재시도 */}
      {track && track.coverage < 0.8 && (
        <div className="space-y-2 rounded-lg border border-warn-line bg-warn-bg px-3 py-2">
          <p className="text-[11px] leading-relaxed text-warn">
            영상 구간의 {Math.round(track.coverage * 100)}%에서만 몸을 인식했습니다.
            인식이 끊긴 구간에서는 스켈레톤이 표시되지 않습니다. 일시적인 문제일 수
            있으니 다시 분석해보고, 계속 그러면 밝은 곳에서 전신이 크게 나오게 다시
            찍어주세요.
          </p>
          <button
            type="button"
            onClick={() => {
              abortRef.current?.abort();
              setTrack(null);
              setOverrides({});
              setSelected(null);
              setHandedLabel(null);
              setPhase('idle');
            }}
            className="rounded-lg border border-warn-line px-2.5 py-1.5 text-[11px] text-warn transition-colors hover:border-warn hover:text-warn"
          >
            다시 분석하기
          </button>
        </div>
      )}

      {/* 구간 — 자동 감지된 순간으로 이동하고, 틀리면 프레임 단위로 직접 지정 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-surface-2 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {EVENT_ORDER.map((key) => {
            const t = effectiveTime(key);
            const auto = events?.[key];
            const overridden = overrides[key] != null;
            const blurry = !overridden && auto != null && auto.confidence < QUALITY_THRESHOLD;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSelected(key);
                  if (t != null) seekTo(t);
                }}
                className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  selected === key
                    ? 'border-sky bg-sky/10 text-sky'
                    : 'border-line text-muted hover:border-sky-soft hover:text-ink'
                }`}
              >
                {EVENT_LABELS[key]}{' '}
                {t != null ? `${t.toFixed(2)}초` : '감지 못함'}
                {blurry && '?'}
                {overridden && ' ✎'}
              </button>
            );
          })}
          {events && (
            <button
              type="button"
              onClick={() => {
                setHandedLabel(events.throwingSide === 'right' ? 'left' : 'right');
                setSaveState('idle');
              }}
              title="투구 방향의 뒤에서 찍힌 영상은 좌우가 뒤집혀 인식될 수 있습니다. 표기만 바뀌고 측정값은 그대로입니다."
              className="ml-auto rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:border-sky-soft hover:text-ink"
            >
              {events.throwingSide === 'right'
                ? '우투로 인식 — 틀리면 좌투로 바꾸기'
                : '좌투로 인식 — 틀리면 우투로 바꾸기'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => stepFrame(-1)}
            aria-label="이전 프레임"
            className="rounded-lg border border-line p-1.5 text-muted transition-colors hover:border-sky hover:text-sky"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => stepFrame(1)}
            aria-label="다음 프레임"
            className="rounded-lg border border-line p-1.5 text-muted transition-colors hover:border-sky hover:text-sky"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <span className="px-1 text-[11px] tabular-nums text-muted">
            현재 {now.toFixed(2)}초
          </span>
          <button
            type="button"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              const v = videoRef.current;
              if (!v) return;
              setOverrides((prev) => ({ ...prev, [selected]: v.currentTime }));
              setSaveState('idle');
            }}
            className="rounded-lg border border-line-strong px-2.5 py-1.5 text-[11px] text-ink transition-colors enabled:hover:border-sky enabled:hover:text-sky disabled:opacity-40"
          >
            현재 프레임을 {selected ? EVENT_AS[selected] : '구간으로'} 지정
          </button>
          {selected && overrides[selected] != null && (
            <button
              type="button"
              onClick={() => {
                setOverrides((prev) => {
                  const next = { ...prev };
                  delete next[selected];
                  return next;
                });
                setSaveState('idle');
              }}
              className="rounded-lg px-2 py-1.5 text-[11px] text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              자동값 복원
            </button>
          )}
        </div>

        {events && !events.sideViewOk ? (
          <p className="text-[11px] leading-relaxed text-muted/60">
            구간을 직접 지정할 수는 있지만, 촬영 각도 때문에 수치는 실제와 다르게
            나옵니다.
          </p>
        ) : events && !events.kneeUp && !events.footPlant && !events.release ? (
          <p className="text-[11px] leading-relaxed text-warn">
            투구 동작을 찾지 못했습니다. 팔을 휘두르는 장면이 화면 안에 다 들어와
            있는지 확인해주세요. 구간을 누른 뒤 ◀ ▶로 프레임을 맞추고 직접
            지정하면 수치는 똑같이 계산됩니다.
          </p>
        ) : (
          <p className="text-[11px] leading-relaxed text-muted/60">
            구간을 누르면 그 순간으로 이동합니다. 위치가 틀리면 ◀ ▶로 맞춘 뒤
            지정을 누르세요. ?는 그 순간 관절 인식이 흐렸다는 표시입니다.
          </p>
        )}
      </div>

      {events && !events.sideViewOk && (
        <p className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-[11px] leading-relaxed text-warn">
          투구 방향의 앞이나 뒤에서 찍힌 영상이라 자동 분석을 하지 않았습니다.
          이 각도에서는 몸이 화면 안쪽으로 움직여 거리와 각도를 잴 수 없어,
          숫자를 내면 전부 틀린 값이 됩니다. 위 촬영 가이드대로 1루 또는 3루
          쪽에서 옆모습으로 찍어주세요. 스켈레톤은 그대로 보실 수 있습니다.
        </p>
      )}

      {badCameraAngle && (
        <p className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-[11px] leading-relaxed text-warn">
          스트라이드가 신장의 {strideMetric?.value}%로 측정됐습니다 — 옆(90도)이
          아닌 각도에서 찍힌 영상 같습니다. 이런 영상은 거리·각도 수치가 실제보다
          작게 나오고 좌/우투 인식도 뒤집힐 수 있습니다. 위 촬영 가이드대로 옆에서
          다시 찍으면 정확해집니다.
        </p>
      )}

      {/* 지표 — 구간 프레임에서 잰 수치. 절대값보다 지난 영상과의 변화가 중요하다. */}
      {metrics && !lowQuality && (
        <div className="space-y-1.5">
          <MetricsGrid metrics={metrics} />
          <p className="text-[11px] leading-relaxed text-muted/60">
            90도 측면 촬영 기준의 근사값입니다. 절대값보다는 같은 조건으로 찍은
            지난 영상과의 변화를 보세요. 구간을 수동 지정하면 수치도 다시 계산됩니다.
          </p>

          {previous && <DeltaBlock current={metrics} previous={previous} />}

          {/* 저장 — 측면·인식 상태가 좋은 분석만. 다음에 재분석 없이 보고 비교에 쓴다. */}
          {pitchLogId && videoPath && events?.sideViewOk && track && track.coverage >= 0.8 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={saveState === 'saving' || saveState === 'saved'}
                className="rounded-lg border border-sky-soft bg-sky/10 px-3 py-2 text-xs font-medium text-sky transition-colors enabled:hover:border-sky disabled:opacity-60"
              >
                {saveState === 'saving'
                  ? '저장 중…'
                  : saveState === 'saved'
                    ? '저장됨 ✓'
                    : saved
                      ? '분석 다시 저장'
                      : '이 분석 저장'}
              </button>
              <span className="text-[11px] text-muted/60">
                저장하면 다음에 재분석 없이 바로 보이고, 이후 세션과 자동 비교됩니다.
              </span>
              {saveState === 'error' && saveError && (
                <span className="text-[11px] text-danger">{saveError}</span>
              )}
            </div>
          )}
        </div>
      )}

      {lowQuality && (
        <p className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-[11px] leading-relaxed text-warn">
          관절 인식 신뢰도가 낮습니다. 밝은 곳에서 전신이 다 나오게, 배경과 구분되는
          옷으로 다시 찍으면 좋아집니다. 이 상태의 측정값은 신뢰하기 어렵습니다.
        </p>
      )}
    </div>
  );
}
