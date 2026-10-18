'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, X } from '@/components/icon';
import { saveCheckin } from '@/app/actions/checkin';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { PAIN_FORCED_CONDITION, armPainJointsToday } from '@/lib/checkin';
import { partsFromSpots, type BodySpots } from '@/lib/body-spots';
import { shiftDateKey } from '@/lib/pitch-stats';
import { buzz, haptic } from '@/lib/haptics';
import { useTodayKey } from '@/components/use-today-key';
import { writeCheckinSkip } from '@/components/checkin-skip';
import { ConditionStep, MemoStep, PainStep, SleepStep } from './steps';
import type { CheckinFlowContext, CheckinPrefill } from './types';

/**
 * 체크인 3판 — 한 화면에 한 질문(2026-10-13 사용자: "토스처럼 … 환영 → 컨디션 → 불편한 곳 → 수면 → 메모 → 완료").
 *
 * 두 자리에서 같은 것을 그린다 — 휴대폰은 전체 화면(app/(session)/checkin, variant 'page'), PC 는 관문 · 종의 팝업 안
 * (variant 'popup'). 답은 신호 셋(lib/checkin.ts)만: 컨디션 · 수면의 질 · 불편한 곳(네 3D 몸 그림, 팔 통증 자리 · 정도) · 메모.
 * 운동 종류 · 끼니 · 던지는 일정은 그 탭의 카드로 갔다(app/actions/day-cards.ts).
 *
 *   진행 띠   위에 — 답한 질문 / 전체(통증 화면이 켜졌는지에 따라 전체가 다르다)
 *   처음으로  왼쪽 위 — 환영으로 돌아가되 답은 남긴다
 *   아래 막대 [이전](옅은 회색) · [다음](파랑). 통증 화면에는 가운데 '건너뛰기'. 환영은 [시작]만, 완료는 없음
 *   전환      지금 화면이 왼쪽으로 빠지며 살짝 옅어지고 다음 화면이 오른쪽에서 들어온다(0.26초) — 움직임 줄이기면 0.12초 옅어지기만.
 *             틀(띠 · 단추 · 처음으로)은 그대로. CSS 변형만 쓴다 — view-transition-name 은 글자 · 열린 창을 덮는 함정(메모리).
 *   초안      질문마다 답을 localStorage 에 적어 둔다(날짜 열쇠) — 중간에 나가도 이어 적게. 저장은 끝에 한 번(orOffline).
 *   고치기    오늘 체크인이 있으면 그 답으로 채우고 완료 글이 '고쳤어요'
 */

export type Answers = {
  condition: number;
  /** '몸에 불편한 곳이 있어요' — 컨디션 PAIN_FORCED_CONDITION 이하면 켜진 것으로 본다(effectivePain) */
  painOn: boolean;
  spots: BodySpots;
  armSpots: string[];
  armLevel: number | null;
  sleepQuality: number | null;
  note: string;
};

type StepKey = 'welcome' | 'condition' | 'pain' | 'sleep' | 'memo' | 'done';

const DRAFT_KEY = 'bullpen-checkin-draft';
/** 완료 화면을 보여 주는 시간 — 그 뒤 홈으로 */
const DONE_MS = 1500;
/** 화면 전환 시간 — steps 의 duration 과 같아야 한다 */
const SLIDE_MS = 260;
/** 아무것도 안 적었을 때 — 컨디션은 보통의 위(7), 잠은 보통(3) */
const DEFAULT: Answers = {
  condition: 7,
  painOn: false,
  spots: {},
  armSpots: [],
  armLevel: null,
  sleepQuality: 3,
  note: '',
};

function fromPrefill(p: CheckinPrefill): Answers {
  const hasPain = Object.keys(p.bodySpots).length > 0;
  return {
    condition: p.condition,
    painOn: hasPain,
    spots: p.bodySpots,
    armSpots: p.armPainSpots,
    armLevel: p.armPainLevel,
    sleepQuality: p.sleepQuality ?? DEFAULT.sleepQuality,
    note: p.note ?? '',
  };
}

function readDraft(day: string): Answers | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_KEY}:${day}`);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Answers>;
    return { ...DEFAULT, ...v, spots: v.spots ?? {}, armSpots: v.armSpots ?? [] };
  } catch {
    return null;
  }
}
function writeDraft(day: string, a: Answers) {
  try {
    localStorage.setItem(`${DRAFT_KEY}:${day}`, JSON.stringify(a));
  } catch {
    /* 못 적으면 이어 적기만 안 된다 */
  }
}
function clearDraft(day: string) {
  try {
    localStorage.removeItem(`${DRAFT_KEY}:${day}`);
  } catch {
    /* 없으면 그만 */
  }
}

/** 'N일 연속' — 오늘부터 하루씩 거슬러 체크인이 이어진 날 수 */
export function streakOf(days: readonly string[], today: string) {
  const have = new Set(days);
  let n = 0;
  let d = today;
  while (have.has(d)) {
    n++;
    d = shiftDateKey(d, -1);
  }
  return n;
}

export function CheckinFlow({
  variant,
  ctx,
  onDone,
  onSkip,
}: {
  /** page — 휴대폰 전체 화면(틀의 높이를 다 쓴다) · popup — PC 의 창 안(제 높이를 정한다) */
  variant: 'page' | 'popup';
  ctx: CheckinFlowContext;
  /** 완료 화면이 끝났을 때(popup) — 창을 닫는다. page 는 홈으로 간다 */
  onDone?: () => void;
  /** 환영에서 '오늘은 건너뛰기'(popup) — 창을 닫는다 */
  onSkip?: () => void;
}) {
  const router = useRouter();
  /* 오늘 — 브라우저의 날짜를 알기 전(서버 그림)에는 null 이라 아무것도 안 그린다 */
  const today = useTodayKey(null);
  const existing = useMemo(
    () => (today ? (ctx.recent.find((r) => r.date === today) ?? null) : null),
    [ctx.recent, today]
  );
  const yesterday = useMemo(
    () =>
      today
        ? (ctx.recent.find((r) => r.date === shiftDateKey(today, -1))?.condition ??
          null)
        : null,
    [ctx.recent, today]
  );
  /*
   * 답 = 처음 값(오늘 체크인 → 초안 → 기본) 위에 이 화면에서 고친 것. 처음 값을 매번 다시 재는 것이 아니라
   * 오늘 · 오늘 체크인이 바뀔 때만(useMemo) — 저장 뒤 서버가 오늘 줄을 보내 와도 보던 답이 그대로다.
   */
  const initial = useMemo<Answers | null>(() => {
    if (!today) return null;
    if (existing) return fromPrefill(existing);
    return readDraft(today) ?? DEFAULT;
  }, [today, existing]);
  const [edits, setEdits] = useState<Partial<Answers>>({});
  const answers: Answers | null = initial ? { ...initial, ...edits } : null;
  const patch = (p: Partial<Answers>) => setEdits((cur) => ({ ...cur, ...p }));

  /* 어느 화면인가 — prev 는 빠져나가는 화면(전환이 끝나면 지운다) */
  const [view, setView] = useState<{ cur: StepKey; prev: StepKey | null; dir: 1 | -1 }>(
    {
      cur: 'welcome',
      prev: null,
      dir: 1,
    }
  );
  useEffect(() => {
    if (!view.prev) return;
    const t = window.setTimeout(
      () => setView((v) => ({ ...v, prev: null })),
      SLIDE_MS + 40
    );
    return () => window.clearTimeout(t);
  }, [view.prev, view.cur]);
  const go = (next: StepKey, dir: 1 | -1) => {
    setError(null);
    setView((v) => (v.cur === next ? v : { cur: next, prev: v.cur, dir }));
  };

  const forcedPain = answers != null && answers.condition <= PAIN_FORCED_CONDITION;
  const painOn = answers != null && (forcedPain || answers.painOn);
  const steps: StepKey[] = [
    'welcome',
    'condition',
    ...(painOn ? (['pain'] as StepKey[]) : []),
    'sleep',
    'memo',
    'done',
  ];
  const questions: StepKey[] = steps.filter((s) => s !== 'welcome' && s !== 'done');
  const idx = steps.indexOf(view.cur);
  const qIdx = questions.indexOf(view.cur);
  /* 진행 띠 — 질문 수로 똑같이 나눠 지금 페이지까지 찬다(2026-10-13 사용자: "페이지 수에 따라 정확히 나눠"). 숫자는 안 적는다 */
  const filled =
    view.cur === 'welcome' ? 0 : view.cur === 'done' ? questions.length : qIdx + 1;

  /* 초안 — 고치는 날(오늘 체크인이 있음)은 안 적는다. 저장 뒤에도 안 적는다(saved) */
  /* 저장했으면 처음 체크인인지 고친 것인지 — 저장 뒤 화면을 다시 받으면(revalidatePath) existing 이 오늘 것으로 차서, 그걸 보면
     첫 체크인도 '고쳤어요'가 떴다. 그래서 저장하기 전에 정해 둔다 */
  const [saved, setSaved] = useState<false | 'new' | 'edit'>(false);
  useEffect(() => {
    if (!today || !answers || existing || saved) return;
    writeDraft(today, answers);
    // answers 는 매 그림마다 새 객체라 안의 값으로 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, existing, saved, JSON.stringify(answers)]);

  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!today || !answers) return;
    const wasEdit = existing != null;
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set('flow', '3');
      fd.set('date', today);
      fd.set('condition', String(answers.condition));
      if (answers.sleepQuality != null)
        fd.set('sleepQuality', String(answers.sleepQuality));
      const spots = painOn ? answers.spots : {};
      fd.set('bodySpots', JSON.stringify(spots));
      for (const [k, v] of Object.entries(partsFromSpots(spots))) fd.set(k, v);
      fd.set('armpain', '1');
      if (painOn) {
        for (const s of answers.armSpots) fd.append('armPainSpots', s);
        if (answers.armLevel != null) fd.set('armPainLevel', String(answers.armLevel));
      }
      fd.set('note', answers.note);
      const r = await orOffline(saveCheckin(undefined, fd), { error: OFFLINE_MESSAGE });
      if (!r || r.error) {
        setError(r?.error ?? '저장하지 못했어요. 다시 해 주세요.');
        return;
      }
      clearDraft(today);
      setSaved(wasEdit ? 'edit' : 'new');
      haptic('success');
      go('done', 1);
    });
  };

  const next = () => {
    if (view.cur === 'memo') {
      submit();
      return;
    }
    buzz(20);
    go(steps[idx + 1] ?? 'done', 1);
  };
  const back = () => {
    if (idx <= 1) {
      go('welcome', -1);
      return;
    }
    go(steps[idx - 1], -1);
  };
  const skipPain = () => {
    patch({ painOn: false, spots: {}, armSpots: [], armLevel: null });
    buzz(20);
    go('sleep', 1);
  };

  /* 한 번만 — 완료 화면을 연달아 누르면 홈 이동 · 창 닫기가 여러 번 불렸다 */
  const left = useRef(false);
  const finish = () => {
    if (left.current) return;
    left.current = true;
    if (variant === 'page') router.replace('/');
    else onDone?.();
  };
  const skipToday = () => {
    if (today) writeCheckinSkip(today);
    if (variant === 'page') router.replace('/');
    else onSkip?.();
  };

  /*
   * 완료 화면 — 1.5초 뒤 홈으로, 누르면 바로 홈으로. 가만히도 아픈 날(정도 3)은 쉬라는 카드라 저절로 안 넘어간다.
   * 예전에는 손대면 멈췄는데(hold) 완료 화면엔 단추가 없어, 누르는 순간 그 화면에 갇혀 멈춘 것처럼 보였다(2026-10-16 김민).
   */
  /* 어깨 · 팔꿈치가 '통증'일 때만 — 서버(parseArmPain)와 같은 규칙. 관절을 뻐근으로 내리거나 빼도 armLevel 은 남아 있어 카드가 떴다(2026-10-17) */
  const restCard =
    painOn &&
    answers != null &&
    answers.armLevel === 3 &&
    armPainJointsToday(partsFromSpots(answers.spots)).length > 0;
  /* 어깨 · 팔꿈치가 '통증'이면 얼마나 아픈지(정도)를 꼭 고른다 — 안 고르면 '다음'이 잠긴다(2026-10-18 사용자: "통증 표시하면 필수로") */
  const needArmLevel =
    view.cur === 'pain' &&
    answers != null &&
    answers.armLevel == null &&
    armPainJointsToday(partsFromSpots(answers.spots)).length > 0;
  useEffect(() => {
    if (view.cur !== 'done' || restCard) return;
    const t = window.setTimeout(finish, DONE_MS);
    return () => window.clearTimeout(t);
    // finish 는 변수 둘(variant · onDone)만 보는 함수라 매번 새로 만들어도 같은 일을 한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.cur, restCard]);

  if (!today || !answers) {
    return <div className={variant === 'page' ? 'flex-1' : 'h-[min(78dvh,42rem)]'} />;
  }

  const render = (step: StepKey): ReactNode => {
    switch (step) {
      case 'welcome':
        return <Welcome nickname={ctx.nickname} edit={existing != null} />;
      case 'condition':
        return (
          <ConditionStep
            value={answers.condition}
            onChange={(condition) => patch({ condition })}
            painOn={painOn}
            forced={forcedPain}
            onPainToggle={(on) => patch({ painOn: on })}
            yesterday={yesterday}
            usual={ctx.usualCondition}
          />
        );
      case 'pain':
        return (
          <PainStep
            spots={answers.spots}
            onSpots={(spots) => patch({ spots })}
            armSpots={answers.armSpots}
            onArmSpots={(armSpots) => patch({ armSpots })}
            armLevel={answers.armLevel}
            onArmLevel={(armLevel) => patch({ armLevel })}
          />
        );
      case 'sleep':
        return (
          <SleepStep
            value={answers.sleepQuality ?? DEFAULT.sleepQuality!}
            onChange={(sleepQuality) => patch({ sleepQuality })}
          />
        );
      case 'memo':
        return (
          <MemoStep
            value={answers.note}
            onChange={(note) => patch({ note })}
            error={error}
          />
        );
      case 'done':
        return (
          <Done
            today={today}
            days={[...ctx.streakDays, today]}
            edit={saved ? saved === 'edit' : existing != null}
            rest={restCard}
            onHome={finish}
          />
        );
    }
  };

  const showChrome = view.cur !== 'welcome' && view.cur !== 'done';

  return (
    <div
      className={
        variant === 'page'
          ? 'flex min-h-0 flex-1 flex-col bg-page'
          : 'flex h-[min(78dvh,42rem)] flex-col'
      }
    >
      {/*
        고치는 날 휴대폰 전체 화면의 환영 — 오른쪽 위 닫기(X)로 홈에(2026-10-13 사용자: "닫기는 우상단에 있으니 아래 단추는 필요 없다").
        PC 창은 창 자신의 X 가 있다(components/modal.tsx).
      */}
      {variant === 'page' && existing && view.cur === 'welcome' && (
        <header className="flex shrink-0 justify-end px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={() => router.replace('/')}
            aria-label="닫기"
            className="grid h-12 w-12 place-items-center rounded-full text-muted transition-colors hover:bg-ink/6 hover:text-ink"
          >
            <X aria-hidden className="h-7 w-7" />
          </button>
        </header>
      )}
      {/* 위 — 처음으로 · 몇 번째 · 진행 띠. 환영 · 완료에는 없다 */}
      {showChrome && (
        <header
          className={`shrink-0 px-5 ${variant === 'page' ? 'pt-[max(0.75rem,env(safe-area-inset-top))]' : 'pt-1'}`}
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => go('welcome', -1)}
              /* 저장 중에는 잠근다 — 그 사이 첫 화면으로 가면 실패 글(메모 화면 안)을 볼 길이 없었다 */
              disabled={pending}
              className="-ml-2 inline-flex min-h-12 items-center gap-0.5 rounded-full px-2 text-base font-medium text-muted transition-colors hover:text-ink disabled:opacity-50"
            >
              <ChevronLeft aria-hidden className="h-5 w-5" />
              처음으로
            </button>
            <span className="text-xs tabular-nums text-muted" aria-live="polite">
              {qIdx + 1} / {questions.length}
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={questions.length}
            aria-valuenow={qIdx + 1}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10"
          >
            {/* 한 페이지 = 전체의 1/질문 수 — 지금 페이지까지 정확히 그만큼 찬다(칸 표시 없이 띠 하나) */}
            <div
              className="h-full rounded-full bg-sky motion-safe:transition-[width] duration-[280ms] ease-out"
              style={{ width: `${(filled / questions.length) * 100}%` }}
            />
          </div>
        </header>
      )}

      {/* 가운데 — 화면 둘을 겹쳐 두고 전환한다 */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* 두 판의 key 는 화면 이름 — 나가는 판이 같은 노드로 남아(phase 만 leave 로) 3D 몸 · 찾기 칸이 다시 마운트되지 않는다(2026-10-17 전엔 깜빡였다) */}
        {view.prev && (
          <Pane key={view.prev} phase="leave" dir={view.dir}>
            {render(view.prev)}
          </Pane>
        )}
        <Pane
          key={view.cur}
          phase={view.prev ? 'enter' : 'idle'}
          dir={view.dir}
        >
          {render(view.cur)}
        </Pane>
      </div>

      {/* 아래 막대 */}
      {view.cur === 'welcome' ? (
        <footer
          className={`shrink-0 space-y-3 px-5 pt-2 ${variant === 'page' ? 'pb-[max(1rem,env(safe-area-inset-bottom))]' : 'pb-1'}`}
        >
          <button
            type="button"
            onClick={() => {
              buzz(20);
              go('condition', 1);
            }}
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-sky text-lg font-bold text-white transition-colors hover:bg-sky-strong"
          >
            {existing ? '고치기 시작' : '시작'}
          </button>
          {/*
            고치는 날은 아래 글 단추가 없다 — 닫기는 오른쪽 위(X)에 있다(2026-10-13 사용자).
            '로그인 · 회원가입 화면으로'는 뺐다(2026-10-17 김민) — 건너뛰기 바로 옆에서 누르면 묻지 않고 로그아웃됐다. 로그아웃은 설정에서.
          */}
          {!existing && (
            <div className="flex items-center justify-center text-sm text-muted">
              <button
                type="button"
                onClick={skipToday}
                className="min-h-11 underline-offset-2 hover:underline"
              >
                오늘은 건너뛰기
              </button>
            </div>
          )}
        </footer>
      ) : view.cur === 'done' ? null : (
        <footer
          className={`shrink-0 px-5 pt-2 ${variant === 'page' ? 'pb-[max(1rem,env(safe-area-inset-bottom))]' : 'pb-1'}`}
        >
          {/* 통증 화면의 건너뛰기 — 단추 줄 위에 작게(2026-10-13 사용자: "이전 · 다음 위에 작은 크기로") */}
          {view.cur === 'pain' && (
            <div className="mb-2 flex justify-center">
              <button
                type="button"
                onClick={skipPain}
                disabled={pending}
                className="min-h-10 rounded-full px-3 text-sm font-medium text-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
              >
                불편한 곳 없어요 · 건너뛰기
              </button>
            </div>
          )}
          {needArmLevel && (
            <p className="mb-2 text-center text-sm font-medium text-danger" aria-live="polite">
              얼마나 아픈지 골라 주세요
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={back}
              disabled={pending}
              className="flex h-14 min-w-28 items-center justify-center rounded-2xl bg-ink/6 px-5 text-base font-semibold text-ink transition-colors hover:bg-ink/10 disabled:opacity-50"
            >
              이전
            </button>
            <button
              type="button"
              onClick={next}
              disabled={pending || needArmLevel}
              className="flex h-14 flex-1 items-center justify-center rounded-2xl bg-sky text-lg font-bold text-white transition-colors hover:bg-sky-strong disabled:opacity-60"
            >
              {view.cur === 'memo'
                ? pending
                  ? '저장 중…'
                  : existing
                    ? '고치기'
                    : '완료'
                : '다음'}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

/**
 * 한 화면 — 들어오는 것(enter)은 오른쪽(또는 뒤로 가면 왼쪽)에서, 나가는 것(leave)은 반대로 빠진다.
 * 그린 다음 프레임에 자리를 바꿔 CSS 전환이 걸린다. 움직임 줄이기면 옅어지기만.
 */
function Pane({
  phase,
  dir,
  children,
}: {
  phase: 'idle' | 'enter' | 'leave';
  dir: 1 | -1;
  children: ReactNode;
}) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const moving = phase !== 'idle';
  let pos = 'translate-x-0 opacity-100';
  if (phase === 'enter' && !on) {
    pos =
      dir === 1
        ? 'motion-safe:translate-x-full motion-reduce:opacity-0'
        : 'motion-safe:-translate-x-full motion-reduce:opacity-0';
  } else if (phase === 'leave' && on) {
    pos =
      dir === 1
        ? 'motion-safe:-translate-x-full motion-safe:opacity-60 motion-reduce:opacity-0'
        : 'motion-safe:translate-x-full motion-safe:opacity-60 motion-reduce:opacity-0';
  }
  return (
    <div
      aria-hidden={phase === 'leave' || undefined}
      className={`absolute inset-0 overflow-y-auto overscroll-contain px-5 pt-5 pb-4 ${
        moving
          ? 'transition-[transform,opacity] duration-[260ms] ease-out motion-reduce:transition-opacity motion-reduce:duration-[120ms]'
          : ''
      } ${pos}`}
    >
      {children}
    </div>
  );
}

/** 환영 — 파란 동그라미에 흰 체크, 두 줄 인사. [시작]은 아래 막대에 */
function Welcome({ nickname, edit }: { nickname: string; edit: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="grid h-24 w-24 place-items-center rounded-full bg-sky text-white">
        <Check aria-hidden className="h-12 w-12" />
      </div>
      <h1 className="mt-7 text-2xl font-bold text-ink">
        {edit ? '오늘 체크인을 고칠게요' : `${nickname}님, 오늘 몸은 어때요?`}
      </h1>
      <p className="mt-2 text-base text-muted">
        {edit ? '바꿀 것만 고치고 끝까지 가면 돼요' : '오늘 몸 상태를 20초만 적어요'}
      </p>
    </div>
  );
}

/**
 * 완료 — 링이 그려지고 체크가 뜬다(globals.css done-ring · finish-pop · rise-in), 'N일째 체크인'. 1.5초 뒤 홈으로.
 * 가만히도 아픈 날(팔 통증 정도 3)은 그 대신 '오늘은 던지지 말고 쉬어요' 카드.
 */
function Done({
  today,
  days,
  edit,
  rest,
  onHome,
}: {
  today: string;
  days: string[];
  edit: boolean;
  rest: boolean;
  onHome: () => void;
}) {
  const streak = streakOf(days, today);
  return (
    <div
      className="flex h-full flex-col items-center justify-center text-center"
      /* 쉬라는 카드는 단추로 나간다 — 카드 글을 읽으려고 누른 손에 넘어가지 않게 */
      onClick={rest ? undefined : onHome}
    >
      <div className="relative h-24 w-24">
        <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            strokeWidth="7"
            className="stroke-sky/15"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            className="done-ring stroke-sky"
          />
        </svg>
        <span
          aria-hidden
          className="finish-pop done-check absolute inset-3 grid place-items-center rounded-full bg-sky text-white"
        >
          <Check className="h-10 w-10" />
        </span>
      </div>
      <p className="mt-6 text-2xl font-bold text-ink">
        {edit ? '고쳤어요' : '체크인했어요'}
      </p>
      {streak >= 1 && (
        <p className="rise-in mt-1 text-base font-semibold text-sky [--rise-delay:600ms]">
          {streak}일째 체크인
        </p>
      )}
      {rest ? (
        <div className="rise-in mt-6 w-full max-w-sm space-y-3 rounded-2xl border border-warn-line bg-warn-bg p-4 text-left [--rise-delay:700ms]">
          <p className="text-sm font-bold text-warn">오늘은 던지지 말고 쉬어요</p>
          <p className="text-sm leading-relaxed text-ink/80">
            가만히 있어도 아픈 날이에요. 트레이닝 탭 암케어만 하고, 며칠 이어지면 진료를
            받아요.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href="/training"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-sky px-5 text-sm font-semibold text-white hover:bg-sky-strong"
            >
              암케어 보기
            </a>
            <button
              type="button"
              onClick={onHome}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink/6 px-5 text-sm font-semibold text-ink hover:bg-ink/10"
            >
              홈으로
            </button>
          </div>
        </div>
      ) : (
        <p className="rise-in mt-4 text-sm text-muted [--rise-delay:700ms]">
          오늘 운동과 조언에 바로 반영해요
        </p>
      )}
    </div>
  );
}
