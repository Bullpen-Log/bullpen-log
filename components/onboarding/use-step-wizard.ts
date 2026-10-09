import { useEffect, useState } from 'react';

/**
 * 한 화면에 한 질문인 마법사의 뼈대 — 가입(app/login/auth-form.tsx)과 영양 온보딩(app/(app)/nutrition/setup/setup-wizard.tsx)이
 * 따로 들고 있던 같은 코드(답 상태 · 보이는 차례 · 다음/이전 · 막힌 칸으로 초점)를 훅 하나로. 투구 · 트레이닝 첫 설정
 * (/videos/setup · /training/setup, 2026-10-09)이 같은 뼈대로 선다.
 *
 * 답(answers)은 상태로 쥐고 끝에 한 번 보낸다. 차례(steps)는 답으로 셈한다 — 답에 따라 화면이 생기고 빠진다.
 * '다음'은 지금 화면을 check 로 먼저 본다. 막히면 problem(seq 가 하나 늘어 같은 문제도 다시 읽힌다)을 쥐고 그 칸으로
 * 초점을 보낸다. 서버가 막고 돌아오면 setProblem({error, field}) — stepOfField 로 그 칸의 화면으로 돌아가 초점.
 *
 * 쓰는 법:
 *   const w = useStepWizard<StepKey, Answers>({
 *     initial: EMPTY,
 *     steps: (a) => ['hand', ...(a.hand ? (['freq'] as const) : []), 'done'],
 *     check: (key, a) => (key === 'hand' && !a.hand ? { error: '던지는 손을 골라 주세요.', field: 'throwingHand' } : null),
 *     stepOfField: (field) => (field === 'throwingHand' ? 'hand' : null),
 *   });
 *   <StepCard titleKey={w.step} progress={(w.index + 1) / w.total} footer={<Button onClick={w.next}>다음</Button>}>
 *     {panel('hand', <Chips name="throwingHand" value={w.answers.hand} onChange={(v) => w.patch({ hand: v })} />)}
 *     {w.problem && <ProblemLine seq={w.seq}>{w.problem.error}</ProblemLine>}
 *   </StepCard>
 *   저장 응답이 막으면: w.setProblem({ error: res.error, field: res.field })
 *
 * 화면이 바뀌었을 때 위로 굴리고 첫 칸으로 초점을 옮기는 것은 쓰는 쪽의 몫이다(useEffect(…, [w.step])) — 폼 · 뿌리
 * ref 가 거기 있다.
 */

export type WizardProblem = { error: string; field: string };

export function useStepWizard<K extends string, A extends object>({
  initial,
  steps,
  check,
  stepOfField,
}: {
  initial: A;
  /** 답으로 셈한 화면 차례 — 비어 있으면 안 된다 */
  steps: (a: A) => K[];
  /** 이 화면을 넘어가도 되는가 — 막히면 까닭과 칸 이름 */
  check: (key: K, a: A) => WizardProblem | null;
  /** 칸 이름이 있는 화면 — 모르면 null(지금 화면에 머문다) */
  stepOfField: (field: string, a: A) => K | null;
}) {
  const [answers, setAnswers] = useState<A>(initial);
  const [key, setKey] = useState<K>(() => steps(initial)[0]);
  const [dir, setDir] = useState<'next' | 'back'>('next');
  /* 지금 보여 줄 문제 — 같은 문제가 다시 나도 다시 읽히고 초점이 가도록 번호(seq)를 붙인다 */
  const [problem, setProblemState] = useState<(WizardProblem & { seq: number }) | null>(
    null
  );

  const visible = steps(answers);
  const total = visible.length;
  /* 답이 바뀌어 지금 화면이 차례에서 빠졌으면 마지막 화면으로 */
  const found = visible.indexOf(key);
  const index = found < 0 ? Math.max(0, total - 1) : found;
  const step = visible[index];

  function patch(part: Partial<A>) {
    setAnswers((prev) => ({ ...prev, ...part }));
    /* 고치기 시작하면 막힌 까닭을 걷는다 — 다시 '다음'을 누르면 그때 다시 본다 */
    if (problem) setProblemState(null);
  }

  function goTo(to: K) {
    const at = visible.indexOf(to);
    if (at < 0) return;
    setDir(at < index ? 'back' : 'next');
    setKey(to);
  }

  function fail(p: WizardProblem) {
    setProblemState((prev) => ({ ...p, seq: (prev?.seq ?? 0) + 1 }));
  }

  function next() {
    if (index >= total - 1) return;
    const bad = check(step, answers);
    if (bad) return fail(bad);
    setProblemState(null);
    goTo(visible[index + 1]);
  }

  function back() {
    setProblemState(null);
    goTo(visible[Math.max(0, index - 1)]);
  }

  /** 서버가 막고 돌아왔을 때 — 그 칸의 화면으로 가서 알린다. null 이면 걷는다. */
  function setProblem(p: WizardProblem | null) {
    if (!p) return setProblemState(null);
    const at = stepOfField(p.field, answers);
    if (at !== null) goTo(at);
    fail(p);
  }

  /*
   * 문제의 칸으로 초점 — 그린 뒤(effect)에 보낸다. 서버가 막아 다른 화면으로 돌아갈 때는 그 화면이 아직 hidden 이라
   * 바로 focus() 하면 아무 일도 없다. seq 가 problem 안에 있어 같은 칸이 다시 막혀도 다시 간다.
   */
  useEffect(() => {
    if (problem) focusField(problem.field);
  }, [problem]);

  return {
    answers,
    patch,
    step,
    dir,
    index,
    total,
    visible,
    next,
    back,
    goTo,
    problem: problem && { error: problem.error, field: problem.field },
    seq: problem?.seq ?? 0,
    setProblem,
    focusField,
  };
}

/**
 * 칸으로 초점 — id "{name}-field"(Input · NumberUnitField · 고르는 묶음), data-field(고르는 묶음), name 차례로 찾는다.
 * 고르는 묶음이면 고른 단추(없으면 첫 단추)로. 숨은 칸(답을 보내는 input hidden)은 건너뛴다.
 * 한 그림 뒤(requestAnimationFrame)에 보낸다 — 누른 손에서 바로 부르면 아직 그 칸이 안 그려졌을 수 있다.
 */
function focusField(name: string) {
  requestAnimationFrame(() => {
    const id = CSS.escape(name);
    const target =
      document.getElementById(`${name}-field`) ??
      document.querySelector<HTMLElement>(`[data-field="${id}"]`) ??
      Array.from(document.querySelectorAll<HTMLElement>(`[name="${id}"]`)).find(
        (el) => !(el instanceof HTMLInputElement && el.type === 'hidden')
      );
    if (!target) return;
    if (target.dataset.field !== undefined) {
      const picked =
        target.querySelector<HTMLElement>('[aria-checked="true"]:not(:disabled)') ??
        target.querySelector<HTMLElement>('button:not(:disabled)');
      picked?.focus({ preventScroll: true });
      return;
    }
    target.focus({ preventScroll: true });
  });
}
