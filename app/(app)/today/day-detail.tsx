'use client';

import { isPhoneVideoPath, phoneVideoElsewhereText } from '@/lib/local-video';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, Camera, Check, Circle, Film, StickyNote } from 'lucide-react';
import { formatSpeed } from '@/lib/units';
import { useSpeedUnit } from '@/components/use-units';
import { usePlaybackUrls } from '@/components/use-playback-urls';
import { OpenCheckinButton } from '@/components/notice-bell';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import type { Log } from '@/app/(app)/pitch-log/types';
import type { PlanDaySummary } from '@/lib/report/training-history';
import type { DayDetail } from '@/lib/day-detail';
import { dayHas, spokenDay, type DayFacts, type DayFocus } from './day-summary';
import { OPEN_POPUP_TYPES } from '@/lib/transition-types';
import { LinkPending } from '@/components/link-pending';
import type { VelocityDayFact } from '@/lib/velocity-meta';
import type { CalendarEventView } from '@/lib/calendar-event';
import { DaySchedule } from './day-schedule';

/* 구속 측정 클립 — 클립이 있는 날에만 불러온다(재생기가 스트라이크 존 그림까지 끌고 와 홈을 무겁게 하지 않게) */
const VelocityClips = dynamic(() => import('./velocity-clips'), {
  loading: () => <Waiting />,
});

/**
 * 캘린더 밑 칸 — 옆 요약에서 누른 아이콘을 조금 더 자세히.
 *
 * 여기도 요약이다. 그날 무엇을 했는지 한 번 더 펴 보는 자리이고, 진짜 자세한 것(영상
 * 분석 도구, 세트 고치기, 음식 담기)은 각 탭에 있다. 그래서 칸 위쪽에 늘 그 탭으로
 * 가는 길을 둔다 — 그 날짜를 그대로 들고 간다.
 *
 * 투구·영상은 캘린더가 이미 들고 있는 기록으로 바로 그린다. 트레이닝·영양·컨디션과 구속 측정 클립은
 * 날짜를 고를 때 그날 것만 받아 온다(/api/day-detail) — 받는 동안 자리를 잡아 둔다.
 *
 * 분석은 머리의 '그날 분석' 한 줄로 분석 · 그래프 화면(/coach)에 그 날짜째 연다 — 2026-10-05 홈 정리 때
 * 캘린더 밑에 늘 떠 있던 분석 칸이 그리로 옮겨 갔다. 리포트가 있는 날은 리포트 칸으로.
 */

const TITLES: Record<DayFocus, string> = {
  pitch: '투구',
  training: '트레이닝',
  nutrition: '영양',
  checkin: '컨디션',
  video: '영상',
  schedule: '일정',
};

/** 각 탭으로 가는 길 — 그날 남긴 것이 없으면 '남기러 가는' 말로 */
function tabLink(
  focus: DayFocus,
  date: string,
  today: string,
  opts: { empty: boolean; clipsOnly: boolean }
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
      /* 구속 측정 클립만 있는 날 — 공마다 보고 고치는 곳은 그날 화면이다 */
      if (opts.clipsOnly)
        return { href: `/pitch-log/${date}`, label: '그날 화면에서 공마다 보기' };
      /* 영상 캘린더가 그날을 열어 둔 채로 시작한다 */
      return {
        href: `/videos?date=${date}`,
        label: opts.empty ? '투구 기록으로' : '투구 기록에서 보기',
      };
    case 'checkin':
      /* 체크인은 따로 탭이 없다 — 오늘 것은 오른쪽 위 알림(종)의 체크인 창에서 고친다 */
      return null;
    case 'schedule':
      /* 일정은 이 칸에서 바로 적고 고친다 */
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
  onReload,
  onEventSaved,
  onEventDeleted,
}: {
  date: string;
  today: string;
  focus: DayFocus;
  /** 그날에 대해 캘린더가 이미 아는 것(투구 기록 · 일정) */
  facts: DayFacts;
  featuredVideo: string | null | undefined;
  /** 받아 온 그날 요약. 아직이면 null */
  detail: DayDetail | null;
  /** 받아 오지 못했다 */
  failed: boolean;
  /** 받아 오지 못한 날을 다시 받는다 */
  onRetry: () => void;
  /** 받아 둔 그날 요약을 버리고 새로 받는다 — 클립 주소가 만료됐을 때 */
  onReload: () => void;
  /** 일정을 더하거나 고쳤다 · 지웠다 — 캘린더가 쥔 목록을 고친다 */
  onEventSaved: (event: CalendarEventView) => void;
  onEventDeleted: (id: string) => void;
}) {
  const { logs, plan, velocity } = facts;
  /* 앞날 — 남긴 기록이 있을 수 없어 일정만 쓴다(받아 올 그날 요약도 없다) */
  const ahead = date > today;
  const needsDetail =
    !ahead && (focus === 'training' || focus === 'nutrition' || focus === 'checkin');
  const videos = logs.flatMap((l) => l.videoPaths);
  const clips = velocity?.clips ?? 0;
  /* 영상 칸에서 고른 구속 측정 공 — 주소를 다시 받아도 그 공에 머물게 여기서 쥔다 */
  const [clipPick, setClipPick] = useState<string | null>(null);
  /*
   * 남긴 것이 있나는 오른쪽 요약과 같은 기준(dayHas)으로 본다. 받아 온 내용으로 보면
   * 받는 동안이나 못 받았을 때 '기록하러 가기'로 잘못 적히고, 요약 아이콘은 칠해졌는데
   * 밑 칸 링크는 '기록하러 가기'인 식으로 둘이 어긋난다.
   */
  const empty = !dayHas(facts)[focus];
  const link = ahead
    ? null
    : tabLink(focus, date, today, {
        empty,
        clipsOnly: videos.length === 0 && clips > 0,
      });

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
        <span className="flex flex-wrap items-center gap-1">
          {/* 그날 분석 — 분석 · 그래프 화면을 그 날짜째(앞날은 없다) */}
          {!ahead && (
            <Link
              href={`/coach?date=${date}`}
              className="inline-flex items-center rounded-lg px-2 py-1 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              그날 분석
            </Link>
          )}
          {link && (
            <Link
              href={link.href}
              transitionTypes={
                link.href.startsWith('/pitch-log/') ? OPEN_POPUP_TYPES : undefined
              }
              className="group inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-sky transition-colors hover:bg-sky-tint hover:text-sky-strong"
            >
              {link.label}
              <LinkPending className="h-3.5 w-3.5">
                <ArrowRight
                  aria-hidden
                  className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
                />
              </LinkPending>
            </Link>
          )}
        </span>
      </header>

      {/* 줄이나 날짜가 바뀔 때마다 새로 그려, 내용이 옅게 떠오르며 바뀐다 */}
      <div key={`${date}-${focus}`} className="motion-safe:animate-fade-in px-5 py-4">
        {focus === 'schedule' && (
          <DaySchedule
            date={date}
            events={facts.events}
            onSaved={onEventSaved}
            onDeleted={onEventDeleted}
          />
        )}
        {ahead && focus !== 'schedule' && (
          <p className="text-sm text-muted">
            아직 오지 않은 날이에요. 일정을 적어 둘 수 있어요.
          </p>
        )}
        {!ahead && focus === 'pitch' && <PitchDetail logs={logs} velocity={velocity} />}
        {!ahead && focus === 'video' && (
          <div className="space-y-5">
            {(videos.length > 0 || clips === 0) && (
              <VideoDetail videos={videos} featured={featuredVideo ?? null} />
            )}
            {/* 구속 측정 클립 — 주소는 그날 요약과 함께 온다 */}
            {clips > 0 &&
              (detail ? (
                <VelocityClips
                  clips={detail.clips}
                  pickedId={clipPick}
                  onPick={setClipPick}
                  onReload={onReload}
                />
              ) : failed ? (
                <Failed onRetry={onRetry} />
              ) : (
                <Waiting />
              ))}
          </div>
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
      </div>
    </section>
  );
}

/* ─────────────────────────── 공통 ─────────────────────────── */

function Waiting() {
  return (
    <div aria-busy="true" className="space-y-2.5">
      <span className="sr-only">불러오는 중이에요</span>
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

function PitchDetail({
  logs,
  velocity,
}: {
  logs: Log[];
  velocity: VelocityDayFact | undefined;
}) {
  const speedUnit = useSpeedUnit();
  /* 같이 만든 투구 기록을 지우면 측정 세션만 남는다 — 그래도 카메라 줄은 보인다 */
  const camera = velocity && velocity.n > 0 && (
    <p className="flex items-center gap-1.5 text-xs text-muted">
      <Camera aria-hidden className="h-3.5 w-3.5 shrink-0 text-sky" />
      <span>
        카메라로 잰 공 {velocity.n}구 · 최고 {formatSpeed(velocity.max, speedUnit)}
        {velocity.clips > 0 && ` · 영상 ${velocity.clips}개는 영상 아이콘에서 봐요`}
      </span>
    </p>
  );
  if (logs.length === 0)
    return (
      <div className="space-y-3">
        <Empty>이 날 남긴 투구가 없어요.</Empty>
        {camera}
      </div>
    );

  return (
    <div className="space-y-3">
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
                  영상 {l.videoPaths.length}개 · 영상 아이콘을 누르면 봐요
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {/* 카메라로 잰 공 — 공 하나하나 · 클립은 그날 화면과 영상 아이콘에 */}
      {camera}
    </div>
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
  /* 색은 하나 — 무엇인지는 이름이 말한다(그림은 색 적게) */
  { key: 'carbs', label: '탄수화물', bar: 'bg-sky' },
  { key: 'protein', label: '단백질', bar: 'bg-sky' },
  { key: 'fat', label: '지방', bar: 'bg-sky' },
] as const;

function NutritionDetail({ n }: { n: DayDetail['nutrition'] }) {
  if (n.meals.length === 0) {
    return <Empty>이 날 먹은 것을 아직 안 적었어요.</Empty>;
  }
  const pct = (v: number, of: number) =>
    `${Math.min(100, of > 0 ? (v / of) * 100 : 0)}%`;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm">
          <b className="text-lg font-bold tabular-nums text-ink">
            {n.kcal.toLocaleString('ko-KR')}
          </b>
          <span className="text-muted">
            {' '}
            / {n.target.kcal.toLocaleString('ko-KR')}kcal
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
        {isToday && (
          <>
            {' '}
            <OpenCheckinButton className="font-semibold text-sky-strong">
              지금 체크인하기
            </OpenCheckinButton>
          </>
        )}
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

/** 두 개까지 그 자리에서 튼다. 더 있으면 투구 기록 탭에서. */
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
          외 {videos.length - shown.length}개는 투구 기록에서 볼 수 있어요.
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
            {ready
              ? isPhoneVideoPath(path)
                ? phoneVideoElsewhereText()
                : '영상을 불러오지 못했어요'
              : '영상을 불러오는 중…'}
          </div>
        )}
      </div>
      <figcaption className="text-xs text-muted">{label}</figcaption>
    </figure>
  );
}
