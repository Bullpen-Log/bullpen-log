'use client';

import { useEffect, useMemo, useState, useTransition, type CSSProperties } from 'react';
import {
  ArrowLeft,
  Check,
  History,
  Minus,
  PencilLine,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { Modal } from '@/components/modal';
import { Segmented } from '@/components/segmented';
import {
  BASIC_FOODS,
  FOOD_CATEGORIES,
  FOODS_BY_CATEGORY,
  STARTER_FOOD_IDS,
  basicFood,
  rankFoods,
  type FoodCategory,
} from '@/lib/nutrition/foods';
import {
  AMOUNT_MAX,
  AMOUNT_MIN,
  FOOD_NAME_MAX,
  KCAL_MAX,
  MACRO_MAX,
  SOURCE_LABEL,
  amountText,
  entryMacros,
  gramText,
  kcalText,
  mealLabel,
  scaleMacros,
  sumMacros,
  type Food,
  type MealEntryView,
  type MealKey,
} from '@/lib/nutrition/meta';
import {
  deleteUserFood,
  saveUserFood,
  unfavoriteFood,
  type NutritionResult,
} from '@/app/actions/nutrition';
import { EASE, toFoodInput, type Origin } from './shared';

/**
 * 음식 담기 창 — 끼니 단추를 누르면 뜬다.
 *
 * 인아웃에서 가장 불편하다는 말을 들은 곳이 음식 찾기였다. 그래서 세 가지를 했다.
 *
 *   1. 치는 즉시 걸러 준다. 기본 목록과 내 음식은 이미 화면에 있어서 서버에 묻지
 *      않는다. 식약처 검색만 잠깐 멈췄다가(0.28초) 묻는다.
 *   2. 초성으로도 찾는다('ㄷㄱㅅㅅ' → 닭가슴살).
 *   3. 최근에 먹은 것은 줄 옆의 + 한 번으로 1인분을 담는다. 양을 바꾸고 싶을 때만
 *      줄을 눌러 들어간다.
 *
 * 담아도 창을 닫지 않는다. 한 끼는 보통 여러 가지라, 담을 때마다 끼니 단추를 다시
 * 누르게 하면 번거롭다. 아래에 담은 것을 모아 보여 주고 '다 했어요'로 닫는다.
 */

/*
 * 최근 · 내 음식 · 전체 음식.
 *
 * '전체 음식'은 앱에 든 음식을 분류별로 모두 보여 준다. 이름이 떠오르지 않을 때
 * 검색창 대신 눈으로 훑어 고른다 — 반찬 칸을 열어 오늘 먹은 것을 찾는 식이다.
 * 처음 쓰는 사람(최근 기록이 없음)은 '최근' 자리에 자주 먹는 것을 대신 보여 준다.
 */
type Tab = 'recent' | 'mine' | 'all';
type Category = 'all' | FoodCategory;
type View = { kind: 'list' } | { kind: 'pick'; food: Food } | { kind: 'custom' };

const favKey = (f: Food) => `${f.source}:${f.id}`;
const canFavorite = (f: Food) =>
  (f.source === 'basic' || f.source === 'mfds') && !!f.id;

export function FoodSheet({
  open,
  meal,
  origin,
  onClose,
  recent,
  mine,
  favorites,
  yesterday,
  mfds,
  onAdd,
}: {
  open: boolean;
  meal: MealKey;
  origin: Origin;
  onClose: () => void;
  recent: Food[];
  mine: Food[];
  favorites: string[];
  yesterday: MealEntryView[];
  mfds: boolean;
  onAdd: (items: { food: Food; amount: number }[]) => Promise<NutritionResult>;
}) {
  const label = mealLabel(meal);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>(recent.length > 0 ? 'recent' : 'all');
  const [category, setCategory] = useState<Category>('all');
  const [view, setView] = useState<View>({ kind: 'list' });
  const [added, setAdded] = useState<string[]>([]);
  const [favs, setFavs] = useState(() => new Set(favorites));
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const q = query.trim();

  /* ── 식약처 검색 — 치다 멈추면 묻는다. 결과에는 어느 낱말의 것인지 붙여 둔다. ── */
  const [remote, setRemote] = useState<{ q: string; foods: Food[] }>({
    q: '',
    foods: [],
  });
  useEffect(() => {
    if (!mfds || !q) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/nutrition/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        const json = (await res.json()) as { foods?: Food[] };
        setRemote({ q, foods: Array.isArray(json.foods) ? json.foods : [] });
      } catch {
        if (!ctrl.signal.aborted) setRemote({ q, foods: [] });
      }
    }, 280);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, mfds]);
  const remoteLoading = mfds && q !== '' && remote.q !== q;
  const remoteFoods = remote.q === q ? remote.foods : [];

  const myFoods = useMemo(
    () => mine.filter((f) => !gone.has(f.id ?? '')),
    [mine, gone]
  );
  const local = useMemo(
    () => (q ? rankFoods([...myFoods, ...BASIC_FOODS], q, 40) : []),
    [q, myFoods]
  );

  const starters = useMemo(
    () => STARTER_FOOD_IDS.map(basicFood).filter((f): f is Food => f !== null),
    []
  );

  /** 담은 것을 아래 줄에 올리고, 저장이 실패하면 거기서 빼고 까닭을 띄운다 */
  function track(label: string, done: Promise<NutritionResult>) {
    setError(null);
    setAdded((a) => [...a, label]);
    done.then((res) => {
      if (res.ok) return;
      setAdded((a) => a.filter((x) => x !== label));
      setError(`${label} — 담지 못했어요. ${res.error}`);
    });
  }

  function add(food: Food, amount: number) {
    track(`${food.name} ${amountText(amount)}`, onAdd([{ food, amount }]));
    setView({ kind: 'list' });
  }

  function addYesterday() {
    const done = onAdd(
      yesterday.map((e) => ({
        food: {
          source: e.source,
          id: e.sourceId,
          name: e.name,
          servingLabel: e.servingLabel ?? '1인분',
          servingGrams: e.servingGrams,
          kcal: e.kcal,
          carbs: e.carbs,
          protein: e.protein,
          fat: e.fat,
        },
        amount: e.amount,
      }))
    );
    track(`어제 ${label} ${yesterday.length}가지`, done);
  }

  const [, startTransition] = useTransition();

  function toggleFavorite(food: Food) {
    if (!canFavorite(food)) return;
    const key = favKey(food);
    const on = !favs.has(key);
    const flip = (value: boolean) =>
      setFavs((s) => {
        const next = new Set(s);
        if (value) next.add(key);
        else next.delete(key);
        return next;
      });
    flip(on);
    startTransition(async () => {
      const res = on
        ? await saveUserFood(toFoodInput(food))
        : await unfavoriteFood(food.source, food.id!);
      if (!res.ok) {
        flip(!on);
        setError(res.error);
      }
    });
  }

  function removeMine(food: Food) {
    if (!food.id) return;
    const id = food.id;
    setGone((s) => new Set(s).add(id));
    startTransition(async () => {
      const res = await deleteUserFood(id);
      if (!res.ok) {
        setGone((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
        setError(res.error);
      }
    });
  }

  const yesterdayTotal = sumMacros(yesterday.map(entryMacros));

  return (
    <Modal open={open} onClose={onClose} title={`${label} 담기`} origin={origin}>
      {view.kind === 'pick' ? (
        <PickFood
          key={favKey(view.food)}
          food={view.food}
          meal={meal}
          favorite={favs.has(favKey(view.food))}
          onFavorite={() => toggleFavorite(view.food)}
          onBack={() => setView({ kind: 'list' })}
          onAdd={(amount) => add(view.food, amount)}
        />
      ) : view.kind === 'custom' ? (
        <CustomFood
          meal={meal}
          initialName={q}
          onBack={() => setView({ kind: 'list' })}
          onAdd={(food, save) => {
            add(food, 1);
            if (save) {
              startTransition(async () => {
                const res = await saveUserFood(
                  toFoodInput({ ...food, source: 'mine' })
                );
                if (!res.ok) setError(res.error);
              });
            }
          }}
        />
      ) : (
        <div className="space-y-4">
          {/* 찾는 칸은 목록을 굴려도 위에 붙어 있다 */}
          <div className="sticky -top-5 z-10 -mx-5 -mt-5 bg-surface px-5 pb-3 pt-5">
            <label className="relative block">
              <span className="sr-only">음식 이름</span>
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="음식 이름 — 초성도 돼요 (ㄷㄱㅅㅅ)"
                enterKeyHint="search"
                className="w-full rounded-xl border border-line bg-surface-2 py-3 pl-10 pr-10 text-sm text-ink placeholder:text-muted/60 transition-colors focus:border-sky focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="지우기"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:text-ink"
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              )}
            </label>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger"
            >
              {error}
            </p>
          )}

          {q ? (
            <SearchResults
              q={q}
              local={local}
              remote={remoteFoods}
              remoteLoading={remoteLoading}
              mfds={mfds}
              onPick={(food) => setView({ kind: 'pick', food })}
              onQuick={(food) => add(food, 1)}
              onCustom={() => setView({ kind: 'custom' })}
            />
          ) : (
            <>
              {yesterday.length > 0 && (
                <button
                  type="button"
                  onClick={addYesterday}
                  className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 text-left transition-colors hover:border-sky hover:bg-sky-tint/60"
                >
                  <History aria-hidden className="h-4 w-4 shrink-0 text-sky" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">
                      어제 {label}과 같이 담기
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {yesterday.map((e) => e.name).join(', ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-muted">
                    {kcalText(yesterdayTotal.kcal)}kcal
                  </span>
                </button>
              )}

              <Segmented
                label="음식 고르는 곳"
                role="tablist"
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'recent', label: '최근' },
                  { value: 'mine', label: '내 음식' },
                  { value: 'all', label: '전체 음식' },
                ]}
              />

              <div role="tabpanel">
                {tab === 'recent' &&
                  (recent.length === 0 ? (
                    <div className="space-y-1">
                      <p className="px-1 pb-1 text-xs text-muted">
                        아직 기록이 없어요. 선수들이 자주 먹는 것부터 골라 보세요.
                      </p>
                      <FoodList
                        foods={starters}
                        onPick={(food) => setView({ kind: 'pick', food })}
                        onQuick={(food) => add(food, 1)}
                      />
                    </div>
                  ) : (
                    <FoodList
                      foods={recent}
                      onPick={(food) => setView({ kind: 'pick', food })}
                      onQuick={(food) => add(food, 1)}
                    />
                  ))}
                {tab === 'mine' &&
                  (myFoods.length === 0 ? (
                    <Empty text="자주 먹는 것은 음식 화면의 ★ 로 여기에 모아 두세요. 직접 만든 음식도 여기에 들어와요." />
                  ) : (
                    <FoodList
                      foods={myFoods}
                      onPick={(food) => setView({ kind: 'pick', food })}
                      onQuick={(food) => add(food, 1)}
                      onRemove={removeMine}
                    />
                  ))}
                {tab === 'all' && (
                  <AllFoods
                    category={category}
                    onCategory={setCategory}
                    onPick={(food) => setView({ kind: 'pick', food })}
                    onQuick={(food) => add(food, 1)}
                  />
                )}
              </div>

              <button
                type="button"
                onClick={() => setView({ kind: 'custom' })}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong py-3 text-sm text-muted transition-colors hover:border-sky hover:text-sky"
              >
                <PencilLine aria-hidden className="h-4 w-4" />
                목록에 없으면 직접 입력
              </button>
            </>
          )}

          {added.length > 0 && (
            <div className="motion-safe:animate-fade-in sticky -bottom-5 -mx-5 -mb-5 flex items-center gap-3 border-t border-line bg-surface px-5 py-3">
              <Check aria-hidden className="h-4 w-4 shrink-0 text-ok" />
              <p className="min-w-0 flex-1 truncate text-sm text-ink">
                {added.length === 1
                  ? `${added[0]} 담았어요`
                  : `${added.length}번 담았어요 — ${added.at(-1)}`}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-xl bg-sky px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-strong"
              >
                다 했어요
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ─────────────────────────── 목록 ─────────────────────────── */

/**
 * 전체 음식 — 위에 분류 고르개, 밑에 음식.
 *
 * '전체'를 고르면 분류마다 제목을 달아 모두 늘어놓고, 분류를 고르면 그것만
 * 남긴다. 고르개는 앱의 다른 고르개와 같은 부품이라 고른 표시가 옆으로
 * 미끄러진다.
 */
function AllFoods({
  category,
  onCategory,
  onPick,
  onQuick,
}: {
  category: Category;
  onCategory: (c: Category) => void;
  onPick: (food: Food) => void;
  onQuick: (food: Food) => void;
}) {
  const shown = category === 'all' ? FOOD_CATEGORIES : [category];
  return (
    <div className="space-y-4">
      <Segmented
        label="음식 분류"
        role="tablist"
        layout="flow"
        value={category}
        onChange={onCategory}
        itemClassName="px-2.5 py-1.5"
        options={[
          { value: 'all', label: '전체' },
          ...FOOD_CATEGORIES.map((c) => ({ value: c, label: c })),
        ]}
      />
      {/* 분류를 바꿀 때마다 목록을 새로 그려, 줄이 위에서부터 다시 들어온다 */}
      <div key={category} className="space-y-4">
        {shown.map((c) => {
          const foods = FOODS_BY_CATEGORY.get(c) ?? [];
          return (
            <section key={c} aria-label={c} className="space-y-1">
              {category === 'all' && (
                <h3 className="flex items-baseline gap-1.5 px-1 text-xs font-semibold text-ink">
                  {c}
                  <span className="font-normal text-muted">{foods.length}</span>
                </h3>
              )}
              <FoodList foods={foods} onPick={onPick} onQuick={onQuick} hideNote />
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="px-1 py-6 text-center text-sm leading-relaxed text-muted">{text}</p>
  );
}

function FoodList({
  foods,
  onPick,
  onQuick,
  onRemove,
  hideNote = false,
}: {
  foods: Food[];
  onPick: (food: Food) => void;
  onQuick: (food: Food) => void;
  onRemove?: (food: Food) => void;
  /** 분류별로 볼 때는 줄마다 분류를 또 적지 않는다 */
  hideNote?: boolean;
}) {
  return (
    <ul className="-mx-2">
      {foods.map((f, i) => (
        <FoodRow
          key={`${f.source}:${f.id ?? f.name}`}
          food={f}
          index={i}
          onPick={() => onPick(f)}
          onQuick={() => onQuick(f)}
          onRemove={onRemove ? () => onRemove(f) : undefined}
          hideNote={hideNote}
        />
      ))}
    </ul>
  );
}

function FoodRow({
  food,
  index,
  onPick,
  onQuick,
  onRemove,
  hideNote,
}: {
  food: Food;
  index: number;
  onPick: () => void;
  onQuick: () => void;
  onRemove?: () => void;
  hideNote: boolean;
}) {
  /* 지우기는 두 번 눌러야 한다 — 직접 만든 음식은 되살릴 길이 없다 */
  const [confirm, setConfirm] = useState(false);
  const [flash, setFlash] = useState(0);

  return (
    <li
      className="motion-safe:animate-row-in flex items-center gap-1"
      style={{ '--row': index } as CSSProperties}
    >
      <button
        type="button"
        onClick={onPick}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">
            {food.name}
          </span>
          <span className="block truncate text-xs text-muted">
            {food.servingLabel}
            {food.note && !hideNote ? ` · ${food.note}` : ''}
          </span>
        </span>
        <span className="shrink-0 text-sm tabular-nums text-ink">
          {kcalText(food.kcal)}
          <span className="ml-0.5 text-xs text-muted">kcal</span>
        </span>
      </button>
      {onRemove &&
        (confirm ? (
          <button
            type="button"
            onClick={onRemove}
            onBlur={() => setConfirm(false)}
            className="shrink-0 rounded-lg bg-danger-bg px-2.5 py-2 text-xs font-semibold text-danger"
          >
            지우기
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            aria-label={`${food.name} 내 음식에서 지우기`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-bg hover:text-danger"
          >
            <Trash2 aria-hidden className="h-4 w-4" />
          </button>
        ))}
      <button
        type="button"
        onClick={() => {
          onQuick();
          setFlash((n) => n + 1);
        }}
        aria-label={`${food.name} 1인분 담기`}
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sky transition-[background-color,transform] duration-150 hover:bg-sky-tint motion-safe:active:scale-90"
      >
        {/* 담을 때마다 체크가 한 번 떴다 사라진다 — 눌렸는지 눈으로 확인 */}
        {flash > 0 ? (
          <Check
            key={flash}
            aria-hidden
            className="motion-safe:animate-fade-in h-4 w-4 text-ok"
          />
        ) : (
          <Plus aria-hidden className="h-4 w-4" />
        )}
      </button>
    </li>
  );
}

function SearchResults({
  q,
  local,
  remote,
  remoteLoading,
  mfds,
  onPick,
  onQuick,
  onCustom,
}: {
  q: string;
  local: Food[];
  remote: Food[];
  remoteLoading: boolean;
  mfds: boolean;
  onPick: (food: Food) => void;
  onQuick: (food: Food) => void;
  onCustom: () => void;
}) {
  const nothing = local.length === 0 && remote.length === 0 && !remoteLoading;
  return (
    <div className="space-y-4">
      {local.length > 0 && <FoodList foods={local} onPick={onPick} onQuick={onQuick} />}

      {mfds && (remoteLoading || remote.length > 0) && (
        <section className="space-y-1">
          <h3 className="px-1 text-xs font-semibold text-muted">
            식약처 식품영양성분DB
          </h3>
          {remoteLoading ? (
            <div aria-busy="true" className="space-y-2 py-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-11 animate-pulse rounded-xl bg-surface-2" />
              ))}
            </div>
          ) : (
            <FoodList foods={remote} onPick={onPick} onQuick={onQuick} />
          )}
        </section>
      )}

      {nothing && (
        <p className="px-1 pt-2 text-center text-sm text-muted">
          ‘{q}’에 맞는 음식이 없어요.
        </p>
      )}

      <button
        type="button"
        onClick={onCustom}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong py-3 text-sm text-muted transition-colors hover:border-sky hover:text-sky"
      >
        <PencilLine aria-hidden className="h-4 w-4" />‘{q}’ 직접 입력
      </button>

      <p className="px-1 text-[11px] leading-relaxed text-muted/80">
        {mfds
          ? '식약처 자료는 식품의약품안전처 식품영양성분 데이터베이스(공공데이터포털)에서 가져옵니다.'
          : '식약처 음식 검색은 아직 연결 전이에요. 목록에 없는 음식은 직접 입력으로 담아 주세요.'}
      </p>
    </div>
  );
}

/* ─────────────────────────── 양 고르기 ─────────────────────────── */

const QUICK = [0.5, 1, 1.5, 2, 3];

function stepAmount(amount: number, dir: 1 | -1) {
  const size = amount < 1 || (amount === 1 && dir === -1) ? 0.25 : 0.5;
  const next = Math.round((amount + dir * size) / size) * size;
  return Math.min(AMOUNT_MAX, Math.max(0.25, next));
}

const round20 = (n: number) => Math.round(n * 20) / 20;

function PickFood({
  food,
  meal,
  favorite,
  onFavorite,
  onBack,
  onAdd,
}: {
  food: Food;
  meal: MealKey;
  favorite: boolean;
  onFavorite: () => void;
  onBack: () => void;
  onAdd: (amount: number) => void;
}) {
  const [amount, setAmount] = useState(1);
  const [grams, setGrams] = useState(
    food.servingGrams ? gramText(food.servingGrams) : ''
  );
  const got = scaleMacros(food, amount);

  function setBoth(next: number) {
    setAmount(next);
    if (food.servingGrams) setGrams(gramText(next * food.servingGrams));
  }

  function typeGrams(text: string) {
    const clean = text.replace(/[^\d.]/g, '');
    setGrams(clean);
    const g = Number(clean);
    if (food.servingGrams && g > 0) {
      setAmount(
        Math.min(AMOUNT_MAX, Math.max(AMOUNT_MIN, round20(g / food.servingGrams)))
      );
    }
  }

  return (
    <div className="motion-safe:animate-fade-in space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 inline-flex items-center gap-1 rounded-lg px-1 py-1 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        목록
      </button>

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-ink">{food.name}</h3>
          <p className="text-xs text-muted">
            1인분 {food.servingLabel} · {SOURCE_LABEL[food.source]}
            {food.note ? ` · ${food.note}` : ''}
          </p>
        </div>
        {canFavorite(food) && (
          <button
            type="button"
            onClick={onFavorite}
            aria-pressed={favorite}
            className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              favorite ? 'bg-warn-bg text-warn' : 'text-muted hover:bg-surface-2'
            }`}
          >
            <Star
              aria-hidden
              className={`h-4 w-4 transition-transform duration-200 ${EASE} ${favorite ? 'scale-110' : ''}`}
              fill={favorite ? 'currentColor' : 'none'}
            />
            {favorite ? '내 음식' : '내 음식에 두기'}
          </button>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl border border-line bg-surface-2">
            <button
              type="button"
              onClick={() => setBoth(stepAmount(amount, -1))}
              aria-label="줄이기"
              className="flex h-11 w-11 items-center justify-center rounded-l-xl text-muted transition-colors hover:text-ink"
            >
              <Minus aria-hidden className="h-4 w-4" />
            </button>
            <span className="min-w-[5rem] text-center text-base font-semibold tabular-nums text-ink">
              {amountText(amount)}
            </span>
            <button
              type="button"
              onClick={() => setBoth(stepAmount(amount, 1))}
              aria-label="늘리기"
              className="flex h-11 w-11 items-center justify-center rounded-r-xl text-muted transition-colors hover:text-ink"
            >
              <Plus aria-hidden className="h-4 w-4" />
            </button>
          </div>
          {food.servingGrams !== null && (
            <label className="flex items-center gap-1.5 text-sm text-muted">
              <span className="sr-only">그램</span>
              <input
                inputMode="decimal"
                value={grams}
                onChange={(e) => typeGrams(e.target.value)}
                className="w-20 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-right text-sm tabular-nums text-ink transition-colors focus:border-sky focus:outline-none"
              />
              g
            </label>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setBoth(a)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                amount === a
                  ? 'bg-sky-tint text-sky'
                  : 'bg-surface-2 text-muted hover:text-ink'
              }`}
            >
              {amountText(a)}
            </button>
          ))}
        </div>
      </div>

      <dl className="grid grid-cols-4 gap-2 rounded-xl bg-surface-2 p-3 text-center tabular-nums">
        <div>
          <dt className="text-[11px] text-muted">칼로리</dt>
          <dd className="text-base font-bold text-ink">{kcalText(got.kcal)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">탄수화물</dt>
          <dd className="text-sm font-semibold text-ink">{gramText(got.carbs)}g</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">단백질</dt>
          <dd className="text-sm font-semibold text-ink">{gramText(got.protein)}g</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">지방</dt>
          <dd className="text-sm font-semibold text-ink">{gramText(got.fat)}g</dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() => onAdd(amount)}
        className="w-full rounded-xl bg-sky py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-strong"
      >
        {mealLabel(meal)}에 담기
      </button>
    </div>
  );
}

/* ─────────────────────────── 직접 입력 ─────────────────────────── */

function CustomFood({
  meal,
  initialName,
  onBack,
  onAdd,
}: {
  meal: MealKey;
  initialName: string;
  onBack: () => void;
  onAdd: (food: Food, save: boolean) => void;
}) {
  const [name, setName] = useState(initialName);
  const [serving, setServing] = useState('');
  const [kcal, setKcal] = useState('');
  const [carbs, setCarbs] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [save, setSave] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (s: string) => (s.trim() === '' ? null : Number(s));

  function submit() {
    const k = num(kcal);
    const macros = [num(carbs), num(protein), num(fat)];
    if (!name.trim()) return setError('음식 이름을 적어 주세요.');
    if (k === null || !Number.isFinite(k) || k < 0 || k > KCAL_MAX) {
      return setError(
        '칼로리를 적어 주세요. 모르면 포장지나 메뉴판의 값을 적으면 돼요.'
      );
    }
    if (
      macros.some((m) => m !== null && (!Number.isFinite(m) || m < 0 || m > MACRO_MAX))
    ) {
      return setError(`탄수화물·단백질·지방은 0~${MACRO_MAX}g 사이로 적어 주세요.`);
    }
    onAdd(
      {
        source: 'free',
        id: null,
        name: name.trim(),
        servingLabel: serving.trim() || '1인분',
        servingGrams: null,
        kcal: k,
        carbs: macros[0],
        protein: macros[1],
        fat: macros[2],
      },
      save
    );
  }

  const field =
    'w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink placeholder:text-muted/60 transition-colors focus:border-sky focus:outline-none';
  const numField = `${field} text-right tabular-nums`;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="motion-safe:animate-fade-in space-y-4"
    >
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 inline-flex items-center gap-1 rounded-lg px-1 py-1 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        목록
      </button>

      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted">음식 이름</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={FOOD_NAME_MAX}
            placeholder="예) 엄마표 제육볶음"
            className={field}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted">먹은 양 (선택)</span>
          <input
            value={serving}
            onChange={(e) => setServing(e.target.value)}
            maxLength={40}
            placeholder="1인분"
            className={field}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: '칼로리 (kcal)', value: kcal, set: setKcal, need: true },
          { label: '탄수화물 (g)', value: carbs, set: setCarbs },
          { label: '단백질 (g)', value: protein, set: setProtein },
          { label: '지방 (g)', value: fat, set: setFat },
        ].map((f) => (
          <label key={f.label} className="space-y-1.5">
            <span className="text-xs font-medium text-muted">
              {f.label}
              {f.need ? '' : ' · 선택'}
            </span>
            <input
              inputMode="decimal"
              value={f.value}
              onChange={(e) => f.set(e.target.value.replace(/[^\d.]/g, ''))}
              className={numField}
            />
          </label>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={save}
          onChange={(e) => setSave(e.target.checked)}
          className="h-4 w-4 accent-sky"
        />
        내 음식에 저장해 다음에도 쓰기
      </label>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        className="w-full rounded-xl bg-sky py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-strong"
      >
        {mealLabel(meal)}에 담기
      </button>
    </form>
  );
}
