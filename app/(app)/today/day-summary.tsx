'use client';

import type { CSSProperties, ReactNode } from 'react';
import { formatSpeed } from '@/lib/units';
import { useSpeedUnit } from '@/components/use-units';
import {
  ChevronDown,
  Dumbbell,
  Film,
  HeartPulse,
  Target,
  Utensils,
  X,
} from 'lucide-react';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import type { Log } from '@/app/(app)/pitch-log/types';
import type { PlanDaySummary, TrainingDaySummary } from '@/lib/report/training-history';

/** 그날 먹은 것 — 칼로리·단백질 합 */
export type NutritionDay = { kcal: number; protein: number };
/** 그날 체크인 — 컨디션(1~10)과 통증이 있었나 */
export type CheckinDay = { condition: number; pain: boolean };

/**
 * 그날 칸의 줄 — 누르면 캘린더 밑에 그 줄의 자세한 요약이 펴진다.
 *
 * '분석' 줄은 없앴다. 분석은 캘린더 밑의 분석 칸이 늘 보여 주고, 고른 날을 따라
 * 그날 분석으로 바뀐다(analysis-block.tsx) — 여기에도 두면 같은 것이 두 번 나온다.
 */
export type DayFocus = 'pitch' | 'training' | 'nutrition' | 'checkin' | 'video';

/** 한 날에 대해 미리 알고 있는 것(캘린더와 함께 읽어 둔 한 줄 요약들) */
export type DayFacts = {
  logs: Log[];
  training: TrainingDaySummary | undefined;
  plan: PlanDaySummary | undefined;
  nutrition: NutritionDay | undefined;
  checkin: CheckinDay | undefined;
};

const ORDER: DayFocus[] = ['pitch', 'training', 'nutrition', 'checkin', 'video'];

/** 줄마다 남긴 것이 있나 */
export function dayHas(f: DayFacts): Record<DayFocus, boolean> {
  return {
    pitch: f.logs.length > 0,
    training: Boolean(
      f.plan || (f.training && (f.training.count > 0 || f.training.intensity != null))
    ),
    nutrition: Boolean(f.nutrition && f.nutrition.kcal > 0),
    checkin: f.checkin != null,
    video: f.logs.some((l) => l.videoPaths.length > 0),
  };
}

/** 처음 펼칠 줄 — 남긴 것 가운데 가장 앞. 아무것도 없으면 투구(남기러 가는 길). */
export function firstFocus(f: DayFacts): DayFocus {
  const has = dayHas(f);
  return ORDER.find((k) => has[k]) ?? 'pitch';
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * '9월 24일 (수)'.
 *
 * UTC 로 읽는 이유: 날짜 키는 그냥 달력의 칸 이름이지 시각이 아니다. 지역
 * 시간으로 새 Date 를 만들면 시간대에 따라 하루 밀려 요일이 틀어진다.
 */
export function spokenDay(dateKey: string) {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}

/** '오늘' · '어제' · '3일 전' · '2주 전' — 오늘에서 얼마나 떨어졌나 */
export function agoText(date: string, today: string) {
  if (date === today) return '오늘';
  const days = Math.round(
    (Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${date}T00:00:00.000Z`)) /
      86_400_000
  );
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  if (days < 60) return `${Math.floor(days / 7)}주 전`;
  return `${Math.floor(days / 30)}달 전`;
}

/**
 * 캘린더 옆의 '그날' 칸 — 고른 날에 무엇을 남겼는지 한눈에 보는 요약.
 *
 * 보는 것이 먼저다. 줄마다 그날의 숫자(몇 구 · 몇 kcal · 컨디션 몇)를 굵게 두고,
 * 없으면 '기록 없음'을 흐리게 적는다. 줄을 누르면 넘어가지 않고, 캘린더 밑에 그 줄의
 * 조금 더 자세한 요약이 펴진다(day-detail.tsx). 각 탭으로 넘어가는 길은 그 밑 칸에
 * 둔다 — 요약을 훑다가 실수로 화면이 바뀌지 않게.
 */
export function DaySummary({
  date,
  today,
  facts,
  focus,
  onFocus,
  onClose,
}: {
  /** YYYY-MM-DD */
  date: string;
  /** 서비스 기준 오늘(YYYY-MM-DD) */
  today: string;
  facts: DayFacts;
  /** 캘린더 밑에 펴 둔 줄 */
  focus: DayFocus;
  onFocus: (f: DayFocus) => void;
  /** 칸을 닫는다 — 캘린더가 다시 제 크기로 돌아간다 */
  onClose: () => void;
}) {
  /* 구속을 보여줄 단위. 저장은 늘 km/h 다(lib/units.ts). */
  const speedUnit = useSpeedUnit();
  const { logs, training, plan, nutrition, checkin } = facts;

  /*
   * 하루에 여러 건이면 합쳐서 본다.
   *
   * 오전 불펜 30구 · 오후 캐치볼 20구처럼 나뉜 날이 있다. 요약은 '그날 얼마나
   * 던졌나'를 보는 자리라 합이 먼저다. 건별 내역은 밑 칸과 투구 화면에 있다.
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
  const videos = logs.reduce((n, l) => n + l.videoPaths.length, 0);
  const has = dayHas(facts);

  const rows: Row[] = [
    {
      key: 'pitch',
      icon: <Target className="h-4 w-4" />,
      label: '투구',
      value: rested
        ? '쉬는 날'
        : logs.length > 0
          ? `${kinds.join(' · ')} ${pitches}구`
          : null,
      sub: rested
        ? '쉬는 날로 남김'
        : [
            intensity > 0 ? `강도 ${intensity}` : null,
            topVelocity != null ? `최고 ${formatSpeed(topVelocity, speedUnit)}` : null,
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
    },
    {
      key: 'training',
      icon: <Dumbbell className="h-4 w-4" />,
      label: '트레이닝',
      value: plan
        ? plan.theme
        : has.training
          ? training!.count > 0
            ? `${training!.count}개 완료`
            : '강도만 남김'
          : null,
      sub:
        [
          plan && training && training.count > 0 ? `${training.count}개 완료` : null,
          training?.intensity != null ? `강도 ${training.intensity}` : null,
          training?.hasMemo ? '메모 있음' : null,
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
    },
    {
      key: 'nutrition',
      icon: <Utensils className="h-4 w-4" />,
      label: '영양',
      value: has.nutrition ? `${nutrition!.kcal.toLocaleString('ko-KR')}kcal` : null,
      sub: has.nutrition ? `단백질 ${nutrition!.protein}g` : undefined,
    },
    {
      key: 'checkin',
      icon: <HeartPulse className="h-4 w-4" />,
      label: '컨디션',
      value: checkin ? `${checkin.condition} / 10` : null,
      sub: checkin ? (checkin.pain ? '통증 있음' : '통증 없음') : undefined,
      warn: checkin?.pain,
    },
    {
      key: 'video',
      icon: <Film className="h-4 w-4" />,
      label: '영상',
      value: videos > 0 ? `${videos}개` : null,
    },
  ];

  return (
    /*
     * 넓은 화면에서는 옆 캘린더와 위아래 끝을 맞춘다(lg:h-full). 캘린더가 더 길면 줄들이
     * 남는 높이를 고루 나눠 가진다(flex-1) — 칸 밑에 빈자리가 남아 둘의 바닥선이
     * 어긋나 보이던 것.
     */
    <section
      aria-label={`${spokenDay(date)} 요약`}
      className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface lg:h-full"
    >
      {/* 날짜를 바꿀 때마다 새로 그려, 줄이 위에서부터 다시 들어온다 */}
      <div key={date} className="flex flex-1 flex-col">
        <header className="relative px-5 pb-3 pt-4">
          <p className="text-xs font-semibold text-sky">{agoText(date, today)}</p>
          <h3 className="text-heading mt-0.5 text-lg text-ink">{spokenDay(date)}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="그날 칸 닫기"
            className="absolute right-3 top-3 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </header>

        <ul className="flex flex-1 flex-col divide-y divide-line border-t border-line">
          {rows.map((row, i) => (
            <SummaryRow
              key={row.key}
              row={row}
              index={i}
              selected={focus === row.key}
              onSelect={() => onFocus(row.key)}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

type Row = {
  key: DayFocus;
  icon: ReactNode;
  label: string;
  /** 그날의 값. 남긴 것이 없으면 null — '기록 없음'을 흐리게 적는다 */
  value: string | null;
  sub?: string;
  /** 눈여겨볼 값(통증 있음) */
  warn?: boolean;
};

/**
 * 요약 한 줄 — 그림 · 이름 · 그날의 값.
 *
 * 누르면 밑 칸이 이 줄로 바뀐다. 펴 둔 줄은 옅은 하늘색으로 칠해 둔다 — 밑에 무엇이
 * 펴져 있는지 위에서 바로 보이게.
 */
function SummaryRow({
  row,
  index,
  selected,
  onSelect,
}: {
  row: Row;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const done = row.value != null;
  return (
    <li
      className="flex flex-1 motion-safe:animate-row-in"
      style={{ '--row': index } as CSSProperties}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${row.label} — ${row.value ?? '기록 없음'}${row.sub ? `, ${row.sub}` : ''}`}
        className={`group flex w-full flex-1 items-center gap-3 px-5 py-2.5 text-left transition-colors duration-200 ${
          selected ? 'bg-sky-tint/70' : 'hover:bg-surface-2'
        }`}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 ${
            selected
              ? 'bg-sky text-white'
              : done
                ? 'bg-sky-tint text-sky'
                : 'bg-surface-2 text-muted'
          }`}
        >
          {row.icon}
        </span>
        <span className="w-14 shrink-0 text-xs font-semibold text-muted">
          {row.label}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-sm ${
              row.warn
                ? 'font-bold text-danger'
                : done
                  ? 'font-bold text-ink'
                  : 'text-muted/80'
            }`}
          >
            {row.value ?? '기록 없음'}
          </span>
          {row.sub && (
            <span
              className={`block truncate text-xs ${
                row.warn ? 'font-semibold text-danger' : 'text-muted'
              }`}
            >
              {row.sub}
            </span>
          )}
        </span>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 transition-colors duration-200 ${
            selected ? 'text-sky' : 'text-line-strong group-hover:text-muted'
          }`}
        />
      </button>
    </li>
  );
}
