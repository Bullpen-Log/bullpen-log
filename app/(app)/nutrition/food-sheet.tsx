'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from 'react';
import {
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
import { Expand } from '@/components/expand';
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
  type RankedFood,
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
 *      줄을 눌러 편다.
 *
 * 담아도 창을 닫지 않는다. 한 끼는 보통 여러 가지라, 담을 때마다 끼니 단추를 다시
 * 누르게 하면 번거롭다. 아래에 담은 것을 모아 보여 주고 '다 했어요'로 닫는다.
 *
 * ■ 목록은 늘 그 자리에 있다
 *
 * 예전에는 줄을 누르면 목록을 치우고 양 고르는 화면으로 바꿔 끼웠다. 담고 나면
 * 목록을 다시 그렸는데, 그때마다 줄이 위에서부터 다시 들어오고(깜빡임) 굴려 둔
 * 자리도 맨 위로 돌아가서, 다음 음식을 찾으려면 처음부터 다시 내려가야 했다.
 * 이제 양 고르기와 직접 입력은 누른 줄 밑에서 펴지고 담으면 접힌다. 목록은 한 번도
 * 다시 그려지지 않는다.
 *
 * 같은 까닭으로 '최근'과 '인기' 목록은 창을 연 때의 것으로 둔다. 담을 때마다 서버가
 * 새 목록을 보내 주는데, 그대로 따르면 방금 담은 것이 맨 위로 올라가며 줄이 한 칸씩
 * 밀린다.
 */

/*
 * 최근 · 내 음식 · 전체 음식.
 *
 * '전체 음식'은 앱에 든 음식을 분류별로 모두 보여 준다. 이름이 떠오르지 않을 때
 * 검색창 대신 눈으로 훑어 고른다 — 반찬 칸을 열어 오늘 먹은 것을 찾는 식이다.
 * 처음 쓰는 사람(최근 기록이 없음)은 '최근' 자리에 자주 먹는 것을 대신 보여 준다.
 */
type Tab = 'recent' | 'mine' | 'all';
type Category = 'popular' | 'all' | FoodCategory;

const favKey = (f: Food) => `${f.source}:${f.id}`;
/* 줄 하나를 가리키는 이름 — 직접 입력한 음식은 id 가 없어 이름으로 */
const rowKey = (f: Food) => `${f.source}:${f.id ?? f.name}`;
const canFavorite = (f: Food) =>
  (f.source === 'basic' || f.source === 'mfds') && !!f.id;
/* 직접 입력 칸을 가리키는 이름 — 펴 둔 줄은 한 번에 하나라 줄 이름과 같은 자리를 쓴다 */
const CUSTOM_KEY = 'custom';

/**
 * 창 안의 줄들이 함께 쓰는 것.
 *
 * 줄은 여러 목록(최근·내 음식·분류·검색 결과) 안에 있어서, 펴 둔 줄과 담기를 목록마다
 * 내려 주면 모든 목록이 그 값을 들고 다녀야 한다. 한곳에 두고 줄이 직접 꺼내 쓴다.
 */
type SheetState = {
  meal: MealKey;
  /** 펴 둔 줄. 한 번에 하나다 — 다른 줄을 펴면 먼저 것은 접힌다 */
  openKey: string | null;
  toggle: (key: string) => void;
  add: (food: Food, amount: number) => void;
  isFavorite: (food: Food) => boolean;
  toggleFavorite: (food: Food) => void;
};

const SheetContext = createContext<SheetState | null>(null);

function useSheet() {
  const sheet = useContext(SheetContext);
  if (!sheet) throw new Error('음식 줄은 담기 창 안에서만 쓴다');
  return sheet;
}

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
  popular,
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
  /** 모든 사람이 가장 많이 담은 음식 — 순위대로 */
  popular: RankedFood[];
  onAdd: (items: { food: Food; amount: number }[]) => Promise<NutritionResult>;
}) {
  const label = mealLabel(meal);
  /* 창을 연 때의 목록 — 담는 동안 순서가 바뀌어 줄이 밀리지 않게(위 설명) */
  const [recentList] = useState(recent);
  const [popularList] = useState(popular);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>(recentList.length > 0 ? 'recent' : 'all');
  /* 모인 순위가 있으면 인기부터 — 무엇을 먹을지 모를 때 남들이 먹는 것이 가장 빠른 답이다 */
  const [category, setCategory] = useState<Category>(
    popularList.length > 0 ? 'popular' : 'all'
  );
  const [openKey, setOpenKey] = useState<string | null>(null);
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

  /* 담으면 펴 둔 줄을 접는다. 목록은 그대로 두어, 바로 다음 음식을 고른다 */
  function add(food: Food, amount: number) {
    track(`${food.name} ${amountText(amount)}`, onAdd([{ food, amount }]));
    setOpenKey(null);
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

  function addCustom(food: Food, save: boolean) {
    add(food, 1);
    if (!save) return;
    startTransition(async () => {
      const res = await saveUserFood(toFoodInput({ ...food, source: 'mine' }));
      if (!res.ok) setError(res.error);
    });
  }

  const sheet: SheetState = {
    meal,
    openKey,
    toggle: (key) => setOpenKey((k) => (k === key ? null : key)),
    add,
    isFavorite: (food) => favs.has(favKey(food)),
    toggleFavorite,
  };

  const yesterdayTotal = sumMacros(yesterday.map(entryMacros));

  return (
    <Modal open={open} onClose={onClose} title={`${label} 담기`} origin={origin}>
      <SheetContext value={sheet}>
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
                onChange={(e) => {
                  setQuery(e.target.value);
                  /* 찾는 말이 바뀌면 목록이 바뀌므로 펴 둔 줄도 접는다 */
                  setOpenKey(null);
                }}
                placeholder="음식 이름 — 초성도 돼요 (ㄷㄱㅅㅅ)"
                enterKeyHint="search"
                className="w-full rounded-xl border border-line bg-surface-2 py-3 pl-10 pr-10 text-sm text-ink placeholder:text-muted/60 transition-colors focus:border-sky focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setOpenKey(null);
                  }}
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
              className="motion-safe:animate-fade-in rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger"
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
              onCustom={addCustom}
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
                onChange={(next) => {
                  setTab(next);
                  setOpenKey(null);
                }}
                options={[
                  { value: 'recent', label: '최근' },
                  { value: 'mine', label: '내 음식' },
                  { value: 'all', label: '전체 음식' },
                ]}
              />

              <div role="tabpanel">
                {tab === 'recent' &&
                  (recentList.length === 0 ? (
                    <div className="space-y-1">
                      <p className="px-1 pb-1 text-xs text-muted">
                        아직 기록이 없어요. 선수들이 자주 먹는 것부터 골라 보세요.
                      </p>
                      <FoodList foods={starters} />
                    </div>
                  ) : (
                    <FoodList foods={recentList} />
                  ))}
                {tab === 'mine' &&
                  (myFoods.length === 0 ? (
                    <Empty text="자주 먹는 것은 음식을 펴서 ★ 로 여기에 모아 두세요. 직접 만든 음식도 여기에 들어와요." />
                  ) : (
                    <FoodList foods={myFoods} onRemove={removeMine} />
                  ))}
                {tab === 'all' && (
                  <AllFoods
                    popular={popularList}
                    category={category}
                    onCategory={(next) => {
                      setCategory(next);
                      setOpenKey(null);
                    }}
                  />
                )}
              </div>

              <CustomEntry q="" onAdd={addCustom} />
            </>
          )}

          {added.length > 0 && (
            <div className="motion-safe:animate-fade-in sticky -bottom-5 z-10 -mx-5 -mb-5 flex items-center gap-3 border-t border-line bg-surface px-5 py-3">
              <Check aria-hidden className="h-4 w-4 shrink-0 text-ok" />
              {/* 담을 때마다 글이 바뀌며 살짝 떠오른다 — 눌린 것이 들어갔는지 눈으로 확인 */}
              <p
                key={added.length}
                className="motion-safe:animate-fade-in min-w-0 flex-1 truncate text-sm text-ink"
              >
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
      </SheetContext>
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
  popular,
  category,
  onCategory,
}: {
  popular: RankedFood[];
  category: Category;
  onCategory: (c: Category) => void;
}) {
  const shown =
    category === 'popular' ? [] : category === 'all' ? FOOD_CATEGORIES : [category];
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
          { value: 'popular', label: '인기' },
          { value: 'all', label: '전체' },
          ...FOOD_CATEGORIES.map((c) => ({ value: c, label: c })),
        ]}
      />
      {/* 분류를 바꿀 때마다 목록을 새로 그려, 줄이 위에서부터 다시 들어온다 */}
      <div key={category} className="space-y-4">
        {category === 'popular' &&
          (popular.length === 0 ? (
            <Empty text="아직 모인 기록이 적어요. 사람들이 음식을 담기 시작하면 여기에 순위가 생겨요." />
          ) : (
            <section aria-label="인기" className="space-y-1">
              <h3 className="px-1 text-xs text-muted">
                이 앱을 쓰는 사람들이 가장 많이 담은 {popular.length}가지
              </h3>
              <FoodList foods={popular} hideNote />
            </section>
          ))}
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
              <FoodList foods={foods} hideNote />
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
  onRemove,
  hideNote = false,
}: {
  foods: Food[];
  onRemove?: (food: Food) => void;
  /** 분류별로 볼 때는 줄마다 분류를 또 적지 않는다 */
  hideNote?: boolean;
}) {
  return (
    <ul className="-mx-2">
      {foods.map((f, i) => (
        <FoodRow
          key={rowKey(f)}
          food={f}
          index={i}
          onRemove={onRemove ? () => onRemove(f) : undefined}
          hideNote={hideNote}
        />
      ))}
    </ul>
  );
}

/**
 * 음식 한 줄.
 *
 * 누르면 그 밑에서 양 고르기가 펴진다. 오른쪽 + 는 펴지 않고 1인분을 바로 담는다.
 * 어느 쪽으로 담든 + 자리에 체크가 한 번 떴다 사라진다 — 눌린 것이 들어갔는지 눈으로
 * 확인한다.
 */
function FoodRow({
  food,
  index,
  onRemove,
  hideNote,
}: {
  food: Food;
  index: number;
  onRemove?: () => void;
  hideNote: boolean;
}) {
  const { openKey, toggle, add } = useSheet();
  const key = rowKey(food);
  const open = openKey === key;
  /* 인기 순위에서 온 음식이면 순위와 횟수가 붙어 있다 */
  const ranked = 'rank' in food ? (food as RankedFood) : null;
  /* 지우기는 두 번 눌러야 한다 — 직접 만든 음식은 되살릴 길이 없다 */
  const [confirm, setConfirm] = useState(false);
  const [flash, setFlash] = useState(0);
  const panel = useRef<HTMLDivElement>(null);

  /*
   * 편 칸이 창 아래로 잘리면 거기까지만 굴려 보여 준다(이미 보이면 가만히 둔다).
   * 다 펴진 뒤에 잰다 — 펴지는 도중에는 높이가 아직 모자라다.
   */
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      panel.current?.scrollIntoView({
        block: 'nearest',
        behavior: reduce ? 'auto' : 'smooth',
      });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [open]);

  const put = (amount: number) => {
    add(food, amount);
    setFlash((n) => n + 1);
  };

  return (
    <li
      className="motion-safe:animate-row-in"
      style={{ '--row': index } as CSSProperties}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => toggle(key)}
          aria-expanded={open}
          className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors ${
            open ? 'bg-surface-2' : 'hover:bg-surface-2'
          }`}
        >
          {ranked && (
            /* 1~3위는 하늘색으로 — 순위표에서 눈이 가장 먼저 가는 자리 */
            <span
              className={`w-5 shrink-0 text-center text-sm font-bold tabular-nums ${
                ranked.rank <= 3 ? 'text-sky' : 'text-muted'
              }`}
            >
              {ranked.rank}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">
              {food.name}
            </span>
            <span className="block truncate text-xs text-muted">
              {food.servingLabel}
              {ranked
                ? ` · ${ranked.people}명이 ${ranked.picks}번 담음`
                : food.note && !hideNote
                  ? ` · ${food.note}`
                  : ''}
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
          onClick={() => put(1)}
          aria-label={`${food.name} 1인분 담기`}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sky transition-[background-color,transform] duration-150 hover:bg-sky-tint motion-safe:active:scale-90"
        >
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
      </div>

      <Expand open={open}>
        {/* scroll-mb: 아래에 붙은 '담았어요' 줄에 담기 단추가 가리지 않게 */}
        <div ref={panel} className="scroll-mb-20 px-2 pb-2 pt-1">
          <PickFood food={food} onAdd={put} />
        </div>
      </Expand>
    </li>
  );
}

/**
 * 목록에 없으면 직접 입력 — 단추를 누르면 그 밑에서 적는 칸이 펴진다.
 *
 * 찾던 말이 있으면 그것을 이름 칸에 미리 넣어 둔다('엄마표 제육' 을 찾다 없으면 그대로
 * 적는다).
 */
function CustomEntry({
  q,
  onAdd,
}: {
  q: string;
  onAdd: (food: Food, save: boolean) => void;
}) {
  const { meal, openKey, toggle } = useSheet();
  const open = openKey === CUSTOM_KEY;
  return (
    <div>
      <button
        type="button"
        onClick={() => toggle(CUSTOM_KEY)}
        aria-expanded={open}
        className={`flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-sm transition-colors ${
          open
            ? 'border-sky text-sky'
            : 'border-line-strong text-muted hover:border-sky hover:text-sky'
        }`}
      >
        <PencilLine aria-hidden className="h-4 w-4" />
        {q ? `‘${q}’ 직접 입력` : '목록에 없으면 직접 입력'}
      </button>
      <Expand open={open}>
        <div className="scroll-mb-20 pt-3">
          <CustomFood meal={meal} initialName={q} onAdd={onAdd} />
        </div>
      </Expand>
    </div>
  );
}

function SearchResults({
  q,
  local,
  remote,
  remoteLoading,
  mfds,
  onCustom,
}: {
  q: string;
  local: Food[];
  remote: Food[];
  remoteLoading: boolean;
  mfds: boolean;
  onCustom: (food: Food, save: boolean) => void;
}) {
  const nothing = local.length === 0 && remote.length === 0 && !remoteLoading;
  return (
    <div className="space-y-4">
      {local.length > 0 && <FoodList foods={local} />}

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
            <FoodList foods={remote} />
          )}
        </section>
      )}

      {nothing && (
        <p className="px-1 pt-2 text-center text-sm text-muted">
          ‘{q}’에 맞는 음식이 없어요.
        </p>
      )}

      {/* 찾는 말이 바뀌면 이름 칸도 그 말로 새로 시작한다 */}
      <CustomEntry key={q} q={q} onAdd={onCustom} />

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

/**
 * 누른 줄 밑에서 펴지는 양 고르기.
 *
 * 이름은 바로 위 줄에 있어서 다시 적지 않는다. 1인분이 얼마인지·어디 자료인지와
 * 내 음식 단추를 한 줄에 두고, 그 밑에 양과 담기를 둔다.
 */
function PickFood({ food, onAdd }: { food: Food; onAdd: (amount: number) => void }) {
  const { meal, isFavorite, toggleFavorite } = useSheet();
  const favorite = isFavorite(food);
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
    <div className="space-y-3 rounded-xl border border-line bg-surface-2/60 p-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-muted">
          1인분 {food.servingLabel} · {SOURCE_LABEL[food.source]}
          {food.note ? ` · ${food.note}` : ''}
        </p>
        {canFavorite(food) && (
          <button
            type="button"
            onClick={() => toggleFavorite(food)}
            aria-pressed={favorite}
            className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              favorite ? 'bg-warn-bg text-warn' : 'text-muted hover:bg-surface'
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

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-xl border border-line bg-surface">
          <button
            type="button"
            onClick={() => setBoth(stepAmount(amount, -1))}
            aria-label="줄이기"
            className="flex h-11 w-11 items-center justify-center rounded-l-xl text-muted transition-colors hover:text-ink"
          >
            <Minus aria-hidden className="h-4 w-4" />
          </button>
          <span className="min-w-[4.5rem] text-center text-base font-semibold tabular-nums text-ink">
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
              className="w-20 rounded-xl border border-line bg-surface px-3 py-2.5 text-right text-sm tabular-nums text-ink transition-colors focus:border-sky focus:outline-none"
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
            aria-pressed={amount === a}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              amount === a
                ? 'bg-sky-tint text-sky'
                : 'bg-surface text-muted hover:text-ink'
            }`}
          >
            {amountText(a)}
          </button>
        ))}
      </div>

      <dl className="grid grid-cols-4 gap-2 rounded-xl bg-surface p-2.5 text-center tabular-nums">
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
  onAdd,
}: {
  meal: MealKey;
  initialName: string;
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
      className="space-y-4 rounded-xl border border-line p-3"
    >
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

      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          checked={save}
          onChange={(e) => setSave(e.target.checked)}
          className="h-5 w-5 accent-sky"
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
