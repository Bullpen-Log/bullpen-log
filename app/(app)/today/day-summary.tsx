'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { formatSpeed } from '@/lib/units';
import { useSpeedUnit } from '@/components/use-units';
import {
  ChartColumn,
  ChevronRight,
  X,
  Dumbbell,
  Film,
  HeartPulse,
  Target,
  Utensils,
} from 'lucide-react';
import { usePlaybackUrls } from '@/components/use-playback-urls';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import type { Log } from '@/app/(app)/pitch-log/types';
import type { PlanDaySummary, TrainingDaySummary } from '@/lib/report/training-history';

/** 그날 먹은 것 — 칼로리·단백질 합 */
export type NutritionDay = { kcal: number; protein: number };
/** 그날 체크인 — 컨디션(1~10)과 통증이 있었나 */
export type CheckinDay = { condition: number; pain: boolean };

/**
 * 달력 옆의 '그날' 칸 — 고른 날에 남긴 것을 보고, 그 날짜 그대로 각 기능으로 간다.
 *
 * 예전에는 날짜를 누르면 곧바로 그날 화면으로 넘어갔다. 그런데 달력은 이 칸 저 칸
 * 눌러보며 훑는 물건이라, 무엇이 있었는지 잠깐 보려던 것뿐인데 매번 화면이 통째로
 * 바뀌고 다시 뒤로 와야 했다. 그래서 누르면 여기 그날이 뜨고, 넘어갈 때만 줄을 누른다.
 *
 * 줄 하나가 기능 하나다 — 투구 · 트레이닝 · 영양 · 영상 · 분석. 기록이 있으면 무엇을
 * 했는지를, 없으면 무엇을 할 수 있는지를 적는다. 빈칸을 누르는 것은 대개 '여기 뭐
 * 있었지'가 아니라 '여기 남겨야지'다 — 화요일 것을 깜빡한 날.
 */
export function DaySummary({
  date,
  today,
  logs,
  training,
  plan,
  featuredVideo,
  nutrition,
  checkin,
  hasReport,
  onClose,
}: {
  /** YYYY-MM-DD */
  date: string;
  /** 서비스 기준 오늘(YYYY-MM-DD) */
  today: string;
  /** 그날 투구 기록. 하루에 여러 번 던진 날도 있다. 남긴 차례대로 온다. */
  logs: Log[];
  /** 그날 운동 요약. 아무것도 안 했으면 undefined */
  training: TrainingDaySummary | undefined;
  /** 그날 만들어 둔 운동 일정. 안 만든 날이면 undefined */
  plan: PlanDaySummary | undefined;
  /**
   * 영상 탭에서 이 날의 대표로 고른 영상. 안 골랐으면 없다 — 그때는 그날 처음 올린
   * 영상을 보여준다.
   */
  featuredVideo?: string | null;
  nutrition: NutritionDay | undefined;
  checkin: CheckinDay | undefined;
  /** 그날 만든 AI 리포트가 있나 */
  hasReport: boolean;
  /** 칸을 닫는다 — 달력이 다시 제 폭으로 넓어진다 */
  onClose: () => void;
}) {
  /* 구속을 보여줄 단위. 저장은 늘 km/h 다(lib/units.ts). */
  const speedUnit = useSpeedUnit();
  const isToday = date === today;

  /*
   * 하루에 여러 건이면 합쳐서 본다.
   *
   * 오전 불펜 30구 · 오후 캐치볼 20구처럼 나뉜 날이 있다. 요약은 '그날 얼마나
   * 던졌나'를 보는 자리라 합이 먼저다. 건별 내역은 그날 투구 화면에 있다.
   */
  const thrown = logs.filter((l) => l.sessionType !== REST_SESSION_TYPE);
  const rested = logs.length > 0 && thrown.length === 0;
  const pitches = thrown.reduce((sum, l) => sum + l.pitchCount, 0);
  const intensity = thrown.reduce((max, l) => Math.max(max, l.intensity), 0);
  const velocities = thrown
    .map((l) => l.maxVelocity)
    .filter((v): v is number => v != null);
  const topVelocity = velocities.length > 0 ? Math.max(...velocities) : null;
  /* 종류는 중복을 걷어내고 적는다 — '불펜 · 불펜'은 알려주는 것이 없다 */
  const kinds = [...new Set(thrown.map((l) => l.sessionType))];

  /*
   * 그날 영상 — 남긴 차례대로. 대표로 고른 것이 아직 그날 영상에 있으면 그것,
   * 아니면 처음 올린 것. 고른 영상을 나중에 기록에서 뺐을 수도 있어 확인한다.
   */
  const videos = logs.flatMap((l) => l.videoPaths);
  const shownVideo =
    featuredVideo && videos.includes(featuredVideo)
      ? featuredVideo
      : (videos[0] ?? null);

  const didTrain = Boolean(
    training && (training.count > 0 || training.intensity != null)
  );

  const pitchStatus = rested
    ? '쉬는 날로 남김'
    : logs.length > 0
      ? [
          kinds.join(' · '),
          `${pitches}구`,
          intensity > 0 ? `강도 ${intensity}` : null,
          topVelocity != null ? `최고 ${formatSpeed(topVelocity, speedUnit)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null;

  const trainingStatus = plan
    ? plan.theme
    : didTrain
      ? training!.count > 0
        ? `${training!.count}개 완료`
        : '강도만 남김'
      : null;
  const trainingDetail = plan
    ? [
        plan.parts.length > 0 ? plan.parts.join(' · ') : null,
        training && training.count > 0
          ? `${training.count}개 완료`
          : `${plan.count}종목 · 약 ${plan.minutes}분`,
      ]
        .filter(Boolean)
        .join(' — ')
    : undefined;

  const rows: Row[] = [
    {
      key: 'pitch',
      icon: <Target className="h-4 w-4" />,
      label: '투구',
      href: `/pitch-log/${date}`,
      status: pitchStatus,
      empty: isToday ? '오늘 던진 것 남기기' : '이 날 투구 남기기',
    },
    {
      key: 'training',
      icon: <Dumbbell className="h-4 w-4" />,
      label: '트레이닝',
      href: isToday ? '/training' : `/training/day/${date}`,
      status: trainingStatus,
      detail: trainingDetail,
      empty: isToday ? '오늘 운동 보러 가기' : '운동 기록 없음 — 채우러 가기',
    },
    {
      key: 'nutrition',
      icon: <Utensils className="h-4 w-4" />,
      label: '영양',
      href: isToday ? '/nutrition' : `/nutrition?date=${date}`,
      status:
        nutrition && nutrition.kcal > 0
          ? `${nutrition.kcal.toLocaleString('ko-KR')}kcal · 단백질 ${nutrition.protein}g`
          : null,
      empty: isToday ? '오늘 먹은 것 적기' : '식단 기록하기',
    },
    {
      key: 'video',
      icon: <Film className="h-4 w-4" />,
      label: '영상',
      href: `/videos?month=${date.slice(0, 7)}`,
      status: videos.length > 0 ? `영상 ${videos.length}개` : null,
      empty: '이 달 영상 보기',
    },
    {
      key: 'coach',
      icon: <ChartColumn className="h-4 w-4" />,
      label: '분석',
      href: hasReport ? `/coach/report/${date}` : '/coach',
      status: hasReport ? '이 날 AI 리포트' : null,
      empty: '요즘 흐름 보기',
    },
  ];

  return (
    <section
      aria-label={`${spokenDay(date)} 기록`}
      className="overflow-hidden rounded-2xl border border-line bg-surface"
    >
      {/* 날짜를 바꿀 때마다 새로 그려, 줄이 위에서부터 다시 들어온다 */}
      <div key={date}>
        <header className="relative px-5 pb-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="그날 칸 닫기"
            className="absolute right-3 top-3 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
          <p className="text-xs font-semibold text-sky">
            {isToday ? '오늘' : agoText(date, today)}
          </p>
          <h3 className="text-heading mt-0.5 text-lg text-ink">{spokenDay(date)}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <HeartPulse aria-hidden className="h-3.5 w-3.5" />
            {checkin ? (
              <>
                컨디션 {checkin.condition}/10
                {checkin.pain && (
                  <span className="font-semibold text-danger">· 통증 있음</span>
                )}
              </>
            ) : (
              '체크인 없음'
            )}
          </p>
        </header>

        <ul className="divide-y divide-line border-t border-line">
          {rows.map((row, i) => (
            <FeatureRow key={row.key} row={row} index={i} />
          ))}
        </ul>

        {/* ── 영상 ─ 그날 찍은 것 하나를 그 자리에서 튼다 ── */}
        {shownVideo && (
          <div className="border-t border-line px-5 py-4">
            <DayVideo path={shownVideo} total={videos.length} date={date} />
          </div>
        )}
      </div>
    </section>
  );
}

type Row = {
  key: string;
  icon: ReactNode;
  label: string;
  href: string;
  /** 남긴 것이 있으면 그 내용. 없으면 null — 그때는 empty 를 적는다 */
  status: string | null;
  /** 굵은 줄 밑의 설명 한 줄 */
  detail?: string;
  empty: string;
};

/** 기능 하나로 가는 줄 — 그림 · 이름 · 그날 한 것(없으면 할 수 있는 것) · 화살표 */
function FeatureRow({ row, index }: { row: Row; index: number }) {
  const done = row.status != null;
  return (
    <li
      className="motion-safe:animate-row-in"
      style={{ '--row': index } as CSSProperties}
    >
      <Link
        href={row.href}
        className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
            done
              ? 'bg-sky-tint text-sky'
              : 'bg-surface-2 text-muted group-hover:text-ink'
          }`}
        >
          {row.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-muted">{row.label}</span>
          <span
            className={`block truncate text-sm ${done ? 'font-bold text-ink' : 'text-muted group-hover:text-ink'}`}
          >
            {row.status ?? row.empty}
          </span>
          {row.detail && (
            <span className="block truncate text-xs text-ink/70">{row.detail}</span>
          )}
        </span>
        <ChevronRight
          aria-hidden
          className="h-4 w-4 shrink-0 text-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-sky"
        />
      </Link>
    </li>
  );
}

/**
 * 그날 영상 하나를 그 자리에서 튼다.
 *
 * 요약에서는 간단히 보는 것이 목적이라 브라우저의 기본 재생기를 쓴다. 한 프레임씩
 * 넘기기·선 긋기 같은 분석 도구는 그날 투구 화면에 있다.
 *
 * 재생 주소는 이 영상 것만 그때 받는다(서명된 임시 주소). 날짜를 옮길 때마다
 * 새로 받고, 한 번 받은 것은 다시 받지 않는다(usePlaybackUrls).
 */
function DayVideo({
  path,
  total,
  date,
}: {
  path: string;
  total: number;
  date: string;
}) {
  const { urls, ready } = usePlaybackUrls([path]);
  const url = urls[path];

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold text-muted">
          {total > 1 ? `${total}개 중 대표 영상` : '이 날 영상'}
        </p>
        {/*
          대표를 바꾸는 곳 — 영상이 여럿인 날만 고를 것이 있다. 그 날짜의 달을 펴 둔
          채로 연다. 영상 탭은 처음에 가장 최근 달만 펴 두어서, 지난달 영상은 찾으러
          한참 내려가야 했다.
        */}
        {total > 1 && (
          <Link
            href={`/videos?month=${date.slice(0, 7)}`}
            className="text-xs font-semibold text-sky transition-colors hover:text-sky-strong"
          >
            대표 바꾸기
          </Link>
        )}
      </div>

      <div className="mt-2 overflow-hidden rounded-lg bg-shade">
        {url ? (
          /*
            #t=0.1 — 재생 전에도 첫 장면이 보이게 한다. 안 주면 브라우저에 따라
            재생을 누르기 전까지 검은 칸으로 남는다.
          */
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
    </div>
  );
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * '9월 24일 (수)'.
 *
 * UTC 로 읽는 이유: 날짜 키는 그냥 달력의 칸 이름이지 시각이 아니다. 지역
 * 시간으로 새 Date 를 만들면 시간대에 따라 하루 밀려 요일이 틀어진다.
 */
function spokenDay(dateKey: string) {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}

/** '어제' · '3일 전' · '2주 전' — 오늘에서 얼마나 떨어졌나 */
function agoText(date: string, today: string) {
  const days = Math.round(
    (Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${date}T00:00:00.000Z`)) /
      86_400_000
  );
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  if (days < 60) return `${Math.floor(days / 7)}주 전`;
  return `${Math.floor(days / 30)}달 전`;
}
