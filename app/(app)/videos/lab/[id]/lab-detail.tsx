'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { BackLink, PageHeading } from '@/components/ui';
import { ErrorLine } from '@/components/error-line';
import type { LabSample } from '@/lib/pitch-lab';
import {
  LAB_VIEWS,
  LAB_VIEW_LABELS,
  labMetaChips,
  type LabView,
} from '@/lib/pitch-lab-meta';
import type { Pitch3dV2Ok } from '@/lib/pitch-3d/v2/contract';
import type { Metric, MetricKey } from '@/lib/pitch-3d/metrics';
import { V2EmptyWell, V2RequestRow, V2StatusBadge } from './analysis-v2';
import type { Body3DHandle, Transport } from './body-3d';
import { useV2Analysis } from './use-v2-analysis';

/** 3D 보기는 결과가 있을 때만 받는다(three 를 안 여는 화면에 실리지 않게) */
const Body3D = dynamic(() => import('./body-3d').then((m) => m.Body3D), { ssr: false });

/**
 * 샘플 결과 화면 /videos/lab/[id](설계 pitch-3d-quality.md 화면 결정 1 · 2 · 15) — 위에서부터 3D(4:5, 화면의 60% 까지) → 시점 · 재생 →
 * 원본 두 칸(180px) → 숫자. PC(desk)는 왼쏙 3D(폭 60%, 스크롤해도 멈춰 있음) · 오른쪽 원본 두 칸 + 숫자.
 * 원본 영상은 3D 시계를 따라간다(결정 12): 멈춤 · 끌기 때 currentTime, 재생 때 playbackRate. 숫자를 누르면 그 순간으로 가고 3D 가 보이게 올린다.
 */

const WHEN = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const LABELS: Record<MetricKey, string> = {
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
const MAIN: MetricKey[] = [
  'trunkForwardTilt',
  'trunkLateralTilt',
  'separationMax',
  'leadKneeAtPlant',
  'strideLength',
  'shoulderAbduction',
];

/** 지표 → 보여 줄 순간 */
const MOMENT: Record<MetricKey, 'footPlant' | 'release'> = {
  trunkForwardTilt: 'release',
  trunkLateralTilt: 'release',
  separationMax: 'footPlant',
  separationAtPlant: 'footPlant',
  leadKneeAtPlant: 'footPlant',
  leadKneeAtRelease: 'release',
  strideLength: 'footPlant',
  strideOffset: 'footPlant',
  shoulderAbduction: 'release',
  maxExternalRotation: 'release',
  plantToRelease: 'release',
};

export function LabDetail({
  sample,
  v2Enabled,
  preview,
}: {
  sample: LabSample;
  v2Enabled: boolean;
  /** 개발 확인용 결과(서버를 안 부른다) */
  preview?: Pitch3dV2Ok | null;
}) {
  const v2 = useV2Analysis(sample.id, sample.v2.job, preview);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  const body = useRef<Body3DHandle>(null);
  const stage = useRef<HTMLDivElement>(null);
  const videos = useRef<Partial<Record<LabView, HTMLVideoElement | null>>>({});
  const result = v2.result;
  const hasVideos = Boolean(sample.videos.side?.url && sample.videos.back?.url);

  /* 원본 영상이 3D 시계를 따라간다 */
  const onTransport = useCallback(
    (t: Transport) => {
      if (!result) return;
      const times: Record<LabView, number> = {
        side: result.t[t.frame],
        back: result.tBack[t.frame],
      };
      for (const view of LAB_VIEWS) {
        const v = videos.current[view];
        if (!v) continue;
        const want = times[view];
        if (t.reason === 'tick') {
          if (Math.abs(v.currentTime - want) > 0.25) v.currentTime = want;
          continue;
        }
        v.playbackRate = t.speed;
        if (t.playing) {
          if (Math.abs(v.currentTime - want) > 0.05) v.currentTime = want;
          void v.play().catch(() => undefined);
        } else {
          v.pause();
          v.currentTime = want;
        }
      }
    },
    [result]
  );

  const jump = (k: number) => {
    body.current?.seek(k);
    stage.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const meta = sample.meta;
  const main = result
    ? MAIN.map((k) => result.metrics.find((m) => m.key === k)).filter(
        (m): m is Metric => m != null
      )
    : [];
  const rest = result ? result.metrics.filter((m) => !MAIN.includes(m.key)) : [];

  return (
    <div className="stack-page">
      <div className="space-y-2">
        <BackLink href="/videos/lab">투구 분석</BackLink>
        <PageHeading
          title={
            meta?.createdAt ? `${WHEN.format(new Date(meta.createdAt))} 샘플` : '샘플'
          }
          description={meta ? labMetaChips(meta).join(' · ') : undefined}
          action={<V2StatusBadge job={v2.job} now={now} />}
          inlineAction
        />
      </div>

      <div className="desk:grid desk:grid-cols-[3fr_2fr] desk:items-start desk:gap-8">
        <div ref={stage} className="stack-block desk:sticky desk:top-4">
          {result ? (
            <Body3D ref={body} result={result} onTransport={onTransport} />
          ) : (
            <V2EmptyWell
              job={v2.job}
              now={now}
              loading={v2.loading}
              v2Enabled={v2Enabled}
              hasVideos={hasVideos}
            />
          )}
          <V2RequestRow
            job={v2.job}
            now={now}
            busy={v2.busy}
            v2Enabled={v2Enabled}
            hasVideos={hasVideos}
            hasResult={result != null}
            error={v2.error}
            onRequest={v2.request}
          />
          {v2.offline && (
            <ErrorLine>연결을 확인해 주세요. 마지막 상태를 보고 있어요.</ErrorLine>
          )}
        </div>

        <div className="stack-block mt-(--gap-block) desk:mt-0">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-ink">원본 영상</h2>
            <div className="grid grid-cols-2 gap-2">
              {LAB_VIEWS.map((view) => {
                const v = sample.videos[view];
                return (
                  <div key={view} className="space-y-1">
                    <p className="text-xs text-muted">{LAB_VIEW_LABELS[view]}</p>
                    {v?.url ? (
                      <video
                        ref={(el) => {
                          videos.current[view] = el;
                        }}
                        src={`${v.url}#t=0.001`}
                        playsInline
                        muted
                        preload="auto"
                        className="h-[180px] w-full rounded-xl bg-black object-contain"
                      />
                    ) : (
                      <div className="grid h-[180px] w-full place-items-center rounded-xl bg-ink/5 text-xs text-muted">
                        영상 없음
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {result && (
              <p className="text-xs text-muted">
                영상은 3D 를 따라가요 — 멈추거나 끌면 같은 장면, 재생하면 같은 속도.
              </p>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-ink">숫자</h2>
              {result && (
                <span className="text-xs text-muted">
                  엔진 v2 {result.version} · 뼈 흔들림 {result.fit.boneCvPct}% · 다시
                  비춤 {result.fit.reprojPct}%
                </span>
              )}
            </div>
            {result ? (
              <>
                <p className="text-xs text-muted break-keep">
                  숫자는 아직 참고용이에요. 누르면 그 순간으로 가요.
                </p>
                <ul className="divide-y divide-line">
                  {[...main, ...rest].map((m) => (
                    <MetricRow
                      key={m.key}
                      m={m}
                      onClick={() => jump(result.events[MOMENT[m.key]])}
                    />
                  ))}
                </ul>
                {result.warnings.length > 0 && (
                  <p className="text-xs text-warn break-keep">
                    두 영상 사이 각도 · 초점 · 장면 수 때문에 오차 범위를 넓힌 값이
                    있어요.
                  </p>
                )}
              </>
            ) : (
              <p className="rounded-xl empty-well px-4 py-3 text-xs text-muted">
                결과가 나오면 여기에 지표가 와요.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function MetricRow({ m, onClick }: { m: Metric; onClick: () => void }) {
  const unit = m.unit === 'deg' ? '°' : m.unit === 'pct' ? '%' : 'ms';
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-11 w-full items-baseline justify-between gap-3 py-1.5 text-left transition-colors active:bg-ink/4 desk:hover:bg-surface-2"
      >
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
          <span className="text-numeric text-base font-semibold text-ink">
            {m.value}
            {unit}
          </span>
          <span className="ml-1 text-xs text-muted">
            ±{m.pm}
            {unit}
          </span>
        </span>
      </button>
    </li>
  );
}
