'use client';

import type { CSSProperties } from 'react';
import { formatSpeed } from '@/lib/units';
import { useSpeedUnit } from '@/components/use-units';
import {
  Dumbbell,
  Film,
  HeartPulse,
  Target,
  Utensils,
  X,
  type LucideIcon,
} from 'lucide-react';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import type { Log } from '@/app/(app)/pitch-log/types';
import type { PlanDaySummary, TrainingDaySummary } from '@/lib/report/training-history';

/** 그날 먹은 것 — 칼로리·단백질 합 */
export type NutritionDay = { kcal: number; protein: number };
/** 그날 체크인 — 컨디션(1~10)과 통증이 있었나 */
export type CheckinDay = { condition: number; pain: boolean };

/**
 * 그날 칸의 아이콘 — 누르면 캘린더 밑에 그것의 자세한 요약이 펴진다.
 *
 * '분석' 아이콘은 두지 않는다. 분석은 캘린더 밑의 분석 칸이 늘 보여 주고, 고른 날을 따라
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

/** 아이콘마다 남긴 것이 있나 */
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

/** 처음 펼칠 아이콘 — 남긴 것 가운데 가장 앞. 아무것도 없으면 투구(남기러 가는 길). */
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
 * 보는 것이 먼저다. 투구 · 트레이닝 · 영양 · 컨디션 · 영상을 휴대폰 앱 아이콘처럼
 * 늘어놓고, 그날 남긴 것만 제 색으로 칠한다(SummaryTile). 아이콘을 누르면 넘어가지
 * 않고, 캘린더 밑에 그것의 자세한 요약이 펴진다(day-detail.tsx). 각 탭으로 넘어가는
 * 길은 그 밑 칸에 둔다 — 요약을 훑다가 실수로 화면이 바뀌지 않게.
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
  /** 캘린더 밑에 펴 둔 아이콘 */
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
      icon: Target,
      tone: TONES.pitch,
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
      icon: Dumbbell,
      tone: TONES.training,
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
      icon: Utensils,
      tone: TONES.nutrition,
      label: '영양',
      value: has.nutrition ? `${nutrition!.kcal.toLocaleString('ko-KR')}kcal` : null,
      sub: has.nutrition ? `단백질 ${nutrition!.protein}g` : undefined,
    },
    {
      key: 'checkin',
      icon: HeartPulse,
      tone: TONES.checkin,
      label: '컨디션',
      value: checkin ? `${checkin.condition} / 10` : null,
      sub: checkin ? (checkin.pain ? '통증 있음' : '통증 없음') : undefined,
      warn: checkin?.pain,
    },
    {
      key: 'video',
      icon: Film,
      tone: TONES.video,
      label: '영상',
      value: videos > 0 ? `${videos}개` : null,
    },
  ];

  return (
    /*
     * 넓은 화면에서는 옆 캘린더와 위아래 끝을 맞춘다(lg:h-full). 아이콘 판(ul)이 남는 높이를
     * 다 쓰고, 그 안에서 줄 사이를 고루 나눈다(아래 ul 의 설명).
     */
    <section
      aria-label={`${spokenDay(date)} 요약`}
      className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface lg:h-full"
    >
      {/* 날짜를 바꿀 때마다 새로 그려, 아이콘이 차례로 다시 들어온다 */}
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

        {/*
          좁은 화면: 다섯을 한 줄로 — 휴대폰 아래쪽 독(dock)처럼.

          넓은 화면: 캘린더 높이만큼 긴 옆 칸이다. 처음에는 셋씩 두 줄을 가운데에 모아
          두었더니 아이콘끼리 붙고 위아래가 텅 비었다. 이제 한 줄에 셋, 다음 줄에 둘을
          가운데 맞춰 놓고(flex-wrap · justify-center), 줄 사이를 칸 높이에 고루 나눈다
          (content-evenly). 칸이 길어지든(달력이 여섯 주) 짧아지든 간격이 따라 맞는다.
        */}
        <ul className="grid flex-1 grid-cols-5 border-t border-line px-2 pb-5 pt-4 lg:flex lg:flex-wrap lg:content-evenly lg:justify-center lg:gap-0 lg:px-3 lg:py-4">
          {rows.map((row, i) => (
            <SummaryTile
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

/*
 * 아이콘마다 제 색 — 휴대폰 앱처럼 색으로도 무엇인지 알아본다.
 *
 * 밝은 화면: 짙은 바탕에 흰 그림. 어두운 화면: 이 색들이 옅은 색으로 바뀌므로
 * (globals.css 의 dark · navy) 그림은 바탕색(짙은 색)으로 뒤집는다 — text-surface 가
 * 두 경우를 한 번에 맡는다. 투구는 앱의 대표색이지만 sky 는 흰 글씨와 대비가 모자라
 * 한 단계 짙은 sky-strong 을 쓴다.
 *
 * ring: 펴 둔 아이콘의 테두리. 제 색으로 둘러야 어느 것이 펴졌는지 색으로도 이어진다.
 *
 * 영상은 녹화 단추의 빨강(cat-armcare)이다. 보라(cat-core)는 바로 옆 캘린더에서 '분석'
 * 표시의 색이라 같이 쓰면 둘이 섞인다.
 */
const TONES = {
  pitch: { fill: 'bg-sky-strong', ring: 'ring-sky-strong' },
  training: { fill: 'bg-cat-lower', ring: 'ring-cat-lower' },
  nutrition: { fill: 'bg-cat-power', ring: 'ring-cat-power' },
  checkin: { fill: 'bg-cat-recovery', ring: 'ring-cat-recovery' },
  video: { fill: 'bg-cat-armcare', ring: 'ring-cat-armcare' },
} satisfies Record<DayFocus, { fill: string; ring: string }>;

type Row = {
  key: DayFocus;
  icon: LucideIcon;
  tone: { fill: string; ring: string };
  label: string;
  /**
   * 그날의 값. 남긴 것이 없으면 null — 아이콘을 칠하지 않는다.
   * 화면에는 적지 않고 화면 낭독기에만 읽힌다. 눈으로는 색이 '남겼다'를, 밑 칸이 값을 보여 준다.
   */
  value: string | null;
  sub?: string;
  /** 눈여겨볼 값(통증 있음) — 아이콘 모서리에 빨간 점 */
  warn?: boolean;
};

/**
 * 요약 아이콘 하나 — 휴대폰 앱 아이콘처럼 그림이 가운데, 이름이 그 밑.
 *
 * 예전에는 줄마다 그림 · 이름 · 값 · 덧붙인 말을 적은 한 줄이었다. 다섯 줄이 칸을
 * 꽉 채워 무거웠다. 이제 남긴 것이 있으면 아이콘을 제 색으로 칠하고, 없으면 회색으로
 * 둔다 — 색만 훑어도 그날 무엇을 했는지 보인다. 값은 누르면 밑 칸에 펴진다.
 *
 * 펴 둔 아이콘은 제 색 테두리로 두른다(TONES.ring). 밑에 무엇이 펴져 있는지 위에서
 * 바로 보이게. 남긴 것이 없는 아이콘을 펴 두었으면(아무것도 안 한 날의 투구 — 처음
 * 펴지는 것이다) 회색 대신 muted 로 두른다. 옅은 회색(line-strong)은 흰 바탕과의
 * 대비가 1.5:1 이라 펴 둔 것이 안 보였다.
 *
 * 키보드 초점은 테두리와 겹치지 않게 단추 전체(아이콘과 이름)를 둥근 네모로 두른다.
 * 둘 다 아이콘에 두르면 펴 둔 아이콘에 초점이 와도 색만 살짝 바뀌어 알아볼 수 없다.
 *
 * 마우스를 올리면 살짝 떠오르고(움직임을 줄인 사람에게는 빠진다), 색도 조금 바뀐다 —
 * 움직임 없이도 올린 것이 보이게.
 */
function SummaryTile({
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
  const Icon = row.icon;
  return (
    <li
      className="flex justify-center motion-safe:animate-row-in lg:basis-1/3"
      style={{ '--row': index } as CSSProperties}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${row.label} — ${row.value ?? '기록 없음'}${row.sub ? `, ${row.sub}` : ''}`}
        className="group flex w-full flex-col items-center gap-1.5 rounded-xl py-1 outline-offset-2 focus-visible:outline-2 focus-visible:outline-sky lg:gap-2"
      >
        <span
          className={`relative flex h-12 w-12 items-center justify-center rounded-[28%] transition-[translate,scale,box-shadow,background-color,color,filter] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:group-hover:-translate-y-0.5 motion-safe:group-active:scale-95 lg:h-16 lg:w-16 ${
            done
              ? `${row.tone.fill} text-surface shadow-[0_3px_8px_-3px_rgb(15_23_42/0.45)] group-hover:brightness-110`
              : 'bg-surface-2 text-muted group-hover:bg-line group-hover:text-ink'
          } ${
            selected
              ? `ring-2 ring-offset-2 ring-offset-surface ${done ? row.tone.ring : 'ring-muted'}`
              : ''
          }`}
        >
          <Icon aria-hidden className="h-6 w-6 lg:h-7 lg:w-7" />
          {row.warn && (
            <span
              aria-hidden
              className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-danger ring-2 ring-surface lg:h-4 lg:w-4"
            />
          )}
        </span>
        <span
          className={`max-w-full truncate text-xs transition-colors duration-200 lg:text-sm ${
            selected
              ? 'font-bold text-ink'
              : done
                ? 'font-semibold text-ink'
                : 'font-medium text-muted group-hover:text-ink'
          }`}
        >
          {row.label}
        </span>
      </button>
    </li>
  );
}
