'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { BackLink, PageHeading } from '@/components/ui';
import { ErrorLine } from '@/components/error-line';
import type { LabSample } from '@/lib/pitch-lab';
import { LAB_EXTRA_LABEL, LAB_VIEWS, labViewLabel, type LabGround, type LabShifts, type LabView } from '@/lib/pitch-lab-meta';
import type { Pitch3dV2Ok } from '@/lib/pitch-3d/v2/contract';
import { labHandNote, labTitle, metricRows, type LabMetricRow } from '@/lib/pitch-3d/v2/lab-summary';
import { buildReport, type FocusProgress, type ReportDrill } from '@/lib/pitch-3d/v2/report';
import { V2EmptyWell, V2RequestRow, V2StatusBadge } from './analysis-v2';
import { FlowCard, ReportHero, RxCard, VerdictCard } from './report-parts';
import type { Body3DHandle, Transport } from './body-3d';
import { useV2Analysis } from './use-v2-analysis';
import { loadLabVideoShifts } from '@/app/actions/pitch-lab';
import { followTick, sourceTimesAt } from '@/lib/pitch-3d/v2/video-sync';

/** 3D 보기는 결과가 있을 때만 받는다(three 를 안 여는 화면에 실리지 않게) */
const Body3D = dynamic(() => import('./body-3d').then((m) => m.Body3D), { ssr: false });

/**
 * 투구 진단 리포트 /videos/lab/[id](설계 docs/designs/pitch-3d-report.md 5-4 · 5-9절, 2026-10-21 김민: 결과 화면을 리포트로) — 위에서부터
 * 결론(어두운 3D 무대 + 결론 두 줄) · 그 밑에 원본 영상(늘 보임, 마커 샘플은 ③ · ④ 까지) → 투구의 흐름(여섯 요소 사슬 · 기준 띠) → 처방(3주) → 접힌 '분석 자세히'(숫자 · 다시 분석).
 * PC(desk)는 왼쪽 결론(폭 60%, 스크롤해도 멈춰 있음) · 오른쪽 흐름 · 처방 · 자세히. 결과가 없으면 왼쪽에 기다림 · 분석 걸기.
 * 원본 영상은 펼쳤을 때 3D 시계를 따라간다(lib/pitch-3d/v2/video-sync.ts). 흐름의 점을 고르면 3D 가 그 순간으로 간다.
 */

export function LabDetail({
  sample,
  v2Enabled,
  engineBuild = null,
  drills = [],
  youth = false,
  mine = false,
  focus = null,
  preview,
  ownerHeightCm = null,
}: {
  sample: LabSample;
  v2Enabled: boolean;
  /** 지금 분석 서버 엔진의 지문(page.tsx) — 결과의 지문과 다르면 옛 엔진 결과 */
  engineBuild?: string | null;
  /** 처방에 쓸 드릴(page.tsx 가 서버에서) */
  drills?: ReportDrill[];
  /** 성장기(만 16세 미만, 내 샘플일 때만) — 크기 지표는 참고로 */
  youth?: boolean;
  /** 내 샘플 — 처방을 시작할 수 있다 */
  mine?: boolean;
  /** 이 리포트의 처방이 메커니즘에서 진행 중이면 n / 9 */
  focus?: FocusProgress;
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
  const videos = useRef<Partial<Record<LabView | 'cam3' | 'cam4', HTMLVideoElement | null>>>({});
  const result = v2.result;
  const hasVideos = Boolean(sample.videos.side?.url && sample.videos.back?.url);

  /*
   * 영상마다 편집 목록 앞머리(초) — 3D 시각 + 이 값 = 재생기 시각. 화면이 열린 뒤 받는다(못 받으면 0).
   * 받는 사이 멈춰 있던 영상은 마지막 알림을 다시 따라가게 한다.
   */
  const shifts = useRef<LabShifts>({ side: 0, back: 0 });
  /* 영상마다 마지막으로 옮긴 때(performance.now) — followTick 이 옮긴 뒤 잠깐은 다시 안 옮긴다 */
  const seekedAt = useRef<Partial<Record<string, number>>>({});
  const [extrasOn, setExtrasOn] = useState(false);
  const lastT = useRef<Transport | null>(null);

  /* 원본 영상이 3D 시계를 따라간다 */
  const onTransport = useCallback(
    (t: Transport) => {
      if (!result) return;
      lastT.current = t;
      const src = sourceTimesAt(result.t, result.tBack, t.time);
      for (const view of [...LAB_VIEWS, 'cam3', 'cam4'] as const) {
        const v = videos.current[view];
        if (!v) continue;
        /* ③ · ④ 는 옆 시각 + 그 카메라 몫(서버가 알 때만 — 모르면 그대로 둔다, 2026-10-22) */
        const shift = shifts.current[view];
        if (shift == null) continue;
        const want = Math.max(0, (view === 'back' ? src.back : src.side) + shift);
        if (t.reason === 'tick') {
          const now = performance.now();
          const step = followTick(
            {
              time: v.currentTime,
              rate: v.playbackRate,
              /* 옮기는 중 · 다음 장면을 아직 못 받음(HAVE_FUTURE_DATA 밑)이면 안 건드린다 */
              ready: !v.seeking && v.readyState >= 3,
              sinceSeekS: (now - (seekedAt.current[view] ?? -1e9)) / 1000,
            },
            want,
            t.speed
          );
          if (step.seek != null) {
            v.currentTime = step.seek;
            seekedAt.current[view] = now;
          }
          if (step.rate != null) v.playbackRate = step.rate;
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
  const heightCm = meta?.heightCm ?? ownerHeightCm;
  /*
   * 던진 곳 — 올릴 때 고른 것 그대로(옛 샘플은 정보가 없어 마운드). 2026-10-09 김민: 결과 화면에서 바꾸지 못하게 — 3D 는 처음 던진 곳에 맞게.
   * 머리 칩(labMetaChips)에 '마운드' · '평지'가 보인다.
   */
  const ground: LabGround = meta?.ground ?? 'mound';
  /* 숫자 칸 — 이름 · 차례 · 그 순간은 앱 화면과 같이(lib/pitch-3d/v2/lab-summary.ts) */
  const main = result ? metricRows(result) : [];
  const report = useMemo(
    () => (result ? buildReport(result, { heightCm, ground, youth, drills }) : null),
    [result, heightCm, ground, youth, drills]
  );
  const hand = meta?.hand ?? 'R';
  const when = labTitle(meta?.createdAt).replace(/ 투구$/, '');
  const stale = result != null && engineBuild != null && result.engine.build !== engineBuild;
  const request = (
    <V2RequestRow
      job={v2.job}
      now={now}
      busy={v2.busy}
      v2Enabled={v2Enabled}
      hasVideos={hasVideos}
      hasResult={result != null}
      stale={stale}
      error={v2.error}
      onRequest={v2.request}
    />
  );
  const sources = (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {LAB_VIEWS.map((view) => {
          const v = sample.videos[view];
          /* 결과 화면용 가벼운 영상이 있으면 그것(시각 차는 서버 labVideoShifts 가 같은 규칙으로) */
          const src = v?.previewUrl ?? v?.url;
          return (
            <div key={view} className="space-y-1">
              <p className="text-xs text-muted">{labViewLabel(view, hand)}</p>
              {src ? (
                <video
                  ref={(el) => {
                    videos.current[view] = el;
                    if (el && lastT.current) follow.current({ ...lastT.current, reason: 'seek' });
                  }}
                  src={`${src}#t=0.001`}
                  playsInline
                  muted
                  preload="auto"
                  className="h-[180px] w-full rounded-xl bg-black object-contain desk:h-[min(300px,36vh)]"
                />
              ) : (
                <div className="grid h-[180px] w-full place-items-center rounded-xl bg-ink/5 text-xs text-muted desk:h-[min(300px,36vh)]">
                  영상 없음
                </div>
              )}
            </div>
          );
        })}
        {/*
          마커 샘플의 ③ · ④ 카메라 — 옆 · 뒤처럼 3D 시계를 따라간다(서버가 옆 시각과의 차이를 줄 때, 2026-10-22). 누를 때만 받는다 — 240fps 원본 셋 넷을
          한꺼번에 받고 풀면 화면 전체가 버벅였다(2026-10-24 김민 "렉이 많이 걸려").
        */}
        {sample.extras.length > 0 && !extrasOn && (
          <button
            type="button"
            onClick={() => setExtrasOn(true)}
            className="col-span-2 min-h-11 rounded-xl bg-ink/5 text-sm font-semibold text-ink"
          >
            {sample.extras.map((x) => LAB_EXTRA_LABEL[x.key]).join(' · ')} 영상 보기
          </button>
        )}
        {extrasOn && sample.extras.map((x) => (
          <div key={x.key} className="space-y-1">
            <p className="text-xs text-muted">{LAB_EXTRA_LABEL[x.key]}</p>
            {(x.previewUrl ?? x.url) ? (
              <video
                ref={(el) => {
                  videos.current[x.key] = el;
                  if (el && lastT.current) follow.current({ ...lastT.current, reason: 'seek' });
                }}
                src={`${x.previewUrl ?? x.url}#t=0.001`}
                playsInline
                muted
                preload="auto"
                className="h-[180px] w-full rounded-xl bg-black object-contain desk:h-[min(300px,36vh)]"
              />
            ) : (
              <div className="grid h-[180px] w-full place-items-center rounded-xl bg-ink/5 text-xs text-muted desk:h-[min(300px,36vh)]">
                영상 없음
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">
        영상은 3D 를 따라가요. 멈추거나 끌면 같은 장면에 서요.
      </p>
    </div>
  );

  return (
    <div className="stack-page">
      <div className="space-y-2">
        <BackLink href="/videos/lab">3D 동작 분석</BackLink>
        <PageHeading
          title="투구 진단"
          description={`${when} · ${ground === 'flat' ? '평지' : '마운드'} · ${hand === 'L' ? '왼손' : '오른손'} · 이 한 구 기준`}
          action={<V2StatusBadge job={v2.job} now={now} />}
          inlineAction
        />
      </div>

      <div className="flex flex-col gap-block desk:grid desk:grid-cols-[3fr_2fr] desk:items-start desk:gap-x-8">
        <div ref={stage} className="stack-block desk:sticky desk:top-(--desk-veil-solid)">
          {result && labHandNote(result.hand, meta?.hand) && (
            <p className="text-xs text-muted break-keep">{labHandNote(result.hand, meta?.hand)}</p>
          )}
          {result && report ? (
            <ReportHero
              report={report}
              stage={
                <Body3D
                  ref={body}
                  result={result}
                  onTransport={onTransport}
                  ground={ground}
                  heightCm={heightCm}
                  stopFrame={report.headline.frame}
                />
              }
            />
          ) : (
            <>
              <V2EmptyWell
                job={v2.job}
                now={now}
                loading={v2.loading}
                v2Enabled={v2Enabled}
                hasVideos={hasVideos}
                hand={hand}
              />
              {request}
            </>
          )}
          {/* 원본 영상은 결과 바로 밑에 늘 보인다(2026-10-22 김민: "결과 밑에 원본 영상도 안 나와" — 예전엔 '원본 영상 보기'를 눌러야 폈다) */}
          {sources}
          {v2.offline && <ErrorLine>연결을 확인해 주세요. 마지막 상태를 보고 있어요.</ErrorLine>}
        </div>

        <div className="stack-block">
          {report && <VerdictCard report={report} />}
          {report && (
            <FlowCard
              report={report}
              onPick={(it) => {
                if (it.frame != null) body.current?.seek(it.frame);
              }}
            />
          )}
          {report && <RxCard report={report} reportId={sample.id} mine={mine} focus={focus} />}

          {result && (
            <details className="group rounded-2xl bg-surface p-(--block-pad)">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-sm font-semibold text-ink">
                분석 자세히
                <span className="text-xs font-normal text-muted group-open:hidden">숫자 · 다시 분석</span>
              </summary>
              <div className="mt-3 space-y-4">
                {request}
                <section className="space-y-2">
                  <p className="text-xs text-muted break-keep">
                    엔진 v2 {result.version} · 뼈 흔들림 {result.fit.boneCvPct}% · 다시 비춤 {result.fit.reprojPct}%.
                    숫자는 아직 참고용이에요. 누르면 그 순간으로 가요.
                  </p>
                  <ul className="divide-y divide-line">
                    {main.map((m) => (
                      <MetricRow key={m.key} m={m} onClick={() => jump(m.frame)} />
                    ))}
                  </ul>
                  {result.warnings.length > 0 && (
                    <p className="text-xs text-warn break-keep">
                      두 영상 사이 각도 · 초점 · 장면 수 때문에 오차 범위를 넓힌 값이 있어요.
                    </p>
                  )}
                </section>
              </div>
            </details>
          )}
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
