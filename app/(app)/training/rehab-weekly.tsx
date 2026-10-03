'use client';

import { useState, useTransition } from 'react';
import { ChevronLeft, CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui';
import { ErrorLine } from '@/components/error-line';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { judgeStageTest, type StageTest } from '@/lib/armcare/rehab';
import { saveRehabWeekly, type WeeklyTestInput } from '@/app/actions/rehab';
import { RehabChips, PAIN_OPTIONS } from './rehab-chips';
import {
  JudgedBox,
  StageTestFields,
  YES_NO,
  emptyStageTestDraft,
  num,
  stageTestFilled,
  stageTestInput,
} from './rehab-sheets';
import {
  ThrowingTestFields,
  emptyThrowingDraft,
  judgeThrowingDraft,
  throwingFilled,
  throwingInput,
  type RehabThrowingView,
} from './rehab-throwing';

/** 다치기 전 대비 % — 10 단위 */
const PCT_OPTIONS = Array.from({ length: 11 }, (_, i) => ({
  value: i * 10,
  label: `${i * 10}`,
}));

const STEP_NAMES = ['팔 상태', '통증', '활동 · 자신감', '단계 시험'] as const;

/**
 * 매주 확인(약 1분, 가이드라인 8절) — 한 장에 질문 하나 · 둘.
 *   ① 다치기 전 대비 %(0~100, 10 단위)
 *   ② 이번 주 가장 아팠던 정도 0~10 · 밤이나 쉴 때 아팠나
 *   ③ 시작 때 고른 내 활동 둘 각각 0~10 · ④ 세게 던질 자신감 0~10
 *   ⑤ 그 단계의 단계 시험 하나(9절 — 4단계는 투구 복귀표 열기 시험). 오늘은 건너뛸 수 있다
 * 남기면 서버가 결과(정도 낮추기 · 기간 줄이기 · 낮추기 · 진료)를 정해 한 줄씩 돌려준다(saveRehabWeekly).
 */
export function WeeklyFlow({
  stage,
  activities,
  stageTest,
  throwing,
  ckcFirst,
  onDone,
}: {
  stage: number;
  /** 시작 때 고른 내 활동(보통 둘) */
  activities: string[];
  /** 1~3단계의 단계 시험 */
  stageTest: StageTest | null;
  /** 4단계 — ⑤가 투구 복귀표 열기 시험 */
  throwing: RehabThrowingView | null;
  /** 팔굽혀 터치 내 첫 기록 */
  ckcFirst: number | null;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const [normalPct, setNormalPct] = useState<number | null>(null);
  const [worst, setWorst] = useState<number | null>(null);
  const [night, setNight] = useState<string | null>(null);
  const [scores, setScores] = useState<(number | null)[]>(() =>
    activities.map(() => null)
  );
  const [confidence, setConfidence] = useState<number | null>(null);
  const [skipTest, setSkipTest] = useState(false);
  const [draft, setDraft] = useState(() => emptyStageTestDraft(ckcFirst));
  const [throwDraft, setThrowDraft] = useState(emptyThrowingDraft);
  const [pending, startPending] = useTransition();
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{
    lines: string[];
    test: { pass: boolean; fails: string[] } | null;
  } | null>(null);

  const test = stage === 4 ? null : stageTest;
  const throwTest = stage === 4 ? throwing : null;
  const testFilled = test
    ? stageTestFilled(test, draft)
    : throwTest
      ? throwingFilled(throwDraft, throwTest.hasPlyo)
      : false;
  const judged = !testFilled
    ? null
    : test
      ? judgeStageTest(test, stageTestInput(test, draft))
      : throwTest && normalPct != null && confidence != null
        ? judgeThrowingDraft(throwTest, throwDraft, normalPct, confidence)
        : null;

  const canNext =
    (step === 0 && normalPct != null) ||
    (step === 1 && worst != null && night != null) ||
    (step === 2 && scores.every((s) => s != null) && confidence != null);
  const canSave = skipTest || (!test && !throwTest) || testFilled;

  const testInput = (): WeeklyTestInput | null => {
    if (skipTest) return null;
    if (test?.kind === 'rom')
      return {
        kind: 'rom',
        painFree: draft.painFree === 'yes',
        similar: draft.similar === 'yes',
      };
    if (test)
      return {
        kind: 'strength',
        injured: num(draft.injured) ?? 0,
        other: num(draft.other) ?? 0,
        pain: draft.pain ?? 0,
        ckc: test.kind === 'strength' && test.ckc ? num(draft.ckcNow) : null,
      };
    if (throwTest)
      return { kind: 'throwing', ...throwingInput(throwDraft, throwTest.hasPlyo) };
    return null;
  };

  const save = () => {
    if (normalPct == null || worst == null || night == null || confidence == null)
      return;
    setError(undefined);
    startPending(async () => {
      const res = await orOffline(
        saveRehabWeekly({
          normalPct,
          worstPain: worst,
          nightPain: night === 'yes',
          activities: scores.map((s) => s ?? 0),
          confidence,
          test: testInput(),
        }),
        { error: OFFLINE_MESSAGE }
      );
      if ('error' in res) setError(res.error);
      else setResult({ lines: res.lines, test: res.test });
    });
  };

  if (result) {
    return (
      <div className="space-y-4 text-sm leading-relaxed break-keep">
        <p className="flex items-center gap-2 text-heading text-lg text-ink">
          <CircleCheck aria-hidden className="h-5 w-5 text-sky-strong" />
          이번 주 확인을 남겼어요
        </p>
        <ul className="space-y-2" role="status">
          {result.lines.map((line) => (
            <li key={line} className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-ink">
              {line}
            </li>
          ))}
        </ul>
        {result.test && (
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-muted">
              {stage === 4 ? '투구 복귀표 열기 시험' : '단계 시험'}
            </p>
            <JudgedBox pass={result.test.pass} fails={result.test.fails} />
          </div>
        )}
        <Button type="button" onClick={onDone} className="w-full">
          닫기
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-sm leading-relaxed break-keep">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden>
          {STEP_NAMES.map((name, i) => (
            <span
              key={name}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-sky' : 'bg-line'}`}
            />
          ))}
        </div>
        <span className="text-xs text-muted tabular-nums">
          {step + 1}/{STEP_NAMES.length}
        </span>
      </div>

      {step === 0 && (
        <Question title="지금 팔 상태는 다치기 전과 비교해 몇 %예요?">
          <RehabChips
            label="다치기 전 대비 %"
            options={PCT_OPTIONS}
            value={normalPct}
            onChange={setNormalPct}
          />
          <p className="text-xs text-muted">100이면 다치기 전과 같아요.</p>
        </Question>
      )}

      {step === 1 && (
        <Question title="이번 주 가장 아팠던 정도 (0~10)">
          <RehabChips
            label="이번 주 가장 아팠던 정도"
            options={PAIN_OPTIONS}
            value={worst}
            onChange={setWorst}
          />
          <div className="space-y-1 pt-2">
            <p className="font-semibold text-ink">밤이나 쉴 때 아픈 적 있었어요?</p>
            <RehabChips
              label="밤이나 쉴 때 아팠어요"
              options={YES_NO}
              value={night}
              onChange={setNight}
            />
          </div>
        </Question>
      )}

      {step === 2 && (
        <Question
          title="내 활동을 얼마나 할 수 있어요? (0~10)"
          hint="0 은 못 해요, 10 은 다치기 전처럼 해요."
        >
          {activities.map((label, i) => (
            <div key={label} className="space-y-1">
              <p className="font-semibold text-ink">{label}</p>
              <RehabChips
                label={label}
                options={PAIN_OPTIONS}
                value={scores[i]}
                onChange={(v) =>
                  setScores((list) => list.map((s, j) => (j === i ? v : s)))
                }
              />
            </div>
          ))}
          <div className="space-y-1 pt-2">
            <p className="font-semibold text-ink">세게 던질 자신감 (0~10)</p>
            <RehabChips
              label="세게 던질 자신감"
              options={PAIN_OPTIONS}
              value={confidence}
              onChange={setConfidence}
            />
          </div>
        </Question>
      )}

      {step === 3 && (
        <Question
          title={stage === 4 ? '투구 복귀표 열기 시험' : '단계 시험'}
          hint={
            stage === 4
              ? '통과하면 투구 복귀표가 열려요.'
              : '두 번 이어 통과하면 이 단계 기간이 줄어들 수 있어요.'
          }
        >
          {skipTest ? (
            <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-ink/85">
              오늘은 시험 없이 남겨요.
            </p>
          ) : (
            <>
              {test && (
                <>
                  <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-ink/85">
                    {test.method}
                  </p>
                  <StageTestFields
                    test={test}
                    draft={draft}
                    onChange={setDraft}
                    firstEditable={false}
                  />
                </>
              )}
              {throwTest && (
                <ThrowingTestFields
                  hasPlyo={throwTest.hasPlyo}
                  draft={throwDraft}
                  onChange={setThrowDraft}
                />
              )}
              {judged && <JudgedBox pass={judged.pass} fails={judged.fails} />}
            </>
          )}
          <button
            type="button"
            onClick={() => setSkipTest((v) => !v)}
            className="inline-flex min-h-11 items-center rounded-full px-1 text-sm font-semibold text-sky-strong hover:underline"
          >
            {skipTest ? '시험할게요' : '오늘은 시험 건너뛰기'}
          </button>
        </Question>
      )}

      {error && <ErrorLine>{error}</ErrorLine>}

      <div className="flex items-center gap-2 border-t border-line pt-4">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-muted hover:text-ink"
          >
            <ChevronLeft aria-hidden className="h-4 w-4" />
            이전
          </button>
        )}
        <div className="flex-1" />
        {step < 3 ? (
          <Button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext}
          >
            다음
          </Button>
        ) : (
          <Button type="button" onClick={save} disabled={!canSave || pending}>
            {pending ? '남기는 중…' : '남기기'}
          </Button>
        )}
      </div>
    </div>
  );
}

function Question({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-heading text-lg text-ink">{title}</h3>
        {hint && <p className="text-xs leading-relaxed text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
