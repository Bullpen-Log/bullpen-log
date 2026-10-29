'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { BackLink, PageHeading } from '@/components/ui';
import { ErrorLine } from '@/components/error-line';
import type { LabSample } from '@/lib/pitch-lab';
import { LAB_EXTRA_LABEL, LAB_VIEWS, labViewLabel, type LabGround, type LabShifts, type LabView } from '@/lib/pitch-lab-meta';
import { isV2JobActive, v2WaitingText, type Pitch3dV2Ok } from '@/lib/pitch-3d/v2/contract';
import { labHandNote, labWhenText, metricRows, type LabMetricRow } from '@/lib/pitch-3d/v2/lab-summary';
import { buildReport, type FocusProgress, type ReportDrill, type ReportItem } from '@/lib/pitch-3d/v2/report';
import { V2EmptyWell, V2RequestRow, V2StatusBadge } from './analysis-v2';
import { CompareCard, FlowCard, KeyFinding, RxCard } from './report-parts';
import type { PreviousComparison } from '@/lib/pitch-3d/v2/compare-view';
import type { Body3DHandle, Transport } from './body-3d';
import { useV2Analysis } from './use-v2-analysis';
import { loadLabVideoShifts } from '@/app/actions/pitch-lab';
import { followTick, sourceTimesAt } from '@/lib/pitch-3d/v2/video-sync';

/** 3D 보기는 결과가 있을 때만 받는다(three 를 안 여는 화면에 실리지 않게) */
const Body3D = dynamic(() => import('./body-3d').then((m) => m.Body3D), { ssr: false });

/**
 * 투구 진단 리포트 /videos/lab/[id](설계 docs/designs/pitch-3d-report.md, 2026-10-27 개편 — 장면 → 근거 → 해석 → 다음 선택) — 위에서부터
 * 머리(찍은 · 올린 때 · 지면 · 손 · 한 구 기준) → 이번 투구의 핵심(주 문제의 수치 · 장면, 없으면 확인 범위) → 장면(어두운 3D 무대) · 그 밑에 원본 영상
 * (늘 보임, 마커 샘플은 ③ · ④ 까지) → 여섯 요소 판독(줄을 누르면 그 자리에서 펴짐) → 개선 드릴 · 다음 길 → 지난번과 견주기 → 접힌 '분석 자세히'.
 * PC(desk)는 왼쪽 장면 · 원본 영상(폭 60%, 스크롤해도 멈춰 있음) · 오른쪽 핵심 · 판독 · 드릴 · 자세히. 결과가 없으면 왼쪽에 기다림 · 분석 걸기.
 * 원본 영상은 3D 시계를 따라간다(lib/pitch-3d/v2/video-sync.ts). '장면 보기'를 누르면 3D · 영상이 그 순간에 서고 무대가 보이게 굴린다.
 */

export function LabDetail({
  sample,
  v2Enabled,
  engineBuild = null,
  drills = [],
  youth = false,
  mine = false,
  trainingOpen = true,
  focus = null,
  previous = null,
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
  /** 출시 전 베타면 false — 보고서의 트레이닝 단추를 뺀다(report-parts.tsx RxCard) */
  trainingOpen?: boolean;
  /** 이 리포트의 처방이 메카닉에서 진행 중이면 n / 9 */
  focus?: FocusProgress;
  /** 바로 앞 내 리포트와 견주기(page.tsx, 내 것만) */
  previous?: PreviousComparison | null;
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
  /* 3D 무대 칸 — 장면 보기가 이 칸이 보이게 굴린다(왼쪽 칸 전체는 영상까지 길어 'nearest' 가 안 움직였다) */
  const scene = useRef<HTMLElement>(null);
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

  /* 3D(→ 원본 영상)를 그 장면에 세우고 무대가 보이게 — PC 는 무대가 멈춰 있어 굴리지 않는다(nearest) */
  const jump = (k: number) => {
    body.current?.seek(k);
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    (scene.current ?? stage.current)?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'nearest' });
  };
  const onScene = (it: ReportItem) => {
    if (it.frame != null) jump(it.frame);
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
  const when = labWhenText(meta);
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
  /* 영상 칸이 붙거나(다시 불러오기 포함) 떨어질 때 — 붙으면 지금 3D 장면으로 맞춘다 */
  const onVideo = (view: LabView | 'cam3' | 'cam4', el: HTMLVideoElement | null) => {
    videos.current[view] = el;
    if (el && lastT.current) follow.current({ ...lastT.current, reason: 'seek' });
  };
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
                <SourceClip src={src} onEl={(el) => onVideo(view, el)} />
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
              <SourceClip src={(x.previewUrl ?? x.url)!} onEl={(el) => onVideo(x.key, el)} />
            ) : (
              <div className="grid h-[180px] w-full place-items-center rounded-xl bg-ink/5 text-xs text-muted desk:h-[min(300px,36vh)]">
                영상 없음
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted break-keep">
        3D 와 두 영상은 같은 투구의 같은 순간이에요. 3D 를 멈추거나 끌면 영상도 그 장면에 서요.
      </p>
    </div>
  );

  return (
    <div className="stack-page">
      <div className="space-y-2">
        <BackLink href="/videos/lab">3D 동작 분석</BackLink>
        <PageHeading
          title="투구 진단"
          description={[when, ground === 'flat' ? '평지' : '마운드', hand === 'L' ? '왼손' : '오른손', '이 한 구 기준'].filter(Boolean).join(' · ')}
          action={<V2StatusBadge job={v2.job} now={now} />}
          inlineAction
        />
      </div>

      {/* 좁은 화면은 핵심이 무대 위 — PC 는 오른쪽 칸 맨 위(같은 부품 둘, 하나만 보인다) */}
      {report && (
        <div className="desk:hidden">
          <KeyFinding report={report} onScene={onScene} />
        </div>
      )}

      <div className="flex flex-col gap-block desk:grid desk:grid-cols-[3fr_2fr] desk:items-start desk:gap-x-8">
        <div ref={stage} className="stack-block desk:sticky desk:top-(--desk-veil-solid)">
          {result && labHandNote(result.hand, meta?.hand) && (
            <p className="text-xs text-muted break-keep">{labHandNote(result.hand, meta?.hand)}</p>
          )}
          {result && report && v2.job?.status === 'failed' && v2.job.fail && (
            <p role="status" className="rounded-xl bg-warn-bg px-3 py-2.5 text-xs text-ink">
              다시 분석이 안 됐어요. {v2.job.fail.reason} 지금 보이는 건 이전 결과예요.
            </p>
          )}
          {result && report ? (
            <section ref={scene} aria-label="장면" className="theme-dark rounded-3xl bg-[#151722] p-3 text-ink">
              <div className="relative">
                <Body3D
                  ref={body}
                  result={result}
                  onTransport={onTransport}
                  ground={ground}
                  heightCm={heightCm}
                  stopFrame={report.headline.frame}
                />
                {/* 다시 분석 중이면 이전 결과 위에 처음 분석처럼 판을 덮는다(2026-10-24 김민: "분석이 된 건지 전 건지 알 수가 없어") */}
                {v2.job && isV2JobActive(v2.job, now) && (
                  <div
                    role="status"
                    className="absolute inset-0 grid place-content-center gap-1.5 bg-[#151722]/85 px-6 text-center"
                  >
                    <span className="mx-auto size-5 animate-spin rounded-full border-2 border-white/25 border-t-white/80" />
                    <p className="text-sm font-semibold text-[#e8eef7]">다시 분석 중이에요</p>
                    <p className="text-xs text-[#9aa3b8]">{v2WaitingText(v2.job, now)}</p>
                    <p className="text-xs text-[#9aa3b8]">끝나면 새 결과로 바뀌어요. 지금 보이는 건 이전 결과예요.</p>
                  </div>
                )}
              </div>
            </section>
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
          {report && (
            <div className="hidden desk:block">
              <KeyFinding report={report} onScene={onScene} />
            </div>
          )}
          {report && <FlowCard report={report} onPick={onScene} />}
          {report && <RxCard report={report} mine={mine} focus={focus} trainingOpen={trainingOpen} />}
          {report && previous && <CompareCard prev={previous} />}

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

/**
 * 원본 영상 한 칸 — 못 불러오면 그 사실과 다시 불러오기(가짜 그림으로 채우지 않는다). 다시 불러오면 새 영상 칸이 붙어 3D 장면을 다시 따라간다.
 */
function SourceClip({ src, onEl }: { src: string; onEl: (el: HTMLVideoElement | null) => void }) {
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  if (failed)
    return (
      <div role="status" className="grid h-[180px] w-full place-content-center gap-2 rounded-xl bg-ink/5 px-3 text-center desk:h-[min(300px,36vh)]">
        <p className="text-xs text-muted break-keep">영상을 불러오지 못했어요.</p>
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setTries((n) => n + 1);
          }}
          className="mx-auto min-h-10 rounded-full bg-surface px-4 text-sm font-semibold text-ink"
        >
          다시 불러오기
        </button>
      </div>
    );
  return (
    <video
      key={tries}
      ref={(el) => {
        /* 화면에 붙기 전에 난 오류는 onError 로 안 온다(React 가 그 알림을 버린다) — 붙는 순간 한 번 본다 */
        if (el?.error) {
          onEl(null);
          setFailed(true);
          return;
        }
        onEl(el);
      }}
      src={`${src}#t=0.001`}
      playsInline
      muted
      preload="auto"
      onError={() => {
        onEl(null);
        setFailed(true);
      }}
      className="h-[180px] w-full rounded-xl bg-black object-contain desk:h-[min(300px,36vh)]"
    />
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
