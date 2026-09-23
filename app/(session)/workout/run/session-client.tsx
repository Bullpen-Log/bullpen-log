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
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Delete,
  Info,
  ListOrdered,
  Trash2,
  X,
} from 'lucide-react';
import { LibraryVideo } from '@/components/library-video';
import { useWakeLock } from '@/components/use-wake-lock';
import {
  deleteSet,
  finishWorkout,
  logSet,
  reorderSession,
  type SavedSet,
} from '@/app/actions/workout';
import { ExerciseSheet } from './exercise-sheet';
import { FinishSheet } from './finish-sheet';
import { drainOutbox, outbox } from '@/lib/workout/outbox';
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
  type DoneAmount,
} from '@/lib/exercise-meta';
import type { SlotKey } from '@/lib/report/theme';

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

/** 화면에 그리는 세트. 폰에만 있고 아직 못 보낸 것은 pending 이 붙는다. */
type ShownSet = RunSet & { pending?: boolean };

export type RunExercise = {
  id: string;
  title: string;
  category: string;
  slot: SlotKey;
  prescription: string | null;
  plannedSets: number | null;
  perSide: boolean;
  needsWeight: boolean;
  isHold: boolean;
  /**
   * 시간을 분으로 받는가 (유산소).
   *
   * 자전거 10분을 '600초'로 치게 하면 헷갈리고 느리다. 받는 것은 분이지만
   * 저장은 다른 시간형 운동처럼 초로 한다 — 요약·부하 계산이 초를 읽는다.
   */
  inMinutes: boolean;
  equipment: string[];
  /** 운동 중에 자세를 확인하는 데 쓴다 */
  description: string;
  videoPath: string | null;
  referenceVideoId: string | null;
  aspectRatio: number | null;
  thumbUrl: string | null;
  last: (DoneAmount & { date: string }) | null;
};

/* ----------------------------- 휴식 시계 ----------------------------- */

/**
 * 마지막 세트로부터 흐른 시간.
 *
 * 정해 둔 시간에서 거꾸로 내려가지 않는다. 얼마나 쉬었는지를 보는 것이
 * 요점이고 상한도 없다. 그래서 '끝'이 없고, 알릴 일도 없다.
 *
 * 흘러가는 숫자를 들고 있지 않고 '마지막 세트 시각' 하나만 둔다. 화면이
 * 꺼졌다 켜져도, 앱을 나갔다 들어와도 쉰 시간이 정확하다.
 */
function useRestClock(since: string | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!since) return;
    /*
     * 여기서 곧바로 setNow 를 부르지 않는다 — 효과 안에서 바로 상태를 바꾸면
     * 그릴 때마다 연쇄로 다시 그린다(린트가 잡는다). 부를 필요도 없다.
     * 새 세트를 남긴 직후에는 now 가 since 보다 앞서 있어 아래 뺄셈이 음수가
     * 되고, Math.max 가 0 으로 잘라 곧바로 0:00 이 보인다.
     */
    const id = setInterval(() => setNow(Date.now()), 1000);
    /* 화면을 다시 켜면 곧바로 맞춘다 — 꺼진 동안 타이머가 멈췄을 수 있다 */
    const wake = () => setNow(Date.now());
    document.addEventListener('visibilitychange', wake);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [since]);

  if (!since) return null;
  const seconds = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return seconds;
}

function clockText(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
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
          className="h-12 rounded-xl border border-line-strong bg-surface text-lg font-semibold text-ink transition-colors active:bg-surface-2 disabled:opacity-25 motion-safe:active:scale-95"
        >
          {k}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange((prev) => prev.slice(0, -1))}
        aria-label="한 글자 지우기"
        className="flex h-12 items-center justify-center rounded-xl border border-line-strong bg-surface text-muted transition-colors active:bg-surface-2 motion-safe:active:scale-95"
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
  const sets = useMemo<ShownSet[]>(() => {
    const done = new Set(saved.map((x) => `${x.exerciseId}#${x.setNo}`));
    const waiting = pending
      .filter((p) => !done.has(`${p.exerciseId}#${p.setNo}`))
      .map((p) => ({
        setNo: p.setNo,
        exerciseId: p.exerciseId,
        weightKg: p.weightKg,
        reps: p.reps,
        holdSeconds: p.holdSeconds,
        recordedAt: p.recordedAt,
        pending: true,
      }));
    return [...saved, ...waiting];
  }, [saved, pending]);
  /** 마지막으로 보내려다 신호가 없어 멈췄는가 — 알림 문구가 달라진다 */
  const [offline, setOffline] = useState(false);
  /*
   * 목록을 상태로 들고 있는다.
   *
   * 세션 중에 순서를 바꾸거나 뺄 수 있기 때문이다. 서버가 다시 그리지 않으므로
   * (세트 저장이 화면을 안 건드린다) 처음 받은 것에서 출발해 여기서만 고친다.
   */
  const [list, setList] = useState<RunExercise[]>(exercises);
  const [at, setAt] = useState(0);
  /*
   * 운동하는 동안 화면을 켜 둔다.
   *
   * 세트 사이에 1~3분을 쉬는데 폰은 30초면 잠긴다. 한 세트마다 폰을 깨워
   * 잠금을 풀어야 하고, 무엇보다 휴식 시계가 30초마다 사라지면 띄운 뜻이
   * 없다. 이 화면을 나가면 저절로 풀린다 (components/use-wake-lock.ts).
   */
  useWakeLock();

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
   * 자세 설명을 펼쳐 둘지.
   *
   * 운동을 옮겨도 그대로 둔다. 한 번 펼친 사람은 다음 운동에서도 보고 싶어
   * 하는 것이 자연스럽다 — 운동마다 다시 누르게 하면 결국 안 보게 된다.
   */
  const [showForm, setShowForm] = useState(false);
  const [saving, startSaving] = useTransition();
  const [ending, startEnding] = useTransition();
  const topRef = useRef<HTMLDivElement>(null);

  const ex = list[at];
  /* 시간형 운동의 칸 이름 — 유산소는 '운동 시간', 버티기는 '버틴 시간' */
  const timeLabel = ex.inMinutes ? '운동 시간' : '버틴 시간';
  const mine = useMemo(
    () => sets.filter((s) => s.exerciseId === ex.id).sort((a, b) => a.setNo - b.setNo),
    [sets, ex.id]
  );

  /*
   * 마지막으로 남긴 세트 — 운동과 상관없이 하나. 쉰 시간은 그때부터다.
   *
   * 이 판을 연 뒤에 남긴 것만 본다. 한 번 종료한 판을 다시 열면 아까 남긴
   * 세트가 그대로 있는데, 그것부터 세면 '47분째 쉬는 중'이 떠서 종료가 안
   * 된 것처럼 보인다.
   */
  const lastAt = useMemo(() => {
    const mine = sets.filter((s) => s.recordedAt >= openedAt);
    if (mine.length === 0) return null;
    return mine.reduce((a, b) => (a.recordedAt > b.recordedAt ? a : b)).recordedAt;
  }, [sets, openedAt]);
  const rest = useRestClock(lastAt);

  const doneCount = useMemo(() => new Set(sets.map((s) => s.exerciseId)).size, [sets]);

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
        res = await reorderSession(ids);
      } catch (err) {
        unstable_rethrow(err);
        setListError(
          '신호가 없어 순서를 바꾸지 못했습니다. 신호가 잡히면 다시 해 주세요.'
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

  const save = () => {
    setError(null);
    /* 사람이 적은 값은 고른 단위다. 저장은 kg 으로 되돌려 넣는다. */
    const w = weight === '' ? null : round1(fromWeight(Number(weight), wUnit));
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
     * 번호는 여기서 정한다. 폰에만 있는 세트까지 세어야 번호가 안 겹치고,
     * 번호를 함께 보내야 다시 보내도 한 줄로 남는다.
     */
    const setNo = mine.reduce((m, x) => Math.max(m, x.setNo), 0) + 1;
    if (setNo > AMOUNT_LIMITS.sets) {
      setError('세트가 너무 많습니다.');
      return;
    }

    /* 폰에 먼저 담는다 — 신호가 없어도 여기서 끝나고, 보내기는 뒤에서 한다 */
    outbox.add({
      sessionId,
      exerciseId: ex.id,
      setNo,
      weightKg: w,
      reps: ex.isHold ? null : c,
      holdSeconds: ex.isHold ? (ex.inMinutes ? c * 60 : c) : null,
      recordedAt: new Date().toISOString(),
    });

    /*
     * 무게는 남기고 횟수만 비운다. 다음 세트도 대개 같은 무게이고, 무게는
     * 숫자판을 다시 열어 넣기가 가장 번거롭다. 미리 채우는 것이 아니라
     * 방금 본인이 넣은 값을 그대로 두는 것이다.
     */
    setCount('');
    setField('count');
    /* 남기고 나면 접는다 — 쉬는 동안에는 시계와 기록이 보여야 한다 */
    setPad(false);
    void flush();
  };

  const drop = (target: ShownSet) => {
    setError(null);
    /*
     * 아직 못 보낸 세트는 폰에서만 빼면 된다. (막 보내지던 참이었다면 서버에
     * 남아 다시 나타날 수 있다 — 그때는 한 번 더 지우면 된다.)
     */
    if (target.pending) {
      outbox.remove({ sessionId, exerciseId: target.exerciseId, setNo: target.setNo });
      return;
    }
    startSaving(async () => {
      try {
        const res = await deleteSet({
          sessionId,
          exerciseId: target.exerciseId,
          setNo: target.setNo,
        });
        if ('error' in res) setError(res.error);
        else setSaved(res.sets);
      } catch (err) {
        unstable_rethrow(err);
        setError(
          '신호가 없어 지금은 지울 수 없습니다. 신호가 잡히면 다시 눌러 주세요.'
        );
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
          className="rounded-lg p-1.5 text-muted transition-colors hover:text-ink"
        >
          <X className="h-5 w-5" />
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
          <div className="mt-1 flex items-center gap-2">
            <ListOrdered className="h-3.5 w-3.5 shrink-0 text-muted" />
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span
                className="block h-full bg-sky transition-[width] duration-200"
                style={{ width: `${((at + 1) / list.length) * 100}%` }}
              />
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
          className="shrink-0 rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-sky hover:text-sky disabled:opacity-50"
        >
          {ending ? '정리 중' : '운동 종료'}
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
              <b>신호가 없습니다.</b> 세트 {pending.length}개를 폰에 저장해 두었고,
              신호가 잡히면 저절로 보냅니다.
            </span>
          ) : (
            <span>세트 {pending.length}개 보내는 중…</span>
          )}
        </div>
      )}

      <div ref={topRef} className="flex-1 overflow-y-auto px-4 py-4">
        <p className="text-xs text-muted">{ex.category}</p>
        <h1 className="mt-0.5 text-xl font-bold leading-snug text-ink">{ex.title}</h1>
        {ex.prescription && (
          <p className="mt-1 text-sm text-muted">
            {ex.prescription}
            {ex.perSide && ' (좌우 각각)'}
          </p>
        )}
        {/*
          자세 보기.

          헬스장에서 처음 하는 운동이면 이름만 봐서는 무엇을 하라는 것인지
          알 수 없다. 접어 두는 것은 화면을 세트 기록에 쓰기 위해서이고,
          한 번 펼치면 다음 운동에서도 펼친 채로 둔다.
        */}
        {(ex.description || ex.videoPath || ex.referenceVideoId) && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-line-strong py-2 text-xs font-semibold text-ink transition-colors active:bg-surface-2"
            >
              <Info className="h-3.5 w-3.5" />
              {showForm ? '자세 설명 접기' : '자세·영상 보기'}
            </button>

            {showForm && (
              <div className="mt-2 space-y-3 rounded-xl border border-line bg-surface p-3">
                {(ex.videoPath || ex.referenceVideoId) && (
                  <LibraryVideo
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
          </div>
        )}

        {ex.last && (
          <p className="mt-0.5 text-xs text-muted/80">
            지난번 {ex.last.weightKg != null && `${formatWeight(ex.last.weightKg, wUnit)} × `}
            {ex.isHold
              ? ex.last.holdSecondsDone != null
                ? formatSeconds(ex.last.holdSecondsDone)
                : '?'
              : `${ex.last.repsDone ?? '?'}회`}{' '}
            ({ex.last.date.slice(5).replace('-', '월 ')}일)
          </p>
        )}

        {/* 오늘 이 운동에서 남긴 세트 */}
        <div className="mt-4 space-y-1.5">
          {mine.length === 0 ? (
            <p className="rounded-xl bg-surface-2 px-4 py-3 text-xs text-muted">
              아직 남긴 세트가 없습니다. 한 세트를 마치면 아래에서 적어주세요.
            </p>
          ) : (
            mine.map((s, i) => (
              <div
                key={s.setNo}
                className="flex items-center gap-3 rounded-xl border border-line px-3 py-2"
              >
                <span className="w-10 shrink-0 text-xs text-muted">{i + 1}세트</span>
                <span className="flex-1 text-sm tabular-nums text-ink">
                  {s.weightKg != null && `${formatWeight(s.weightKg, wUnit)} × `}
                  {s.holdSeconds != null ? formatSeconds(s.holdSeconds) : `${s.reps}회`}
                </span>
                {s.pending && (
                  <span
                    title="아직 서버에 보내지 못했습니다. 신호가 잡히면 저절로 보냅니다."
                    className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-warn"
                  >
                    <CloudOff aria-hidden className="h-3 w-3" />
                    대기
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => drop(s)}
                  aria-label={`${i + 1}세트 지우기`}
                  className="rounded-md p-1.5 text-muted transition-colors hover:text-warn"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* 쉰 시간 — 0초부터 올라간다. 끝이 없다. */}
        {rest != null && (
          <div className="mt-4 rounded-2xl bg-shade px-4 py-3 text-center">
            <p className="text-display text-3xl leading-none tabular-nums text-white">
              {clockText(rest)}
            </p>
            <p className="mt-1 text-[11px] text-white/60">쉬는 중</p>
          </div>
        )}

        <p className="mt-4 text-center text-[11px] text-muted/70">
          오늘 {doneCount}/{list.length}개 운동에 기록을 남겼습니다
        </p>
      </div>

      {/* ─────────── 아래: 누르는 곳 ─────────── */}
      <div className="shrink-0 space-y-2 border-t-2 border-sky bg-surface px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
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
              className="h-14 w-14 shrink-0 rounded-xl border border-line-strong text-xl text-ink transition-colors active:bg-surface-2 motion-safe:active:scale-95"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => openPad(f.key)}
              className={`flex h-14 flex-1 items-center justify-between rounded-xl border px-3 transition-colors ${
                pad && field === f.key
                  ? 'border-sky bg-sky/5'
                  : 'border-line-strong bg-surface-2'
              }`}
            >
              <span className="text-[11px] text-muted">{f.label}</span>
              <span className="text-xl font-semibold tabular-nums text-ink">
                {f.value === '' ? '—' : f.value}
                <span className="ml-1 text-xs font-normal text-muted">{f.unit}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setField(f.key);
                bump(f.key, 1);
              }}
              aria-label={`${f.label} 늘리기`}
              className="h-14 w-14 shrink-0 rounded-xl border border-line-strong text-xl text-ink transition-colors active:bg-surface-2 motion-safe:active:scale-95"
            >
              +
            </button>
          </div>
        ))}

        {/* 자판은 숫자를 누를 때만. 접으면 그만큼 위쪽이 넓어진다. */}
        {pad && (
          <div className="space-y-1.5 rounded-xl bg-surface-2 p-2">
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
              className="h-12 w-full rounded-xl border border-sky bg-sky/10 text-sm font-bold text-sky transition-transform motion-safe:active:scale-[0.98]"
            >
              {field === 'weight'
                ? `다음 · ${ex.isHold ? timeLabel : '횟수'} →`
                : '확인'}
            </button>
          </div>
        )}

        {ex.last && !pad && (
          <button
            type="button"
            onClick={fillLast}
            className="w-full rounded-lg border border-dashed border-line-strong py-1.5 text-[11px] text-muted transition-colors hover:border-sky hover:text-sky"
          >
            지난번 그대로 담기
          </button>
        )}

        {/*
          서버를 기다리지 않는다 — 폰에 담는 순간 끝난다. 예전에는 보내는 동안
          '남기는 중'으로 꺼져 있어, 신호가 약한 곳에서는 몇 초씩 눌리지 않았다.
        */}
        <button
          type="button"
          onClick={save}
          className="h-[72px] w-full rounded-2xl bg-sky text-base font-bold text-white transition-transform motion-safe:active:scale-[0.98]"
        >
          <Check className="mr-1.5 inline h-5 w-5" />
          {`세트 완료 (${mine.length + 1}세트째)`}
        </button>

        {/* 자판이 열려 있으면 운동 이동은 감춘다 — 지금 할 일은 숫자 넣기다 */}
        {!pad && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => goTo(at - 1)}
              disabled={at === 0}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-line-strong py-2.5 text-xs font-semibold text-ink transition-colors disabled:opacity-30 motion-safe:active:scale-[0.98]"
            >
              <ChevronLeft className="h-4 w-4" />
              이전 운동
            </button>
            <button
              type="button"
              onClick={() => goTo(at + 1)}
              disabled={at === list.length - 1}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-line-strong py-2.5 text-xs font-semibold text-ink transition-colors disabled:opacity-30 motion-safe:active:scale-[0.98]"
            >
              다음 운동
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {finish && (
        <FinishSheet
          exercises={list}
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
                /* 성공하면 서버가 트레이닝으로 보낸다 — 돌아오면 실패한 것이다 */
                const res = await finishWorkout({ intensity, memo });
                if (res && 'error' in res) setFinishError(res.error);
              } catch (err) {
                unstable_rethrow(err);
                setFinishError(
                  '신호가 약해 마치지 못했습니다. 신호가 잡히면 다시 눌러 주세요.'
                );
              }
            });
          }}
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
