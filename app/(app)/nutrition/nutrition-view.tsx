'use client';

import Link from 'next/link';
import {
  useOptimistic,
  useState,
  useTransition,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Droplet,
  Minus,
  Plus,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui';
import { useWeightUnit } from '@/components/use-units';
import { fromWeight, toWeight } from '@/lib/units';
import { shiftDateKey } from '@/lib/pitch-stats';
import {
  AMOUNT_MAX,
  MEALS,
  WATER_CUP_ML,
  WATER_MAX_ML,
  amountText,
  entryMacros,
  kcalText,
  mealLabel,
  sumMacros,
  type Food,
  type Macros,
  type MealEntryView,
  type MealKey,
} from '@/lib/nutrition/meta';
import type { NutritionDay } from '@/lib/nutrition/load';
import {
  addMealEntries,
  deleteMealEntry,
  setWater,
  setWeight,
  updateMealAmount,
  type NutritionResult,
} from '@/app/actions/nutrition';
import { FoodSheet } from './food-sheet';
import { GoalSheet } from './goal-sheet';
import { WeekChart, WeightTrend } from './charts';
import { EASE, originOf, toFoodInput, type Origin } from './shared';

/**
 * 영양 탭 — 하루치 화면.
 *
 * 인아웃의 흐름을 따른다. 맨 위에 오늘 목표와 먹은 것을 게이지 하나로 보여 주고,
 * 그 밑에 끼니 넷을 둔다. 끼니를 누르면 음식 찾는 창이 뜬다 — 인아웃을 써 본
 * 사람들이 가장 좋다고 꼽은 것이 '끼니별 큰 버튼 넷, 깊이 들어가지 않는 기록'이었다.
 *
 * 누르면 바로 바뀐다. 음식을 담거나 물 한 잔을 채우면 화면을 먼저 바꾸고 저장은
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

/** '9월 25일 (목)' */
export function dayTitle(date: string) {
  const d = new Date(`${date}T00:00:00.000Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}

export function NutritionView({ day, today }: { day: NutritionDay; today: string }) {
  const [, startTransition] = useTransition();
  const [entries, applyEntries] = useOptimistic(day.entries, reduceEntries);
  const [water, applyWater] = useOptimistic(
    day.waterMl,
    (_: number, next: number) => next
  );
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
        const res = await addMealEntries(
          day.date,
          meal,
          items.map(({ food, amount }) => ({ food: toFoodInput(food), amount }))
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
      report(await updateMealAmount(id, amount));
    });
  }

  function removeEntry(id: string) {
    setError(null);
    startTransition(async () => {
      applyEntries({ type: 'delete', id });
      report(await deleteMealEntry(id));
    });
  }

  function changeWater(ml: number) {
    const next = Math.min(WATER_MAX_ML, Math.max(0, ml));
    setError(null);
    startTransition(async () => {
      applyWater(next);
      report(await setWater(day.date, next));
    });
  }

  return (
    <div className="space-y-5">
      {/* 휴대폰에서도 한 줄에 들어가게 — 목표 단추는 좁으면 그림만 남긴다 */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-4">
        <h1 className="text-heading text-2xl text-ink">영양</h1>
        <DateNav date={day.date} today={today} />
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

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <SummaryCard eaten={eaten} day={day} />

          {/* 끼니 넷은 한 상자 안에 줄로 — 상자의 안쪽 여백은 줄마다 준다 */}
          <div className="rounded-2xl border border-line bg-surface shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">
            <ul className="divide-y divide-line">
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
        </div>

        <div className="space-y-5">
          <BurnCard day={day} />
          <WaterCard water={water} goal={t.waterMl} onChange={changeWater} />
          <WeightCard day={day} />
          <Card className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold text-ink">최근 7일</h2>
              <p className="text-xs text-muted">막대 = 먹은 칼로리 · 선 = 그날 목표</p>
            </div>
            <WeekChart week={day.week} selected={day.date} />
          </Card>
        </div>
      </div>

      {sheet && (
        <FoodSheet
          key={sheet.n}
          open={sheet.open}
          meal={sheet.meal}
          origin={sheet.origin}
          onClose={() => setSheet((s) => s && { ...s, open: false })}
          recent={day.recent}
          mine={day.mine}
          favorites={day.favorites}
          yesterday={day.yesterday.filter((e) => e.meal === sheet.meal)}
          mfds={day.mfds}
          onAdd={(items) => addFoods(sheet.meal, items)}
        />
      )}

      {goal && (
        <GoalSheet
          key={goal.n}
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

function DateNav({ date, today }: { date: string; today: string }) {
  const prev = shiftDateKey(date, -1);
  const next = shiftDateKey(date, 1);
  const href = (d: string) => (d === today ? '/nutrition' : `/nutrition?date=${d}`);
  const arrow =
    'flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink';

  return (
    <nav aria-label="날짜" className="flex items-center gap-1">
      <Link href={href(prev)} scroll={false} aria-label="전날" className={arrow}>
        <ChevronLeft aria-hidden className="h-5 w-5" />
      </Link>
      <p className="min-w-[7.5rem] text-center text-sm font-semibold text-ink tabular-nums sm:min-w-[8.5rem]">
        {dayTitle(date)}
      </p>
      {date < today ? (
        <Link href={href(next)} scroll={false} aria-label="다음날" className={arrow}>
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

/* ─────────────────────────── 오늘 한눈에 ─────────────────────────── */

const MACROS = [
  { key: 'carbs', label: '탄수화물', bar: 'bg-cat-power' },
  { key: 'protein', label: '단백질', bar: 'bg-cat-lower' },
  { key: 'fat', label: '지방', bar: 'bg-cat-mobility' },
] as const;

function SummaryCard({ eaten, day }: { eaten: Macros; day: NutritionDay }) {
  const t = day.targets;
  const left = t.kcal - eaten.kcal;
  const max = Math.max(t.kcal, eaten.kcal, 1);
  const pct = (n: number) => `${Math.min(100, (Math.max(0, n) / max) * 100)}%`;
  const over = left < 0;

  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm text-muted">
          {over ? '목표보다' : '오늘 더 먹을 수 있는 양'}
        </p>
        <p
          className={`mt-0.5 text-3xl font-bold tabular-nums transition-colors ${
            over ? 'text-warn' : 'text-ink'
          }`}
        >
          {kcalText(Math.abs(left))}
          <span className="ml-1 text-base font-semibold">
            kcal{over ? ' 더 먹었어요' : ''}
          </span>
        </p>
      </div>

      <div className="space-y-2">
        <div
          role="img"
          aria-label={`목표 ${kcalText(t.kcal)}kcal 가운데 ${kcalText(eaten.kcal)}kcal 먹음`}
          className="relative h-3.5 overflow-hidden rounded-full bg-surface-2"
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
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted tabular-nums">
          <span>
            먹은 것 <b className="font-semibold text-ink">{kcalText(eaten.kcal)}</b>
          </span>
          <span>
            목표 <b className="font-semibold text-ink">{kcalText(t.kcal)}</b>
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

      <dl className="grid gap-3 sm:grid-cols-3">
        {MACROS.map((m) => {
          const got = eaten[m.key];
          const goal = t[m.key];
          return (
            <div key={m.key} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-xs text-muted">{m.label}</dt>
                <dd className="text-xs tabular-nums text-muted">
                  <b className="text-sm font-semibold text-ink">{Math.round(got)}</b> /{' '}
                  {goal}g
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

      {day.hasProfile && t.assumed.some((a) => a !== 'sex') && (
        <p className="text-xs text-muted">
          내 정보에 {assumedText(t.assumed)}을 넣으면 목표가 더 정확해져요.
        </p>
      )}
    </Card>
  );
}

function assumedText(assumed: NutritionDay['targets']['assumed']) {
  const names = {
    weight: '몸무게',
    height: '키',
    age: '생년월일',
    sex: '성별',
  } as const;
  return assumed
    .filter((a) => a !== 'sex')
    .map((a) => names[a])
    .join('·');
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
  const label = mealLabel(meal);

  return (
    <li className="px-5 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-bold text-ink">{label}</h2>
        {entries.length > 0 && (
          <p className="text-sm tabular-nums text-muted">
            {kcalText(total.kcal)}kcal · 단백질 {Math.round(total.protein)}g
          </p>
        )}
        {entries.length > 0 && (
          <button
            type="button"
            onClick={onOpen}
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-sky transition-colors hover:bg-sky-tint"
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
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong py-4 text-sm font-medium text-muted transition-[color,border-color,background-color,transform] duration-150 hover:border-sky hover:bg-sky-tint/50 hover:text-sky motion-safe:active:scale-[0.99]"
        >
          <Plus aria-hidden className="h-4 w-4" />
          {label} 기록하기
        </button>
      ) : (
        <ul className="mt-2 space-y-1">
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

function step(amount: number, dir: 1 | -1) {
  const size = amount < 1 || (amount === 1 && dir === -1) ? 0.25 : 0.5;
  const next = Math.round((amount + dir * size) / size) * size;
  return Math.min(AMOUNT_MAX, Math.max(0.25, next));
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
        className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink">{entry.name}</span>
          <span className="block truncate text-xs text-muted">
            {amountText(entry.amount)}
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
          <div className="flex flex-wrap items-center gap-2 pb-3 pt-1">
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
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">운동으로 쓴 칼로리</h2>
        <p className="text-xs text-muted">기록에서 대략 셈</p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted">
          이날 트레이닝·투구 기록이 없어요. 기록하면 여기 저절로 더해지고, 그만큼 먹을
          양도 늘어나요.
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
    </Card>
  );
}

/* ─────────────────────────── 물 ─────────────────────────── */

function WaterCard({
  water,
  goal,
  onChange,
}: {
  water: number;
  goal: number;
  onChange: (ml: number) => void;
}) {
  const cups = Math.min(16, Math.max(4, Math.ceil(goal / WATER_CUP_ML)));
  const filled = Math.floor(water / WATER_CUP_ML);
  const liters = (ml: number) =>
    (ml / 1000).toFixed(ml % 1000 === 0 ? 0 : 2).replace(/0$/, '');

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">물</h2>
        <p className="text-sm tabular-nums text-muted">
          <b className="font-semibold text-ink">{liters(water)}L</b> / {liters(goal)}L
        </p>
      </div>
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label="마신 물(한 잔 250ml)"
      >
        {Array.from({ length: cups }, (_, i) => {
          const full = i < filled;
          return (
            <button
              key={i}
              type="button"
              aria-label={`${i + 1}잔${full ? ' — 마심' : ''}`}
              aria-pressed={full}
              /* 채워진 마지막 잔을 다시 누르면 한 잔 뺀다 */
              onClick={() =>
                onChange(i + 1 === filled ? i * WATER_CUP_ML : (i + 1) * WATER_CUP_ML)
              }
              className={`flex h-9 w-8 items-center justify-center rounded-lg border transition-[background-color,border-color,color,transform] duration-200 motion-safe:active:scale-90 ${
                full
                  ? 'border-sky bg-sky text-white'
                  : 'border-line bg-surface-2 text-line-strong hover:border-sky hover:text-sky'
              }`}
              style={{ transitionDelay: full ? `${Math.min(i, 8) * 12}ms` : '0ms' }}
            >
              <Droplet
                aria-hidden
                className="h-4 w-4"
                fill={full ? 'currentColor' : 'none'}
              />
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(water - WATER_CUP_ML)}
          disabled={water <= 0}
          className="flex h-9 flex-1 items-center justify-center gap-1 rounded-xl border border-line text-sm text-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-40"
        >
          <Minus aria-hidden className="h-4 w-4" /> 한 잔
        </button>
        <button
          type="button"
          onClick={() => onChange(water + WATER_CUP_ML)}
          disabled={water >= WATER_MAX_ML}
          className="flex h-9 flex-1 items-center justify-center gap-1 rounded-xl bg-sky text-sm font-semibold text-white transition-colors hover:bg-sky-strong disabled:opacity-40"
        >
          <Plus aria-hidden className="h-4 w-4" /> 한 잔(250ml)
        </button>
      </div>
    </Card>
  );
}

/* ─────────────────────────── 체중 ─────────────────────────── */

function WeightCard({ day }: { day: NutritionDay }) {
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
  const [error, setError] = useState<string | null>(null);

  const parsed = text.trim() === '' ? null : Number(text);
  const valid = parsed === null || (Number.isFinite(parsed) && parsed > 0);
  const nextKg = parsed === null ? null : fromWeight(parsed, unit);
  const changed = valid && shown(nextKg) !== shown(saved);

  function save() {
    if (!changed) return;
    setError(null);
    startTransition(async () => {
      const res = await setWeight(day.date, nextKg);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <Card className="space-y-3">
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
      <WeightTrend weights={day.weights} unit={unit} />
    </Card>
  );
}
