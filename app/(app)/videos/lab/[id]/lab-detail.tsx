'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { BackLink, PageHeading } from '@/components/ui';
import { ErrorLine } from '@/components/error-line';
import type { LabSample } from '@/lib/pitch-lab';
import {
  LAB_VIEWS,
  labViewLabel,
  labMetaChips,
  type LabGround,
  type LabView,
} from '@/lib/pitch-lab-meta';
import type { Pitch3dV2Ok } from '@/lib/pitch-3d/v2/contract';
import { labHandNote, labTitle, metricRows, type LabMetricRow } from '@/lib/pitch-3d/v2/lab-summary';
import { V2EmptyWell, V2RequestRow, V2StatusBadge } from './analysis-v2';
import { MechCard } from './mech-card';
import type { DrillPicks } from '@/lib/pitch-3d/v2/lab-summary';
import type { Body3DHandle, Transport } from './body-3d';
import { useV2Analysis } from './use-v2-analysis';
import { loadLabVideoShifts } from '@/app/actions/pitch-lab';
import { followStep, sourceTimesAt } from '@/lib/pitch-3d/v2/video-sync';

/** 3D 보기는 결과가 있을 때만 받는다(three 를 안 여는 화면에 실리지 않게) */
const Body3D = dynamic(() => import('./body-3d').then((m) => m.Body3D), { ssr: false });

/**
 * 샘플 결과 화면 /videos/lab/[id](설계 pitch-3d-quality.md 화면 결정 1 · 2 · 15) — 위에서부터 3D(4:5, 화면의 60% 까지) → 시점 · 재생 →
 * 원본 두 칸 → 숫자. PC(desk)는 왼쪽 3D(폭 60%, 스크롤해도 멈춰 있음) · 오른쪽 원본 두 칸 → 점검 + 숫자.
 * 원본 영상은 3D 와 한눈에(휴대폰은 바로 밑 · PC 는 오른쪽 위, 2026-10-20 김민: "같이 볼 수 있게") 3D 시계를 따라간다(결정 12, lib/pitch-3d/v2/video-sync.ts): 멈춤 · 끌기 때 그 시각,
 * 재생 때 0.1초마다 빠르기를 맞춰 따라붙는다. 숫자를 누르면 그 순간으로 가고 3D 가 보이게 올린다.
 */

export function LabDetail({
  sample,
  v2Enabled,
  engineBuild = null,
  drillPicks = {},
  preview,
  ownerHeightCm = null,
}: {
  sample: LabSample;
  v2Enabled: boolean;
  /** 지금 분석 서버 엔진의 지문(page.tsx) — 결과의 지문과 다르면 옛 엔진 결과 */
  engineBuild?: string | null;
  /** 메커니즘 점검 카드의 요소별 드릴(page.tsx 가 서버에서) */
  drillPicks?: DrillPicks;
  /** 개발 확인용 결과(서버를 안 부른다) */
  preview?: Pitch3dV2Ok | null;
  /** 샘플에 키가 없을 때 쓸 올린 사람의 키(내 샘플일 때만, page.tsx) */
  ownerHeightCm?: number | null;
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

  /*
   * 영상마다 편집 목록 앞머리(초) — 3D 시각 + 이 값 = 재생기 시각. 화면이 열린 뒤 받는다(못 받으면 0).
   * 받는 사이 멈춰 있던 영상은 마지막 알림을 다시 따라가게 한다.
   */
  const shifts = useRef<Record<LabView, number>>({ side: 0, back: 0 });
  const lastT = useRef<Transport | null>(null);

  /* 원본 영상이 3D 시계를 따라간다 */
  const onTransport = useCallback(
    (t: Transport) => {
      if (!result) return;
      lastT.current = t;
      const src = sourceTimesAt(result.t, result.tBack, t.time);
      for (const view of LAB_VIEWS) {
        const v = videos.current[view];
        if (!v) continue;
        const want = Math.max(0, src[view] + shifts.current[view]);
        if (t.reason === 'tick') {
          if (v.seeking) continue;
          const step = followStep(v.currentTime, want, t.speed);
          if (step.seek) v.currentTime = want;
          if (Math.abs(v.playbackRate - step.rate) > 0.005) v.playbackRate = step.rate;
          continue;
        }
        v.playbackRate = t.speed;
        if (t.playing) {
          if (Math.abs(v.currentTime - want) > 0.02) v.currentTime = want;
          void v.play().catch(() => undefined);
        } else {
          v.pause();
          v.currentTime = want;
        }
      }
    },
    [result]
  );
  const follow = useRef(onTransport);
  useEffect(() => {
    follow.current = onTransport;
  }, [onTransport]);
  useEffect(() => {
    let alive = true;
    loadLabVideoShifts({ id: sample.id }).then(
      (r) => {
        if (!alive) return;
        shifts.current = r;
        if (lastT.current) follow.current({ ...lastT.current, reason: 'seek' });
      },
      () => undefined
    );
    return () => {
      alive = false;
    };
  }, [sample.id]);

  const jump = (k: number) => {
    body.current?.seek(k);
    stage.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const meta = sample.meta;
  /*
   * 던진 곳 — 올릴 때 고른 것 그대로(옛 샘플은 정보가 없어 마운드). 2026-10-09 김민: 결과 화면에서 바꾸지 못하게 — 3D 는 처음 던진 곳에 맞게.
   * 머리 칩(labMetaChips)에 '마운드' · '평지'가 보인다.
   */
  const ground: LabGround = meta?.ground ?? 'mound';
  /* 숫자 칸 — 이름 · 차례 · 그 순간은 앱 화면과 같이(lib/pitch-3d/v2/lab-summary.ts) */
  const main = result ? metricRows(result) : [];

  return (
    <div className="stack-page">
      <div className="space-y-2">
        <BackLink href="/videos/lab">3D 동작 분석</BackLink>
        <PageHeading
          title={labTitle(meta?.createdAt)}
          description={meta ? labMetaChips(meta).join(' · ') : undefined}
          action={<V2StatusBadge job={v2.job} now={now} />}
          inlineAction
        />
      </div>

      {/*
       * 휴대폰: 3D → 원본 영상 → 분석 걸기 · 점검 · 숫자. PC: 왼쪽 3D(스크롤해도 멈춰 있음), 오른쪽 위 원본 영상 · 그 밑 분석
       * (2026-10-20 김민: "PC 에선 영상을 3D 밑이 아니라 오른쪽에 — 한눈에 같이 보게, 분석은 밑으로").
       */}
      <div className="flex flex-col gap-block desk:grid desk:grid-cols-[3fr_2fr] desk:items-start desk:gap-x-8">
        <div
          ref={stage}
          className="stack-block desk:sticky desk:top-(--desk-veil-solid) desk:col-start-1 desk:row-span-2 desk:row-start-1"
        >
          {result && labHandNote(result.hand, meta?.hand) && (
            <p className="text-xs text-muted break-keep">{labHandNote(result.hand, meta?.hand)}</p>
          )}
          {result ? (
            <Body3D
              ref={body}
              result={result}
              onTransport={onTransport}
              ground={ground}
              heightCm={meta?.heightCm ?? ownerHeightCm}
            />
          ) : (
            <V2EmptyWell
              job={v2.job}
              now={now}
              loading={v2.loading}
              v2Enabled={v2Enabled}
              hasVideos={hasVideos}
              hand={meta?.hand ?? 'R'}
            />
          )}
        </div>

        <section className="space-y-2 desk:col-start-2 desk:row-start-1">
          <h2 className="text-sm font-semibold text-ink">원본 영상</h2>
          <div className="grid grid-cols-2 gap-2">
            {LAB_VIEWS.map((view) => {
              const v = sample.videos[view];
              return (
                <div key={view} className="space-y-1">
                  <p className="text-xs text-muted">{labViewLabel(view, meta?.hand ?? 'R')}</p>
                  {v?.url ? (
                    <video
                      ref={(el) => {
                        videos.current[view] = el;
                      }}
                      src={`${v.url}#t=0.001`}
                      playsInline
                      muted
                      preload="auto"
                      className="h-[180px] w-full rounded-xl bg-black object-contain desk:h-[min(360px,42vh)]"
                    />
                  ) : (
                    <div className="grid h-[180px] w-full place-items-center rounded-xl bg-ink/5 text-xs text-muted desk:h-[min(360px,42vh)]">
                      영상 없음
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {result && (
            <p className="text-xs text-muted">
              영상은 3D 를 따라가요. 멈추거나 끌면 같은 장면에 서요.
            </p>
          )}
        </section>

        <div className="stack-block desk:col-start-2 desk:row-start-2">
          <V2RequestRow
            job={v2.job}
            now={now}
            busy={v2.busy}
            v2Enabled={v2Enabled}
            hasVideos={hasVideos}
            hasResult={result != null}
            stale={result != null && engineBuild != null && result.engine.build !== engineBuild}
            error={v2.error}
            onRequest={v2.request}
          />
          {v2.offline && (
            <ErrorLine>연결을 확인해 주세요. 마지막 상태를 보고 있어요.</ErrorLine>
          )}

          {result && (
            <MechCard
              result={result}
              heightCm={meta?.heightCm ?? ownerHeightCm}
              drillPicks={drillPicks}
              onJump={jump}
            />
          )}

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
                  {main.map((m) => (
                    <MetricRow key={m.key} m={m} onClick={() => jump(m.frame)} />
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

function MetricRow({ m, onClick }: { m: LabMetricRow; onClick: () => void }) {
  const unit = m.unit;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-11 w-full items-baseline justify-between gap-3 py-1.5 text-left transition-colors active:bg-ink/4 desk:hover:bg-surface-2"
      >
        <span className="min-w-0 text-sm text-ink break-keep">
          {m.label}
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
