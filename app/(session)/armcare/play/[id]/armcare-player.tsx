'use client';

import {
  useEffect,
  useReducer,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { Check, ChevronLeft, ChevronRight, Info, Play, X } from 'lucide-react';
import { LibraryVideo } from '@/components/library-video';
import { useWakeLock } from '@/components/use-wake-lock';
import { setExerciseDone } from '@/app/actions/exercise-log';
import { exerciseDescription } from '@/app/actions/content';
import {
  MethodNote,
  type ArmcareExerciseView,
} from '@/app/(app)/training/armcare-media';

/** 따라 할 운동 하나 — 서버(page.tsx)가 만들어 넘긴다 */
export type PlayerItem = {
  exercise: ArmcareExerciseView;
  /** 이 루틴에서 할 세트 */
  sets: number;
  reps: number | null;
  holdSeconds: number | null;
  /** 세트 사이 쉬는 시간(초) */
  restSeconds: number;
  perSide: boolean;
  /** 오늘 이미 체크한 운동 */
  doneBefore: boolean;
};

type Clock = { kind: 'hold' | 'rest'; endsAt: number; total: number };

type State = {
  index: number;
  /** 운동마다 한 세트 수 */
  sets: number[];
  /** 운동마다 다 했는가 */
  done: boolean[];
  /** 좌우 각각 버티는 운동에서 지금 버틸 쪽 — 0 한쪽, 1 반대쪽 */
  side: 0 | 1;
  clock: Clock | null;
  finished: boolean;
};

type Action =
  | { type: 'hold'; at: number }
  | { type: 'set'; at: number }
  /* 시계가 다 돌았거나 [다 버텼어요]·[쉬기 건너뛰기]를 눌렀다 — 어느 시계인지 함께 */
  | { type: 'clock-end'; clock: Clock; at: number }
  | { type: 'go'; index: number }
  | { type: 'finish' };

/**
 * 좌우 각각 버티는 운동 — 한 세트에 한쪽씩 두 번 버틴다.
 * 암케어 버티기 운동 14개 중 12개가 그렇다(2026-09-26 기준).
 */
const twoSides = (it: PlayerItem) => it.perSide && it.holdSeconds != null;

/** 아직 안 한 다음 운동 — 없으면 null */
function nextUndone(done: boolean[], from: number): number | null {
  for (let k = 1; k <= done.length; k++) {
    const i = (from + k) % done.length;
    if (!done[i]) return i;
  }
  return null;
}

function reduce(s: State, a: Action, items: PlayerItem[]): State {
  switch (a.type) {
    case 'hold': {
      const secs = items[s.index].holdSeconds ?? 0;
      return { ...s, clock: { kind: 'hold', endsAt: a.at + secs * 1000, total: secs } };
    }
    case 'set': {
      const i = s.index;
      /* 한쪽을 버텼다 — 세트는 반대쪽까지 해야 끝난다 */
      if (twoSides(items[i]) && s.side === 0) return { ...s, side: 1, clock: null };
      const sets = s.sets.map((n, k) => (k === i ? n + 1 : n));
      if (sets[i] < items[i].sets) {
        /* 아직 세트가 남았다 — 쉬는 시계 */
        const secs = items[i].restSeconds;
        return {
          ...s,
          sets,
          side: 0,
          clock:
            secs > 0 ? { kind: 'rest', endsAt: a.at + secs * 1000, total: secs } : null,
        };
      }
      /* 이 운동을 마쳤다 — 안 한 다음 운동으로 */
      const done = s.done.map((d, k) => (k === i ? true : d));
      const next = nextUndone(done, i);
      return next == null
        ? { ...s, sets, done, side: 0, clock: null, finished: true }
        : { ...s, sets, done, side: 0, clock: null, index: next };
    }
    case 'clock-end':
      /*
       * 시계가 끝나는 순간 단추도 눌렀으면 둘 다 들어온다. 먼저 온 것이 시계를 바꿔
       * 두므로, 뒤에 온 것은 여기서 버린다 — 한 세트를 두 번 세지 않게.
       */
      if (s.clock !== a.clock) return s;
      return a.clock.kind === 'hold'
        ? reduce(s, { type: 'set', at: a.at }, items)
        : { ...s, clock: null };
    case 'go':
      return { ...s, index: a.index, side: 0, clock: null };
    case 'finish':
      return { ...s, clock: null, finished: true };
  }
}

const IDLE_MS = 10 * 60 * 1000;

const buzz = (pattern: number | number[]) => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator)
    navigator.vibrate(pattern);
};

const mmss = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(Math.max(0, secs) % 60).padStart(2, '0')}`;

/**
 * 루틴 따라하기 — 운동 하나씩 크게, 세트와 버티기·쉬기 시계를 대신 세 준다.
 *
 * 2026-09-26 사용자분과 정한 품질 올리기의 둘째 — 목록을 읽지 않고 따라만 하면 되게.
 * 맞춤 루틴과 내 루틴이 함께 쓴다(page.tsx). 운동의 마지막 세트를 마치면 그 운동을
 * 체크하고(setExerciseDone — 루틴 목록의 체크와 같은 기록), 안 한 다음 운동으로 넘어간다.
 * 이미 체크한 운동은 건너뛴다.
 *
 * 버티는 운동은 [버티기 시작]을 누르면 시계가 세고 끝나면 떨려서 알린다. 세트 사이는
 * 운동에 적힌 휴식만큼 쉬는 시계가 돈다 — 건너뛸 수 있다.
 *
 * 화면이 꺼지지 않게 잡아 두되, 10분 동안 아무것도 안 누르면 놓는다(운동 화면과 같은 규칙).
 */
export function ArmcarePlayer({
  title,
  backHref,
  items,
}: {
  title: string;
  backHref: string;
  items: PlayerItem[];
}) {
  const [state, dispatch] = useReducer(
    (s: State, a: Action) => reduce(s, a, items),
    items,
    (list): State => {
      const done = list.map((it) => it.doneBefore);
      const first = done.findIndex((d) => !d);
      return {
        index: first === -1 ? 0 : first,
        sets: list.map((it) => (it.doneBefore ? it.sets : 0)),
        done,
        side: 0,
        clock: null,
        finished: list.length > 0 && first === -1,
      };
    }
  );
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string>();
  const [toast, setToast] = useState<string | null>(null);
  const [, startSaving] = useTransition();

  /* 10분 동안 안 누르면 화면 잠금을 놓는다 */
  const lastTouch = useRef(0);
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    lastTouch.current = Date.now();
    const id = setInterval(() => {
      setIdle(Date.now() - lastTouch.current > IDLE_MS);
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  useWakeLock(!idle && !state.finished);

  /* 마친 운동을 체크한다 — 루틴 목록의 체크와 같은 기록. 한 운동은 한 번만. */
  const saved = useRef(new Set<string>());
  const save = (i: number) => {
    const it = items[i];
    if (saved.current.has(it.exercise.id)) return;
    saved.current.add(it.exercise.id);
    setToast(`${it.exercise.title} 완료`);
    startSaving(async () => {
      const res = await setExerciseDone(it.exercise.id, true);
      if ('error' in res) setError(res.error);
    });
  };
  /* 지금 세트를 마치면 이 운동이 끝나는가 — 좌우 각각이면 반대쪽까지 해야 한다 */
  const completesExercise = (s: State) => {
    const it = items[s.index];
    return (
      !s.done[s.index] &&
      s.sets[s.index] + 1 >= it.sets &&
      !(twoSides(it) && s.side === 0)
    );
  };
  /* 시계를 끝낸다 — 다 돌았을 때와 단추를 눌렀을 때가 같은 길로 */
  const endClock = (s: State, clock: Clock, at: number) => {
    if (clock.kind === 'hold' && completesExercise(s)) save(s.index);
    dispatch({ type: 'clock-end', clock, at });
  };

  /* 시계 — 버티기가 끝나면 세트를(좌우 각각이면 한쪽을) 마치고, 쉬기가 끝나면 다음 세트로 */
  useEffect(() => {
    const clock = state.clock;
    if (!clock) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t < clock.endsAt) return;
      clearInterval(id);
      buzz(clock.kind === 'hold' ? [180, 80, 180] : 250);
      endClock(state, clock, t);
    }, 200);
    return () => clearInterval(id);
    // 시계가 바뀔 때만 다시 건다 — 그 사이 state 는 시계를 멈추지 않고는 바뀌지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.clock]);

  /* 완료 알림은 잠깐만 */
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  const touch = () => {
    lastTouch.current = Date.now();
    if (idle) setIdle(false);
  };
  const finishSet = () => {
    if (completesExercise(state)) save(state.index);
    dispatch({ type: 'set', at: Date.now() });
  };

  if (items.length === 0) {
    return (
      <Shell title={title} backHref={backHref} items={items} state={state}>
        <p className="px-5 py-16 text-center text-sm text-muted">
          따라 할 운동이 없어요.
        </p>
      </Shell>
    );
  }

  if (state.finished) {
    const count = state.done.filter(Boolean).length;
    const all = count === items.length;
    return (
      <Shell title={title} backHref={backHref} items={items} state={state}>
        <div className="grid flex-1 place-items-center px-6 text-center">
          <div className="space-y-4">
            {count > 0 && (
              <span className="finish-pop mx-auto grid h-20 w-20 place-items-center rounded-full bg-sky text-white">
                <Check className="h-10 w-10" strokeWidth={3} />
              </span>
            )}
            <p className="text-heading text-2xl text-ink">
              {all ? '루틴 끝!' : '오늘은 여기까지'}
            </p>
            <p className="text-sm text-muted">
              {all
                ? `운동 ${count}개를 모두 마쳤어요`
                : `운동 ${items.length}개 중 ${count}개를 마쳤어요`}
              {count > 0 && ' · 오늘 기록에 체크됐어요'}
            </p>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Link
              href={backHref}
              className="inline-flex rounded-xl bg-sky px-5 py-3 text-sm font-semibold text-white hover:bg-sky-strong"
            >
              암케어로 돌아가기
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  const it = items[state.index];
  const ex = it.exercise;
  const doneSets = state.sets[state.index];
  const clock = state.clock;
  /* 좌우 각각 버티는 운동이면 어느 쪽인지 붙인다 */
  const sideLabel = twoSides(it) ? (state.side === 0 ? '한쪽 ' : '반대쪽 ') : '';
  const left = clock ? Math.max(0, Math.ceil((clock.endsAt - now) / 1000)) : 0;
  const amount =
    it.holdSeconds != null
      ? `${it.holdSeconds}초 버티기`
      : it.reps != null
        ? `${it.reps}회`
        : '';

  return (
    <Shell
      title={title}
      backHref={backHref}
      items={items}
      state={state}
      onTouch={touch}
    >
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-4 px-4 py-4">
          {ex.videoPath || ex.referenceVideoId ? (
            <LibraryVideo
              path={ex.videoPath}
              referenceVideoId={ex.referenceVideoId}
              title={ex.title}
              thumbUrl={ex.thumbUrl}
              aspectRatio={ex.aspectRatio}
            />
          ) : ex.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ex.thumbUrl} alt="" className="w-full rounded-2xl object-cover" />
          ) : null}

          <div className="space-y-1.5">
            <h1 className="text-heading text-2xl leading-tight break-keep text-ink">
              {ex.title}
            </h1>
            <p className="text-base font-semibold text-sky-strong">
              {amount}
              {it.perSide && ' · 좌우 각각'} · {it.sets}세트
            </p>
            <SetDots total={it.sets} done={doneSets} />
          </div>

          <HowTo exerciseId={ex.id} title={ex.title} />
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </div>

      {/* 누르는 막대 — 엄지가 닿는 아래에 */}
      <div className="border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-xl space-y-2.5">
          {toast && (
            <p className="finish-pop text-center text-sm font-semibold text-sky-strong">
              ✓ {toast}
            </p>
          )}
          {clock ? (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-muted">
                  {clock.kind === 'hold' ? `${sideLabel}버티는 중` : '쉬는 중'}
                </span>
                <span className="text-display text-4xl tabular-nums text-ink">
                  {mmss(left)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full rounded-full transition-[width] duration-200 ${
                    clock.kind === 'hold' ? 'bg-sky' : 'bg-line-strong'
                  }`}
                  style={{ width: `${clock.total ? (left / clock.total) * 100 : 0}%` }}
                />
              </div>
              <button
                type="button"
                onClick={() => endClock(state, clock, Date.now())}
                className="w-full rounded-xl border border-line-strong py-3 text-sm font-semibold text-ink hover:border-sky"
              >
                {clock.kind === 'hold' ? '다 버텼어요' : '쉬기 건너뛰기'}
              </button>
            </div>
          ) : it.holdSeconds != null && !state.done[state.index] ? (
            <button
              type="button"
              onClick={() => dispatch({ type: 'hold', at: Date.now() })}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky py-4 text-base font-bold text-white hover:bg-sky-strong"
            >
              <Play className="h-5 w-5" /> {sideLabel}
              {it.holdSeconds}초 버티기 시작 ({doneSets + 1}/{it.sets})
            </button>
          ) : state.done[state.index] ? (
            <p className="py-3 text-center text-sm font-semibold text-sky-strong">
              ✓ 오늘 이미 한 운동이에요
            </p>
          ) : (
            <button
              type="button"
              onClick={finishSet}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky py-4 text-base font-bold text-white hover:bg-sky-strong"
            >
              <Check className="h-5 w-5" strokeWidth={3} /> 세트 끝 ({doneSets + 1}/
              {it.sets})
            </button>
          )}

          <div className="flex items-center justify-between text-sm font-semibold text-muted">
            <button
              type="button"
              disabled={state.index === 0}
              onClick={() => dispatch({ type: 'go', index: state.index - 1 })}
              className="inline-flex items-center gap-1 py-1 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" /> 이전
            </button>
            {state.index < items.length - 1 ? (
              <button
                type="button"
                onClick={() => dispatch({ type: 'go', index: state.index + 1 })}
                className="inline-flex items-center gap-1 py-1"
              >
                다음 <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => dispatch({ type: 'finish' })}
                className="inline-flex items-center gap-1 py-1"
              >
                끝내기 <Check className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

/** 머리글 — 닫기 · 제목 · 몇 번째 · 운동마다 한 칸짜리 진행 막대 */
function Shell({
  title,
  backHref,
  items,
  state,
  onTouch,
  children,
}: {
  title: string;
  backHref: string;
  items: PlayerItem[];
  state: State;
  onTouch?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col" onPointerDown={onTouch}>
      <header className="border-b border-line bg-surface px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <Link
            href={backHref}
            aria-label="따라하기 닫기"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-5 w-5" />
          </Link>
          <p className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">
            {title}
          </p>
          {items.length > 0 && (
            <span className="shrink-0 text-sm font-semibold text-muted tabular-nums">
              {Math.min(state.index + 1, items.length)} / {items.length}
            </span>
          )}
        </div>
        {items.length > 0 && (
          <div className="mx-auto mt-2.5 flex max-w-xl gap-1" aria-hidden>
            {items.map((item, i) => (
              <span
                key={item.exercise.id}
                className={`h-1.5 flex-1 rounded-full ${
                  state.done[i]
                    ? 'bg-sky'
                    : i === state.index && !state.finished
                      ? 'bg-sky/40'
                      : 'bg-surface-2'
                }`}
              />
            ))}
          </div>
        )}
      </header>
      {children}
    </div>
  );
}

function SetDots({ total, done }: { total: number; done: number }) {
  return (
    <span className="flex gap-1.5" aria-label={`${total}세트 중 ${done}세트`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 rounded-full ${i < done ? 'bg-sky' : 'bg-line-strong'}`}
        />
      ))}
    </span>
  );
}

/**
 * 자세 설명 — 눌러야 받아 온다(글이 길어 처음부터 펼치지 않는다). 리바운드처럼 방식이
 * 붙은 운동이면 그 방식의 설명도 함께(MethodNote).
 */
function HowTo({ exerciseId, title }: { exerciseId: string; title: string }) {
  const [text, setText] = useState<{ id: string; body: string | null } | null>(null);
  const [loading, startLoading] = useTransition();
  const shown = text?.id === exerciseId ? text : null;

  return (
    <details
      className="group rounded-xl bg-surface-2 px-3.5 py-2.5"
      onToggle={(e) => {
        if (!(e.currentTarget as HTMLDetailsElement).open || shown) return;
        startLoading(async () => {
          setText({ id: exerciseId, body: await exerciseDescription(exerciseId) });
        });
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-muted">
        <Info className="h-3.5 w-3.5" /> 자세 설명
      </summary>
      <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap break-keep text-ink/85">
        {loading ? '불러오는 중…' : (shown?.body ?? '')}
      </p>
      <div className="mt-3">
        <MethodNote title={title} />
      </div>
    </details>
  );
}
