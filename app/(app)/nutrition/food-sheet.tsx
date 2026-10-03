'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from 'react';
import {
  BookmarkPlus,
  Check,
  ChevronDown,
  History,
  Layers,
  Minus,
  PencilLine,
  Plus,
  Replace,
  Search,
  Star,
  Trash2,
  X,
  ScanBarcode,
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
  missingMacros,
  missingText,
  scaleMacros,
  sumMacros,
  type Food,
  type MealEntryView,
  type MealKey,
  type RankedFood,
} from '@/lib/nutrition/meta';
import {
  COMBO_NAME_MAX,
  COMBO_TOP,
  comboFood,
  comboMacros,
  defaultComboName,
  findCombo,
  itemsFromEntries,
  orderCombos,
  type ComboItem,
  type MealComboView,
} from '@/lib/nutrition/combos';
import {
  deleteMealCombo,
  deleteUserFood,
  markComboUsed,
  saveMealCombo,
  saveUserFood,
  unfavoriteFood,
  type ComboResult,
  type NutritionResult,
} from '@/app/actions/nutrition';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { EASE, toFoodInput, type Origin } from './shared';
import { PhotoCapture } from './photo-panel';
import { BarcodePanel } from './barcode-panel';
import { subcategoriesOf, subcategoryOf } from '@/lib/nutrition/food-subcategory';
import { ErrorLine } from '@/components/error-line';

/*
 * 서버에 닿지 못했을 때(신호 끊김) — 부르기가 던지면 전환 안의 오류가 오류 화면으로 넘어가 영양 화면(열어 둔 음식 창까지)이
 * 통째로 바뀌었다. 실패로 바꿔 알림 한 줄로 보인다(lib/action-offline.ts).
 */
const OFFLINE: NutritionResult = { ok: false, error: OFFLINE_MESSAGE };
const OFFLINE_COMBO: ComboResult = { ok: false, error: OFFLINE_MESSAGE };

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
  (f.source === 'basic' || f.source === 'mfds' || f.source === 'barcode') && !!f.id;
/* 직접 입력 칸을 가리키는 이름 — 펴 둔 줄은 한 번에 하나라 줄 이름과 같은 자리를 쓴다 */
const CUSTOM_KEY = 'custom';
/* 조합 저장 칸도 같다 */
const COMBO_SAVE_KEY = 'combo-save';

/**
 * 창 안의 줄들이 함께 쓰는 것.
 *
 * 줄은 여러 목록(최근·내 음식·분류·검색 결과) 안에 있어서, 펴 둔 줄과 담기를 목록마다
 * 내려 주면 모든 목록이 그 값을 들고 다녀야 한다. 한곳에 두고 줄이 직접 꺼내 쓴다.
 */
type SheetState = {
  meal: MealKey;
  /** 바꾸기 모드 — 고르면 담는 대신 그 자리의 음식을 바꾼다(단추 글 · 아이콘이 바뀐다) */
  replacing: boolean;
  /** 바꾸는 중 — 결과가 올 때까지 다른 줄을 누르지 못한다 */
  busy: boolean;
  /** 펴 둔 줄. 한 번에 하나다 — 다른 줄을 펴면 먼저 것은 접힌다 */
  openKey: string | null;
  toggle: (key: string) => void;
  add: (food: Food, amount: number) => void;
  isFavorite: (food: Food) => boolean;
  toggleFavorite: (food: Food) => void;
};

const SheetContext = createContext<SheetState | null>(null);

/** '닭가슴살로' · '돈가스로' · '김밥으로' — 받침(ㄹ 받침은 '로')에 맞춘 '(으)로' */
function withTo(word: string) {
  /* 끝의 괄호 · 숫자는 건너뛰고 마지막 한글 글자로 본다 — '닭가슴살(익힌 것)' 은 '것' */
  let final = 0;
  for (let k = word.length - 1; k >= 0; k--) {
    const code = word.charCodeAt(k) - 0xac00;
    if (code >= 0 && code <= 11171) {
      final = code % 28;
      break;
    }
  }
  return `${word}${final === 0 || final === 8 ? '로' : '으로'}`;
}

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
  combos,
  current,
  mfds,
  photo = false,
  onError,
  browseSubs = {},
  popular,
  onAdd,
  replacing = null,
  onReplace,
}: {
  open: boolean;
  meal: MealKey;
  origin: Origin;
  onClose: () => void;
  recent: Food[];
  mine: Food[];
  favorites: string[];
  yesterday: MealEntryView[];
  /** 자주 먹는 조합(lib/nutrition/combos.ts) */
  combos: MealComboView[];
  /** 지금 이 끼니에 담긴 것 — 담는 대로 늘어난다. '이 끼니를 조합으로 저장'이 읽는다 */
  current: MealEntryView[];
  mfds: boolean;
  /** 사진 기록(AI)을 쓸 수 있나 */
  photo?: boolean;
  /** 창이 닫힌 뒤에 끝난 일의 실패 — 영양 화면의 오류 줄로 */
  onError?: (message: string) => void;
  /** 식약처 둘러보기의 분류 → 세부 칸 → 음식 수 */
  browseSubs?: Record<string, Record<string, number>>;
  /** 모든 사람이 가장 많이 담은 음식 — 순위대로 */
  popular: RankedFood[];
  onAdd: (items: { food: Food; amount: number }[]) => Promise<NutritionResult>;
  /**
   * 바꾸기 모드 — 끼니 칸에서 음식 이름(편집 중) · 식단 줄 이름을 눌러 열었을 때. 고르면 담지 않고 그 음식을 바꾸고 창을 닫는다.
   * 조합 · 어제와 같이 · 조합 저장처럼 여럿을 담는 것은 숨긴다.
   */
  replacing?: { name: string } | null;
  onReplace?: (food: Food, amount: number) => Promise<NutritionResult>;
}) {
  const label = mealLabel(meal);
  const [replaceBusy, setReplaceBusy] = useState(false);
  /*
   * 바꾸기는 찾으러 온 것 — 창이 열리면 찾는 칸에 커서를 둔다. 창(dialog)은 열릴 때 닫기 단추에 먼저 초점을 주므로
   * 그 뒤에 옮긴다(autoFocus 는 창이 열리기 전에 돌아 덮인다).
   * 타이머 없이 useLayoutEffect 에서 바로 한다 — 아이폰은 누른 그 순간(손가락 이벤트 안)에 준 초점에만 자판을 올린다.
   * 영양 화면이 바꾸기 창을 flushSync 로 열어, 창(자식 Modal)의 showModal 다음 이 자리까지 누른 손 안에서 돈다(2026-10-03).
   */
  const searchRef = useRef<HTMLInputElement>(null);
  /* 이름으로 본다 — 영양 화면이 다시 그려질 때마다 새 객체가 와서, 객체를 보면 그때마다 커서를 찾는 칸으로 빼앗았다 */
  const replacingName = replacing?.name ?? null;
  useLayoutEffect(() => {
    if (!open || replacingName === null) return;
    searchRef.current?.focus({ preventScroll: true });
  }, [open, replacingName]);
  /* 바코드로 찾기 칸(barcode-panel.tsx)을 폈나 */
  const [scan, setScan] = useState(false);
  /* 바꾸는 중 — 같은 렌더 안의 두 번 누름도 막게 ref 로 먼저 잠근다(화면 표시는 replaceBusy) */
  const replaceLock = useRef(false);
  /* 창을 연 때의 목록 — 담는 동안 순서가 바뀌어 줄이 밀리지 않게(위 설명) */
  const [recentList] = useState(recent);
  const [popularList] = useState(popular);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>(recentList.length > 0 ? 'recent' : 'all');
  /* 모인 순위가 있으면 인기부터 — 무엇을 먹을지 모를 때 남들이 먹는 것이 가장 빠른 답이다 */
  const [category, setCategory] = useState<Category>(
    popularList.length > 0 ? 'popular' : 'all'
  );
  /* 세부 칸 — 분류를 바꾸면 '전체'로 돌아간다 */
  const [sub, setSub] = useState<string>('all');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [favs, setFavs] = useState(() => new Set(favorites));
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  /*
   * 조합은 창을 연 때의 차례로 둔다(최근 목록과 같은 까닭 — 담을 때마다 차례가 바뀌면 줄이 밀린다).
   * 저장 · 지우기만 이 목록에 바로 더하고 뺀다.
   */
  const [comboList, setComboList] = useState(() => orderCombos(combos, meal));
  /* 이 창에서 방금 저장한 조합의 이름 — 저장 줄이 '저장했어요'로 바뀐다 */
  const [savedName, setSavedName] = useState<string | null>(null);
  const currentItems = useMemo(() => itemsFromEntries(current), [current]);
  const savedCurrent = findCombo(comboList, currentItems);

  const q = query.trim();

  /*
   * ── 식약처 검색 — 치다 멈추면 묻는다. 결과에는 어느 낱말의 것인지 붙여 둔다. ──
   *
   * 두 번 묻는다(app/api/nutrition/search). 표준값(품목대표)은 서버에 넣어 둔 것이라 바로 오고,
   * 상품까지 든 결과는 포털을 거쳐 1~13초 뒤에 온다 — 먼저 온 것을 보여 주다가 다 오면 바꿔 끼운다
   * (full). 포털이 끝내 답하지 않으면 먼저 온 것을 그대로 둔다.
   */
  const [remote, setRemote] = useState<{ q: string; foods: Food[]; full: boolean }>({
    q: '',
    foods: [],
    full: true,
  });
  useEffect(() => {
    if (!mfds || !q) return;
    const ctrl = new AbortController();
    const ask = async (part: '' | '&part=reps') => {
      const res = await fetch(
        `/api/nutrition/search?q=${encodeURIComponent(q)}${part}`,
        {
          signal: ctrl.signal,
        }
      );
      const json = (await res.json()) as { foods?: Food[] };
      return Array.isArray(json.foods) ? json.foods : [];
    };
    const timer = window.setTimeout(() => {
      let done = false; // 상품까지 든 결과가 왔다 — 늦게 온 표준값이 덮어쓰지 않는다
      let failed = false; // 그 요청이 실패했다 — 뒤에 온 표준값은 기다림 표시 없이 보인다
      ask('&part=reps')
        .then(
          (foods) =>
            !done &&
            /* 같은 말로 돌아왔을 때 이미 다 와 있던 목록을 표준값만으로 되돌리지 않는다 */
            setRemote((r) =>
              r.q === q && r.full && r.foods.length > 0 ? r : { q, foods, full: failed }
            )
        )
        .catch(() => {});
      ask('')
        .then((foods) => {
          done = true;
          setRemote({ q, foods, full: true });
        })
        .catch(() => {
          if (ctrl.signal.aborted) return;
          failed = true;
          setRemote((r) =>
            r.q === q ? { ...r, full: true } : { q, foods: [], full: true }
          );
        });
    }, 280);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, mfds]);
  const remoteFoods = remote.q === q ? remote.foods : [];
  /* 아직 다 안 왔다 — 아무것도 안 왔거나, 표준값만 오고 상품을 기다리는 중 */
  const remoteLoading = mfds && q !== '' && (remote.q !== q || !remote.full);

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

  /**
   * 바꾸기 — 한 번만(두 번 눌러 두 번 바뀌지 않게). 되면 창을 닫고 안 되면 창 안에 까닭.
   * 받아들였으면 결과(바뀌었나)를, 이미 바꾸는 중이면 null 을 돌려준다.
   */
  function replaceWith(food: Food, amount: number): Promise<boolean> | null {
    if (!onReplace || replaceLock.current) return null;
    replaceLock.current = true;
    setError(null);
    setReplaceBusy(true);
    return onReplace(food, amount).then((res) => {
      replaceLock.current = false;
      setReplaceBusy(false);
      if (res.ok) onClose();
      else setError(`${food.name} — 바꾸지 못했어요. ${res.error}`);
      return res.ok;
    });
  }

  /* 담으면 펴 둔 줄을 접는다. 목록은 그대로 두어, 바로 다음 음식을 고른다 */
  function add(food: Food, amount: number) {
    if (replacing && onReplace) {
      void replaceWith(food, amount);
      return;
    }
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

  /* 조합 담기 — 음식은 다른 음식과 같은 길로 담고, 담은 횟수는 뒤에서 센다(실패해도 담기에는 상관없다) */
  function addCombo(combo: MealComboView) {
    track(
      `${combo.name} ${combo.items.length}가지`,
      onAdd(combo.items.map((i) => ({ food: comboFood(i), amount: i.amount })))
    );
    setOpenKey(null);
    startTransition(async () => {
      await orOffline(markComboUsed(combo.id), OFFLINE);
    });
  }

  async function saveCombo(name: string, items: ComboItem[]) {
    setError(null);
    const res = await orOffline(saveMealCombo({ name, meal, items }), OFFLINE_COMBO);
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    setComboList((list) =>
      list.some((c) => c.id === res.id)
        ? list
        : [...list, { id: res.id, name, meal, items, useCount: 0 }]
    );
    setSavedName(name);
    setOpenKey(null);
    return true;
  }

  function removeCombo(combo: MealComboView) {
    setComboList((list) => list.filter((c) => c.id !== combo.id));
    startTransition(async () => {
      const res = await orOffline(deleteMealCombo(combo.id), OFFLINE);
      if (!res.ok) {
        setComboList((list) =>
          list.some((c) => c.id === combo.id) ? list : [...list, combo]
        );
        setError(res.error);
      }
    });
  }

  /* '담았어요' 줄의 '조합 저장' — 찾는 말을 지우고 맨 위 저장 칸을 편다(그 칸이 제 자리로 굴러 온다) */
  function openSaveCombo() {
    setQuery('');
    setOpenKey(COMBO_SAVE_KEY);
  }
  const canSaveCombo = currentItems.length >= 2 && !savedCurrent;

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
      const res = await orOffline(
        on ? saveUserFood(toFoodInput(food)) : unfavoriteFood(food.source, food.id!),
        OFFLINE
      );
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
      const res = await orOffline(deleteUserFood(id), OFFLINE);
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
    /* 바코드 음식은 바코드째(다음에 같은 바코드를 읽으면 바로 나온다), 나머지는 내 음식으로 */
    const saveMine = () =>
      startTransition(async () => {
        const res = await orOffline(
          saveUserFood(
            toFoodInput(food.source === 'barcode' ? food : { ...food, source: 'mine' })
          ),
          OFFLINE
        );
        if (!res.ok) {
          setError(res.error);
          /* 바꾸기는 저장 전에 창을 닫는다 — 영양 화면에도 남겨야 보인다 */
          onError?.(`${food.name} — 내 음식에 저장하지 못했어요. ${res.error}`);
        }
      });
    if (replacing && onReplace) {
      /* 바뀐 뒤에만 내 음식에 저장 — 두 번 눌러도 · 바꾸기가 실패해도 내 음식이 두 줄 생기지 않게 */
      const done = replaceWith(food, 1);
      if (done && save) void done.then((ok) => ok && saveMine());
      return;
    }
    add(food, 1);
    if (save) saveMine();
  }

  const sheet: SheetState = {
    meal,
    replacing: !!replacing,
    busy: replaceBusy,
    openKey,
    toggle: (key) => setOpenKey((k) => (k === key ? null : key)),
    add,
    isFavorite: (food) => favs.has(favKey(food)),
    toggleFavorite,
  };

  const yesterdayTotal = sumMacros(yesterday.map(entryMacros));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={replacing ? `‘${replacing.name}’ 바꾸기` : `${label} 담기`}
      description={
        replacing
          ? '찾아서 고르면 그 자리에서 바뀌어요. 양은 줄을 펴서 정해요.'
          : undefined
      }
      origin={origin}
    >
      <SheetContext value={sheet}>
        <div className="space-y-4">
          {/* 찾는 칸은 목록을 굴려도 위에 붙어 있다 */}
          <div className="sticky -top-5 z-10 -mx-5 -mt-5 flex gap-2 bg-surface px-5 pb-3 pt-5">
            <label className="relative block min-w-0 flex-1">
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
                ref={searchRef}
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
            {/* 바코드로 찾기(로드맵 8번) — 누르면 찾는 칸 밑에 카메라 · 숫자 칸이 펴진다 */}
            <button
              type="button"
              onClick={() => setScan((v) => !v)}
              aria-expanded={scan}
              aria-label="바코드로 찾기"
              className={`flex w-12 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                scan
                  ? 'border-sky bg-sky-tint text-sky'
                  : 'border-line bg-surface-2 text-muted hover:border-sky hover:text-sky'
              }`}
            >
              <ScanBarcode aria-hidden className="h-5 w-5" />
            </button>
          </div>

          {/* 창이 닫히면 칸을 내려 카메라를 끈다 — 닫힌 창은 그대로 그려 두므로 open 을 같이 본다 */}
          {open && scan && (
            <BarcodePanel
              onClose={() => setScan(false)}
              renderFood={(food) => <FoodRow food={food} index={0} hideNote={false} />}
              renderCustom={(code, name) => (
                <CustomFood
                  key={code}
                  meal={meal}
                  initialName={name}
                  barcode={code}
                  onAdd={addCustom}
                />
              )}
            />
          )}

          {/* 뜨면 그 자리로 굴려 온다 — 목록을 한참 내려가 고른 뒤 실패해도 보이게 */}
          {error && <ErrorLine>{error}</ErrorLine>}

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
              {/* 사진으로 담기(AI) — 찍으면 음식과 양을 알아보고 고른 것만 담는다(photo-panel.tsx) */}
              {photo && !replacing && (
                <PhotoCapture onAdd={(items, label) => track(label, onAdd(items))} />
              )}

              {/* 자주 먹는 조합 — 이 끼니에 저장한 것부터 세 개. 누르면 한 번에 담는다 */}
              {!replacing && comboList.length > 0 && (
                <ul className="space-y-2" aria-label="자주 먹는 조합">
                  {comboList.slice(0, COMBO_TOP).map((c) => (
                    <li key={c.id}>
                      <ComboButton combo={c} onAdd={() => addCombo(c)} />
                    </li>
                  ))}
                </ul>
              )}

              {!replacing && yesterday.length > 0 && (
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

              {replacing ? null : savedName ? (
                <p
                  role="status"
                  className="motion-safe:animate-fade-in flex items-center gap-2 rounded-xl bg-ok/10 px-4 py-3 text-sm text-ok"
                >
                  <Check aria-hidden className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">
                    ‘{savedName}’ 조합으로 저장했어요
                  </span>
                </p>
              ) : (
                canSaveCombo && (
                  <SaveCombo label={label} items={currentItems} onSave={saveCombo} />
                )
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
                  (myFoods.length === 0 && (replacing || comboList.length === 0) ? (
                    <Empty text="자주 먹는 것은 음식을 펴서 ★ 로 여기에 모아 두세요. 직접 만든 음식도, 두 가지 넘게 담은 끼니를 저장한 조합도 여기에 들어와요." />
                  ) : (
                    <div className="space-y-3">
                      {!replacing && comboList.length > 0 && (
                        <section className="space-y-1">
                          <h3 className="px-1 text-xs font-semibold text-muted">
                            조합
                          </h3>
                          <ul className="-mx-2">
                            {comboList.map((c, i) => (
                              <ComboRow
                                key={c.id}
                                combo={c}
                                index={i}
                                onAdd={() => addCombo(c)}
                                onRemove={() => removeCombo(c)}
                              />
                            ))}
                          </ul>
                        </section>
                      )}
                      {myFoods.length > 0 && (
                        <section className="space-y-1">
                          {!replacing && comboList.length > 0 && (
                            <h3 className="px-1 text-xs font-semibold text-muted">
                              음식
                            </h3>
                          )}
                          <FoodList foods={myFoods} onRemove={removeMine} />
                        </section>
                      )}
                    </div>
                  ))}
                {tab === 'all' && (
                  <AllFoods
                    popular={popularList}
                    category={category}
                    onCategory={(next) => {
                      setCategory(next);
                      setSub('all');
                      setOpenKey(null);
                    }}
                    sub={sub}
                    onSub={(next) => {
                      setSub(next);
                      setOpenKey(null);
                    }}
                    browseSubs={browseSubs}
                  />
                )}
              </div>

              <CustomEntry q="" onAdd={addCustom} />
            </>
          )}

          {!replacing && added.length > 0 && (
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
              {canSaveCombo && !savedName && (
                <button
                  type="button"
                  onClick={openSaveCombo}
                  className="motion-safe:animate-fade-in -my-1 inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl px-2.5 text-sm font-medium text-sky transition-colors hover:bg-sky-tint"
                >
                  <BookmarkPlus aria-hidden className="h-4 w-4" />
                  조합 저장
                </button>
              )}
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

/* ─────────────────────────── 조합 ─────────────────────────── */

/* '달걀 · 쌀밥 · 우유' 와 '612kcal · 단백질 31g' */
function comboLines(combo: { items: ComboItem[] }) {
  const m = comboMacros(combo.items);
  return {
    names: combo.items.map((i) => i.name).join(', '),
    totals: `${kcalText(m.kcal)}kcal · 단백질 ${Math.round(m.protein)}g`,
  };
}

/** 창 맨 위의 조합 한 줄 — 누르면 음식 전부를 저장한 양대로 한 번에 담는다('어제와 같이'와 같은 모양) */
function ComboButton({ combo, onAdd }: { combo: MealComboView; onAdd: () => void }) {
  const { names, totals } = comboLines(combo);
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 text-left transition-[color,border-color,background-color,transform] duration-150 hover:border-sky hover:bg-sky-tint/60 motion-safe:active:scale-[0.99]"
    >
      <Layers aria-hidden className="h-4 w-4 shrink-0 text-sky" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">
          {combo.name}
        </span>
        <span className="block truncate text-xs text-muted">{names}</span>
      </span>
      <span className="shrink-0 text-right text-xs tabular-nums text-muted">
        {totals}
      </span>
    </button>
  );
}

/** '내 음식' 탭의 조합 한 줄 — 음식 줄처럼 + 로 담고, 휴지통은 두 번 눌러 지운다 */
function ComboRow({
  combo,
  index,
  onAdd,
  onRemove,
}: {
  combo: MealComboView;
  index: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const { names, totals } = comboLines(combo);
  const [confirm, setConfirm] = useState(false);
  const [flash, setFlash] = useState(0);
  const put = () => {
    onAdd();
    setFlash((n) => n + 1);
  };
  return (
    <li
      className="motion-safe:animate-row-in flex items-center gap-1"
      style={{ '--row': index } as CSSProperties}
    >
      <button
        type="button"
        onClick={put}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-surface-2"
      >
        <Layers aria-hidden className="h-4 w-4 shrink-0 text-sky" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">
            {combo.name}
          </span>
          <span className="block truncate text-xs text-muted">
            {combo.meal ? `${mealLabel(combo.meal)} · ` : ''}
            {names}
          </span>
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted">{totals}</span>
      </button>
      {confirm ? (
        <button
          type="button"
          onClick={onRemove}
          onBlur={() => setConfirm(false)}
          className="min-h-11 shrink-0 rounded-lg bg-danger-bg px-2.5 py-2 text-xs font-semibold text-danger desk:min-h-0"
        >
          지우기
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          aria-label={`${combo.name} 조합 지우기`}
          className="flex h-11 w-11 shrink-0 desk:h-9 desk:w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-bg hover:text-danger"
        >
          <Trash2 aria-hidden className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={put}
        aria-label={`${combo.name} 한 번에 담기`}
        className="relative flex h-11 w-11 shrink-0 desk:h-9 desk:w-9 items-center justify-center rounded-lg text-sky transition-[background-color,transform] duration-150 hover:bg-sky-tint motion-safe:active:scale-90"
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
    </li>
  );
}

/**
 * '이 아침을 조합으로 저장' — 이 끼니에 두 가지 넘게 담겨 있고 같은 조합이 아직 없을 때만 뜬다.
 * 누르면 그 밑에서 이름 칸이 펴진다. 이름은 음식 이름으로 미리 채워 두고, 고치지 않으면 담는 대로 따라 바뀐다.
 */
function SaveCombo({
  label,
  items,
  onSave,
}: {
  label: string;
  items: ComboItem[];
  onSave: (name: string, items: ComboItem[]) => Promise<boolean>;
}) {
  const { openKey, toggle } = useSheet();
  const open = openKey === COMBO_SAVE_KEY;
  /* null = 아직 안 고침 — 기본 이름을 쓴다 */
  const [typed, setTyped] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const name = typed ?? defaultComboName(items);
  const box = useRef<HTMLDivElement>(null);

  /* 편 칸이 창 밖이면(아래 '조합 저장' 단추로 열었을 때) 다 펴진 뒤 그 자리로 굴린다 — 음식 줄과 같은 방식 */
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      box.current?.scrollIntoView({
        block: 'nearest',
        behavior: reduce ? 'auto' : 'smooth',
      });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [open]);

  async function submit() {
    const clean = name.trim();
    if (!clean || pending) return;
    setPending(true);
    const ok = await onSave(clean, items);
    setPending(false);
    if (ok) setTyped(null);
  }

  return (
    <div
      ref={box}
      className={`scroll-mt-20 rounded-xl border border-dashed transition-colors ${
        open ? 'border-sky' : 'border-line-strong hover:border-sky'
      }`}
    >
      <button
        type="button"
        onClick={() => toggle(COMBO_SAVE_KEY)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <BookmarkPlus aria-hidden className="h-4 w-4 shrink-0 text-sky" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">
            이 {label}을 조합으로 저장
          </span>
          <span className="block truncate text-xs text-muted">
            {items.map((i) => i.name).join(', ')} — 다음부터 한 번에 담아요
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${EASE} ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <Expand open={open}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="flex items-center gap-2 px-4 pb-3"
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">조합 이름</span>
            <input
              value={name}
              onChange={(e) => setTyped(e.target.value)}
              maxLength={COMBO_NAME_MAX}
              enterKeyHint="done"
              className="h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-ink transition-colors focus:border-sky focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="h-10 shrink-0 rounded-xl bg-sky px-4 text-sm font-semibold text-white transition-[background-color,opacity] hover:bg-sky-strong disabled:opacity-60"
          >
            {pending ? '저장 중' : '저장'}
          </button>
        </form>
      </Expand>
    </div>
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
  sub,
  onSub,
  browseSubs,
}: {
  popular: RankedFood[];
  category: Category;
  onCategory: (c: Category) => void;
  /** 세부 칸(food-subcategory.ts) — 'all' 이면 그 분류 전부 */
  sub: string;
  onSub: (key: string) => void;
  browseSubs: Record<string, Record<string, number>>;
}) {
  const shown =
    category === 'popular' ? [] : category === 'all' ? FOOD_CATEGORIES : [category];
  const picked = category !== 'popular' && category !== 'all' ? category : null;
  /* 세부 칸 고르기 — 기본 음식 + 식약처 음식 수를 달고, 빈 칸은 숨긴다 */
  const subs = picked
    ? subcategoriesOf(picked)
        .map((s) => ({
          ...s,
          count:
            (FOODS_BY_CATEGORY.get(picked) ?? []).filter(
              (f) => subcategoryOf(picked, f.name) === s.key
            ).length + (browseSubs[picked]?.[s.key] ?? 0),
        }))
        .filter((s) => s.count > 0)
    : [];
  const subTotal = subs.reduce((a, s) => a + s.count, 0);
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
      {/*
        세부 칸 — 분류 하나에 음식이 수백~천 가지라(반찬 1천 넘게) 한 번 더 좁힌다(2026-10-02 사용자).
        분류 고르개보다 한 단 작은 알약이라 위계가 보인다. 고르면 기본 음식 · 식약처 목록이 함께 좁혀진다.
      */}
      {picked && subs.length > 1 && (
        <div
          key={picked}
          role="tablist"
          aria-label={`${picked} 세부 분류`}
          className="motion-safe:animate-fade-in -mt-1 flex flex-wrap gap-1.5"
        >
          {[{ key: 'all', label: '전체', count: subTotal }, ...subs].map((s) => {
            const on = sub === s.key;
            return (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onSub(s.key)}
                className={`inline-flex min-h-10 items-center gap-1 rounded-full border px-3 text-xs transition-colors desk:min-h-8 ${
                  on
                    ? 'border-sky bg-sky-tint font-semibold text-sky-strong'
                    : 'border-line text-muted hover:border-sky hover:text-ink'
                }`}
              >
                {s.label}
                <span className="tabular-nums opacity-60">
                  {s.count.toLocaleString('ko-KR')}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {/* 분류 · 세부 칸을 바꿀 때마다 목록을 새로 그려, 줄이 위에서부터 다시 들어온다 */}
      <div key={`${category}-${sub}`} className="space-y-4">
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
          const foods = (FOODS_BY_CATEGORY.get(c) ?? []).filter(
            (f) => !picked || sub === 'all' || subcategoryOf(c, f.name) === sub
          );
          if (foods.length === 0) return null;
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
        {/* 식약처 음식 — 검색하지 않아도 전체 · 분류에서 내려가며 본다(앱에 넣어 둔 품목대표) */}
        {category !== 'popular' && (
          <MfdsBrowse category={category} sub={picked && sub !== 'all' ? sub : null} />
        )}
      </div>
    </div>
  );
}

/**
 * 식약처 품목대표 둘러보기 — 기본 음식 밑에 이어진다(app/api/nutrition/browse, 분류는 lib/nutrition/mfds-category.ts).
 *
 * 6천 줄이 넘어 한 번에 그리지 않는다. 40줄씩 받고, 목록 끝이 화면에 가까워지면(아래 400px 앞) 다음 40줄을 묻는다.
 * 받은 쪽마다 FoodList 하나라, 줄이 들어오는 움직임이 쪽마다 처음부터 시작한다(뒤쪽 줄이 한참 늦게 뜨지 않게).
 * 전체에서는 분류가 바뀌는 자리에 작은 제목을 단다.
 */
type BrowseItem = { food: Food; category: FoodCategory };
type BrowsePageData = { items: BrowseItem[]; total: number; next: number | null };

async function fetchBrowse(
  category: FoodCategory | 'all',
  offset: number,
  sub: string | null,
  signal?: AbortSignal
): Promise<BrowsePageData> {
  const res = await fetch(
    `/api/nutrition/browse?cat=${encodeURIComponent(category)}&offset=${offset}${
      sub ? `&sub=${encodeURIComponent(sub)}` : ''
    }`,
    { signal }
  );
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as BrowsePageData;
}

/**
 * 받은 쪽들을 그릴 덩이로 — 쪽마다 따로(줄이 들어오는 움직임이 쪽마다 처음부터), 전체에서는 분류가 바뀌는 자리에서도 끊고
 * 그 덩이에 분류 제목을 단다(앞 덩이와 같은 분류면 안 단다).
 */
function browseBlocks(pages: BrowseItem[][], byCategory: boolean) {
  const blocks: {
    key: string;
    category: FoodCategory;
    foods: Food[];
    heading: boolean;
  }[] = [];
  let prev: FoodCategory | null = null;
  pages.forEach((page, i) => {
    let current: (typeof blocks)[number] | null = null;
    page.forEach((it, j) => {
      if (!current || (byCategory && it.category !== current.category)) {
        current = {
          key: `${i}-${j}`,
          category: it.category,
          foods: [],
          heading: byCategory && it.category !== prev,
        };
        blocks.push(current);
      }
      current.foods.push(it.food);
      prev = it.category;
    });
  });
  return blocks;
}

function MfdsBrowse({
  category,
  sub,
}: {
  category: FoodCategory | 'all';
  /** 세부 칸 — null 이면 그 분류 전부 */
  sub: string | null;
}) {
  const [pages, setPages] = useState<BrowseItem[][]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [next, setNext] = useState<number | null>(null);
  /* 처음 쪽은 칸을 열자마자(아래 effect) — 그동안은 받는 중 */
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const busy = useRef(true);
  const end = useRef<HTMLDivElement>(null);

  const take = useCallback((page: BrowsePageData) => {
    setPages((p) => [...p, page.items]);
    setTotal(page.total);
    setNext(page.next);
  }, []);

  /* 첫 쪽 — 스크롤을 기다리지 않는다(분류를 고르면 곧바로 식약처 줄까지 보이게) */
  useEffect(() => {
    const ctrl = new AbortController();
    fetchBrowse(category, 0, sub, ctrl.signal)
      .then(take)
      .catch(() => {
        if (!ctrl.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (ctrl.signal.aborted) return;
        busy.current = false;
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [category, sub, take]);

  /** 다음 쪽 — 목록 끝이 가까워지거나 '더 보기' · '다시'를 누르면 */
  const load = useCallback(async () => {
    if (busy.current) return;
    const offset = pages.length === 0 ? 0 : next;
    if (offset === null) return;
    busy.current = true;
    setLoading(true);
    setFailed(false);
    try {
      take(await fetchBrowse(category, offset, sub));
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [category, sub, next, pages.length, take]);

  /* 목록 끝이 가까워지면 다음 쪽 — 창 안을 굴리는 것이라 화면(뷰포트) 기준으로 본다 */
  useEffect(() => {
    const el = end.current;
    if (!el || next === null || failed) return;
    const io = new IntersectionObserver(
      (seen) => {
        if (seen.some((x) => x.isIntersecting)) void load();
      },
      { rootMargin: '400px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [load, next, failed]);

  const blocks = browseBlocks(pages, category === 'all');
  if (total === 0 && !loading && !failed) return null;
  return (
    <section aria-label="식약처 식품영양성분DB" className="space-y-1">
      <h3 className="flex items-baseline gap-1.5 px-1 pt-2 text-xs font-semibold text-ink">
        식약처 식품영양성분DB
        {total !== null && (
          <span className="font-normal text-muted">
            {total.toLocaleString('ko-KR')}
          </span>
        )}
      </h3>
      <p className="px-1 text-xs text-muted">
        조리한 음식 → 가공식품 → 원재료 순이에요. 찾는 게 있으면 위에서 검색하는 게
        빨라요.
      </p>
      {blocks.map((block) => (
        <div key={block.key} className="space-y-1">
          {block.heading && (
            <h4 className="px-1 pt-2 text-xs font-medium text-muted">
              {block.category}
            </h4>
          )}
          <FoodList foods={block.foods} />
        </div>
      ))}
      <div ref={end} aria-hidden className="h-4 w-full" />
      {loading && (
        <div className="motion-safe:animate-fade-in space-y-2 py-1" aria-busy>
          {[0, 1, 2].map((k) => (
            <div
              key={k}
              aria-hidden
              className="h-11 animate-pulse rounded-xl bg-surface-2"
            />
          ))}
        </div>
      )}
      {failed && (
        <p className="flex items-center justify-between gap-2 px-1 text-xs text-muted">
          불러오지 못했어요.
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex min-h-10 items-center rounded-lg px-2 font-semibold text-sky-strong hover:bg-sky-tint"
          >
            다시
          </button>
        </p>
      )}
      {!loading && !failed && next !== null && pages.length > 0 && (
        <button
          type="button"
          onClick={() => void load()}
          className="flex min-h-10 w-full items-center justify-center rounded-xl text-sm font-medium text-sky transition-colors hover:bg-sky-tint"
        >
          더 보기
        </button>
      )}
      {next === null && pages.length > 0 && (
        <p className="px-1 py-2 text-center text-xs text-muted">끝까지 봤어요</p>
      )}
    </section>
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
  const { openKey, toggle, add, replacing, busy } = useSheet();
  const key = rowKey(food);
  const open = openKey === key;
  /* 인기 순위에서 온 음식이면 순위와 횟수가 붙어 있다 */
  const ranked = 'rank' in food ? (food as RankedFood) : null;
  /* 식약처 '수집' 자료는 탄수화물 · 지방이 비어 오는 일이 많다 — 담기 전에 보이게 */
  const missing = missingMacros(food);
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
    /* 바꾸기는 결과를 기다린다 — 되면 창이 닫히고, 안 되면 오류 줄이 뜬다(✓ 를 먼저 띄우면 된 것처럼 보였다) */
    if (!replacing) setFlash((n) => n + 1);
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
              {missing.length > 0 ? ` · ${missingText(missing)}` : ''}
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
              className="min-h-11 shrink-0 rounded-lg bg-danger-bg px-2.5 py-2 text-xs font-semibold text-danger desk:min-h-0"
            >
              지우기
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              aria-label={`${food.name} 내 음식에서 지우기`}
              className="flex h-11 w-11 shrink-0 desk:h-9 desk:w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-bg hover:text-danger"
            >
              <Trash2 aria-hidden className="h-4 w-4" />
            </button>
          ))}
        {/* 담기 · 지우기는 휴대폰에서 44px — 36px 는 옆 줄 · 옆 단추를 잘못 눌렀다(PC 는 그대로, 2026-10-03) */}
        <button
          type="button"
          onClick={() => put(1)}
          disabled={replacing && busy}
          aria-label={
            replacing ? `${withTo(food.name)} 바꾸기` : `${food.name} 1인분 담기`
          }
          className="relative flex h-11 w-11 shrink-0 desk:h-9 desk:w-9 items-center justify-center rounded-lg text-sky transition-[background-color,transform,opacity] duration-150 hover:bg-sky-tint disabled:opacity-40 motion-safe:active:scale-90"
        >
          {flash > 0 ? (
            <Check
              key={flash}
              aria-hidden
              className="motion-safe:animate-fade-in h-4 w-4 text-ok"
            />
          ) : replacing ? (
            <Replace aria-hidden className="h-4 w-4" />
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
  /* 표준값이 먼저 와 있으면 그 밑에서 상품을 기다린다 — 줄 수를 줄여 '더 오는 중'으로 읽히게 */
  const waiting = remote.length > 0 ? [0, 1] : [0, 1, 2];
  return (
    <div className="space-y-4">
      {local.length > 0 && <FoodList foods={local} />}

      {mfds && (remoteLoading || remote.length > 0) && (
        <section className="space-y-1" aria-busy={remoteLoading}>
          <h3 className="px-1 text-xs font-semibold text-muted">
            식약처 식품영양성분DB
          </h3>
          {remote.length > 0 && <FoodList foods={remote} />}
          {remoteLoading && (
            <div className="motion-safe:animate-fade-in space-y-2 py-1">
              {remote.length > 0 && (
                <p role="status" className="px-1 text-[11px] text-muted/80">
                  상품을 더 찾는 중…
                </p>
              )}
              {waiting.map((i) => (
                <div
                  key={i}
                  aria-hidden
                  className="h-11 animate-pulse rounded-xl bg-surface-2"
                />
              ))}
            </div>
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

/* − 는 0.25 밑의 양(그램으로 적은 0.1인분 등)을 늘리지 않는다 — 예전에는 0.1 에서 − 를 누르면 0.25 로 커졌다 */
function stepAmount(amount: number, dir: 1 | -1) {
  const size = amount < 1 || (amount === 1 && dir === -1) ? 0.25 : 0.5;
  const next = Math.round((amount + dir * size) / size) * size;
  const floor = dir === -1 ? Math.min(amount, 0.25) : 0.25;
  return Math.min(AMOUNT_MAX, Math.max(floor, next));
}

const round20 = (n: number) => Math.round(n * 20) / 20;

/**
 * 누른 줄 밑에서 펴지는 양 고르기.
 *
 * 이름은 바로 위 줄에 있어서 다시 적지 않는다. 1인분이 얼마인지·어디 자료인지와
 * 내 음식 단추를 한 줄에 두고, 그 밑에 양과 담기를 둔다.
 */
function PickFood({ food, onAdd }: { food: Food; onAdd: (amount: number) => void }) {
  const { meal, isFavorite, toggleFavorite, replacing, busy } = useSheet();
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
    /* '72,5' 처럼 쉼표 소수점도 점으로 — 그냥 지우면 725 가 됐다(2026-10-03) */
    const clean = text.replace(/,/g, '.').replace(/[^\d.]/g, '');
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
          <dd className="text-sm font-semibold text-ink">
            {food.carbs === null ? (
              <span className="text-muted">정보 없음</span>
            ) : (
              `${gramText(got.carbs)}g`
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">단백질</dt>
          <dd className="text-sm font-semibold text-ink">
            {food.protein === null ? (
              <span className="text-muted">정보 없음</span>
            ) : (
              `${gramText(got.protein)}g`
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">지방</dt>
          <dd className="text-sm font-semibold text-ink">
            {food.fat === null ? (
              <span className="text-muted">정보 없음</span>
            ) : (
              `${gramText(got.fat)}g`
            )}
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() => onAdd(amount)}
        disabled={replacing && busy}
        className="w-full rounded-xl bg-sky py-3 text-sm font-semibold text-white transition-[background-color,opacity] hover:bg-sky-strong disabled:opacity-60"
      >
        {replacing
          ? busy
            ? '바꾸는 중…'
            : `${withTo(food.name)} 바꾸기`
          : `${mealLabel(meal)}에 담기`}
      </button>
    </div>
  );
}

/* ─────────────────────────── 직접 입력 ─────────────────────────── */

function CustomFood({
  meal,
  initialName,
  onAdd,
  barcode = null,
}: {
  meal: MealKey;
  initialName: string;
  onAdd: (food: Food, save: boolean) => void;
  /** 바코드로 못 찾은 제품 — 적은 것을 바코드째 저장해(기본으로 켬) 다음부터 읽자마자 나오게 */
  barcode?: string | null;
}) {
  const { replacing } = useSheet();
  const [name, setName] = useState(initialName);
  const [serving, setServing] = useState('');
  const [kcal, setKcal] = useState('');
  const [carbs, setCarbs] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [save, setSave] = useState(barcode !== null);
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
        source: barcode ? 'barcode' : 'free',
        id: barcode,
        name: name.trim(),
        servingLabel: serving.trim() || (barcode ? '1개' : '1인분'),
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
          <span className="text-xs font-medium text-muted">
            {barcode ? '1회 양 (선택)' : '먹은 양 (선택)'}
          </span>
          <input
            value={serving}
            onChange={(e) => setServing(e.target.value)}
            maxLength={40}
            placeholder={barcode ? '1봉지 · 1개(54g)' : '1인분'}
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
              onChange={(e) =>
                f.set(e.target.value.replace(/,/g, '.').replace(/[^\d.]/g, ''))
              }
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
        {barcode
          ? '이 바코드로 저장해 다음부터 바로 찾기'
          : '내 음식에 저장해 다음에도 쓰기'}
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
        {replacing ? '이 음식으로 바꾸기' : `${mealLabel(meal)}에 담기`}
      </button>
    </form>
  );
}
