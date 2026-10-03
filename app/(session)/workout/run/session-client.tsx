'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';
import {
  ArrowLeftRight,
  ChartLine,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Delete,
  Info,
  ListOrdered,
  Pencil,
  Plus,
  RotateCcw,
  Star,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import { LibraryVideo } from '@/components/library-video';
import { ExerciseHistoryPanel } from '@/components/exercise-history';
import { useWakeLock } from '@/components/use-wake-lock';
import { useAlarm } from '@/components/use-alarm';
import { buzz } from '@/lib/haptics';
import { nativeCancelAlarm, nativeScheduleAlarm } from '@/lib/native-bridge';
import { newRecord } from '@/lib/workout/bests';
import {
  deleteSet,
  finishWorkout,
  logSet,
  reorderSession,
  type SavedSet,
} from '@/app/actions/workout';
import { setExerciseFavorite } from '@/app/actions/favorite';
import { ExerciseNote } from './exercise-note';
import { ExerciseSheet } from './exercise-sheet';
import { FinishSheet } from './finish-sheet';
import { SwapSheet } from './swap-sheet';
import { drainOutbox, outbox, withPending, type ShownSet } from '@/lib/workout/outbox';
import { placeExercise } from '@/lib/workout/swap';
import { REST_CLOCK_LIMIT_SECONDS, restSeconds } from '@/lib/workout/rest';
import {
  formatWeight,
  fromWeight,
  readWeightUnit,
  round1,
  serverWeightUnit,
  subscribeUnits,
  toWeight,
} from '@/lib/units';
import {
  AMOUNT_LIMITS,
  WEIGHT_STEP,
  formatSeconds,
  storedKg,
} from '@/lib/exercise-meta';
import type { RunExercise } from '@/lib/workout/run-exercises';

/**
 * 운동하는 동안의 화면.
 *
 * ■ 화면을 둘로 못박는다
 *
 * 위쪽은 보는 곳, 아래쪽은 누르는 곳이다. 헬스장에서는 한 손에 기구를 들고
 * 엄지로만 누르게 되므로, 누를 것이 위아래로 흩어져 있으면 쓸 수가 없다.
 * 아래 단추는 전부 72px 다.
 *
 * ■ 숫자는 앱이 그린 판으로 받는다
 *
 * 폰 기본 키보드를 띄우면 화면 절반이 덮이고, 닫고 여는 데만 두 번씩 더
 * 눌러야 한다. 무게와 횟수만 넣으면 되므로 숫자판을 직접 그린다.
 *
 * ■ 미리 채우지 않는다
 *
 * 처방이 3세트 10회라고 해서 10을 넣어 두지 않는다. 눌러서 넘어가기는
 * 편하지만 실제로 한 것과 다른 숫자가 그대로 저장되고, 그 숫자로 운동 부하를
 * 잰다. 대신 '지난번 그대로'를 한 번 눌러 담을 수 있게 둔다 — 그건 사용자가
 * 고른 것이다.
 *
 * ■ 서버 값이 입력 중인 숫자를 덮지 않는다
 *
 * 세트를 저장해도 화면을 다시 그리지 않는다. 트레이닝 목록 화면은 서버가
 * 다시 그릴 때마다 입력값이 통째로 갈리는 구조인데(exercise-list.tsx), 그
 * 방식을 여기로 가져오지 않는다.
 */

export type RunSet = SavedSet;

/*
 * 운동 하나의 모양은 서버와 같이 쓴다 — 운동 화면을 열 때와 운동 중에 바꿔
 * 넣은 운동을 돌려받을 때 같은 곳에서 만든다(lib/workout/run-exercises.ts).
 */
export type { RunExercise };

/* ----------------------------- 휴식 시계 ----------------------------- */

/**
 * 마지막 세트로부터 흐른 시간.
 *
 * 정해 둔 시간에서 거꾸로 내려가지 않는다. 얼마나 쉬었는지를 보는 것이
 * 요점이라 '끝'이 없다. 처방에 쉬는 시간이 있으면 그만큼에서 링이 다 차고 한 번
 * 알릴 뿐, 시계는 그 뒤로도 올라간다(RestPill, 2026-10-01 '감성'). 다만 10분이
 * 넘으면 시계를 거둔다 — [운동 종료]를 안 누르고 떠난 판에서 끝없이 올라가지
 * 않게(lib/workout/rest.ts).
 *
 * 흘러가는 숫자를 들고 있지 않고 '마지막 세트 시각' 하나만 둔다. 화면이
 * 꺼졌다 켜져도, 앱을 나갔다 들어와도 쉰 시간이 정확하다.
 */
function useRestClock(since: string | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!since) return;
    const start = Date.parse(since);
    /*
     * 여기서 곧바로 setNow 를 부르지 않는다 — 효과 안에서 바로 상태를 바꾸면
     * 그릴 때마다 연쇄로 다시 그린다(린트가 잡는다). 부를 필요도 없다.
     * 새 세트를 남긴 직후에는 now 가 since 보다 앞서 있어 아래 뺄셈이 음수가
     * 되고, Math.max 가 0 으로 잘라 곧바로 0:00 이 보인다.
     */
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      /* 10분이 넘어 시계를 거뒀으면 더 셀 것이 없다 — 1초마다 다시 그리지 않게 멈춘다 */
      if (t - start >= REST_CLOCK_LIMIT_SECONDS * 1000) clearInterval(id);
    }, 1000);
    /* 화면을 다시 켜면 곧바로 맞춘다 — 꺼진 동안 타이머가 멈췄을 수 있다 */
    const wake = () => setNow(Date.now());
    document.addEventListener('visibilitychange', wake);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [since]);

  /* 10분이 넘으면 null — 화면에서 시계가 사라진다 */
  return restSeconds(since, now);
}

function clockText(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 쉬는 시간 끝 앱 알림의 이름 — 같은 이름으로 걸면 앞의 것을 바꾼다(lib/native-bridge.ts) */
const REST_ALARM_ID = 'workout-rest';

/** 지금 보던 운동을 이 판 번호로 적어 두는 곳(sessionStorage) — 아래 at 설명 */
const atKey = (sessionId: string) => `bullpen-workout-at:${sessionId}`;

/** 링 한 바퀴의 길이 — 반지름 9 */
const RING = 2 * Math.PI * 9;
const subscribeNothing = () => () => {};

/**
 * 쉬는 시간 알약 — 링 · 쉰 시간 · 목표. 아이폰의 실시간 현황(라이브 액티비티) 알약처럼(2026-10-01 '감성').
 *
 * 처방에 쉬는 시간(target)이 있으면 링이 그만큼에서 다 차고, 다 차면 링이 파란 체크가 되며 넘은 만큼을
 * '+0:12'로 보인다 — 시계는 멈추지 않는다. 처방이 없으면 링 없이 시계만.
 *
 * 화면을 다 그린 뒤에만 그린다. 시계라 서버가 그린 초와 폰이 처음 그린 초가 달라 맞추기(hydration)가
 * 어긋난다 — 그사이 자리만 비워 둔다.
 */
function RestPill({ seconds, target }: { seconds: number; target: number | null }) {
  const client = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false
  );
  if (!client) return <div aria-hidden className="h-10" />;

  const over = target != null && seconds >= target;
  const frac = target ? Math.min(1, seconds / target) : 0;
  return (
    <div
      role="timer"
      aria-label={`쉰 시간 ${clockText(seconds)}${target != null ? `, 쉬는 시간 ${clockText(target)}` : ''}`}
      className={`mx-auto flex h-10 w-fit items-center gap-2 rounded-full pr-4 pl-1.5 transition-colors duration-300 ${
        over ? 'bg-sky/12' : 'bg-ink/6'
      }`}
    >
      {target == null ? (
        <Timer aria-hidden className="ml-1 h-5 w-5 text-muted" />
      ) : over ? (
        <span
          aria-hidden
          className="finish-pop grid h-7 w-7 place-items-center rounded-full bg-sky text-white"
        >
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>
      ) : (
        <svg aria-hidden viewBox="0 0 24 24" className="h-7 w-7 -rotate-90">
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            strokeWidth="3"
            className="stroke-ink/12"
          />
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            className="stroke-sky transition-[stroke-dashoffset] duration-1000 ease-linear"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - frac)}
          />
        </svg>
      )}
      <span className="text-numeric text-lg leading-none text-ink">
        {clockText(seconds)}
      </span>
      <span className={`text-xs ${over ? 'font-semibold text-sky' : 'text-muted'}`}>
        {target == null
          ? '쉬는 중'
          : over
            ? `쉬기 끝 · +${clockText(seconds - target)}`
            : `/ ${clockText(target)}`}
      </span>
    </div>
  );
}

/**
 * 처방 세트 수만큼의 점 — 남긴 세트만큼 파랗게 찬다(칠해지는 순간 톡 커진다). 다 차면 '다 했어요'.
 * 처방보다 더 하면 점이 늘어난다 — 더 한 것도 한 것이다. 암케어 따라하기의 점과 같은 모양.
 */
function SetDots({ planned, done }: { planned: number; done: number }) {
  const total = Math.max(planned, done);
  return (
    <div className="mt-3 flex items-center gap-2.5">
      <span className="flex flex-wrap gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            /* 칠해지는 순간 새로 그려져 한 번 톡 커진다(finish-pop) */
            key={`${i}-${i < done}`}
            className={`h-2.5 w-2.5 rounded-full ${i < done ? 'finish-pop bg-sky' : 'bg-ink/15'}`}
          />
        ))}
      </span>
      {done >= planned ? (
        <span className="finish-pop inline-flex items-center gap-1 text-xs font-semibold text-sky">
          <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
          {planned}세트 다 했어요
        </span>
      ) : (
        <span className="text-xs tabular-nums text-muted">
          {planned}세트 중 {done}세트
        </span>
      )}
    </div>
  );
}

/* ----------------------------- 숫자판 ----------------------------- */

const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'] as const;

function NumberPad({
  onChange,
  allowDecimal,
}: {
  /**
   * 지금 값을 받아 다음 값을 돌려주는 꼴로 넘긴다.
   *
   * 값을 그대로 받아 쓰면 빠르게 두 번 누를 때 한 자리를 잃는다 — 두 번째
   * 누름이 아직 반영되지 않은 옛 값을 보기 때문이다. '60'을 치려다 '0'이
   * 된다. 헬스장에서 숫자를 후딱 치는 자리라 실제로 일어난다.
   */
  onChange: (update: (prev: string) => string) => void;
  allowDecimal: boolean;
}) {
  const press = (key: string) => {
    onChange((prev) => {
      if (key === '.') {
        if (!allowDecimal || prev.includes('.')) return prev;
        return (prev === '' ? '0' : prev) + '.';
      }
      /* 소수점 아래 한 자리까지. 0.5kg 자리를 담으면 충분하다. */
      const dot = prev.indexOf('.');
      if (dot >= 0 && prev.length - dot > 1) return prev;
      if (prev.replace('.', '').length >= 5) return prev;
      return prev === '0' ? key : prev + key;
    });
  };

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {PAD_KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => press(k)}
          disabled={k === '.' && !allowDecimal}
          /* 낮은 화면(아이폰 SE)은 한 칸 40px — 판 · 무게 · 횟수 · [세트 완료]가 한 화면에 들어오게 */
          className="h-12 rounded-xl bg-raised text-xl font-medium text-ink shadow-[0_1px_0_rgb(0_0_0/0.14)] transition active:bg-ink/10 disabled:opacity-25 short:h-10 motion-safe:active:scale-95"
        >
          {k}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange((prev) => prev.slice(0, -1))}
        aria-label="한 글자 지우기"
        className="flex h-12 items-center justify-center rounded-xl text-ink transition active:bg-ink/10 short:h-10 motion-safe:active:scale-95"
      >
        <Delete className="h-5 w-5" />
      </button>
    </div>
  );
}

/* ----------------------------- 본체 ----------------------------- */

export function SessionClient({
  sessionId,
  themeLabel,
  exercises,
  initialSets,
  openedAt,
  priorSeconds,
}: {
  /** 이 판의 번호. 폰에 담아 두는 세트가 다른 판으로 새지 않게 붙여 둔다. */
  sessionId: string;
  themeLabel: string;
  exercises: RunExercise[];
  initialSets: RunSet[];
  /** 이 판을 연 시각. 휴식 시계는 이 뒤에 남긴 세트만 센다. */
  openedAt: string;
  /** 다시 연 판이면 앞서 마친 구간들의 운동 시간(초). 처음이면 0. */
  priorSeconds: number;
}) {
  const router = useRouter();
  /* 서버에 저장이 끝난 세트. 서버가 돌려준 것만 넣는다. */
  const [saved, setSaved] = useState<RunSet[]>(initialSets);
  /*
   * 폰에만 있고 아직 못 보낸 세트 (lib/workout/outbox.ts).
   *
   * 화면에는 둘을 합쳐 보여준다. 신호가 없어도 방금 남긴 세트가 바로 보이고,
   * 휴식 시계도 누른 그 순간부터 흐른다 — 헬스장에서 신호를 기다리게 할 수는
   * 없다.
   */
  const allPending = useSyncExternalStore(
    outbox.subscribe,
    outbox.snapshot,
    outbox.serverSnapshot
  );
  const pending = useMemo(
    () => allPending.filter((p) => p.sessionId === sessionId),
    [allPending, sessionId]
  );
  /* 같은 세트가 양쪽에 있으면 폰 쪽이 이긴다 — 고친 값이 신호 없이도 보인다 */
  const sets = useMemo(() => withPending(saved, pending), [saved, pending]);
  /** 마지막으로 보내려다 신호가 없어 멈췄는가 — 알림 문구가 달라진다 */
  const [offline, setOffline] = useState(false);
  /*
   * 목록을 상태로 들고 있는다.
   *
   * 세션 중에 순서를 바꾸거나 뺄 수 있기 때문이다. 서버가 다시 그리지 않으므로
   * (세트 저장이 화면을 안 건드린다) 처음 받은 것에서 출발해 여기서만 고친다.
   */
  const [list, setList] = useState<RunExercise[]>(exercises);
  /*
   * 지금 보는 운동(목록의 몇 번째).
   *
   * 폰에도 적어 둔다(sessionStorage, 이 판 번호로). 아이폰은 다른 앱에 오래 있거나 메모리가 모자라면 이 화면을
   * 통째로 다시 불러오는데, 그러면 0 에서 시작해 다섯 번째 운동을 하던 사람이 첫 운동으로 튕겼다(2026-10-03
   * 점검). 세트는 서버 · 폰에 남아 있으니 보던 자리만 되찾으면 된다. 번호가 아니라 운동 id 로 적는다 — 그사이
   * 순서를 바꿨어도 같은 운동으로 돌아간다. 처음 그림은 서버와 같아야 해서(맞추기) 그린 뒤에 되찾는다(아래 효과).
   */
  const [at, setAt] = useState(0);
  /*
   * 운동별 내 메모 (운동 id → 메모).
   *
   * 처음 받은 것에서 출발해 여기서 고친다. 저장해도 서버가 화면을 다시
   * 그리지 않기 때문이다 (app/actions/exercise-note.ts).
   */
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(exercises.flatMap((e) => (e.note ? [[e.id, e.note]] : [])))
  );
  /*
   * 별을 달아 둔 운동. 라이브러리의 별과 같은 표다 — 여기서 달면 라이브러리와
   * 트레이닝의 '운동 추가' 창에도 달려 있다.
   */
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(
    () => new Set(exercises.filter((e) => e.favorite).map((e) => e.id))
  );
  const [starring, startStarring] = useTransition();
  /* 운동 교체 창 (swap-sheet.tsx) */
  const [swap, setSwap] = useState(false);

  const [sheet, setSheet] = useState(false);
  /*
   * 종료 요약.
   *
   * [운동 종료]가 곧장 끝내지 않는다. 한 시간을 쓰고 나서 남는 것이 체크
   * 표시뿐이면 그 한 시간이 숫자로 안 남고, 체감 강도를 받을 자리도 사라진다.
   */
  const [finish, setFinish] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  /*
   * 숫자판은 누를 때만 올린다.
   *
   * 처음에는 늘 펴 두었는데, 화면 아래 절반을 자판이 차지해 정작 보아야 할
   * 것(방금 남긴 세트, 쉰 시간)이 밀려났다. 한 세트에 숫자를 넣는 것은 한
   * 번뿐이고 나머지 시간에는 보기만 한다.
   *
   * 폰 기본 키보드를 쓰지 않는 이유는, 열렸을 때 오히려 더 많이 가리고(화면
   * 40~50%) iOS 에서 키보드가 올라온 채로 아래 단추를 누르면 첫 번째 탭이
   * 키보드 닫기로 먹히는 일이 있어서다.
   */
  const [pad, setPad] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  /*
   * 무게를 어떤 단위로 보여줄지. 저장은 언제나 kg 이다(lib/units.ts).
   *
   * 여기서만 바꾸면 되는 이유: 화면이 들고 있는 weight 는 '사람이 적은 값'이고,
   * 서버로 나갈 때 한 번만 kg 으로 바꾼다. 중간에 섞이면 세트마다 단위가 달라진다.
   */
  const wUnit = useSyncExternalStore(subscribeUnits, readWeightUnit, serverWeightUnit);
  const [weight, setWeight] = useState('');
  const [count, setCount] = useState('');
  const [field, setField] = useState<'weight' | 'count'>(
    exercises[0].needsWeight ? 'weight' : 'count'
  );
  const [error, setError] = useState<string | null>(null);
  /*
   * 고치는 중인 세트.
   *
   * 완료한 세트 줄을 누르면 그 세트의 무게·횟수가 아래 칸에 채워지고, 큰
   * 단추가 'N세트 고치기'가 된다. 같은 번호로 다시 담아 보내면 서버가 그 줄을
   * 덮어쓴다(app/actions/workout.ts 의 logSet) — 새로 만들 것이 없고, 신호가
   * 없을 때 폰에 담아 두는 것도 새 세트와 똑같이 된다.
   *
   * 마친 시각은 그 세트의 것을 그대로 보낸다. 고친 시각으로 바꾸면 휴식 시계가
   * 0 으로 돌아가고, 세트 순서와 '마지막으로 운동한 때'까지 틀어진다.
   *
   * 누르기 전에 칸에 넣고 있던 값(draft)을 들고 있다가, 고치기를 마치거나
   * 그만두면 되돌려 놓는다. 다음 세트 무게를 넣어 둔 채 앞 세트를 고쳐도 그
   * 무게를 다시 넣지 않아도 된다.
   */
  const [editing, setEditing] = useState<{
    setNo: number;
    recordedAt: string;
    draft: { weight: string; count: string; field: 'weight' | 'count' };
  } | null>(null);
  /*
   * 자세 설명을 펼쳐 둘지.
   *
   * 운동을 옮겨도 그대로 둔다. 한 번 펼친 사람은 다음 운동에서도 보고 싶어
   * 하는 것이 자연스럽다 — 운동마다 다시 누르게 하면 결국 안 보게 된다.
   */
  const [showForm, setShowForm] = useState(false);
  /* 내 기록을 펼쳐 둘지 — 자세 설명과 같은 까닭으로 운동을 옮겨도 그대로 둔다 */
  const [showHistory, setShowHistory] = useState(false);
  const [saving, startSaving] = useTransition();
  const [ending, startEnding] = useTransition();
  const topRef = useRef<HTMLDivElement>(null);

  /*
   * 다시 불러온 화면이면 보던 운동으로 — 적기(아래)보다 먼저 읽는다(효과는 적은 차례로 돈다). 처음 한 번만:
   * 그 뒤로는 목록(list)이 처음 받은 것(exercises)과 달라질 수 있어 번호가 어긋난다.
   */
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(atKey(sessionId));
    } catch {
      return;
    }
    const i = id ? exercises.findIndex((e) => e.id === id) : -1;
    if (i <= 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 폰에 적어 둔 자리를 한 번 되찾는다(맞추기 뒤라 효과에서)
    setAt(i);
    setField(exercises[i].needsWeight ? 'weight' : 'count');
  }, [sessionId, exercises]);

  const ex = list[at];
  useEffect(() => {
    try {
      sessionStorage.setItem(atKey(sessionId), ex.id);
    } catch {
      /* 못 적어도 이번 화면은 그대로 — 다시 불러오면 첫 운동부터일 뿐 */
    }
  }, [sessionId, ex.id]);
  /* 자세 설명이나 영상이 있는 운동인가 — 없으면 [내 기록]이 한 줄을 다 쓴다 */
  const hasForm = Boolean(ex.description || ex.videoPath || ex.referenceVideoId);
  /* 시간형 운동의 칸 이름 — 유산소는 '운동 시간', 버티기는 '버틴 시간' */
  const timeLabel = ex.inMinutes ? '운동 시간' : '버틴 시간';
  const mine = useMemo(
    () => sets.filter((s) => s.exerciseId === ex.id).sort((a, b) => a.setNo - b.setNo),
    [sets, ex.id]
  );
  /* 고치는 세트가 몇 번째 줄인가. 그사이 지워져 없으면 -1 — 고치는 중이 아니다 */
  const editIndex = editing ? mine.findIndex((s) => s.setNo === editing.setNo) : -1;

  /*
   * 마지막으로 남긴 세트 — 운동과 상관없이 하나. 쉰 시간은 그때부터다.
   *
   * 이 판을 연 뒤에 남긴 것만 본다. 한 번 종료한 판을 다시 열면 아까 남긴
   * 세트가 그대로 있는데, 그것부터 세면 '47분째 쉬는 중'이 떠서 종료가 안
   * 된 것처럼 보인다.
   */
  const lastSet = useMemo(() => {
    const mine = sets.filter((s) => s.recordedAt >= openedAt);
    if (mine.length === 0) return null;
    return mine.reduce((a, b) => (a.recordedAt > b.recordedAt ? a : b));
  }, [sets, openedAt]);
  const lastAt = lastSet?.recordedAt ?? null;
  /*
   * 마지막으로 운동한 때부터 흐른 시간 — 세트를 남겼으면 그 시각부터, 아직이면
   * 판을 연 시각부터. 10분이 넘으면 null 이다(lib/workout/rest.ts).
   */
  const idle = useRestClock(lastAt ?? openedAt);
  /* 쉬는 시계는 세트를 남긴 뒤에만 — 판을 열자마자 '쉬는 중'이 뜨면 이상하다 */
  const rest = lastAt ? idle : null;
  /*
   * 운동하는 동안 화면을 켜 둔다.
   *
   * 세트 사이에 1~3분을 쉬는데 폰은 30초면 잠긴다. 한 세트마다 폰을 깨워
   * 잠금을 풀어야 하고, 무엇보다 휴식 시계가 30초마다 사라지면 띄운 뜻이
   * 없다. 이 화면을 나가면 저절로 풀린다 (components/use-wake-lock.ts).
   *
   * 10분 넘게 아무 세트도 없으면 놓는다 — 휴식 시계를 거두는 때와 같다.
   * [운동 종료]를 안 누르고 화면을 켜 둔 채 떠나면 배터리가 끝까지 닳았다.
   * 놓은 뒤에는 폰이 원래대로 잠기고, 다음 세트를 남기면 다시 잡는다.
   */
  useWakeLock(idle != null);

  /*
   * 쉬는 시간 목표 — 마지막 세트를 한 운동의 처방 휴식. 링이 이만큼에서 다 차고, 다 차는 순간 한 번
   * 떨고 짧게 울린다(useAlarm — 소리는 [세트 완료]를 누를 때 깨워 둔다). 다 찬 뒤 한참 지나 알게 된 것
   * (화면을 다시 켰을 때)은 울리지 않는다 — 늦은 알림은 소음이다.
   */
  const restTarget = lastSet
    ? (list.find((e) => e.id === lastSet.exerciseId)?.restSeconds ?? null)
    : null;
  const { arm, ring } = useAlarm();
  const alarmed = useRef<string | null>(null);
  useEffect(() => {
    if (restTarget == null || rest == null || lastAt == null) return;
    if (rest < restTarget || alarmed.current === lastAt) return;
    alarmed.current = lastAt;
    if (rest - restTarget <= 3) ring('rest');
  }, [rest, restTarget, lastAt, ring]);

  /*
   * 아이폰 앱이면 쉬는 시간이 끝날 시각에 알림도 걸어 둔다 — 폰을 잠그고 주머니에 넣거나 다른 앱에 가 있으면 위의
   * 시계 · 소리가 멈춰, 쉬는 시간이 끝나도 조용했다(2026-10-03 점검). 다음 세트를 남기면(마지막 세트가 바뀌면) 새
   * 시각으로 바꿔 걸고, 세트를 지워 이미 지난 시각이 되거나 화면을 나가면 거둔다. 앱이 앞에 떠 있는 동안에는 알림이
   * 안 뜨고 위의 소리가 알린다. 사파리 · PC 에서는 아무 일도 안 한다(lib/native-bridge.ts).
   */
  const restEndsAt =
    lastAt != null && restTarget != null
      ? Date.parse(lastAt) + restTarget * 1000
      : null;
  useEffect(() => {
    if (restEndsAt == null || restEndsAt <= Date.now()) return;
    nativeScheduleAlarm(
      REST_ALARM_ID,
      restEndsAt,
      '쉬는 시간 끝',
      '다음 세트를 시작할 차례예요'
    );
    return () => {
      nativeCancelAlarm(REST_ALARM_ID);
    };
  }, [restEndsAt]);

  /* 운동마다 남긴 세트 수 — 위 막대의 칸이 이만큼 찬다 */
  const setCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sets) counts.set(s.exerciseId, (counts.get(s.exerciseId) ?? 0) + 1);
    return counts;
  }, [sets]);
  /* 오늘 이 운동에서 지난 최고를 넘은 세트 — 그 줄에 '새 최고'(lib/workout/bests.ts) */
  const record = useMemo(() => newRecord(ex, mine, ex.best), [ex, mine]);

  /*
   * 폰에 담아 둔 세트를 누른 순서대로 하나씩 보낸다.
   *
   * 한 번에 한 줄만 돈다. 보내는 사이에 새 세트가 담기면 끝나기 전에 이어서
   * 보낸다 — 한 번 보낼 때마다 저장소를 새로 읽기 때문이다.
   *
   * 서버가 거절한 것(이미 마친 판, 잘못된 값)은 다시 보내도 안 되므로 빼고
   * 알린다. 신호가 없어 못 보낸 것은 그대로 두고 멈춘다 — 다음 기회에 보낸다.
   */
  const flush = useCallback(async () => {
    const outcome = await drainOutbox(
      sessionId,
      logSet,
      (_sent, res) => {
        if ('error' in res) setError(res.error);
        else setSaved(res.sets);
      },
      /* 화면 이동 같은 Next.js 자체 신호는 잡지 않고 그대로 넘긴다 */
      unstable_rethrow
    );
    if (outcome === 'offline') setOffline(true);
    else if (outcome === 'done') setOffline(false);
  }, [sessionId]);

  /*
   * 다시 보내는 때: 신호가 돌아왔을 때, 앱으로 돌아왔을 때, 그리고 15초마다.
   * 화면을 처음 열 때도 한 번 — 지난번에 못 보낸 것이 폰에 남아 있을 수 있다.
   * 담긴 것이 없으면 저장소만 한 번 보고 끝나므로 헛되이 서버를 부르지 않는다.
   */
  useEffect(() => {
    const kick = () => void flush();
    const onVisible = () => {
      if (document.visibilityState === 'visible') kick();
    };
    window.addEventListener('online', kick);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(kick, 15_000);
    kick();
    return () => {
      window.removeEventListener('online', kick);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [flush]);

  /*
   * 운동을 옮기면 입력칸을 비우고 위로 올린다.
   *
   * 효과로 하지 않는다. 옮기는 일은 아래 단추를 누를 때만 일어나므로 그
   * 자리에서 하면 되고, 효과 안에서 곧바로 상태를 바꾸면 그릴 때마다 연쇄로
   * 다시 그린다.
   */
  const goTo = (next: number, from: RunExercise[] = list) => {
    const i = Math.min(from.length - 1, Math.max(0, next));
    setAt(i);
    setWeight('');
    setCount('');
    setField(from[i].needsWeight ? 'weight' : 'count');
    setPad(false);
    setError(null);
    /* 고치던 세트는 앞 운동의 것이다 — 칸을 어차피 비우므로 되돌릴 것도 없다 */
    setEditing(null);
    topRef.current?.scrollTo({ top: 0 });
  };

  /**
   * 목록 순서를 바꾸거나 뺀다.
   *
   * 지금 보고 있던 운동은 자리가 바뀌어도 그대로 따라간다. 뺀 것이 지금 보던
   * 것이면 그 자리에 올라온 운동으로 넘어간다 — 목록 맨 앞으로 튕기면 어디까지
   * 했는지 다시 찾아야 한다.
   */
  const applyOrder = (ids: string[]) => {
    setListError(null);
    startSaving(async () => {
      let res: Awaited<ReturnType<typeof reorderSession>>;
      try {
        res = await reorderSession(ids, sessionId);
      } catch (err) {
        unstable_rethrow(err);
        setListError(
          '신호가 없어 순서를 바꾸지 못했어요. 신호가 잡히면 다시 해 주세요.'
        );
        return;
      }
      if ('error' in res) {
        setListError(res.error);
        return;
      }
      const byId = new Map(list.map((e) => [e.id, e]));
      const next = res.ids.flatMap((id) => {
        const found = byId.get(id);
        return found ? [found] : [];
      });
      if (next.length === 0) return;

      const currentId = ex.id;
      const found = next.findIndex((e) => e.id === currentId);
      setList(next);
      if (found >= 0) setAt(found);
      else goTo(Math.min(at, next.length - 1), next);
    });
  };

  /**
   * 교체 창에서 운동을 넣었다.
   *
   * 서버가 이미 찍어 둔 목록을 고쳤으므로, 화면 목록도 같은 규칙으로 고친다
   * (lib/workout/swap.ts 의 placeExercise). 바꿨으면 그 자리에서, 더했으면 더한
   * 운동으로 넘어간다 — 지금 하려던 것이 그것이다.
   */
  const applySwap = (added: RunExercise, mode: 'replace' | 'add') => {
    setSwap(false);
    const next = placeExercise(list, ex.id, added, mode);
    if (!next) return;
    setList(next);
    const note = added.note;
    if (note) setNotes((prev) => ({ ...prev, [added.id]: note }));
    if (added.favorite) setFavorites((prev) => new Set(prev).add(added.id));
    goTo(mode === 'replace' ? at : at + 1, next);
  };

  /**
   * ★ — 이 운동을 즐겨찾기에 담거나 뺀다.
   *
   * 누르는 즉시 바꿔 보이고 뒤에서 저장한다. 원하는 상태('담아라/빼라')를 보내므로
   * 신호가 약해 다시 눌러도 어긋나지 않는다(setExerciseFavorite). 못 했으면 되돌린다.
   */
  const toggleStar = () => {
    const id = ex.id;
    const on = !favorites.has(id);
    const mark = (value: boolean) =>
      setFavorites((prev) => {
        const next = new Set(prev);
        if (value) next.add(id);
        else next.delete(id);
        return next;
      });
    setError(null);
    mark(on);
    startStarring(async () => {
      try {
        const res = await setExerciseFavorite(id, on);
        if ('error' in res) {
          mark(!on);
          setError(res.error);
        }
      } catch (err) {
        unstable_rethrow(err);
        mark(!on);
        setError(
          '신호가 없어 즐겨찾기를 바꾸지 못했어요. 신호가 잡히면 다시 눌러 주세요.'
        );
      }
    });
  };

  /** 고치기를 마치거나 그만둔다 — 누르기 전에 넣고 있던 값을 되돌려 놓는다. */
  const endEdit = () => {
    if (!editing) return;
    setWeight(editing.draft.weight);
    setCount(editing.draft.count);
    setField(editing.draft.field);
    setEditing(null);
  };

  /** 완료한 세트 줄을 눌렀다 — 그 세트를 고친다. 한 번 더 누르면 그만둔다. */
  const startEdit = (target: ShownSet) => {
    setError(null);
    if (editing?.setNo === target.setNo) {
      endEdit();
      return;
    }
    setEditing({
      setNo: target.setNo,
      recordedAt: target.recordedAt,
      /* 다른 세트를 고치다 넘어왔으면 맨 처음 넣고 있던 값을 그대로 들고 간다 */
      draft: editing?.draft ?? { weight, count, field },
    });
    /* 저장은 kg 이다 — 보여줄 때는 고른 단위로 (fillLast 와 같다) */
    setWeight(
      target.weightKg != null ? String(round1(toWeight(target.weightKg, wUnit))) : ''
    );
    const raw = ex.isHold ? target.holdSeconds : target.reps;
    /* 분으로 받는 운동도 초로 남아 있다 — 분으로 바꿔 담는다 */
    const n = raw != null && ex.inMinutes ? Math.round(raw / 60) : raw;
    setCount(n != null ? String(n) : '');
    /* 자판은 접는다 — 무엇이 채워졌는지부터 보이게. 숫자를 누르면 다시 열린다 */
    setPad(false);
  };

  const save = () => {
    setError(null);
    /*
     * 사람이 적은 값은 고른 단위다. 저장은 kg 으로 되돌려 넣는다.
     *
     * 소수 둘째 자리까지 남긴다(storedKg). 첫째 자리로 자르면 135lb 가
     * 61.2kg 이 되고, 되돌리면 134.9lb 가 된다 — 적은 적 없는 숫자다.
     */
    const w = weight === '' ? null : storedKg(fromWeight(Number(weight), wUnit));
    const c = count === '' ? null : Number(count);

    if (ex.needsWeight && (w == null || w <= 0)) {
      setError('무게를 적어주세요.');
      setField('weight');
      return;
    }
    if (c == null || c <= 0) {
      setError(ex.isHold ? `${timeLabel}을 적어주세요.` : '횟수를 적어주세요.');
      setField('count');
      return;
    }
    /*
     * 서버가 받는 한도(AMOUNT_LIMITS)를 여기서 먼저 본다 — 넘는 값은 폰에 담긴 뒤 서버가 거절하고, 대기열에서 빠져 그 세트가
     * 사라졌다('버틴 시간을 적어주세요'처럼 엉뚱한 말과 함께 — 40분 유산소를 2400초로 보낸 경우).
     */
    const countLimit = ex.isHold
      ? ex.inMinutes
        ? AMOUNT_LIMITS.holdSeconds / 60
        : AMOUNT_LIMITS.holdSeconds
      : AMOUNT_LIMITS.reps;
    if (c > countLimit) {
      setError(
        ex.isHold
          ? `${timeLabel}은 30분까지 적을 수 있어요.`
          : `횟수는 ${countLimit}회까지 적을 수 있어요.`
      );
      setField('count');
      return;
    }
    if (w != null && w > AMOUNT_LIMITS.weightKg) {
      setError(
        `무게는 ${formatWeight(AMOUNT_LIMITS.weightKg, wUnit)}까지 적을 수 있어요.`
      );
      setField('weight');
      return;
    }

    /* 고치는 중이면 그 세트의 번호와 마친 시각을 그대로 쓴다 (editing 설명 참고) */
    const fixing = editIndex >= 0 ? editing : null;

    /*
     * 새 세트의 번호는 여기서 정한다. 폰에만 있는 세트까지 세어야 번호가 안
     * 겹치고, 번호를 함께 보내야 다시 보내도 한 줄로 남는다.
     */
    const setNo = fixing?.setNo ?? mine.reduce((m, x) => Math.max(m, x.setNo), 0) + 1;
    if (setNo > AMOUNT_LIMITS.sets) {
      setError('세트가 너무 많아요.');
      return;
    }

    const entry = {
      setNo,
      weightKg: w,
      reps: ex.isHold ? null : c,
      holdSeconds: ex.isHold ? (ex.inMinutes ? c * 60 : c) : null,
    };

    /*
     * 손에 '남겼다'를 알린다 — 가볍게 톡 한 번. 이 세트로 지난 최고를 새로 넘었으면 두 번(줄에 '새 최고'가
     * 뜬다). 쉬는 시간이 다 차면 울릴 소리도 여기서 깨워 둔다 — 소리는 누른 순간에만 깨울 수 있다.
     */
    arm();
    const before = newRecord(ex, mine, ex.best);
    const after = newRecord(
      ex,
      [...mine.filter((m) => m.setNo !== setNo), entry],
      ex.best
    );
    const beatNow =
      after != null &&
      after.setNo === setNo &&
      (before == null || after.value > before.value);
    buzz(beatNow ? [15, 120, 15] : 12);

    /* 폰에 먼저 담는다 — 신호가 없어도 여기서 끝나고, 보내기는 뒤에서 한다 */
    outbox.add({
      sessionId,
      exerciseId: ex.id,
      ...entry,
      recordedAt: fixing?.recordedAt ?? new Date().toISOString(),
    });

    if (fixing) {
      /* 고치기 전에 넣고 있던 값으로 돌아간다 */
      endEdit();
    } else {
      /*
       * 무게는 남기고 횟수만 비운다. 다음 세트도 대개 같은 무게이고, 무게는
       * 숫자판을 다시 열어 넣기가 가장 번거롭다. 미리 채우는 것이 아니라
       * 방금 본인이 넣은 값을 그대로 두는 것이다.
       */
      setEditing(null);
      setCount('');
      setField('count');
    }
    /* 남기고 나면 접는다 — 쉬는 동안에는 시계와 기록이 보여야 한다 */
    setPad(false);
    void flush();
  };

  const drop = (target: ShownSet) => {
    setError(null);
    if (editing?.setNo === target.setNo) endEdit();
    const key = { sessionId, exerciseId: target.exerciseId, setNo: target.setNo };
    /*
     * 폰에 담긴 것부터 뺀다 — 새로 남긴 세트든, 고친 값이든. 빼지 않으면 뒤에서
     * 보내져 되살아난다. (막 보내지던 참이었다면 서버에 남아 다시 나타날 수
     * 있다 — 그때는 한 번 더 지우면 된다.)
     */
    outbox.remove(key);
    /* 서버에 아직 없던 세트면 여기서 끝이다 */
    if (!saved.some((x) => x.exerciseId === key.exerciseId && x.setNo === key.setNo)) {
      return;
    }
    startSaving(async () => {
      try {
        const res = await deleteSet(key);
        if ('error' in res) setError(res.error);
        else setSaved(res.sets);
      } catch (err) {
        unstable_rethrow(err);
        setError('신호가 없어 지금은 지울 수 없어요. 신호가 잡히면 다시 눌러 주세요.');
      }
    });
  };

  const fillLast = () => {
    if (!ex.last) return;
    if (ex.last.weightKg != null)
      setWeight(String(round1(toWeight(ex.last.weightKg, wUnit))));
    const raw = ex.isHold ? ex.last.holdSecondsDone : ex.last.repsDone;
    /* 지난번 것도 초로 남아 있다 — 분으로 받는 운동이면 분으로 바꿔 담는다 */
    const n = raw != null && ex.inMinutes ? Math.round(raw / 60) : raw;
    if (n != null) setCount(String(n));
    setError(null);
  };

  /*
   * 어느 칸을 움직일지 인자로 받는다.
   *
   * 예전에는 field 상태를 읽었다. 그런데 ± 를 누를 때 setField 로 칸을 먼저
   * 고르고 곧바로 이것을 불렀는데, setField 는 바로 반영되지 않아 여기서는
   * 아직 옛 칸이 보였다. 무게 + 를 눌렀더니 횟수가 올라갔다.
   */
  const bump = (which: 'weight' | 'count', delta: number) => {
    if (which === 'weight') {
      /*
       * 한 번에 움직이는 폭도 단위를 따른다. kg 은 2.5, lb 는 5 다 —
       * 원판이 그렇게 생겼다. lb 에서 2.5씩 올리면 있지도 않은 무게가 된다.
       */
      const step = wUnit === 'lb' ? 5 : WEIGHT_STEP;
      const next = Math.max(0, (Number(weight) || 0) + delta * step);
      setWeight(next === 0 ? '' : String(Number(next.toFixed(1))));
    } else {
      const limit = ex.isHold
        ? ex.inMinutes
          ? AMOUNT_LIMITS.holdSeconds / 60
          : AMOUNT_LIMITS.holdSeconds
        : AMOUNT_LIMITS.reps;
      /* 버티기는 5초씩, 분으로 받는 유산소와 횟수는 하나씩 */
      const step = ex.isHold && !ex.inMinutes ? 5 : 1;
      const next = Math.min(limit, Math.max(0, (Number(count) || 0) + delta * step));
      setCount(next === 0 ? '' : String(next));
    }
  };

  const countLabel = ex.inMinutes ? '분' : ex.isHold ? '초' : '회';

  /** 숫자를 누르면 그 칸을 고르고 자판을 연다 */
  const openPad = (which: 'weight' | 'count') => {
    setField(which);
    setPad(true);
  };

  return (
    <>
      {/* ─────────── 위: 보는 곳 ─────────── */}
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => router.push('/training')}
          aria-label="나가기"
          className="-m-1.5 grid h-11 w-11 shrink-0 place-items-center text-muted transition-colors hover:text-ink"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-ink/6">
            <X className="h-4 w-4" strokeWidth={2.4} />
          </span>
        </button>
        {/*
          진행 막대를 누르면 오늘 목록이 열린다.

          [이전]·[다음]만 있으면 여섯 번째 운동에 가는 데 다섯 번을 눌러야 하고,
          무엇이 남았는지도 알 수 없다.
        */}
        <button
          type="button"
          onClick={() => setSheet(true)}
          aria-label="오늘 운동 목록 열기"
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-xs text-muted">{themeLabel}</p>
          {/*
            운동마다 한 칸 — 세트를 남길수록 그 칸이 찬다(처방 세트 수만큼이면 가득). 지금 보는 운동의 칸은
            옅은 파랑. 예전 막대는 '몇 번째 운동을 보나'라 앞 운동으로 돌아가면 줄었다 — 한 만큼 차야
            뿌듯하다(2026-10-01 '감성', 암케어 따라하기의 칸 막대와 같은 모양).
          */}
          <div className="mt-1.5 flex items-center gap-2">
            <ListOrdered className="h-3.5 w-3.5 shrink-0 text-muted" />
            <span aria-hidden className="flex flex-1 gap-[3px]">
              {list.map((item, i) => {
                const n = setCounts.get(item.id) ?? 0;
                const fill =
                  n === 0
                    ? 0
                    : item.plannedSets
                      ? Math.min(1, n / item.plannedSets)
                      : 1;
                return (
                  <span
                    key={item.id}
                    className={`h-1 flex-1 overflow-hidden rounded-full ${
                      i === at ? 'bg-sky/25' : 'bg-ink/10'
                    }`}
                  >
                    <span
                      className="block h-full rounded-full bg-sky transition-[width] duration-300 ease-out"
                      style={{ width: `${fill * 100}%` }}
                    />
                  </span>
                );
              })}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted">
              {at + 1}/{list.length}
            </span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => {
            setFinishError(null);
            setFinish(true);
            /* 못 보낸 세트가 있으면 지금 한 번 더 보내 본다 */
            void flush();
          }}
          disabled={ending}
          /* 누르는 자리는 44px, 보이는 알약은 그보다 작게 */
          className="group -my-1 flex min-h-11 shrink-0 items-center disabled:opacity-50"
        >
          <span className="rounded-full bg-ink/6 px-3.5 py-2 text-[13px] font-semibold text-ink transition-colors group-hover:text-sky group-active:bg-ink/12">
            {ending ? '정리 중' : '운동 종료'}
          </span>
        </button>
      </header>

      {/*
        못 보낸 세트가 있을 때만 뜬다.

        말없이 폰에 쌓아 두면, 나중에 기록이 비어 보일 때 왜인지 알 수 없다.
        신호가 없다는 것과 세트는 안전하다는 것을 같이 말한다.
      */}
      {pending.length > 0 && (
        <div
          role="status"
          className={`flex shrink-0 items-center gap-2 px-4 py-2 text-xs leading-relaxed ${
            offline ? 'bg-warn-bg text-warn' : 'bg-surface-2 text-muted'
          }`}
        >
          <CloudOff aria-hidden className="h-3.5 w-3.5 shrink-0" />
          {offline ? (
            <span>
              <b>신호가 없어요.</b> 세트 {pending.length}개를 폰에 저장해 두었고, 신호가
              잡히면 저절로 보내요.
            </span>
          ) : (
            <span>세트 {pending.length}개 보내는 중…</span>
          )}
        </div>
      )}

      <div ref={topRef} className="flex-1 overflow-y-auto px-4 py-4">
        <p className="text-xs font-medium text-muted">{ex.category}</p>
        {/*
          이름 옆에 ★(즐겨찾기)와 [교체].

          기구가 차 있거나 해 보니 오늘은 아닌 운동을 그 자리에서 바꾼다.
          세트를 남긴 운동이면 [추가]가 된다 — 하던 운동은 두고 바로 뒤에 더한다.
        */}
        <div className="mt-0.5 flex items-start gap-1">
          <h1 className="min-w-0 flex-1 pt-1 text-2xl font-bold leading-tight text-ink">
            {ex.title}
          </h1>
          <button
            type="button"
            onClick={toggleStar}
            disabled={starring}
            aria-pressed={favorites.has(ex.id)}
            aria-label={favorites.has(ex.id) ? '즐겨찾기에서 빼기' : '즐겨찾기에 담기'}
            className="grid h-11 w-11 shrink-0 place-items-center transition-transform disabled:opacity-60 motion-safe:active:scale-90"
          >
            <Star
              className={`h-6 w-6 ${favorites.has(ex.id) ? 'text-sky' : 'text-muted'}`}
              fill={favorites.has(ex.id) ? 'currentColor' : 'none'}
              strokeWidth={1.8}
            />
          </button>
          <button
            type="button"
            onClick={() => setSwap(true)}
            className="mt-1.5 inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full bg-surface px-3 text-xs font-semibold text-ink transition-colors active:bg-ink/6"
          >
            {mine.length > 0 ? (
              <Plus aria-hidden className="h-3.5 w-3.5" />
            ) : (
              <ArrowLeftRight aria-hidden className="h-3.5 w-3.5" />
            )}
            {mine.length > 0 ? '추가' : '교체'}
          </button>
        </div>
        {ex.prescription && (
          <p className="mt-1 text-sm text-muted">
            {ex.prescription}
            {ex.perSide && ' (좌우 각각)'}
          </p>
        )}
        {ex.plannedSets != null && ex.plannedSets > 0 && (
          <SetDots planned={ex.plannedSets} done={mine.length} />
        )}
        {/*
          내 메모 — 운동마다 하나. 할 때마다 떠올려야 하는 것이라 이름 바로
          밑에 둔다. 다음에 이 운동을 할 때 여기 미리 떠 있다.
        */}
        <ExerciseNote
          exerciseId={ex.id}
          note={notes[ex.id] ?? null}
          onSaved={(id, note) =>
            setNotes((prev) => {
              const next = { ...prev };
              if (note) next[id] = note;
              else delete next[id];
              return next;
            })
          }
        />
        {/*
          자세 보기 · 내 기록.

          헬스장에서 처음 하는 운동이면 이름만 봐서는 무엇을 하라는 것인지
          알 수 없다. 접어 두는 것은 화면을 세트 기록에 쓰기 위해서이고,
          한 번 펼치면 다음 운동에서도 펼친 채로 둔다.

          내 기록은 이 운동의 지난 기록과 흐름이다 — 오늘 무게를 올릴지 정할 때
          본다. 지금 하는 판은 빼고 보여준다(components/exercise-history.tsx).
        */}
        <div className={`mt-3 grid gap-2 ${hasForm ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {hasForm && (
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              aria-expanded={showForm}
              className="flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-surface text-xs font-semibold text-ink transition-colors active:bg-ink/6 aria-expanded:text-sky"
            >
              <Info className="h-3.5 w-3.5" />
              {showForm ? '자세 설명 접기' : '자세·영상 보기'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
            className="flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-surface text-xs font-semibold text-ink transition-colors active:bg-ink/6 aria-expanded:text-sky"
          >
            <ChartLine className="h-3.5 w-3.5" />
            {showHistory ? '내 기록 접기' : '내 기록'}
          </button>
        </div>

        {showForm && hasForm && (
          <div className="mt-2 space-y-3 rounded-2xl bg-surface p-3">
            {(ex.videoPath || ex.referenceVideoId) && (
              <LibraryVideo
                /* 운동마다 새 재생기 — 같은 자리라 앞 운동의 영상(받아 둔 주소)이 다음 운동에서도 돌았다 */
                key={ex.id}
                path={ex.videoPath}
                referenceVideoId={ex.referenceVideoId}
                title={ex.title}
                thumbUrl={ex.thumbUrl}
                aspectRatio={ex.aspectRatio}
              />
            )}
            {ex.description && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/85">
                {ex.description}
              </p>
            )}
          </div>
        )}

        {showHistory && (
          <div className="mt-2 rounded-2xl bg-surface p-3">
            <ExerciseHistoryPanel
              exerciseId={ex.id}
              excludeSessionId={sessionId}
              compact
            />
          </div>
        )}

        {ex.last && (
          <p className="mt-0.5 text-xs text-muted/80">
            지난번{' '}
            {ex.last.weightKg != null && `${formatWeight(ex.last.weightKg, wUnit)} × `}
            {ex.isHold
              ? ex.last.holdSecondsDone != null
                ? formatSeconds(ex.last.holdSecondsDone)
                : '?'
              : `${ex.last.repsDone ?? '?'}회`}{' '}
            ({ex.last.date.slice(5).replace('-', '월 ')}일)
          </p>
        )}

        {/*
          오늘 이 운동에서 남긴 세트.

          줄을 누르면 그 세트를 고친다 — 값이 아래 칸에 채워지고 큰 단추가
          'N세트 고치기'가 된다. 지우기는 오른쪽 휴지통 그대로다.
        */}
        <div className="mt-4">
          {mine.length === 0 ? (
            <p className="rounded-2xl bg-surface px-4 py-3.5 text-sm text-muted">
              첫 세트를 마치면 여기에 쌓여요.
            </p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
              {mine.map((s, i) => {
                const fixingThis = i === editIndex;
                return (
                  <li
                    key={s.setNo}
                    className={`flex items-center transition-colors ${fixingThis ? 'bg-sky/8' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => startEdit(s)}
                      aria-pressed={fixingThis}
                      className="flex min-h-13 min-w-0 flex-1 items-center gap-3 py-2 pr-1 pl-3.5 text-left transition-colors active:bg-ink/4"
                    >
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums ${
                          fixingThis ? 'bg-sky text-white' : 'bg-ink/6 text-muted'
                        }`}
                      >
                        {i + 1}
                        <span className="sr-only">세트</span>
                      </span>
                      <span className="text-numeric min-w-0 flex-1 truncate text-lg leading-none text-ink">
                        {s.weightKg != null && `${formatWeight(s.weightKg, wUnit)} × `}
                        {s.holdSeconds != null
                          ? formatSeconds(s.holdSeconds)
                          : `${s.reps}회`}
                      </span>
                      {/* 지난 모든 기록보다 나은 세트 — 남기는 순간 톡 뜨고 손에 두 번 떤다(save) */}
                      {record?.setNo === s.setNo && (
                        <span className="finish-pop shrink-0 rounded-full bg-sky px-2 py-0.5 text-[11px] font-bold text-white">
                          새 최고
                        </span>
                      )}
                      {s.pending && (
                        <span
                          title="아직 서버에 보내지 못했어요. 신호가 잡히면 저절로 보내요."
                          className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-warn"
                        >
                          <CloudOff aria-hidden className="h-3 w-3" />
                          대기
                        </span>
                      )}
                      <Pencil
                        aria-hidden
                        className={`h-3.5 w-3.5 shrink-0 ${fixingThis ? 'text-sky' : 'text-muted/50'}`}
                      />
                      <span className="sr-only">
                        {fixingThis
                          ? '고치는 중. 다시 누르면 그만둬요'
                          : '눌러서 고치기'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => drop(s)}
                      aria-label={`${i + 1}세트 지우기`}
                      /* 손가락 크기(44px) · 고치기 연필과 거리 — 26px 라 연필을 누르려다 세트가 지워졌다 */
                      className="ml-1 grid h-11 w-11 shrink-0 place-items-center text-muted transition-colors hover:text-warn active:text-warn"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/*
        ─────────── 아래: 누르는 곳 ───────────

        자판(메모 쓰기)이 떠 있는 동안은 감춘다 — 이 막대에는 자판으로 넣는 칸이 없고(숫자는 앱이 그린 판), 아이폰
        SE 에서는 자판 위 남는 400px 가운데 이 막대가 340px 를 차지해 쓰는 메모가 안 보였다(2026-10-03 점검).
        메모 상자에 저장 · 취소가 따로 있다.

        min-h-0 · overflow-y-auto — 낮은 화면에서 숫자판까지 열어 이 막대가 틀보다 길어지면, 예전에는 틀 밖으로
        밀려나 [세트 완료]가 화면 밑으로 사라졌다. 이제 막대 안에서 굴러간다(가운데 칸은 먼저 0 까지 줄어든다).
      */}
      <div className="min-h-0 shrink space-y-2 overflow-y-auto border-t border-line bg-surface px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 [html[data-keyboard]_&]:hidden">
        {/*
          쉬는 시간 — 엄지가 닿는 곳, 언제나 보이는 자리. 예전에는 세트 목록 밑(굴러가는 칸)이라 세트가
          쌓이면 화면 밖으로 밀려났다. 처방에 쉬는 시간이 있으면 링이 그만큼에서 다 차고 한 번 알린다.
        */}
        {/* 낮은 화면(short, 아이폰 SE)에서 숫자판을 연 동안은 감춘다 — 숫자를 넣는 몇 초라 [세트 완료]가 먼저다 */}
        {rest != null && (
          <div className={pad ? 'short:hidden' : undefined}>
            <RestPill seconds={rest} target={restTarget} />
          </div>
        )}
        {error && (
          <p className="rounded-lg bg-warn-bg px-3 py-2 text-center text-xs text-warn">
            {error}
          </p>
        )}

        {/*
          무게칸은 언제나 낸다.

          예전에는 바벨·덤벨 운동에만 냈다. 그런데 맨몸으로 적어 둔 운동도
          덤벨을 들고 하거나 조끼를 입고 하는 일이 흔하고, 그때 적을 자리가
          아예 없었다. 꼭 적어야 하는 것은 바벨·덤벨뿐이고 나머지는 비워
          두어도 된다.

          ± 는 늘 보인다. 지난 세트에서 2.5kg 만 올리는 것처럼 흔한 경우는
          자판을 열 것도 없다.
        */}
        {[
          {
            key: 'weight' as const,
            label: `무게${!ex.needsWeight ? ' (없으면 비워두세요)' : ''}`,
            value: weight,
            unit: wUnit,
          },
          {
            key: 'count' as const,
            label: ex.isHold ? timeLabel : '횟수',
            value: count,
            unit: countLabel,
          },
        ].map((f) => (
          <div key={f.key} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setField(f.key);
                bump(f.key, -1);
              }}
              aria-label={`${f.label} 줄이기`}
              className="h-14 w-14 shrink-0 rounded-2xl bg-ink/6 text-2xl text-ink transition active:bg-ink/12 motion-safe:active:scale-95"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => openPad(f.key)}
              className={`flex h-14 min-w-0 flex-1 items-center justify-between gap-2 rounded-2xl px-4 transition-colors ${
                pad && field === f.key
                  ? 'bg-sky/10 ring-2 ring-sky ring-inset'
                  : 'bg-ink/6'
              }`}
            >
              <span className="min-w-0 truncate text-xs text-muted">{f.label}</span>
              {/* 지금 넣는 숫자는 크게 — 기구를 든 채 팔 길이에서 읽힌다 */}
              <span className="text-numeric shrink-0 text-2xl leading-none text-ink">
                {f.value === '' ? (
                  <span className="font-sans font-normal text-muted/50">—</span>
                ) : (
                  f.value
                )}
                <span className="ml-1 font-sans text-sm font-medium text-muted">
                  {f.unit}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setField(f.key);
                bump(f.key, 1);
              }}
              aria-label={`${f.label} 늘리기`}
              className="h-14 w-14 shrink-0 rounded-2xl bg-ink/6 text-2xl text-ink transition active:bg-ink/12 motion-safe:active:scale-95"
            >
              +
            </button>
          </div>
        ))}

        {/* 자판은 숫자를 누를 때만. 접으면 그만큼 위쪽이 넓어진다. */}
        {pad && (
          <div className="space-y-1.5 rounded-2xl bg-ink/6 p-1.5">
            <NumberPad
              onChange={field === 'weight' ? setWeight : setCount}
              allowDecimal={field === 'weight'}
            />
            {/*
              다 넣었으면 누른다.

              숫자만 있으면 다 넣고 나서 무엇을 눌러야 할지 알 수 없다. 무게를
              넣는 중이면 다음 칸으로 넘기고, 횟수까지 넣었으면 자판을 접는다 —
              한 번 누를 것을 두 번 누르게 하지 않는다.
            */}
            <button
              type="button"
              onClick={() => {
                if (field === 'weight') setField('count');
                else setPad(false);
              }}
              className="h-12 w-full rounded-xl bg-sky/15 text-sm font-bold text-sky transition-transform short:h-10 motion-safe:active:scale-[0.98]"
            >
              {field === 'weight'
                ? `다음 · ${ex.isHold ? timeLabel : '횟수'} →`
                : '확인'}
            </button>
          </div>
        )}

        {/*
          고치는 중이면 무엇을 고치는지와 그만두는 길을 큰 단추 바로 위에 둔다.
          '지난번 그대로 담기'는 새 세트를 넣을 때 쓰는 것이라 그동안 감춘다.
        */}
        {!pad &&
          (editIndex >= 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-sky/10 px-3.5 py-1 text-xs text-sky">
              <Pencil aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">
                <b>{editIndex + 1}세트</b>를 고치는 중이에요
              </span>
              <button
                type="button"
                onClick={endEdit}
                className="-mr-1.5 min-h-9 shrink-0 px-1.5 font-semibold transition-opacity active:opacity-60"
              >
                그만두기
              </button>
            </div>
          ) : (
            ex.last && (
              <button
                type="button"
                onClick={fillLast}
                className="mx-auto flex min-h-9 w-fit items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-sky transition-opacity active:opacity-60"
              >
                <RotateCcw aria-hidden className="h-3.5 w-3.5" strokeWidth={2.4} />
                지난번 그대로 담기
              </button>
            )
          ))}

        {/*
          서버를 기다리지 않는다 — 폰에 담는 순간 끝난다. 예전에는 보내는 동안
          '남기는 중'으로 꺼져 있어, 신호가 약한 곳에서는 몇 초씩 눌리지 않았다.
          고치기도 같다 — 같은 번호로 폰에 담고 뒤에서 보낸다.
        */}
        <button
          type="button"
          onClick={save}
          /* 낮은 화면에서 숫자판을 연 동안만 64px — 판과 같이 한 화면에 들어오게 */
          className={`flex h-[72px] w-full shrink-0 items-center justify-center gap-2 rounded-full bg-sky text-lg font-bold text-white transition-transform motion-safe:active:scale-[0.98] ${
            pad ? 'short:h-16' : ''
          }`}
        >
          {editIndex >= 0 ? (
            <>
              <Pencil className="h-5 w-5" />
              {`${editIndex + 1}세트 고치기`}
            </>
          ) : (
            <>
              <Check className="h-6 w-6" strokeWidth={2.6} />
              {`${mine.length + 1}세트 완료`}
            </>
          )}
        </button>

        {/* 자판이 열려 있으면 운동 이동은 감춘다 — 지금 할 일은 숫자 넣기다 */}
        {!pad && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => goTo(at - 1)}
              disabled={at === 0}
              className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full bg-ink/6 text-[13px] font-semibold text-ink transition active:bg-ink/12 disabled:opacity-30 motion-safe:active:scale-[0.98]"
            >
              <ChevronLeft className="h-4 w-4" />
              이전 운동
            </button>
            <button
              type="button"
              onClick={() => goTo(at + 1)}
              disabled={at === list.length - 1}
              className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full bg-ink/6 text-[13px] font-semibold text-ink transition active:bg-ink/12 disabled:opacity-30 motion-safe:active:scale-[0.98]"
            >
              다음 운동
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {finish && (
        <FinishSheet
          sets={sets}
          startedAt={openedAt}
          priorSeconds={priorSeconds}
          pendingCount={pending.length}
          busy={ending}
          error={finishError}
          onClose={() => {
            setFinish(false);
            setFinishError(null);
          }}
          onFinish={(intensity, memo) => {
            setFinishError(null);
            startEnding(async () => {
              try {
                /* 성공하면 서버가 축하 화면(/workout/done)으로 보낸다 — 돌아오면 실패한 것이다 */
                /* 이 화면의 판을 콕 집어 닫는다 — 다른 날 열린 판을 닫지 않게 */
                const res = await finishWorkout({ sessionId, intensity, memo });
                if (res && 'error' in res) setFinishError(res.error);
              } catch (err) {
                unstable_rethrow(err);
                setFinishError(
                  '신호가 약해 마치지 못했어요. 신호가 잡히면 다시 눌러 주세요.'
                );
              }
            });
          }}
        />
      )}

      {swap && (
        <SwapSheet
          sessionId={sessionId}
          current={ex}
          /* 폰에만 있는 세트까지 센다 — 서버는 아직 모르는 세트다 */
          mode={mine.length > 0 ? 'add' : 'replace'}
          inPlanIds={list.map((e) => e.id)}
          onDone={applySwap}
          onClose={() => setSwap(false)}
        />
      )}

      {sheet && (
        <ExerciseSheet
          exercises={list}
          sets={sets}
          at={at}
          busy={saving}
          error={listError}
          onJump={(i) => {
            goTo(i);
            setSheet(false);
          }}
          onApply={applyOrder}
          onClose={() => {
            setSheet(false);
            setListError(null);
          }}
        />
      )}
    </>
  );
}
