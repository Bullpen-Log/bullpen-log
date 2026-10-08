'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Rotate3d } from 'lucide-react';
import { DisclosureButton } from '@/components/disclosure';
import { ErrorLine } from '@/components/error-line';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { loadLabAnalysis, saveLabAnalysis } from '@/app/actions/pitch-lab';
import type { LabSample } from '@/lib/pitch-lab';
import {
  WARNING_TEXT,
  type Pitch3dOk,
  type Pitch3dResult,
} from '@/lib/pitch-3d/analyze';
import type { Metric, MetricKey } from '@/lib/pitch-3d/metrics';

/** 3D 보기는 결과를 펼 때만 받는다 */
const Skeleton3D = dynamic(() => import('./skeleton-3d').then((m) => m.Skeleton3D), {
  ssr: false,
});

/**
 * 샘플 카드의 3D 분석(설계 5절 2단계) — 두 영상의 관절 찾기(0.25배, 검토 R1) → 3D 계산(워커) → 저장(analysis.json, R9) → 결과.
 * 겉은 단순하게: 지표 여섯 줄 + 믿음, 나머지 지표 · 두 영상이 맞는 정도는 '자세히'에.
 */

export const LABELS: Record<MetricKey, string> = {
  trunkForwardTilt: '몸통 앞 기울기 · 릴리스',
  trunkLateralTilt: '몸통 옆 기울기 · 릴리스',
  separationMax: '골반-어깨 꼬임 최대',
  separationAtPlant: '골반-어깨 꼬임 · 착지',
  leadKneeAtPlant: '앞 무릎 굽힘 · 착지',
  leadKneeAtRelease: '앞 무릎 굽힘 · 릴리스',
  strideLength: '보폭(키 대비)',
  strideOffset: '디딤 방향(+ 열림)',
  shoulderAbduction: '팔 높이 · 어깨 벌림',
  maxExternalRotation: '어깨 외회전 최대',
  plantToRelease: '착지 → 릴리스',
};
/** 겉에 보이는 지표(나머지는 '자세히') */
export const MAIN: MetricKey[] = [
  'trunkForwardTilt',
  'trunkLateralTilt',
  'separationMax',
  'leadKneeAtPlant',
  'strideLength',
  'shoulderAbduction',
];
const TRUST = { high: '높음', medium: '보통', low: '낮음' } as const;

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'run'; step: 'side' | 'back' | 'compute' | 'save'; percent: number }
  | { kind: 'done'; result: Pitch3dResult; saved: boolean };

export function AnalysisPanel({ sample }: { sample: LabSample }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string>();
  const abortRef = useRef<AbortController | null>(null);

  /* 화면을 떠나면 하던 분석을 멈춘다 */
  useEffect(() => () => abortRef.current?.abort(), []);

  const side = sample.videos.side?.url;
  const back = sample.videos.back?.url;
  if (!side || !back) return null;

  const open = async () => {
    setError(undefined);
    setPhase({ kind: 'loading' });
    const r = await orOffline(loadLabAnalysis({ id: sample.id }), {
      error: OFFLINE_MESSAGE,
    });
    if ('error' in r) {
      setError(r.error);
      setPhase({ kind: 'idle' });
      return;
    }
    setPhase(
      r.result ? { kind: 'done', result: r.result, saved: true } : { kind: 'idle' }
    );
  };

  const analyze = async () => {
    setError(undefined);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const { extractPoseTrack } = await import('@/lib/pose/extract');
      const { runPitch3d } = await import('@/lib/pitch-3d/run');
      setPhase({ kind: 'run', step: 'side', percent: 0 });
      const sideTrack = await extractPoseTrack(
        side,
        (p) => setPhase({ kind: 'run', step: 'side', percent: Math.round(p * 100) }),
        ac.signal,
        { playbackRate: 0.25 }
      );
      setPhase({ kind: 'run', step: 'back', percent: 0 });
      const backTrack = await extractPoseTrack(
        back,
        (p) => setPhase({ kind: 'run', step: 'back', percent: Math.round(p * 100) }),
        ac.signal,
        { playbackRate: 0.25 }
      );
      setPhase({ kind: 'run', step: 'compute', percent: 0 });
      const result = await runPitch3d(
        {
          side: sideTrack,
          back: backTrack,
          hand: sample.meta?.hand ?? 'R',
          slowmoFps: sample.meta?.slowmoFps ?? null,
          screenRecorded: sample.meta?.screenRecorded ?? true,
        },
        ac.signal
      );
      setPhase({ kind: 'run', step: 'save', percent: 0 });
      const saved = await orOffline(saveLabAnalysis({ id: sample.id, result }), {
        error: OFFLINE_MESSAGE,
      });
      if ('error' in saved)
        setError(`결과는 아래에 있어요. 저장은 못 했어요: ${saved.error}`);
      setPhase({ kind: 'done', result, saved: !('error' in saved) });
    } catch (err) {
      if (!ac.signal.aborted)
        setError(
          err instanceof Error ? err.message : '분석하지 못했어요. 다시 해 주세요.'
        );
      setPhase({ kind: 'idle' });
    } finally {
      abortRef.current = null;
    }
  };

  const STEP_TEXT = {
    side: '옆 영상 관절 찾는 중',
    back: '뒤 영상 관절 찾는 중',
    compute: '3D 계산 중',
    save: '저장 중',
  } as const;

  return (
    <div className="space-y-3 rounded-2xl bg-ink/4 p-3">
      <div className="flex items-center gap-2">
        <Rotate3d aria-hidden className="h-5 w-5 text-sky" />
        <p className="text-sm font-semibold text-ink">3D 분석</p>
      </div>

      {phase.kind === 'run' ? (
        <div className="space-y-2" aria-live="polite">
          <p className="text-sm text-ink">
            {STEP_TEXT[phase.step]}
            {phase.step === 'side' || phase.step === 'back' ? ` ${phase.percent}%` : ''}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink/8">
            <div
              className="h-full bg-sky transition-[width]"
              style={{
                width: `${phase.step === 'side' ? phase.percent / 2 : phase.step === 'back' ? 50 + phase.percent / 2.5 : phase.step === 'compute' ? 92 : 98}%`,
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="min-h-10 rounded-full px-3 text-sm text-muted active:bg-ink/6"
          >
            멈추기
          </button>
        </div>
      ) : phase.kind === 'done' ? (
        <ResultView result={phase.result} onAgain={analyze} />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted break-keep">
            두 영상의 관절을 찾아 3D 로 재요. 1분쯤 걸려요. 화면을 켜 두세요.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={analyze}
              disabled={phase.kind === 'loading'}
              className="min-h-11 flex-1 rounded-2xl bg-sky px-4 text-sm font-bold text-white disabled:opacity-40"
            >
              {sample.hasAnalysis ? '다시 분석하기' : '3D 분석하기'}
            </button>
            {sample.hasAnalysis && (
              <button
                type="button"
                onClick={open}
                disabled={phase.kind === 'loading'}
                className="min-h-11 flex-1 rounded-2xl bg-ink/6 px-4 text-sm font-semibold text-ink disabled:opacity-40"
              >
                {phase.kind === 'loading' ? '불러오는 중' : '결과 보기'}
              </button>
            )}
          </div>
        </div>
      )}

      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}

function fmt(m: Metric) {
  const unit = m.unit === 'deg' ? '°' : m.unit === 'pct' ? '%' : 'ms';
  return { value: `${m.value}${unit}`, pm: `±${m.pm}${unit}` };
}

function MetricRow({ m }: { m: Metric }) {
  const { value, pm } = fmt(m);
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="min-w-0 text-sm text-ink break-keep">
        {LABELS[m.key]}
        {m.experimental && (
          <span className="ml-1.5 rounded-full bg-ink/8 px-1.5 text-xs text-muted">
            실험
          </span>
        )}
        {m.check && (
          <span className="ml-1.5 rounded-full bg-warn-bg px-1.5 text-xs text-warn">
            확인 필요
          </span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span className="text-numeric text-base font-semibold text-ink">{value}</span>
        <span className="ml-1 text-xs text-muted">{pm}</span>
      </span>
    </li>
  );
}

export function ResultView({
  result,
  onAgain,
}: {
  result: Pitch3dResult;
  onAgain: () => void;
}) {
  const [more, setMore] = useState(false);
  const [view3d, setView3d] = useState(false);
  if (!result.ok) {
    return (
      <div className="space-y-2">
        <ErrorLine>{result.reason}</ErrorLine>
        <button
          type="button"
          onClick={onAgain}
          className="min-h-10 rounded-full bg-ink/6 px-3 text-sm text-ink"
        >
          다시 분석하기
        </button>
      </div>
    );
  }
  const ok = result as Pitch3dOk;
  const main = MAIN.map((k) => ok.metrics.find((m) => m.key === k)).filter(
    (m): m is Metric => m != null
  );
  const rest = ok.metrics.filter((m) => !MAIN.includes(m.key));
  /* 믿음 한 줄 — 지표 믿음의 가장 낮은 것 */
  const worst =
    (['low', 'medium', 'high'] as const).find((t) => main.some((m) => m.trust === t)) ??
    'high';
  const q = ok.quality;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        믿음 {TRUST[worst]} · 엔진 {ok.version}
      </p>
      {ok.warnings.length > 0 && (
        <ul className="space-y-1">
          {ok.warnings.map((w) => (
            <li key={w} className="text-xs text-warn break-keep">
              {WARNING_TEXT[w]}
            </li>
          ))}
        </ul>
      )}
      <ul className="divide-y divide-line">
        {main.map((m) => (
          <MetricRow key={m.key} m={m} />
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setView3d((v) => !v)}
        className="min-h-11 w-full rounded-2xl bg-ink/6 text-sm font-semibold text-ink"
      >
        {view3d ? '3D 보기 닫기' : '3D 로 보기'}
      </button>
      {view3d && <Skeleton3D result={ok} />}

      <div className="-mx-1 rounded-xl">
        <DisclosureButton
          open={more}
          onClick={() => setMore((v) => !v)}
          label="자세히"
        />
        {more && (
          <div className="space-y-3 px-1 pb-1">
            {rest.length > 0 && (
              <ul className="divide-y divide-line">
                {rest.map((m) => (
                  <MetricRow key={m.key} m={m} />
                ))}
              </ul>
            )}
            <ul className="space-y-1 text-xs text-muted break-keep">
              <li>
                두 영상이 맞는 정도: 다시 비춤 {q.reprojPct}% · 뼈 길이 흔들림 몸통{' '}
                {q.boneCv.trunk}% · 다리 {q.boneCv.legs}% · 위팔 {q.boneCv.upperArm}% ·
                아래팔 {q.boneCv.forearm}%
              </li>
              <li>
                카메라: 두 폰 사이 {q.axisAngleDeg}° · 확대 옆 {q.focal.side} · 뒤{' '}
                {q.focal.back}(긴 변 배수) · 믿음 {TRUST[q.calibration]}
              </li>
              <li>
                장면: 초당 옆 {q.density.side} · 뒤 {q.density.back} · 시간 맞춤{' '}
                {q.syncCost}
              </li>
              <li>
                오차 범위(±)는 연구 값으로 어림한 것이에요. 실험실 측정과 견줘 보기
                전이에요.
              </li>
            </ul>
            <button
              type="button"
              onClick={onAgain}
              className="min-h-10 rounded-full bg-ink/6 px-3 text-sm text-ink"
            >
              다시 분석하기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
