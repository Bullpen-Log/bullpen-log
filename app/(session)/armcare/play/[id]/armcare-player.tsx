'use client';

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
  Play,
  X,
} from 'lucide-react';
import { LibraryVideo } from '@/components/library-video';
import { useWakeLock } from '@/components/use-wake-lock';
import { setExerciseDone } from '@/app/actions/exercise-log';
import { formatSeconds } from '@/lib/exercise-meta';
import { REST_CLOCK_LIMIT_SECONDS } from '@/lib/workout/rest';
import {
  DescriptionText,
  MethodNote,
  useExerciseDescription,
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
  /** 그날 이미 체크한 운동 */
  doneBefore: boolean;
  /** 지금 몸 상태에는 권하지 않는 운동 — 루틴 목록과 같은 규칙(lib/armcare/today.ts) */
  unsafe: boolean;
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
  /** 방금 마친 운동 — 잠깐 '완료'를 띄운다 */
  justDone: { index: number; at: number } | null;
};

type Action =
  | { type: 'hold'; at: number }
  | { type: 'set'; at: number }
  /* 시계가 다 돌았거나 [다 버텼어요]·[쉬기 건너뛰기]를 눌렀다 — 어느 시계인지 함께 */
  | { type: 'clock-end'; clock: Clock; at: number }
  | { type: 'go'; index: number }
  | { type: 'finish' }
  | { type: 'toast-end'; justDone: State['justDone'] };

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
        /* 아직 세트가 남았다 — 쉬는 시계. 운동 화면처럼 10분에서 자른다 */
        const secs = Math.min(items[i].restSeconds, REST_CLOCK_LIMIT_SECONDS);
        return {
          ...s,
          sets,
          side: 0,
          clock:
            secs > 0 ? { kind: 'rest', endsAt: a.at + secs * 1000, total: secs } : null,
        };
      }
      /* 이 운동을 마쳤다 — 안 한 다음 운동으로. 체크는 아래 effect 가 남긴다 */
      const done = s.done.map((d, k) => (k === i ? true : d));
      const next = nextUndone(done, i);
      const justDone = { index: i, at: a.at };
      return next == null
        ? { ...s, sets, done, side: 0, clock: null, finished: true, justDone }
        : { ...s, sets, done, side: 0, clock: null, index: next, justDone };
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
    case 'toast-end':
      return s.justDone === a.justDone ? { ...s, justDone: null } : s;
  }
}

function initState(list: PlayerItem[]): State {
  const done = list.map((it) => it.doneBefore);
  const first = done.findIndex((d) => !d);
  return {
    index: first === -1 ? 0 : first,
    sets: list.map((it) => (it.doneBefore ? it.sets : 0)),
    done,
    side: 0,
    clock: null,
    finished: list.length > 0 && first === -1,
    justDone: null,
  };
}

/** 이만큼 아무것도 안 누르면 화면 잠금을 놓는다 — 운동 화면이 쉬는 시계를 거두는 10분 */
const IDLE_MS = REST_CLOCK_LIMIT_SECONDS * 1000;

const buzz = (pattern: number | number[]) => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator)
    navigator.vibrate(pattern);
};

/**
 * 시계가 끝났다는 신호 — 진동과 짧은 소리.
 *
 * 예전에는 진동뿐이었는데, 아이폰은 웹에서 진동을 쓸 수 없어 버티기가 끝나도 아무
 * 신호가 없었다(2026-09-26 검토). 소리는 사람이 누른 순간에 한 번 깨워 둬야 난다
 * (브라우저 규칙) — 화면의 단추를 누를 때마다 깨운다(arm). 무음 모드면 소리가 안 날 수
 * 있다.
 */
function useAlarm() {
  const audio = useRef<AudioContext | null>(null);

  const arm = useCallback(() => {
    let ac = audio.current;
    if (!ac) {
      const Ctor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      try {
        ac = audio.current = new Ctor();
        /* 아이폰은 누른 순간에 무엇이든 한 번 울려야 뒤에 소리가 난다 — 들리지 않는 한 점 */
        const silent = ac.createBufferSource();
        silent.buffer = ac.createBuffer(1, 1, 22050);
        silent.connect(ac.destination);
        silent.start(0);
      } catch {
        /* 소리 없이 진동만 */
        return;
      }
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
  }, []);

  const ring = useCallback((kind: Clock['kind']) => {
    buzz(kind === 'hold' ? [180, 80, 180] : 250);
    const ac = audio.current;
    if (!ac || ac.state !== 'running') return;
    /* 버티기 끝은 두 번, 쉬기 끝은 한 번 — 눈을 안 떼도 어느 쪽인지 */
    for (let k = 0; k < (kind === 'hold' ? 2 : 1); k++) {
      const t = ac.currentTime + k * 0.22;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    }
  }, []);

  /* 화면을 떠나면 소리 연결을 닫는다 — 브라우저가 한 번에 여는 수에 한도가 있다 */
  useEffect(() => {
    const box = audio;
    return () => {
      const ac = box.current;
      box.current = null;
      ac?.close().catch(() => {});
    };
  }, []);

  return { arm, ring };
}

/**
 * 루틴 따라하기 — 운동 하나씩 크게, 세트와 버티기·쉬기 시계를 대신 세 준다.
 *
 * 2026-09-26 사용자분과 정한 품질 올리기의 둘째 — 목록을 읽지 않고 따라만 하면 되게.
 * 맞춤 루틴과 내 루틴이 함께 쓴다(page.tsx). 운동의 마지막 세트를 마치면 그 운동을
 * 체크하고(setExerciseDone — 루틴 목록의 체크와 같은 기록), 안 한 다음 운동으로 넘어간다.
 * 이미 체크한 운동은 건너뛴다.
 *
 * 버티는 운동은 [버티기 시작]을 누르면 시계가 세고 끝나면 진동·소리로 알린다. 세트
 * 사이는 운동에 적힌 휴식만큼 쉬는 시계가 돈다 — 건너뛸 수 있다.
 *
 * 화면이 꺼지지 않게 잡아 두되, 10분 동안 아무것도 안 누르면 놓는다(운동 화면과 같은 규칙).
 */
export function ArmcarePlayer({
  title,
  backHref,
  dateKey,
  notice,
  items: initialItems,
}: {
  title: string;
  backHref: string;
  /** 이 루틴의 날(YYYY-MM-DD) — 체크를 이 날에 남긴다(자정을 넘겨도) */
  dateKey: string;
  /** 위에 한 번 알릴 것 — 만든 뒤 바뀐 몸 상태, 통증을 남긴 날 */
  notice: string | null;
  items: PlayerItem[];
}) {
  /*
   * 목록은 처음 받은 것으로 못박는다. 체크를 남길 때마다 이 화면이 서버에서 새로
   * 그려지는데(새 items), 진행 상태(몇 번째 · 몇 세트)는 처음 목록의 차례를 가리킨다.
   * 그 사이 목록이 바뀌면(다른 기기에서 운동을 뺐다 등) 없는 운동을 읽다 오류가 나거나
   * 다른 운동이 체크됐다(2026-09-26 검토).
   */
  const [items] = useState(initialItems);
  const [state, dispatch] = useReducer(
    (s: State, a: Action) => reduce(s, a, items),
    items,
    initState
  );
  const { arm, ring } = useAlarm();

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

  /*
   * 체크 — 마친 운동을 기록에 남긴다. 한 운동은 한 번만 보낸다(sent).
   *
   * 신호가 끊겨 못 보낸 것은 남겨 뒀다가 다시 보낸다 — 다음 운동을 마칠 때, 신호가
   * 돌아올 때(online), [다시 보내기]를 누를 때. 예전에는 보내다 끊기면 그 오류가 화면
   * 전체로 번져, 운동 중에 오류 화면이 뜨고 진행이 사라졌다(2026-09-26 검토).
   */
  const sent = useRef(new Set<string>());
  const [saved, setSaved] = useState<ReadonlySet<string>>(() => new Set());
  const [failed, setFailed] = useState<{ ids: string[]; message: string | null }>({
    ids: [],
    message: null,
  });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const fail = (id: string, message: string | null) => {
      sent.current.delete(id);
      setFailed((f) => ({
        ids: f.ids.includes(id) ? f.ids : [...f.ids, id],
        message,
      }));
    };
    items.forEach((it, i) => {
      const id = it.exercise.id;
      if (!state.done[i] || it.doneBefore || sent.current.has(id)) return;
      sent.current.add(id);
      setExerciseDone(id, true, dateKey)
        .then((res) => {
          if ('error' in res) return fail(id, res.error);
          setSaved((prev) => new Set(prev).add(id));
          setFailed((f) => ({ ...f, ids: f.ids.filter((x) => x !== id) }));
        })
        .catch(() => fail(id, null));
    });
  }, [items, state.done, dateKey, retry]);
  useEffect(() => {
    const again = () => setRetry((n) => n + 1);
    window.addEventListener('online', again);
    return () => window.removeEventListener('online', again);
  }, []);

  /* 시계 — 끝나는 순간에 한 번. 버티기가 끝나면 세트를(좌우 각각이면 한쪽을) 마친다 */
  useEffect(() => {
    const clock = state.clock;
    if (!clock) return;
    const id = setTimeout(
      () => {
        ring(clock.kind);
        dispatch({ type: 'clock-end', clock, at: Date.now() });
      },
      Math.max(0, clock.endsAt - Date.now())
    );
    return () => clearTimeout(id);
  }, [state.clock, ring]);

  /*
   * 운동이 바뀌면 맨 위(영상 · 이름)부터 — 자세 설명을 읽느라 내려가 있던 자리에 다음
   * 운동이 뜨면, 무엇을 할 차례인지가 화면 밖에 있다. 운동 화면(/workout/run)과 같다.
   */
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [state.index]);

  /* 완료 알림은 잠깐만 */
  useEffect(() => {
    const justDone = state.justDone;
    if (!justDone) return;
    const id = setTimeout(() => dispatch({ type: 'toast-end', justDone }), 1800);
    return () => clearTimeout(id);
  }, [state.justDone]);

  const touch = () => {
    lastTouch.current = Date.now();
    if (idle) setIdle(false);
  };

  const shell = { title, backHref, items, state, onTouch: touch, onPress: arm };
  const unsent = failed.ids.length;
  const resend = () => setRetry((n) => n + 1);

  if (items.length === 0) {
    return (
      <Shell {...shell}>
        <p className="px-5 py-16 text-center text-sm text-muted">
          따라 할 운동이 없어요.
        </p>
      </Shell>
    );
  }

  if (state.finished) {
    const count = state.done.filter(Boolean).length;
    const all = count === items.length;
    const pending = items.some(
      (it, i) => state.done[i] && !it.doneBefore && !saved.has(it.exercise.id)
    );
    return (
      <Shell {...shell}>
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
              {count > 0 && !pending && ' · 기록에 체크됐어요'}
              {pending && unsent === 0 && ' · 기록에 남기는 중…'}
            </p>
            {unsent > 0 && <Unsent count={unsent} message={failed.message} onRetry={resend} />}
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
  const done = state.done[state.index];
  const clock = state.clock;
  /* 좌우 각각 버티는 운동이면 어느 쪽인지 붙인다 */
  const sideLabel = twoSides(it) ? (state.side === 0 ? '한쪽 ' : '반대쪽 ') : '';
  const amount =
    it.holdSeconds != null
      ? `${formatSeconds(it.holdSeconds)} 버티기`
      : it.reps != null
        ? `${it.reps}회`
        : '';
  const toast = state.justDone ? items[state.justDone.index].exercise.title : null;

  return (
    <Shell {...shell}>
      <div ref={scroller} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-4 px-4 py-4">
          {notice && (
            <p className="flex items-start gap-2 rounded-xl border border-warn-line bg-warn-bg px-3.5 py-2.5 text-[13px] leading-relaxed break-keep text-warn">
              <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
              {notice}
            </p>
          )}

          {/*
            운동마다 새로 그린다(key). 예전에는 영상과 자세 설명이 운동이 바뀌어도 같은
            부품으로 남아, 다음 운동으로 넘어가도 앞 운동의 영상이 돌고 설명 칸은 빈 채였다
            (2026-09-26 검토).
          */}
          <div key={ex.id} className="space-y-4">
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
              {it.unsafe && !done && (
                <p className="flex items-start gap-1.5 pt-1 text-[13px] leading-relaxed break-keep text-warn">
                  <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  지금 몸 상태에는 권하지 않는 운동이에요 — 건너뛰어도 돼요.
                </p>
              )}
            </div>

            <HowTo exercise={ex} />
          </div>
          {unsent > 0 && <Unsent count={unsent} message={failed.message} onRetry={resend} />}
        </div>
      </div>

      {/* 누르는 막대 — 엄지가 닿는 아래에 */}
      <div className="border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-xl space-y-2.5">
          {toast && (
            <p
              key={state.justDone?.at}
              role="status"
              className="finish-pop text-center text-sm font-semibold text-sky-strong"
            >
              ✓ {toast} 완료
            </p>
          )}
          {clock ? (
            <div className="space-y-2">
              <Countdown
                key={clock.endsAt}
                clock={clock}
                label={clock.kind === 'hold' ? `${sideLabel}버티는 중` : '쉬는 중'}
              />
              <button
                type="button"
                onClick={() => dispatch({ type: 'clock-end', clock, at: Date.now() })}
                className="w-full rounded-xl border border-line-strong py-3 text-sm font-semibold text-ink hover:border-sky"
              >
                {clock.kind === 'hold' ? '다 버텼어요' : '쉬기 건너뛰기'}
              </button>
            </div>
          ) : done ? (
            <p className="py-3 text-center text-sm font-semibold text-sky-strong">
              ✓ 오늘 이미 한 운동이에요
            </p>
          ) : it.holdSeconds != null ? (
            <button
              type="button"
              onClick={() => dispatch({ type: 'hold', at: Date.now() })}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky py-4 text-base font-bold text-white hover:bg-sky-strong"
            >
              <Play className="h-5 w-5" /> {sideLabel}
              {formatSeconds(it.holdSeconds)} 버티기 시작 ({doneSets + 1}/{it.sets})
            </button>
          ) : (
            <button
              type="button"
              onClick={() => dispatch({ type: 'set', at: Date.now() })}
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
  onPress,
  children,
}: {
  title: string;
  backHref: string;
  items: PlayerItem[];
  state: State;
  /** 화면을 만졌다 — 화면 잠금을 다시 잡는다 */
  onTouch: () => void;
  /** 무엇이든 눌렀다 — 끝 알림 소리를 깨워 둔다(누른 순간에만 깨울 수 있다) */
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col" onPointerDown={onTouch} onClickCapture={onPress}>
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

/** 남은 시간 '0:45' */
const clockText = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

/**
 * 버티기 · 쉬기 시계 — 남은 시간과 막대.
 *
 * 스스로 초를 센다. 예전에는 화면 전체가 0.2초마다 다시 그려졌고, 시계가 새로 시작하는
 * 순간에는 지난 시각으로 남은 시간을 셈해 45초 쉬기가 잠깐 '3:45'로 보였다(2026-09-26
 * 검토). 시계마다 새로 만들어(key) 시작하는 그 순간의 시각부터 센다.
 */
function Countdown({ clock, label }: { clock: Clock; label: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((clock.endsAt - now) / 1000));
  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-muted">{label}</span>
        <span className="text-display text-4xl tabular-nums text-ink">{clockText(left)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ${
            clock.kind === 'hold' ? 'bg-sky' : 'bg-line-strong'
          }`}
          style={{ width: `${clock.total ? (left / clock.total) * 100 : 0}%` }}
        />
      </div>
    </>
  );
}

/** 못 남긴 체크 — 몇 개인지와 [다시 보내기] */
function Unsent({
  count,
  message,
  onRetry,
}: {
  count: number;
  message: string | null;
  onRetry: () => void;
}) {
  return (
    <p className="rounded-xl border border-warn-line bg-warn-bg px-3.5 py-2.5 text-[13px] leading-relaxed break-keep text-warn">
      {message ?? '인터넷이 끊겨'} 체크 {count}개를 아직 못 남겼어요.{' '}
      <button type="button" onClick={onRetry} className="font-semibold underline">
        다시 보내기
      </button>
    </p>
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
 * 자세 설명 — 펼쳐야 받아 온다(글이 길어 처음부터 펼치지 않는다). 리바운드처럼 방식이
 * 붙은 운동이면 그 방식의 설명도 함께(MethodNote). 받는 법은 '자세·영상 보기'와 같다
 * (armcare-media.tsx 의 useExerciseDescription).
 */
function HowTo({ exercise }: { exercise: ArmcareExerciseView }) {
  const desc = useExerciseDescription(exercise.id);
  return (
    <details
      className="group rounded-xl bg-surface-2 px-3.5 py-2.5"
      onToggle={(e) => {
        if (e.currentTarget.open) desc.load();
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-muted">
        <Info className="h-3.5 w-3.5" /> 자세 설명
      </summary>
      <div className="mt-2 space-y-3">
        <DescriptionText desc={desc} />
        <MethodNote method={exercise.method} />
      </div>
    </details>
  );
}
