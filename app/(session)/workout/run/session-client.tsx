'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Delete,
  Info,
  Trash2,
  X,
} from 'lucide-react';
import { LibraryVideo } from '@/components/library-video';
import { deleteSet, finishWorkout, logSet, type SavedSet } from '@/app/actions/workout';
import { AMOUNT_LIMITS, WEIGHT_STEP, type DoneAmount } from '@/lib/exercise-meta';
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
  value,
  onChange,
  allowDecimal,
}: {
  value: string;
  onChange: (next: string) => void;
  allowDecimal: boolean;
}) {
  const press = (key: string) => {
    if (key === '.') {
      if (!allowDecimal || value.includes('.')) return;
      onChange((value === '' ? '0' : value) + '.');
      return;
    }
    /* 소수점 아래 한 자리까지. 0.5kg 자리를 담으면 충분하다. */
    const dot = value.indexOf('.');
    if (dot >= 0 && value.length - dot > 1) return;
    if (value.replace('.', '').length >= 5) return;
    onChange(value === '0' ? key : value + key);
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
        onClick={() => onChange(value.slice(0, -1))}
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
  themeLabel,
  exercises,
  initialSets,
}: {
  themeLabel: string;
  exercises: RunExercise[];
  initialSets: RunSet[];
}) {
  const router = useRouter();
  const [sets, setSets] = useState<RunSet[]>(initialSets);
  const [at, setAt] = useState(0);
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

  const ex = exercises[at];
  const mine = useMemo(
    () => sets.filter((s) => s.exerciseId === ex.id).sort((a, b) => a.setNo - b.setNo),
    [sets, ex.id]
  );

  /* 마지막으로 남긴 세트 — 운동과 상관없이 하나. 쉰 시간은 그때부터다. */
  const lastAt = useMemo(() => {
    if (sets.length === 0) return null;
    return sets.reduce((a, b) => (a.recordedAt > b.recordedAt ? a : b)).recordedAt;
  }, [sets]);
  const rest = useRestClock(lastAt);

  const doneCount = useMemo(() => new Set(sets.map((s) => s.exerciseId)).size, [sets]);

  /*
   * 운동을 옮기면 입력칸을 비우고 위로 올린다.
   *
   * 효과로 하지 않는다. 옮기는 일은 아래 단추를 누를 때만 일어나므로 그
   * 자리에서 하면 되고, 효과 안에서 곧바로 상태를 바꾸면 그릴 때마다 연쇄로
   * 다시 그린다.
   */
  const goTo = (next: number) => {
    const i = Math.min(exercises.length - 1, Math.max(0, next));
    setAt(i);
    setWeight('');
    setCount('');
    setField(exercises[i].needsWeight ? 'weight' : 'count');
    setError(null);
    topRef.current?.scrollTo({ top: 0 });
  };

  const save = () => {
    setError(null);
    const w = weight === '' ? null : Number(weight);
    const c = count === '' ? null : Number(count);

    if (ex.needsWeight && (w == null || w <= 0)) {
      setError('무게를 적어주세요.');
      setField('weight');
      return;
    }
    if (c == null || c <= 0) {
      setError(ex.isHold ? '버틴 시간을 적어주세요.' : '횟수를 적어주세요.');
      setField('count');
      return;
    }

    startSaving(async () => {
      const res = await logSet({
        exerciseId: ex.id,
        weightKg: w,
        reps: ex.isHold ? null : c,
        holdSeconds: ex.isHold ? c : null,
      });
      if ('error' in res) {
        setError(res.error);
        return;
      }
      setSets(res.sets);
      /*
       * 무게는 남기고 횟수만 비운다. 다음 세트도 대개 같은 무게이고, 무게는
       * 숫자판을 다시 열어 넣기가 가장 번거롭다. 미리 채우는 것이 아니라
       * 방금 본인이 넣은 값을 그대로 두는 것이다.
       */
      setCount('');
      setField('count');
    });
  };

  const drop = (setNo: number) => {
    startSaving(async () => {
      const res = await deleteSet({ exerciseId: ex.id, setNo });
      if (!('error' in res)) setSets(res.sets);
    });
  };

  const fillLast = () => {
    if (!ex.last) return;
    if (ex.last.weightKg != null) setWeight(String(ex.last.weightKg));
    const n = ex.isHold ? ex.last.holdSecondsDone : ex.last.repsDone;
    if (n != null) setCount(String(n));
    setError(null);
  };

  const bump = (delta: number) => {
    if (field === 'weight') {
      const next = Math.max(0, (Number(weight) || 0) + delta * WEIGHT_STEP);
      setWeight(next === 0 ? '' : String(Number(next.toFixed(1))));
    } else {
      const limit = ex.isHold ? AMOUNT_LIMITS.holdSeconds : AMOUNT_LIMITS.reps;
      const step = ex.isHold ? 5 : 1;
      const next = Math.min(limit, Math.max(0, (Number(count) || 0) + delta * step));
      setCount(next === 0 ? '' : String(next));
    }
  };

  const countLabel = ex.isHold ? '초' : '회';
  const active = field === 'weight' ? weight : count;

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
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted">{themeLabel}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span
                className="block h-full bg-sky transition-[width] duration-200"
                style={{ width: `${((at + 1) / exercises.length) * 100}%` }}
              />
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted">
              {at + 1}/{exercises.length}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            startEnding(async () => {
              await finishWorkout({});
            })
          }
          disabled={ending}
          className="shrink-0 rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-sky hover:text-sky disabled:opacity-50"
        >
          {ending ? '정리 중' : '운동 종료'}
        </button>
      </header>

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
            지난번 {ex.last.weightKg != null && `${ex.last.weightKg}kg × `}
            {ex.isHold
              ? `${ex.last.holdSecondsDone ?? '?'}초`
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
                  {s.weightKg != null && `${s.weightKg}kg × `}
                  {s.holdSeconds != null ? `${s.holdSeconds}초` : `${s.reps}회`}
                </span>
                <button
                  type="button"
                  onClick={() => drop(s.setNo)}
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
          오늘 {doneCount}/{exercises.length}개 운동에 기록을 남겼습니다
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
        */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setField('weight')}
            className={`flex-1 rounded-xl border px-3 py-2 text-left transition-colors ${
              field === 'weight'
                ? 'border-sky bg-sky/5'
                : 'border-line-strong bg-surface-2'
            }`}
          >
            <span className="block text-[10px] text-muted">
              무게{!ex.needsWeight && ' (없으면 비워두세요)'}
            </span>
            <span className="block text-lg font-semibold tabular-nums text-ink">
              {weight === '' ? '—' : weight}
              <span className="ml-1 text-xs font-normal text-muted">kg</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setField('count')}
            className={`flex-1 rounded-xl border px-3 py-2 text-left transition-colors ${
              field === 'count'
                ? 'border-sky bg-sky/5'
                : 'border-line-strong bg-surface-2'
            }`}
          >
            <span className="block text-[10px] text-muted">
              {ex.isHold ? '버틴 시간' : '횟수'}
            </span>
            <span className="block text-lg font-semibold tabular-nums text-ink">
              {count === '' ? '—' : count}
              <span className="ml-1 text-xs font-normal text-muted">{countLabel}</span>
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => bump(-1)}
            aria-label="줄이기"
            className="h-11 w-14 shrink-0 rounded-xl border border-line-strong text-lg text-ink transition-colors active:bg-surface-2 motion-safe:active:scale-95"
          >
            −
          </button>
          <div className="flex-1">
            <NumberPad
              value={active}
              onChange={field === 'weight' ? setWeight : setCount}
              allowDecimal={field === 'weight'}
            />
          </div>
          <button
            type="button"
            onClick={() => bump(1)}
            aria-label="늘리기"
            className="h-11 w-14 shrink-0 rounded-xl border border-line-strong text-lg text-ink transition-colors active:bg-surface-2 motion-safe:active:scale-95"
          >
            +
          </button>
        </div>

        {ex.last && (
          <button
            type="button"
            onClick={fillLast}
            className="w-full rounded-lg border border-dashed border-line-strong py-1.5 text-[11px] text-muted transition-colors hover:border-sky hover:text-sky"
          >
            지난번 그대로 담기
          </button>
        )}

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="h-[72px] w-full rounded-2xl bg-sky text-base font-bold text-white transition-transform disabled:opacity-60 motion-safe:active:scale-[0.98]"
        >
          <Check className="mr-1.5 inline h-5 w-5" />
          {saving ? '남기는 중' : `세트 완료 (${mine.length + 1}세트째)`}
        </button>

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
            disabled={at === exercises.length - 1}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-line-strong py-2.5 text-xs font-semibold text-ink transition-colors disabled:opacity-30 motion-safe:active:scale-[0.98]"
          >
            다음 운동
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}
