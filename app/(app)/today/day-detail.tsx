'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowRight, Check, Circle, Film, StickyNote } from 'lucide-react';
import { formatSpeed } from '@/lib/units';
import { useSpeedUnit } from '@/components/use-units';
import { usePlaybackUrls } from '@/components/use-playback-urls';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import { litersText } from '@/lib/nutrition/meta';
import type { Log } from '@/app/(app)/pitch-log/types';
import type { PlanDaySummary } from '@/lib/report/training-history';
import type { DayDetail } from '@/lib/day-detail';
import { dayHas, spokenDay, type DayFacts, type DayFocus } from './day-summary';

/**
 * 캘린더 밑 칸 — 오른쪽 요약에서 누른 줄을 조금 더 자세히.
 *
 * 여기도 요약이다. 그날 무엇을 했는지 한 번 더 펴 보는 자리이고, 진짜 자세한 것(영상
 * 분석 도구, 세트 고치기, 음식 담기)은 각 탭에 있다. 그래서 칸 위쪽에 늘 그 탭으로
 * 가는 길을 둔다 — 그 날짜를 그대로 들고 간다.
 *
 * 투구·영상은 캘린더가 이미 들고 있는 기록으로 바로 그린다. 트레이닝·영양·컨디션·
 * 분석은 날짜를 고를 때 그날 것만 받아 온다(/api/day-detail) — 받는 동안 자리를 잡아
 * 둔다.
 */

const TITLES: Record<DayFocus, string> = {
  pitch: '투구',
  training: '트레이닝',
  nutrition: '영양',
  checkin: '컨디션',
  video: '영상',
  coach: '분석',
};

/** 각 탭으로 가는 길 — 그날 남긴 것이 없으면 '남기러 가는' 말로 */
function tabLink(
  focus: DayFocus,
  date: string,
  today: string,
  opts: { empty: boolean; hasReport: boolean }
): { href: string; label: string } | null {
  const isToday = date === today;
  switch (focus) {
    case 'pitch':
      return {
        href: `/pitch-log/${date}`,
        label: opts.empty ? '이 날 투구 남기기' : '투구 기록에서 자세히',
      };
    case 'training':
      return {
        href: isToday ? '/training' : `/training/day/${date}`,
        label: opts.empty
          ? isToday
            ? '오늘 운동하러 가기'
            : '이 날 운동 채우기'
          : '트레이닝에서 자세히',
      };
    case 'nutrition':
      return {
        href: isToday ? '/nutrition' : `/nutrition?date=${date}`,
        label: opts.empty ? '식단 기록하러 가기' : '영양 탭에서 자세히',
      };
    case 'video':
      return { href: `/videos?month=${date.slice(0, 7)}`, label: '영상 탭에서 보기' };
    case 'coach':
      return opts.hasReport
        ? { href: `/coach/report/${date}`, label: '리포트 전체 보기' }
        : { href: '/coach', label: '분석 탭으로' };
    case 'checkin':
      /* 체크인은 따로 탭이 없다 — 오늘 것은 홈 위쪽 체크인 상자에서 고친다 */
      return null;
  }
}

export function DayDetailBlock({
  date,
  today,
  focus,
  facts,
  featuredVideo,
  detail,
  failed,
  onRetry,
}: {
  date: string;
  today: string;
  focus: DayFocus;
  /** 그날에 대해 캘린더가 이미 아는 것(투구 기록 · 일정 · 리포트가 있나) */
  facts: DayFacts;
  featuredVideo: string | null | undefined;
  /** 받아 온 그날 요약. 아직이면 null */
  detail: DayDetail | null;
  /** 받아 오지 못했다 */
  failed: boolean;
  /** 받아 오지 못한 날을 다시 받는다 */
  onRetry: () => void;
}) {
  const { logs, plan, hasReport } = facts;
  const needsDetail =
    focus === 'training' ||
    focus === 'nutrition' ||
    focus === 'checkin' ||
    focus === 'coach';
  const videos = logs.flatMap((l) => l.videoPaths);
  /*
   * 남긴 것이 있나는 오른쪽 요약과 같은 기준(dayHas)으로 본다. 받아 온 내용으로 보면
   * 받는 동안이나 못 받았을 때 '기록하러 가기'로 잘못 적히고, 요약 줄은 '2,950kcal'
   * 인데 밑 칸 링크는 '기록하러 가기'인 식으로 둘이 어긋난다.
   */
  const empty = !dayHas(facts)[focus];
  const link = tabLink(focus, date, today, { empty, hasReport });

  return (
    <section
      aria-label={`${spokenDay(date)} ${TITLES[focus]} 자세히`}
      className="overflow-hidden rounded-2xl border border-line bg-surface"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-5 py-3">
        <h3 className="text-sm font-bold text-ink">
          {spokenDay(date)}
          <span className="font-normal text-muted"> · {TITLES[focus]}</span>
        </h3>
        {link && (
          <Link
            href={link.href}
            className="group inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-sky transition-colors hover:bg-sky-tint hover:text-sky-strong"
          >
            {link.label}
            <ArrowRight
              aria-hidden
              className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
            />
          </Link>
        )}
      </header>

      {/* 줄이나 날짜가 바뀔 때마다 새로 그려, 내용이 옅게 떠오르며 바뀐다 */}
      <div key={`${date}-${focus}`} className="motion-safe:animate-fade-in px-5 py-4">
        {focus === 'pitch' && <PitchDetail logs={logs} />}
        {focus === 'video' && (
          <VideoDetail videos={videos} featured={featuredVideo ?? null} />
        )}
        {needsDetail &&
          !detail &&
          (failed ? <Failed onRetry={onRetry} /> : <Waiting />)}
        {focus === 'training' && detail && (
          <TrainingDetail training={detail.training} plan={plan} />
        )}
        {focus === 'nutrition' && detail && <NutritionDetail n={detail.nutrition} />}
        {focus === 'checkin' && detail && (
          <CheckinDetail c={detail.checkin} isToday={date === today} />
        )}
        {focus === 'coach' && detail && <CoachDetail r={detail.report} />}
      </div>
    </section>
  );
}

/* ─────────────────────────── 공통 ─────────────────────────── */

function Waiting() {
  return (
    <div aria-busy="true" className="space-y-2.5">
      <span className="sr-only">불러오는 중입니다</span>
      {[80, 60, 70].map((w) => (
        <div
          key={w}
          className="h-4 animate-pulse rounded bg-surface-2"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  );
}

/*
 * 날짜를 다시 누르라고 하지 않는다 — 고른 날을 또 누르면 칸이 닫힌다(여닫이).
 * 그 자리에서 다시 받는 단추를 둔다.
 */
function Failed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <p role="alert" className="text-sm text-danger">
        이 날 내용을 불러오지 못했어요.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg px-2 py-1 text-sm font-semibold text-sky transition-colors hover:bg-sky-tint hover:text-sky-strong"
      >
        다시 불러오기
      </button>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted">{children}</p>;
}

/** 이름과 값 한 쌍 — '강도 7', '최고 132km/h' */
function Fact({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd
        className={`tabular-nums ${strong ? 'text-lg font-bold text-ink' : 'text-sm font-semibold text-ink'}`}
      >
        {value}
      </dd>
    </div>
  );
}

/* ─────────────────────────── 투구 ─────────────────────────── */

function PitchDetail({ logs }: { logs: Log[] }) {
  const speedUnit = useSpeedUnit();
  if (logs.length === 0) return <Empty>이 날 남긴 투구가 없어요.</Empty>;

  return (
    <ul className="space-y-3">
      {logs.map((l, i) => {
        const rest = l.sessionType === REST_SESSION_TYPE;
        return (
          <li
            key={l.id}
            className="motion-safe:animate-row-in rounded-xl bg-surface-2 px-4 py-3"
            style={{ '--row': i } as CSSProperties}
          >
            <p className="text-sm font-bold text-ink">
              {rest ? '쉬는 날' : `${l.sessionType} · ${l.pitchCount}구`}
            </p>
            {!rest && (
              <dl className="mt-2 grid grid-cols-3 gap-2">
                <Fact
                  label="강도"
                  value={l.intensity > 0 ? String(l.intensity) : '—'}
                />
                <Fact
                  label="최고 구속"
                  value={formatSpeed(l.maxVelocity, speedUnit) ?? '—'}
                />
                <Fact
                  label="평균 구속"
                  value={formatSpeed(l.avgVelocity, speedUnit) ?? '—'}
                />
              </dl>
            )}
            {l.memo?.trim() && (
              <p className="mt-2 flex gap-1.5 text-[13px] leading-relaxed break-keep text-ink/80">
                <StickyNote
                  aria-hidden
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted"
                />
                <span className="line-clamp-3">{l.memo}</span>
              </p>
            )}
            {l.videoPaths.length > 0 && (
              <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted">
                <Film aria-hidden className="h-3.5 w-3.5" />
                영상 {l.videoPaths.length}개 — 영상 줄에서 바로 봐요
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ─────────────────────────── 트레이닝 ─────────────────────────── */

const MAX_EXERCISES = 8;

function TrainingDetail({
  training,
  plan,
}: {
  training: DayDetail['training'];
  plan: PlanDaySummary | undefined;
}) {
  const done = training.exercises.filter((e) => e.done);
  const shown = training.exercises.slice(0, MAX_EXERCISES);
  const hidden = training.exercises.length - shown.length;

  if (!plan && training.exercises.length === 0 && training.intensity == null) {
    return <Empty>이 날 남긴 운동이 없어요.</Empty>;
  }

  return (
    <div className="space-y-4">
      {(plan || training.intensity != null) && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {plan && <Fact label="테마" value={plan.theme} strong />}
          {plan && <Fact label="구성" value={plan.parts.join(' · ') || '—'} />}
          <Fact
            label="마친 운동"
            value={`${done.length}${training.exercises.length > done.length ? ` / ${training.exercises.length}` : ''}개`}
          />
          {training.intensity != null && (
            <Fact label="강도" value={String(training.intensity)} />
          )}
        </dl>
      )}

      {shown.length > 0 && (
        <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {shown.map((e, i) => (
            <li
              key={e.id}
              className="motion-safe:animate-row-in flex items-start gap-2 text-sm"
              style={{ '--row': i } as CSSProperties}
            >
              {e.done ? (
                <Check aria-label="마침" className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
              ) : (
                <Circle
                  aria-label="못 함"
                  className="mt-0.5 h-4 w-4 shrink-0 text-line-strong"
                />
              )}
              <span className="min-w-0">
                <span
                  className={`block truncate ${e.done ? 'text-ink' : 'text-muted'}`}
                >
                  {e.title}
                </span>
                <span className="block truncate text-xs text-muted">{doneText(e)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <p className="text-xs text-muted">외 {hidden}개는 트레이닝에서 볼 수 있어요.</p>
      )}

      {training.memo?.trim() && (
        <p className="flex gap-1.5 rounded-xl bg-surface-2 px-4 py-3 text-[13px] leading-relaxed break-keep text-ink/80">
          <StickyNote aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
          <span className="line-clamp-3">{training.memo}</span>
        </p>
      )}
    </div>
  );
}

/** 실제로 한 만큼, 없으면 계획 — '3세트 · 10회 · 40kg' */
function doneText(e: DayDetail['training']['exercises'][number]) {
  const actual = [
    e.setsDone != null ? `${e.setsDone}세트` : null,
    e.repsDone != null ? `${e.repsDone}회` : null,
    e.holdSecondsDone != null ? `${e.holdSecondsDone}초` : null,
    e.weightKg != null ? `${e.weightKg}kg` : null,
  ].filter(Boolean);
  if (actual.length > 0) return actual.join(' · ');
  return e.planned ?? e.category;
}

/* ─────────────────────────── 영양 ─────────────────────────── */

const MACROS = [
  { key: 'carbs', label: '탄수화물', bar: 'bg-cat-power' },
  { key: 'protein', label: '단백질', bar: 'bg-cat-lower' },
  { key: 'fat', label: '지방', bar: 'bg-cat-mobility' },
] as const;

function NutritionDetail({ n }: { n: DayDetail['nutrition'] }) {
  if (n.meals.length === 0 && n.waterMl === 0) {
    return <Empty>이 날 먹은 것을 아직 안 적었어요.</Empty>;
  }
  const pct = (v: number, of: number) =>
    `${Math.min(100, of > 0 ? (v / of) * 100 : 0)}%`;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="flex items-baseline justify-between gap-2 text-sm">
          <span>
            <b className="text-lg font-bold tabular-nums text-ink">
              {n.kcal.toLocaleString('ko-KR')}
            </b>
            <span className="text-muted">
              {' '}
              / {n.target.kcal.toLocaleString('ko-KR')}kcal
            </span>
          </span>
          <span className="text-xs text-muted">
            물 {litersText(n.waterMl)} / {litersText(n.target.waterMl)}L
          </span>
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${
              n.kcal > n.target.kcal ? 'bg-warn' : 'bg-sky'
            }`}
            style={{ width: pct(n.kcal, n.target.kcal) }}
          />
        </div>
        <dl className="grid grid-cols-3 gap-3 pt-1">
          {MACROS.map((m) => (
            <div key={m.key} className="space-y-1">
              <div className="flex items-baseline justify-between gap-1">
                <dt className="text-[11px] text-muted">{m.label}</dt>
                <dd className="text-xs tabular-nums text-muted">
                  <b className="font-semibold text-ink">{n[m.key]}</b>/{n.target[m.key]}
                  g
                </dd>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full rounded-full ${m.bar}`}
                  style={{ width: pct(n[m.key], n.target[m.key]) }}
                />
              </div>
            </div>
          ))}
        </dl>
      </div>

      {n.meals.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {n.meals.map((m, i) => (
            <li
              key={m.meal}
              className="motion-safe:animate-row-in flex items-start gap-3 px-4 py-2.5"
              style={{ '--row': i } as CSSProperties}
            >
              <span className="w-8 shrink-0 text-xs font-semibold text-muted">
                {m.label}
              </span>
              <span className="min-w-0 flex-1 text-[13px] break-keep text-ink">
                {m.items
                  .map(
                    (it) => `${it.name}${it.amount === '1인분' ? '' : ` ${it.amount}`}`
                  )
                  .join(', ')}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted">
                {m.kcal.toLocaleString('ko-KR')}kcal
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─────────────────────────── 컨디션 ─────────────────────────── */

const FEELING_TONE: Record<string, string> = {
  정상: 'bg-surface-2 text-muted',
  뻐근: 'bg-warn-bg text-warn',
  통증: 'bg-danger-bg text-danger',
};

function CheckinDetail({ c, isToday }: { c: DayDetail['checkin']; isToday: boolean }) {
  if (!c) {
    return (
      <Empty>
        이 날 체크인이 없어요.
        {isToday && ' 홈 위쪽 체크인 상자에서 남길 수 있어요.'}
      </Empty>
    );
  }
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="컨디션" value={`${c.condition} / 10`} strong />
        <Fact label="수면" value={c.sleep} />
      </dl>
      <ul className="flex flex-wrap gap-1.5" aria-label="부위">
        {c.parts.map((p) => (
          <li
            key={p.label}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium ${FEELING_TONE[p.value] ?? FEELING_TONE['정상']}`}
          >
            {p.label} {p.value}
          </li>
        ))}
      </ul>
      {c.details.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {c.details.map((d) => (
            <Fact key={d.label} label={d.label} value={d.value} />
          ))}
        </dl>
      )}
      {c.note && (
        <p className="flex gap-1.5 rounded-xl bg-surface-2 px-4 py-3 text-[13px] leading-relaxed break-keep text-ink/80">
          <StickyNote aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
          <span className="line-clamp-3">{c.note}</span>
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────── 영상 ─────────────────────────── */

/** 두 개까지 그 자리에서 튼다. 더 있으면 영상 탭에서. */
function VideoDetail({
  videos,
  featured,
}: {
  videos: string[];
  featured: string | null;
}) {
  if (videos.length === 0) return <Empty>이 날 올린 영상이 없어요.</Empty>;
  /* 대표로 고른 것을 먼저 — 고른 영상이 기록에서 빠졌을 수도 있어 확인한다 */
  const ordered =
    featured && videos.includes(featured)
      ? [featured, ...videos.filter((v) => v !== featured)]
      : videos;
  const shown = ordered.slice(0, 2);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((path, i) => (
          <DayVideo
            key={path}
            path={path}
            label={i === 0 && featured === path ? '대표 영상' : `영상 ${i + 1}`}
          />
        ))}
      </div>
      {videos.length > shown.length && (
        <p className="text-xs text-muted">
          외 {videos.length - shown.length}개는 영상 탭에서 볼 수 있어요.
        </p>
      )}
    </div>
  );
}

/**
 * 영상 하나를 그 자리에서 튼다 — 브라우저의 기본 재생기. 한 프레임씩 넘기기·선 긋기
 * 같은 분석 도구는 그날 투구 화면에 있다. 재생 주소는 이 영상 것만 그때 받는다.
 */
function DayVideo({ path, label }: { path: string; label: string }) {
  const { urls, ready } = usePlaybackUrls([path]);
  const url = urls[path];
  return (
    <figure className="space-y-1.5">
      <div className="overflow-hidden rounded-lg bg-shade">
        {url ? (
          /* #t=0.1 — 재생 전에도 첫 장면이 보이게 한다 */
          <video
            key={url}
            src={`${url}#t=0.1`}
            controls
            playsInline
            preload="metadata"
            className="block aspect-video w-full object-contain"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-surface-2 text-xs text-muted">
            {ready ? '영상을 불러오지 못했습니다' : '영상을 불러오는 중…'}
          </div>
        )}
      </div>
      <figcaption className="text-xs text-muted">{label}</figcaption>
    </figure>
  );
}

/* ─────────────────────────── 분석 ─────────────────────────── */

function CoachDetail({ r }: { r: DayDetail['report'] }) {
  if (!r) {
    return (
      <Empty>
        이 날 만든 AI 리포트가 없어요. 분석 탭에서 요즘 흐름을 볼 수 있어요.
      </Empty>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-base font-bold break-keep text-ink">{r.headline}</p>
      {r.assessment && (
        <p className="line-clamp-4 text-[13px] leading-relaxed break-keep text-ink/80">
          {r.assessment}
        </p>
      )}
      {r.actions.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-muted">할 것</p>
          <ul className="mt-1 space-y-1">
            {r.actions.slice(0, 3).map((a) => (
              <li key={a} className="flex gap-2 text-[13px] break-keep text-ink">
                <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.watchouts.length > 0 && (
        <p className="text-xs break-keep text-warn">
          지켜볼 점: {r.watchouts.slice(0, 2).join(' · ')}
        </p>
      )}
    </div>
  );
}
