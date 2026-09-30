'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Minus,
  Plus,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { MiniCalendar } from '@/components/mini-calendar';
import { Eyebrow } from '@/components/ui';
import { useWeightUnit } from '@/components/use-units';
import { fromWeight, toWeight } from '@/lib/units';
import { shiftDateKey } from '@/lib/pitch-stats';
import { NUTRITION_BACK_DAYS } from '@/lib/nutrition/days';
import {
  AMOUNT_MAX,
  MEALS,
  amountText,
  entryMacros,
  gapNames,
  kcalText,
  macroGaps,
  mealLabel,
  missingMacros,
  missingText,
  sumMacros,
  type Food,
  type MacroGaps,
  type Macros,
  type MealEntryView,
  type MealKey,
} from '@/lib/nutrition/meta';
import type { DaySummary, NutritionDay } from '@/lib/nutrition/load';
import {
  GUIDE_DISCLAIMER,
  recoveryEaten,
  type ThrowGuide,
} from '@/lib/nutrition/guide';
import { computeTargets } from '@/lib/nutrition/targets';
import { STEP_KCAL, goalCopy, planOnSave } from '@/lib/nutrition/weight-goal';
import {
  addMealEntries,
  applyWeightStep,
  deleteMealEntry,
  saveNutritionProfile,
  setWeight,
  updateMealAmount,
  type NutritionResult,
} from '@/app/actions/nutrition';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { FoodSheet } from './food-sheet';
import { GoalSheet } from './goal-sheet';
import { WeekChart, WeightTrend } from './charts';
import { EASE, originOf, toFoodInput, type Origin } from './shared';

/*
 * 서버에 닿지 못했을 때(신호 끊김) — 부르기가 던지면 전환 안의 오류가 오류 화면으로 넘어가 영양 화면(열어 둔 음식 창까지)이
 * 통째로 바뀌었다. 실패로 바꿔 알림 한 줄로 보인다(lib/action-offline.ts).
 */
const OFFLINE: NutritionResult = { ok: false, error: OFFLINE_MESSAGE };

/**
 * 영양 탭 — 하루치 화면.
 *
 * 인아웃의 흐름을 따른다. 맨 위에 오늘 목표와 먹은 것을 게이지 하나로 보여 주고,
 * 그 밑에 끼니 넷을 둔다. 끼니를 누르면 음식 찾는 창이 뜬다 — 인아웃을 써 본
 * 사람들이 가장 좋다고 꼽은 것이 '끼니별 큰 버튼 넷, 깊이 들어가지 않는 기록'이었다.
 *
 * 누르면 바로 바뀐다. 음식을 담거나 양을 고치면 화면을 먼저 바꾸고 저장은
 * 뒤에서 한다(useOptimistic). 저장이 실패하면 원래대로 돌아가고 까닭을 띄운다.
 */

/* 저장되기 전까지 화면에만 있는 줄의 임시 이름 */
let tempSeq = 0;

type EntryAction =
  | { type: 'add'; entries: MealEntryView[] }
  | { type: 'amount'; id: string; amount: number }
  | { type: 'delete'; id: string };

function reduceEntries(list: MealEntryView[], a: EntryAction): MealEntryView[] {
  switch (a.type) {
    case 'add':
      return [...list, ...a.entries];
    case 'amount':
      return list.map((e) => (e.id === a.id ? { ...e, amount: a.amount } : e));
    case 'delete':
      return list.filter((e) => e.id !== a.id);
  }
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/*
 * 영양 탭의 상자 — 공용 Card 보다 안쪽 여백이 작다(p-4 · 넓으면 p-5). 상자가 여럿 붙는
 * 화면이라 여백만으로도 한 화면을 넘겼다. Card 에 p-4 를 덧대면 어느 쪽이 이길지가 CSS
 * 순서에 달려 있어 따로 적는다.
 */
/* 안쪽 여백은 모든 탭의 블록과 같은 --block-pad(globals.css '크기 기준') */
const PANEL =
  'rounded-2xl border border-line bg-surface p-(--block-pad) shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]';

/** '9월 25일 (목)' */
export function dayTitle(date: string) {
  const d = new Date(`${date}T00:00:00.000Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}

export function NutritionView({ day, today }: { day: NutritionDay; today: string }) {
  useArrowKeys(day.date, today);
  const [, startTransition] = useTransition();
  const [entries, applyEntries] = useOptimistic(day.entries, reduceEntries);
  const [error, setError] = useState<string | null>(null);
  /*
   * 창은 닫아도 곧바로 치우지 않는다(open 만 끈다). 치워 버리면 닫히는 움직임 없이
   * 뚝 사라진다. 새로 열 때는 n 을 올려 안의 상태(검색어 등)를 새로 시작한다.
   */
  const [sheet, setSheet] = useState<{
    meal: MealKey;
    origin: Origin;
    n: number;
    open: boolean;
  } | null>(null);
  const [goal, setGoal] = useState<{ origin: Origin; n: number; open: boolean } | null>(
    null
  );
  const openGoal = (e: MouseEvent<HTMLElement>) =>
    setGoal({ origin: originOf(e), n: (goal?.n ?? 0) + 1, open: true });

  const t = day.targets;
  const eaten = sumMacros(entries.map(entryMacros));
  const gaps = macroGaps(entries);

  const report = (res: NutritionResult) => {
    if (!res.ok) setError(res.error);
  };

  /**
   * 담기. 결과를 돌려주어, 담기 창이 실패를 제 안에서도 알리게 한다 — 창이 화면을
   * 덮고 있어서 뒤에 뜬 오류는 창을 닫기 전까지 안 보인다.
   */
  function addFoods(
    meal: MealKey,
    items: { food: Food; amount: number }[]
  ): Promise<NutritionResult> {
    setError(null);
    const temp: MealEntryView[] = items.map(({ food, amount }) => ({
      id: `tmp-${++tempSeq}`,
      meal,
      name: food.name,
      source: food.source,
      sourceId: food.id,
      servingLabel: food.servingLabel,
      servingGrams: food.servingGrams,
      amount,
      kcal: food.kcal,
      carbs: food.carbs,
      protein: food.protein,
      fat: food.fat,
    }));
    return new Promise((resolve) => {
      startTransition(async () => {
        applyEntries({ type: 'add', entries: temp });
        const res = await orOffline(
          addMealEntries(
            day.date,
            meal,
            items.map(({ food, amount }) => ({ food: toFoodInput(food), amount }))
          ),
          OFFLINE
        );
        report(res);
        resolve(res);
      });
    });
  }

  function changeAmount(id: string, amount: number) {
    setError(null);
    startTransition(async () => {
      applyEntries({ type: 'amount', id, amount });
      report(await orOffline(updateMealAmount(id, amount), OFFLINE));
    });
  }

  function removeEntry(id: string) {
    setError(null);
    startTransition(async () => {
      applyEntries({ type: 'delete', id });
      report(await orOffline(deleteMealEntry(id), OFFLINE));
    });
  }

  return (
    <div className="stack-page">
      {/*
        제목 · 날짜 · 날짜 띠 · 목표를 한 줄에. 머리글(Nutrition) · 밑줄 · 여백은 다른 탭의 쪽 머리
        (PageHeading)와 같게 — 탭마다 머리 모양이 다르면 규격이 흐트러진다(2026-09-28 사용자).

        휴대폰에서는 제목 · 날짜 · 목표가 한 줄이고(목표 단추는 그림만), 날짜 띠는 맨 뒤로
        보내 밑줄을 통째로 쓴다(order-last). 넓은 화면(lg)에서는 띠가 제자리로 돌아와 같은
        줄에 선다 — 예전에는 띠가 따로 한 줄(57px + 간격)을 차지해 오른쪽 절반이 비었다.
      */}
      <header className="flex flex-wrap items-end gap-x-3 gap-y-3 border-b border-line pb-5 sm:gap-x-4 desk:pb-4">
        {/* 머리글은 휴대폰에서 뺀다 — 제목 줄에 날짜 · 목표가 같이 서서, 넣으면 목표 단추가 밑줄로 밀린다 */}
        <div className="space-y-2 desk:space-y-1">
          <span className="hidden sm:block">
            <Eyebrow>Nutrition</Eyebrow>
          </span>
          <h1 className="text-heading page-title text-ink">영양</h1>
        </div>
        <DateNav date={day.date} today={today} calendar={day.calendar} />
        <WeekStrip
          strip={day.strip}
          date={day.date}
          today={today}
          className="order-last w-full sm:max-w-xl lg:order-none lg:w-auto lg:flex-1"
        />
        <button
          type="button"
          onClick={openGoal}
          aria-label="영양 목표"
          className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-2.5 text-sm text-ink transition-colors hover:border-sky hover:text-sky sm:px-3"
        >
          <Settings2 aria-hidden className="h-4 w-4" />
          <span className="hidden sm:inline">목표</span>
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="motion-safe:animate-fade-in flex items-start gap-2 rounded-xl border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger"
        >
          <p className="flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="닫기"
            className="-m-1 rounded-md p-1 hover:bg-danger/10"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>
      )}

      {!day.hasProfile && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sky/30 bg-sky-tint px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-ink">
            목표를 정하면 칼로리와 단백질이 내 몸과 시즌에 맞춰져요.
            <span className="block text-xs text-muted">
              지금은 목표 ‘유지’, 평소 움직임 ‘보통’으로 계산하고 있어요.
            </span>
          </p>
          <button
            type="button"
            onClick={openGoal}
            className="rounded-xl bg-sky px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-strong"
          >
            목표 정하기
          </button>
        </div>
      )}

      <div className="grid items-start gap-block lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="stack-block">
          {/* 던지는 날 가이드 — 오늘이 등판 · 불펜 전날이나 당일, 던진 뒤일 때만(lib/nutrition/guide.ts) */}
          {day.guide && (
            <GuideCard
              guide={day.guide}
              entries={entries}
              carbsEaten={eaten.carbs}
              carbsTarget={t.carbs}
              carbsGap={gaps.carbs > 0}
            />
          )}
          <SummaryCard eaten={eaten} gaps={gaps} day={day} today={today} />

          {/*
            끼니 넷 — 넓으면 두 칸씩(2×2), 좁으면 한 줄에 하나.

            예전에는 한 줄에 하나씩 길게 쌓아, 음식을 둘씩만 적어도 끼니 칸이 667px 로
            화면의 대부분을 먹었다. 줄 사이의 선은 칸 사이 1px 틈에 깔린 바탕색이다
            (gap-px + bg-line) — 칸마다 테두리를 그리면 맞닿는 곳이 두 겹이 된다.
          */}
          <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset] sm:grid-cols-2">
            {MEALS.map((m) => (
              <MealSection
                key={m.key}
                meal={m.key}
                entries={entries.filter((e) => e.meal === m.key)}
                onOpen={(e) =>
                  setSheet({
                    meal: m.key,
                    origin: originOf(e),
                    n: (sheet?.n ?? 0) + 1,
                    open: true,
                  })
                }
                onAmount={changeAmount}
                onRemove={removeEntry}
              />
            ))}
          </ul>
        </div>

        <div className="stack-block">
          <BurnCard day={day} />
          <WeightCard day={day} today={today} onOpenGoal={openGoal} />
          <section className={`${PANEL} space-y-3`}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold text-ink">최근 7일</h2>
              <p className="text-xs text-muted">막대 = 먹은 칼로리 · 선 = 그날 목표</p>
            </div>
            <WeekChart week={day.week} selected={day.date} />
          </section>
        </div>
      </div>

      {sheet && (
        <FoodSheet
          /* 두 창은 형제라 이름이 겹치면 안 된다 — 숫자만 쓰면 둘 다 1 일 때 부딪힌다 */
          key={`food-${sheet.n}`}
          open={sheet.open}
          meal={sheet.meal}
          origin={sheet.origin}
          onClose={() => setSheet((s) => s && { ...s, open: false })}
          recent={day.recent}
          mine={day.mine}
          favorites={day.favorites}
          yesterday={day.yesterday.filter((e) => e.meal === sheet.meal)}
          mfds={day.mfds}
          popular={day.popular}
          onAdd={(items) => addFoods(sheet.meal, items)}
        />
      )}

      {goal && (
        <GoalSheet
          key={`goal-${goal.n}`}
          open={goal.open}
          origin={goal.origin}
          onClose={() => setGoal((g) => g && { ...g, open: false })}
          profile={day.profile}
          body={day.body}
          assumed={t.assumed}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── 날짜 ─────────────────────────── */

/*
 * 날짜를 옮기는 길은 넷이다 — 멀리 갈수록 쓰는 길이 다르다.
 *
 *   하루      제목 옆 화살표 · PC 는 키보드 ← →
 *   이번 주   날짜 띠의 칸을 누른다
 *   몇 주     띠 양끝의 겹화살표, 휴대폰은 띠를 옆으로 민다
 *   먼 날     날짜 제목을 누르면 작은 달력이 뜬다 — 적은 날에 점이 찍혀 있다
 *
 * 예전에는 화살표 하나라, 지난달 것을 보려면 서른 번을 눌러야 했다.
 */

const hrefOf = (d: string, today: string) =>
  d === today ? '/nutrition' : `/nutrition?date=${d}`;
const oldest = (today: string) => shiftDateKey(today, -NUTRITION_BACK_DAYS);

/** PC 에서 ← → 로 하루씩. 글을 적는 중이거나 창이 떠 있으면 가만히 둔다. */
function useArrowKeys(date: string, today: string) {
  const router = useRouter();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
        return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const target = e.target as HTMLElement | null;
      /* 고르개(Segmented)는 화살표로 칸을 옮기므로 거기서 누른 것도 둔다 */
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="tablist"], [role="radiogroup"]'
        )
      )
        return;
      if (document.querySelector('dialog[open], [data-mini-calendar]')) return;
      const next = shiftDateKey(date, e.key === 'ArrowLeft' ? -1 : 1);
      if (next > today || next < oldest(today)) return;
      e.preventDefault();
      router.push(hrefOf(next, today), { scroll: false });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [date, today, router]);
}

function DateNav({
  date,
  today,
  calendar,
}: {
  date: string;
  today: string;
  /** 날짜별로 먹은 칼로리 — 작은 달력이 적은 날에 점을 찍는다 */
  calendar: Record<string, number>;
}) {
  const router = useRouter();
  const prev = shiftDateKey(date, -1);
  const next = shiftDateKey(date, 1);
  const arrow =
    'flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink';

  /*
   * 작은 달력 판.
   *
   * 예전에는 브라우저의 날짜 고르개를 띄웠다(기기마다 모양이 다르고 기록이 안 보였다).
   * 이제 앱의 달력을 제자리에 편다 — 창(dialog)이 아니라 제목 밑에 붙는 작은 판이라,
   * 무엇을 고르던 중인지 가려지지 않는다. 바깥을 누르거나 Esc 면 닫힌다.
   *
   * 닫을 때도 빠르게(0.12초) 옅어진다. 들어올 때보다 짧게 — 나가는 것이 오래 남으면
   * 다음에 누를 것을 가린다.
   */
  const [picker, setPicker] = useState<'closed' | 'open' | 'closing'>('closed');
  const box = useRef<HTMLSpanElement>(null);
  const close = () => setPicker((p) => (p === 'open' ? 'closing' : p));

  useEffect(() => {
    if (picker !== 'open') return;
    const shut = () => setPicker((p) => (p === 'open' ? 'closing' : p));
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) shut();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') shut();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [picker]);

  useEffect(() => {
    if (picker !== 'closing') return;
    const timer = window.setTimeout(() => setPicker('closed'), 120);
    return () => window.clearTimeout(timer);
  }, [picker]);

  return (
    <nav aria-label="날짜" className="flex items-center gap-1">
      {prev >= oldest(today) ? (
        <Link
          href={hrefOf(prev, today)}
          scroll={false}
          aria-label="전날"
          className={arrow}
        >
          <ChevronLeft aria-hidden className="h-5 w-5" />
        </Link>
      ) : (
        <span aria-hidden className={`${arrow} opacity-30`}>
          <ChevronLeft className="h-5 w-5" />
        </span>
      )}
      <span ref={box} className="relative">
        <button
          type="button"
          onClick={() => (picker === 'open' ? close() : setPicker('open'))}
          aria-expanded={picker === 'open'}
          aria-haspopup="dialog"
          aria-label={`${dayTitle(date)} — 다른 날짜 고르기`}
          className={`inline-flex min-w-[7.5rem] items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-ink tabular-nums transition-colors sm:min-w-[8.5rem] ${
            picker === 'open' ? 'bg-surface-2' : 'hover:bg-surface-2'
          }`}
        >
          <CalendarDays
            aria-hidden
            className={`h-4 w-4 transition-colors ${picker === 'open' ? 'text-sky' : 'text-muted'}`}
          />
          {dayTitle(date)}
        </button>
        {picker !== 'closed' && (
          <div
            role="dialog"
            aria-label="날짜 고르기"
            data-mini-calendar
            className={`absolute left-1/2 top-full z-30 mt-2 w-[18.5rem] -translate-x-1/2 origin-top rounded-2xl border border-line bg-surface p-3 shadow-lg ${
              picker === 'closing'
                ? 'pointer-events-none motion-safe:animate-[month-fade-out_120ms_ease-in_both]'
                : 'motion-safe:animate-fade-in'
            }`}
          >
            <MiniCalendar
              value={date}
              today={today}
              min={oldest(today)}
              max={today}
              marked={(d) => (calendar[d] ?? 0) > 0}
              onPick={(d) => {
                close();
                if (d !== date) router.push(hrefOf(d, today), { scroll: false });
              }}
            />
          </div>
        )}
      </span>
      {date < today ? (
        <Link
          href={hrefOf(next, today)}
          scroll={false}
          aria-label="다음날"
          className={arrow}
        >
          <ChevronRight aria-hidden className="h-5 w-5" />
        </Link>
      ) : (
        <span aria-hidden className={`${arrow} opacity-30`}>
          <ChevronRight className="h-5 w-5" />
        </span>
      )}
      {date !== today && (
        <Link
          href="/nutrition"
          scroll={false}
          className="ml-1 rounded-lg px-2 py-1 text-xs font-medium text-sky transition-colors hover:bg-sky-tint"
        >
          오늘로
        </Link>
      )}
    </nav>
  );
}

const WEEKDAY_SHORT = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 날짜 띠 — 고른 날이 든 한 주(일~토).
 *
 * 칸마다 그날 먹은 양이 목표의 얼마인지 가는 막대로 보여 준다. 어느 날을 비웠는지가
 * 한눈에 보여, 빠뜨린 날로 곧장 간다. 휴대폰은 띠를 옆으로 밀면 한 주씩 넘어간다.
 */
function WeekStrip({
  strip,
  date,
  today,
  className = '',
}: {
  strip: DaySummary[];
  date: string;
  today: string;
  /** 놓일 자리(머리 줄 안에서의 순서 · 폭) */
  className?: string;
}) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const back = shiftDateKey(date, -7);
  const prevWeek = back >= oldest(today) ? back : null;
  /* 다음 주가 아직 안 왔으면 오늘로 — 오늘이 이 띠에 없을 때만 */
  const ahead = shiftDateKey(date, 7);
  const nextWeek =
    ahead <= today ? ahead : strip.some((d) => d.date === today) ? null : today;

  const go = (d: string | null) => {
    if (d) router.push(hrefOf(d, today), { scroll: false });
  };
  const edge =
    'flex w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink';

  return (
    <div
      className={`flex touch-pan-y items-stretch gap-1 ${className}`}
      onPointerDown={(e) => {
        swiped.current = false;
        start.current =
          e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        if (Math.abs(dx) > 50 && Math.abs(e.clientY - s.y) < 40) {
          swiped.current = true;
          go(dx > 0 ? prevWeek : nextWeek);
        }
      }}
      /* 밀었을 때는 손가락이 떨어진 칸이 눌린 것으로 치지 않는다 */
      onClickCapture={(e) => {
        if (swiped.current) {
          e.preventDefault();
          e.stopPropagation();
          swiped.current = false;
        }
      }}
    >
      {prevWeek ? (
        <Link
          href={hrefOf(prevWeek, today)}
          scroll={false}
          aria-label="한 주 전"
          className={edge}
        >
          <ChevronsLeft aria-hidden className="h-4 w-4" />
        </Link>
      ) : (
        <span aria-hidden className={`${edge} opacity-30`}>
          <ChevronsLeft className="h-4 w-4" />
        </span>
      )}

      <ol className="grid flex-1 grid-cols-7 gap-1">
        {strip.map((d) => {
          const future = d.date > today;
          const selected = d.date === date;
          const isToday = d.date === today;
          const pct = d.target > 0 ? Math.min(100, (d.kcal / d.target) * 100) : 0;
          const over = d.kcal > d.target;
          const dayNo = Number(d.date.slice(8));
          const weekday =
            WEEKDAY_SHORT[new Date(`${d.date}T00:00:00.000Z`).getUTCDay()];
          const face = (
            <>
              <span
                className={`text-[11px] ${selected ? 'text-white/80' : 'text-muted'}`}
              >
                {weekday}
              </span>
              <span
                className={`text-sm font-semibold tabular-nums ${
                  selected ? 'text-white' : isToday ? 'text-sky' : 'text-ink'
                }`}
              >
                {dayNo}
              </span>
              <span
                aria-hidden
                className={`mt-1 h-1 w-6 overflow-hidden rounded-full ${
                  selected ? 'bg-white/30' : 'bg-line'
                }`}
              >
                <span
                  className={`block h-full rounded-full transition-[width] duration-500 ${EASE} ${
                    selected ? 'bg-white' : over ? 'bg-warn' : 'bg-sky'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </span>
            </>
          );
          const cell =
            'flex flex-col items-center rounded-xl py-1.5 transition-[background-color,transform] duration-200 motion-safe:active:scale-95';
          return (
            <li key={d.date}>
              {future ? (
                <span aria-disabled className={`${cell} opacity-35`}>
                  {face}
                </span>
              ) : (
                <Link
                  href={hrefOf(d.date, today)}
                  scroll={false}
                  aria-current={selected ? 'date' : undefined}
                  aria-label={`${dayTitle(d.date)} — ${
                    d.kcal > 0 ? `${kcalText(d.kcal)}kcal 먹음` : '기록 없음'
                  }`}
                  className={`${cell} ${
                    selected
                      ? 'bg-sky shadow-sm'
                      : isToday
                        ? 'ring-1 ring-sky/40 hover:bg-surface-2'
                        : 'hover:bg-surface-2'
                  }`}
                >
                  {face}
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      {nextWeek ? (
        <Link
          href={hrefOf(nextWeek, today)}
          scroll={false}
          aria-label={nextWeek === today ? '오늘로' : '한 주 뒤'}
          className={edge}
        >
          <ChevronsRight aria-hidden className="h-4 w-4" />
        </Link>
      ) : (
        <span aria-hidden className={`${edge} opacity-30`}>
          <ChevronsRight className="h-4 w-4" />
        </span>
      )}
    </div>
  );
}

/* ─────────────────────────── 던지는 날 가이드 ─────────────────────────── */

/**
 * 던지는 날 가이드 한 장 — 무엇을 언제 먹으면 좋은지.
 *
 * 글은 서버가 만든다(lib/nutrition/guide.ts — 체크인의 던지는 일정 · 식욕, 오늘의 투구 기록). 여기서는
 * 먹은 기록과 견준 줄만 셈한다: 음식을 담으면 바로 따라 움직이게(담는 즉시 바뀌는 entries 를 읽는다).
 *
 *   전날 · 던지는 날  오늘 탄수화물을 목표에 견줘 얼마나 채웠나
 *   던진 뒤          던진 뒤에 담은 음식의 단백질 — 회복식을 챙겼나
 *
 * 못 채웠다고 나무라지 않는다 — 채운 것만 말한다.
 *
 * 처음에는 가장 중요한 한 줄과 견준 줄(그리고 그 사람에게만 뜨는 덧말)만 보인다. 나머지(곁들일 말 · 참고 안내)는 '더 보기'로 편다 —
 * 다 펼쳐 두면 휴대폰에서 이 카드가 화면 절반을 먹어 정작 끼니 칸이 밀린다.
 */
function GuideCard({
  guide,
  entries,
  carbsEaten,
  carbsTarget,
  carbsGap,
}: {
  guide: ThrowGuide;
  entries: MealEntryView[];
  carbsEaten: number;
  carbsTarget: number;
  /** 탄수화물 정보가 없는 음식이 있다 — 아래 요약 카드처럼 '+' 를 붙인다 */
  carbsGap: boolean;
}) {
  const [open, setOpen] = useState(false);
  const recovery = recoveryEaten(entries, guide);
  const [first, ...rest] = guide.lines;
  /* 막대는 목표까지만 찬다 — 넘겨 먹은 것은 숫자로만 */
  const share = (got: number, goal: number) =>
    `${Math.min(100, goal > 0 ? (Math.max(0, got) / goal) * 100 : 0)}%`;

  return (
    <section
      aria-labelledby="throw-guide-title"
      className={`${PANEL} motion-safe:animate-fade-in space-y-3 break-keep`}
    >
      <div className="flex items-start gap-2">
        {/* 이름표와 제목은 좁으면 두 줄로 접히고, 펴기 단추는 늘 오른쪽 위에 있다 */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="rounded-full border border-sky/30 bg-sky-tint px-2.5 py-0.5 text-xs font-semibold text-ink">
            {guide.badge}
          </span>
          <h2 id="throw-guide-title" className="text-[15px] font-bold text-ink">
            {guide.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="throw-guide-more"
          aria-label={open ? '안내 접기' : '안내 더 보기'}
          className="-my-2 -mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 transition-transform duration-200 ${EASE} ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      <p className="text-sm leading-relaxed text-ink">{first}</p>

      {guide.kind === 'after' ? (
        recovery && (
          <div className="motion-safe:animate-fade-in space-y-1.5">
            <p
              className={`flex items-center gap-1.5 text-sm tabular-nums transition-colors ${
                recovery.done ? 'font-semibold text-ok' : 'text-muted'
              }`}
            >
              {/* 챙긴 뒤의 글은 짧게 — 길면 휴대폰에서 두 줄로 접혀 체크가 줄 사이에 뜬다 */}
              {recovery.done ? (
                <>
                  <Check aria-hidden className="h-4 w-4 shrink-0" />
                  회복식을 챙겼어요 · 단백질 {recovery.protein}g
                </>
              ) : (
                <>
                  던진 뒤 담은 음식의 단백질 {recovery.protein}g
                  {guide.recoveryProtein != null && <> / {guide.recoveryProtein}g</>}
                </>
              )}
            </p>
            {guide.recoveryProtein != null && (
              <div
                aria-hidden
                className="h-1.5 overflow-hidden rounded-full bg-surface-2"
              >
                <div
                  className={`h-full rounded-full bg-cat-recovery transition-[width] duration-500 ${EASE}`}
                  style={{ width: share(recovery.protein, guide.recoveryProtein) }}
                />
              </div>
            )}
          </div>
        )
      ) : (
        <div className="space-y-1.5">
          <p className="flex items-baseline justify-between gap-2 text-xs text-muted">
            <span>오늘 탄수화물</span>
            <span className="tabular-nums">
              <b className="text-sm font-semibold text-ink">{Math.round(carbsEaten)}</b>
              {carbsGap && <b className="font-semibold text-warn">+</b>} / {carbsTarget}
              g
            </span>
          </p>
          <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className={`h-full rounded-full bg-cat-power transition-[width] duration-500 ${EASE}`}
              style={{ width: share(carbsEaten, carbsTarget) }}
            />
          </div>
        </div>
      )}

      {/*
        덧말(입맛이 없는 날 · 감량 중 · 성장기)은 접지 않는다 — 그 사람에게만 뜨는 말이고, 체크인의
        '식욕'은 이 한 줄을 띄우려고 받는 칸이다. 없는 날이 대부분이라 카드는 평소 그대로 작다.
      */}
      {guide.notes.length > 0 && (
        <div className="space-y-1">
          {guide.notes.map((note) => (
            <p key={note} className="text-xs leading-relaxed text-muted">
              {note}
            </p>
          ))}
        </div>
      )}

      {/* 더 보기 — 높이가 부드럽게 열리고 닫힌다(끼니 줄의 양 고치기와 같은 방식) */}
      <div
        id="throw-guide-more"
        className={`-mt-3 grid transition-[grid-template-rows] duration-200 ${EASE} ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0 overflow-hidden" inert={!open}>
          <div className="space-y-2 pt-3">
            {rest.map((line) => (
              <p key={line} className="text-sm leading-relaxed text-muted">
                {line}
              </p>
            ))}
            {guide.hint && (
              <p className="text-xs leading-relaxed text-muted">{guide.hint}</p>
            )}
            <p className="text-[11px] leading-relaxed text-muted">{GUIDE_DISCLAIMER}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── 오늘 한눈에 ─────────────────────────── */

const MACROS = [
  { key: 'carbs', label: '탄수화물', bar: 'bg-cat-power' },
  { key: 'protein', label: '단백질', bar: 'bg-cat-lower' },
  { key: 'fat', label: '지방', bar: 'bg-cat-mobility' },
] as const;

function SummaryCard({
  eaten,
  gaps,
  day,
  today,
}: {
  eaten: Macros;
  gaps: MacroGaps;
  day: NutritionDay;
  today: string;
}) {
  const t = day.targets;
  /*
   * 체중 카드의 권유를 여기서 한 줄로 알린다 — 휴대폰에서 체중 카드는 끼니 넷 아래라 안 보인다.
   * 단추는 체중 카드에만 있다(까닭을 읽고 누르게). 던지는 날 가이드가 뜬 날은 알림을 겹치지 않는다.
   */
  const snoozed = useSuggestionSnoozed(day, today);
  const nudge = day.plan.suggestion !== null && !day.guide && !snoozed;
  const left = t.kcal - eaten.kcal;
  const max = Math.max(t.kcal, eaten.kcal, 1);
  const pct = (n: number) => `${Math.min(100, (Math.max(0, n) / max) * 100)}%`;
  const over = left < 0;

  /*
   * 남은 양 · 게이지 · 탄단지를 촘촘히 쌓는다(예전 218px → 줄여서).
   *
   * '먹은 것 · 목표' 줄은 큰 숫자와 같은 줄 오른쪽으로 올렸다 — 게이지 밑에 따로 한 줄을
   * 차지하던 것이다. 좁으면 숫자 밑으로 내려간다(flex-wrap).
   */
  return (
    <section className={`${PANEL} space-y-3`}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <p className="text-xs text-muted">
            {over ? '목표보다' : '오늘 더 먹을 수 있는 양'}
          </p>
          <p
            className={`text-[1.75rem] font-bold leading-tight tabular-nums transition-colors ${
              over ? 'text-warn' : 'text-ink'
            }`}
          >
            {kcalText(Math.abs(left))}
            <span className="ml-1 text-sm font-semibold">
              kcal{over ? ' 더 먹었어요' : ''}
            </span>
          </p>
        </div>
        <p className="flex flex-wrap gap-x-3 gap-y-1 pb-1 text-xs text-muted tabular-nums">
          <span>
            먹은 것 <b className="font-semibold text-ink">{kcalText(eaten.kcal)}</b>
          </span>
          <span>
            목표 <b className="font-semibold text-ink">{kcalText(t.kcal)}</b>
            {/* 체중 흐름을 보고 받아들인 조정이 얹혀 있으면 말한다 — 숫자가 왜 계산과 다른지 */}
            {t.adjust !== 0 && (
              <>
                {' '}
                (체중 조정 {t.adjust > 0 ? '+' : '−'}
                {kcalText(Math.abs(t.adjust))} 포함)
              </>
            )}
            {t.burn > 0 && (
              <>
                {' '}
                = 기본 {kcalText(t.base)} +{' '}
                <span className="text-cat-recovery">운동 {kcalText(t.burn)}</span>
              </>
            )}
          </span>
        </p>
      </div>

      <div
        role="img"
        aria-label={`목표 ${kcalText(t.kcal)}kcal 가운데 ${kcalText(eaten.kcal)}kcal 먹음`}
        className="relative h-3 overflow-hidden rounded-full bg-surface-2"
      >
        {/* 운동으로 늘어난 몫 — 옅은 초록으로 깔아 둔다 */}
        {t.burn > 0 && (
          <div
            className={`absolute inset-y-0 bg-cat-recovery/25 transition-[left,width] duration-500 ${EASE}`}
            style={{
              left: pct(t.base),
              width: `calc(${pct(t.kcal)} - ${pct(t.base)})`,
            }}
          />
        )}
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ${EASE} ${
            over ? 'bg-warn' : 'bg-sky'
          }`}
          style={{ width: pct(eaten.kcal) }}
        />
        {over && (
          <div
            aria-hidden
            className="absolute inset-y-0 w-0.5 bg-surface"
            style={{ left: pct(t.kcal) }}
          />
        )}
      </div>

      {/*
        탄단지는 휴대폰에서도 세 칸 나란히 — 이름 밑에 숫자를 둔다. 예전에는 좁으면 한 줄에
        하나씩 세 줄로 쌓였다. 넓으면 이름과 숫자가 한 줄이다.
      */}
      <dl className="grid grid-cols-3 gap-3 sm:gap-4">
        {MACROS.map((m) => {
          const got = eaten[m.key];
          const goal = t[m.key];
          return (
            <div key={m.key} className="space-y-1.5">
              <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
                <dt className="text-xs text-muted">{m.label}</dt>
                <dd className="text-xs tabular-nums text-muted">
                  <b className="text-sm font-semibold text-ink">{Math.round(got)}</b>
                  {/* 정보가 빠진 음식이 있으면 '+' — 적어도 이만큼, 실제로는 더 먹었다 */}
                  {gaps[m.key] > 0 && (
                    <b
                      className="font-semibold text-warn"
                      title="정보가 없는 음식이 있어 실제로는 더 먹었어요"
                    >
                      +
                    </b>
                  )}{' '}
                  / {goal}g
                </dd>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full rounded-full ${m.bar} transition-[width] duration-500 ${EASE}`}
                  style={{
                    width: `${Math.min(100, goal > 0 ? (got / goal) * 100 : 0)}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </dl>

      {gaps.foods > 0 && (
        <p className="motion-safe:animate-fade-in text-xs text-muted">
          {gapNames(gaps)} 정보가 없는 음식이 {gaps.foods}개라,{' '}
          <b className="font-semibold text-warn">+</b> 표시한 양은 실제보다 적게
          잡혔어요.
        </p>
      )}

      {nudge && (
        <p className="motion-safe:animate-fade-in flex flex-wrap items-center gap-x-2 text-xs text-muted">
          체중 흐름을 보고 목표를 조금 바꿔 볼까요?
          <a
            href="#weight-card"
            onClick={(e) => {
              const card = document.getElementById('weight-card');
              if (!card) return;
              e.preventDefault();
              card.scrollIntoView({
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                  ? 'auto'
                  : 'smooth',
                block: 'center',
              });
            }}
            className="-my-2 inline-flex min-h-10 items-center rounded-md px-1 font-semibold text-sky-strong underline-offset-2 hover:underline"
          >
            보기
          </a>
        </p>
      )}

      {/*
        비어서 짐작으로 셈한 것 — 성별도 이제 알린다. 성별은 예전에 목표 창에서
        골랐지만 지금은 내 정보에 있어서, 여기서 말하지 않으면 모르고 지나간다.
      */}
      {day.hasProfile && t.assumed.length > 0 && (
        <p className="text-xs text-muted">
          내 정보에 {withObjectParticle(assumedText(t.assumed))} 넣으면 목표가 더
          정확해져요.
        </p>
      )}
    </section>
  );
}

function assumedText(assumed: NutritionDay['targets']['assumed']) {
  const names = {
    weight: '몸무게',
    height: '키',
    age: '생년월일',
    sex: '성별',
  } as const;
  return assumed.map((a) => names[a]).join('·');
}

/** '성별을' · '키를' — 마지막 글자에 받침이 있으면 '을', 없으면 '를' */
function withObjectParticle(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
  return `${word}${hasFinal ? '을' : '를'}`;
}

/* ─────────────────────────── 끼니 ─────────────────────────── */

function MealSection({
  meal,
  entries,
  onOpen,
  onAmount,
  onRemove,
}: {
  meal: MealKey;
  entries: MealEntryView[];
  onOpen: (e: MouseEvent<HTMLButtonElement>) => void;
  onAmount: (id: string, amount: number) => void;
  onRemove: (id: string) => void;
}) {
  const total = sumMacros(entries.map(entryMacros));
  const proteinGap = entries.some((e) => e.protein === null);
  const label = mealLabel(meal);

  /*
   * 끼니 한 칸. 머리 줄(이름 · 합계 · 담기) 밑에 음식이 한 줄씩.
   *
   * 칸이 두 개씩 나란해서 한 줄의 높이는 옆 칸과 같아진다. 비어 있는 끼니의 '기록하기'는
   * 남는 높이를 채워(flex-1) 옆 칸이 길어도 빈 자리가 생기지 않고, 누르는 자리가 넓어진다.
   * 누르는 것들은 줄여도 40px 밑으로 내리지 않는다 — 손가락으로 누르는 화면이다.
   */
  return (
    <li className="flex flex-col gap-1.5 bg-surface px-4 py-3 sm:px-5">
      <div className="flex min-h-9 items-center gap-2">
        <h2 className="shrink-0 text-[15px] font-bold text-ink">{label}</h2>
        {entries.length > 0 && (
          <p className="min-w-0 truncate text-xs tabular-nums text-muted">
            {kcalText(total.kcal)}kcal · 단백질 {Math.round(total.protein)}g
            {proteinGap ? '+' : ''}
          </p>
        )}
        {entries.length > 0 && (
          <button
            type="button"
            onClick={onOpen}
            className="-mr-2 ml-auto inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-sky transition-colors hover:bg-sky-tint"
          >
            <Plus aria-hidden className="h-4 w-4" />
            담기
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex min-h-10 w-full flex-1 items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong text-sm font-medium text-muted transition-[color,border-color,background-color,transform] duration-150 hover:border-sky hover:bg-sky-tint/50 hover:text-sky motion-safe:active:scale-[0.99]"
        >
          <Plus aria-hidden className="h-4 w-4" />
          {label} 기록하기
        </button>
      ) : (
        <ul>
          {entries.map((e, i) => (
            <EntryRow
              key={e.id}
              entry={e}
              index={i}
              onAmount={(a) => onAmount(e.id, a)}
              onRemove={() => onRemove(e.id)}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

const QUICK_AMOUNTS = [0.5, 1, 1.5, 2];

/* − 는 0.25 밑의 양(그램으로 적은 0.1인분 등)을 늘리지 않는다 — 예전에는 0.1 에서 − 를 누르면 0.25 로 커졌다 */
function step(amount: number, dir: 1 | -1) {
  const size = amount < 1 || (amount === 1 && dir === -1) ? 0.25 : 0.5;
  const next = Math.round((amount + dir * size) / size) * size;
  const floor = dir === -1 ? Math.min(amount, 0.25) : 0.25;
  return Math.min(AMOUNT_MAX, Math.max(floor, next));
}

function EntryRow({
  entry,
  index,
  onAmount,
  onRemove,
}: {
  entry: MealEntryView;
  index: number;
  onAmount: (amount: number) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(entry.amount);
  const kcal = entry.kcal * entry.amount;
  const missing = missingMacros(entry);
  const saving = entry.id.startsWith('tmp-');

  function toggle() {
    setDraft(entry.amount);
    setOpen((o) => !o);
  }

  return (
    <li
      className="motion-safe:animate-row-in rounded-xl transition-colors"
      style={{ '--row': index } as CSSProperties}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        aria-expanded={open}
        className="-mx-2 flex min-h-10 w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
      >
        {/*
          이름과 양을 한 줄에 — 예전에는 양을 밑줄로 따로 적어 음식 하나가 52px 였다.
          칸이 좁으면 뒤쪽(양)부터 말줄임표로 잘린다.
        */}
        <span className="min-w-0 flex-1 truncate text-sm text-ink">
          {entry.name}
          <span className="ml-1.5 text-xs text-muted">
            {amountText(entry.amount)}
            {/* 빠진 영양소는 양 바로 뒤에 — 줄이 좁으면 뒤쪽부터 잘려서, 끝에 두면 안 보인다 */}
            {missing.length > 0 ? ` · ${missingText(missing)}` : ''}
            {entry.servingLabel ? ` · ${entry.servingLabel}` : ''}
          </span>
        </span>
        <span
          className={`shrink-0 text-sm tabular-nums transition-opacity ${
            saving ? 'text-muted opacity-60' : 'text-ink'
          }`}
        >
          {kcalText(kcal)}
          <span className="ml-0.5 text-xs text-muted">kcal</span>
        </span>
      </button>

      {/* 누르면 펼쳐지는 양 고치기 — 높이가 부드럽게 열리고 닫힌다 */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ${EASE} ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0 overflow-hidden" inert={!open}>
          <div className="flex flex-wrap items-center gap-2 pb-2 pt-1">
            <div className="flex items-center rounded-xl border border-line bg-surface-2">
              <button
                type="button"
                onClick={() => setDraft((d) => step(d, -1))}
                aria-label="줄이기"
                className="flex h-9 w-9 items-center justify-center rounded-l-xl text-muted transition-colors hover:text-ink"
              >
                <Minus aria-hidden className="h-4 w-4" />
              </button>
              <span className="min-w-[4.5rem] text-center text-sm font-semibold tabular-nums text-ink">
                {amountText(draft)}
              </span>
              <button
                type="button"
                onClick={() => setDraft((d) => step(d, 1))}
                aria-label="늘리기"
                className="flex h-9 w-9 items-center justify-center rounded-r-xl text-muted transition-colors hover:text-ink"
              >
                <Plus aria-hidden className="h-4 w-4" />
              </button>
            </div>
            {QUICK_AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setDraft(a)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  draft === a ? 'bg-sky-tint text-sky' : 'text-muted hover:bg-surface-2'
                }`}
              >
                {amountText(a)}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onRemove();
                }}
                aria-label={`${entry.name} 지우기`}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-bg hover:text-danger"
              >
                <Trash2 aria-hidden className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={draft === entry.amount}
                onClick={() => {
                  setOpen(false);
                  onAmount(draft);
                }}
                className="rounded-lg bg-sky px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-strong disabled:opacity-40"
              >
                {draft === entry.amount
                  ? '그대로'
                  : `${kcalText(entry.kcal * draft)}kcal로 고치기`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

/* ─────────────────────────── 운동으로 쓴 것 ─────────────────────────── */

function BurnCard({ day }: { day: NutritionDay }) {
  const items = day.burnItems;
  return (
    <section className={`${PANEL} space-y-3`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">운동으로 쓴 칼로리</h2>
        <p className="text-xs text-muted">기록에서 대략 셈</p>
      </div>
      {items.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted">
          이날 트레이닝·투구 기록이 없어요. 기록하면 먹을 양이 그만큼 늘어요.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((b, i) => (
            <li
              key={i}
              className="motion-safe:animate-row-in flex items-baseline justify-between gap-3 text-sm"
              style={{ '--row': i } as CSSProperties}
            >
              <span className="text-ink">{b.label}</span>
              <span className="tabular-nums text-cat-recovery">
                +{kcalText(b.kcal)}kcal
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ─────────────────────────── 체중 ─────────────────────────── */

/*
 * '그대로 둘게요' — 권유를 접어 둔다. 이 기기에만 남긴다(단위 · 테마와 같은 까닭: DB 칸을 늘릴 일이 아니다).
 * 다른 기기에서는 다시 보인다. 같은 권유(같은 다음 조정값)를 14일 동안 접고, 그 뒤에는 다시 묻는다.
 *
 * useSyncExternalStore 로 읽는다 — 서버가 그릴 때는 '안 접음'이고 화면에 붙은 뒤 진짜 값으로 바꿔 그린다
 * (components/use-units.ts 와 같은 방식).
 */
const SNOOZE_KEY = 'bullpen-weight-suggest-snooze';
const SNOOZE_DAYS = 14;
const snoozeListeners = new Set<() => void>();

function subscribeSnooze(onChange: () => void) {
  snoozeListeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    snoozeListeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function readSnooze() {
  try {
    return window.localStorage.getItem(SNOOZE_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeSnooze(value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(SNOOZE_KEY);
    else window.localStorage.setItem(SNOOZE_KEY, value);
  } catch {
    /* 저장소를 못 쓰는 브라우저(사생활 보호 창) — 접히지 않을 뿐이다 */
  }
  snoozeListeners.forEach((notify) => notify());
}

/** 오늘의 권유를 접어 두었나 */
function useSuggestionSnoozed(day: NutritionDay, today: string) {
  const stored = useSyncExternalStore(subscribeSnooze, readSnooze, () => '');
  const suggestion = day.plan.suggestion;
  if (!suggestion || !stored) return false;
  const [since, next] = stored.split(':');
  const days = Math.round(
    (Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${since}T00:00:00.000Z`)) /
      86_400_000
  );
  return Number(next) === suggestion.nextAdjust && days >= 0 && days < SNOOZE_DAYS;
}

const STEP_LABEL = {
  raise: `하루 +${STEP_KCAL}kcal 올리기`,
  lower: `하루 −${STEP_KCAL}kcal 내리기`,
  maintain: '유지로 바꾸기',
} as const;

function WeightCard({
  day,
  today,
  onOpenGoal,
}: {
  day: NutritionDay;
  today: string;
  onOpenGoal: (e: MouseEvent<HTMLElement>) => void;
}) {
  const unit = useWeightUnit();
  const saved = day.weightKg;
  const shown = (kg: number | null) =>
    kg === null ? '' : String(Math.round(toWeight(kg, unit) * 10) / 10);
  /*
   * 적는 칸의 글자. 저장된 값이 바뀌면(다른 날로 옮기거나 저장이 끝나면) 그 값으로
   * 다시 맞춘다 — 그리는 동안 맞추는 방식(이펙트 없이).
   */
  const [text, setText] = useState(shown(saved));
  const [base, setBase] = useState({ saved, unit });
  if (base.saved !== saved || base.unit !== unit) {
    setBase({ saved, unit });
    setText(shown(saved));
  }
  const [pending, startTransition] = useTransition();
  const [stepping, startStep] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const parsed = text.trim() === '' ? null : Number(text);
  const valid = parsed === null || (Number.isFinite(parsed) && parsed > 0);
  const nextKg = parsed === null ? null : fromWeight(parsed, unit);
  const changed = valid && shown(nextKg) !== shown(saved);

  function save() {
    if (!changed) return;
    setError(null);
    startTransition(async () => {
      const res = await orOffline(setWeight(day.date, nextKg), OFFLINE);
      if (!res.ok) setError(res.error);
    });
  }

  /* ── 체중 목표: 흐름과 계획을 견준 글(lib/nutrition/weight-goal.ts) ── */
  const t = day.targets;
  const plan = day.plan;
  const copy = goalCopy(plan, {
    goal: t.goal,
    band: t.ageBand,
    ageKnown: day.body.age !== null,
    hasProfile: day.hasProfile,
    unit,
    isToday: day.date === today,
  });
  const snoozed = useSuggestionSnoozed(day, today);

  /* '유지로 바꾸기'를 누르면 하루 목표가 얼마가 되나 — 목표 창과 같은 규칙으로 미리 셈한다 */
  const keepProfile = {
    goal: 'maintain' as const,
    activity: day.profile.activity,
    weeklyRateKg: null,
    kcalTarget: day.profile.kcalTarget,
  };
  const keepBase =
    copy.action === 'maintain'
      ? computeTargets(
          {
            ...day.profile,
            ...keepProfile,
            targetWeightKg: null,
            kcalAdjust: planOnSave(day.profile, keepProfile, day.body.age).kcalAdjust,
          },
          day.body,
          0
        ).base
      : t.base;

  function act() {
    const action = copy.action;
    if (!action) return;
    setError(null);
    startStep(async () => {
      const res =
        action === 'maintain'
          ? await orOffline(
              saveNutritionProfile({
                ...keepProfile,
                proteinPerKg: t.proteinPerKg,
                targetWeightKg: null,
              }),
              OFFLINE
            )
          : await orOffline(
              applyWeightStep(action === 'raise' ? STEP_KCAL : -STEP_KCAL),
              OFFLINE
            );
      if (!res.ok) setError(res.error);
    });
  }

  const hasStatus = copy.label !== null || copy.sentence !== null;

  return (
    <section id="weight-card" className={`${PANEL} scroll-mt-20 space-y-3`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">체중</h2>
        {day.weightFrom === 'checkin' && (
          <p className="text-xs text-muted">체크인에 적은 값</p>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex items-center gap-2"
      >
        <label className="relative flex-1">
          <span className="sr-only">체중({unit})</span>
          <input
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder={
              day.targets.weightKg ? shown(day.targets.weightKg) : '예) 78.5'
            }
            className="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 pr-12 text-sm tabular-nums text-ink placeholder:text-muted/60 transition-colors focus:border-sky focus:outline-none"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted">
            {unit}
          </span>
        </label>
        <button
          type="submit"
          disabled={!changed || pending}
          className="rounded-xl bg-sky px-4 py-2.5 text-sm font-semibold text-white transition-[background-color,opacity] hover:bg-sky-strong disabled:opacity-40"
        >
          {pending ? '저장 중…' : '저장'}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      {/*
        흐름과 계획 — 숫자 하나 · 문장 하나 · 단추 하나. 숫자에 색을 입히지 않는다(체중은 성적이 아니다).
        상태가 바뀌면(저장 · 단추) 통째로 다시 떠오른다.
      */}
      {hasStatus && (
        <div
          key={`${plan.status}-${plan.hold}-${copy.action}`}
          className="motion-safe:animate-fade-in space-y-1.5 break-keep"
        >
          {copy.label && <p className="text-xs text-muted">{copy.label}</p>}
          {copy.number && (
            <p className="text-[1.75rem] font-bold leading-tight tabular-nums text-ink">
              {copy.number}
            </p>
          )}
          {copy.sub && <p className="text-xs text-muted tabular-nums">{copy.sub}</p>}
          {copy.sentence && (
            <p className="pt-0.5 text-sm leading-relaxed text-ink">{copy.sentence}</p>
          )}
          {copy.note && (
            <p className="text-xs leading-relaxed text-muted">{copy.note}</p>
          )}

          {copy.action &&
            (snoozed ? (
              <p
                key="snoozed"
                className="motion-safe:animate-fade-in flex flex-wrap items-center gap-x-2 text-xs text-muted"
              >
                그대로 두기로 했어요.
                <button
                  type="button"
                  onClick={() => writeSnooze(null)}
                  className="-my-2 min-h-10 rounded-md px-1 font-semibold text-sky-strong underline-offset-2 hover:underline"
                >
                  다시 보기
                </button>
              </p>
            ) : (
              <div
                key="actions"
                className="motion-safe:animate-fade-in space-y-1.5 pt-1.5"
              >
                <button
                  type="button"
                  onClick={act}
                  disabled={stepping}
                  className="min-h-11 w-full rounded-xl bg-sky px-4 py-2.5 text-sm font-semibold text-white transition-[background-color,opacity] hover:bg-sky-strong disabled:opacity-60"
                >
                  {stepping ? '바꾸는 중…' : STEP_LABEL[copy.action]}
                </button>
                {copy.action === 'maintain' && keepBase !== t.base && (
                  <p className="text-center text-xs text-muted tabular-nums">
                    하루 목표가 {kcalText(t.base)} → {kcalText(keepBase)}kcal로 바뀌어요
                  </p>
                )}
                {copy.actionNote && (
                  <p className="text-center text-xs text-muted">{copy.actionNote}</p>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    if (copy.action === 'maintain') onOpenGoal(e);
                    else if (plan.suggestion) {
                      writeSnooze(`${today}:${plan.suggestion.nextAdjust}`);
                    }
                  }}
                  disabled={stepping}
                  className="min-h-10 w-full rounded-xl text-sm font-medium text-muted transition-colors hover:text-ink disabled:opacity-60"
                >
                  {copy.action === 'maintain' ? '새 목표 정하기' : '그대로 둘게요'}
                </button>
              </div>
            ))}
        </div>
      )}
      {copy.minor && (
        <p className="motion-safe:animate-fade-in break-keep text-xs leading-relaxed text-muted">
          {copy.minor}
        </p>
      )}

      <WeightTrend
        weights={day.weights}
        unit={unit}
        trend={plan.trend}
        targetKg={plan.targetKg}
      />
      {hasStatus && (
        <p className="break-keep text-[11px] leading-relaxed text-muted">{copy.foot}</p>
      )}
    </section>
  );
}
