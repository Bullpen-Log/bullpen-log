'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { Modal } from '@/components/modal';
import { Button, Input } from '@/components/ui';
import { ErrorLine } from '@/components/error-line';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import {
  CKCUEST_METHOD,
  REHAB_STAGES,
  judgeStageTest,
  type RehabConditionKey,
  type RehabStage,
  type StageTest,
  type StageTestInput,
} from '@/lib/armcare/rehab';
import { changeRehabStage, setRehabCondition } from '@/app/actions/rehab';
import { RehabChips, PAIN_OPTIONS } from './rehab-chips';

export const YES_NO = [
  { value: 'yes', label: '예' },
  { value: 'no', label: '아니요' },
] as const;

/** 숫자 칸 → 숫자(비었거나 숫자가 아니면 null) */
export function num(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** 단계 시험에 적는 것 — 칸은 글자 그대로 쥐고, 판정할 때 숫자로 바꾼다 */
export type StageTestDraft = {
  painFree: string | null;
  similar: string | null;
  injured: string;
  other: string;
  pain: number | null;
  ckcFirst: string;
  ckcNow: string;
};

export function emptyStageTestDraft(ckcFirst: number | null = null): StageTestDraft {
  return {
    painFree: null,
    similar: null,
    injured: '',
    other: '',
    pain: null,
    ckcFirst: ckcFirst == null ? '' : String(ckcFirst),
    ckcNow: '',
  };
}

/** 적은 것 → 판정 입력 */
export function stageTestInput(test: StageTest, d: StageTestDraft): StageTestInput {
  return test.kind === 'rom'
    ? {
        painFree: d.painFree == null ? undefined : d.painFree === 'yes',
        similar: d.similar == null ? undefined : d.similar === 'yes',
      }
    : {
        injured: num(d.injured) ?? undefined,
        other: num(d.other) ?? undefined,
        pain: d.pain ?? undefined,
        ckcNow: num(d.ckcNow),
        ckcFirst: num(d.ckcFirst),
      };
}

/** 판정할 만큼 적었나 — 팔굽혀 터치는 없어도 된다(처음이면 오늘 기록만) */
export function stageTestFilled(test: StageTest, d: StageTestDraft): boolean {
  return test.kind === 'rom'
    ? d.painFree != null && d.similar != null
    : num(d.injured) != null && num(d.other) != null && d.pain != null;
}

/**
 * 단계 시험 칸(가이드라인 9절) — 단계 올리기 시트와 매주 확인의 ⑤가 같이 쓴다.
 *   1→2  양쪽 움직임 비교 — 예/아니요 둘
 *   2→3  양쪽 힘 횟수(90%) · 시험 중 통증
 *   3→4  같은 힘 횟수(100%, 어깨 95%) + 어깨 부위는 팔굽혀 터치 15초(첫 기록보다 늘었나)
 * 팔굽혀 터치의 '처음' 칸은 이 재활의 첫 기록(매주 확인에 남은 것)으로 미리 채운다. 매주 확인에서는 처음 기록을 고치지
 * 않는다(firstEditable false) — 오늘 기록이 남고, 첫 기록이 없으면 오늘 것이 '내 첫 기록'이 된다.
 */
export function StageTestFields({
  test,
  draft,
  onChange,
  firstEditable = true,
}: {
  test: StageTest;
  draft: StageTestDraft;
  onChange: (next: StageTestDraft) => void;
  firstEditable?: boolean;
}) {
  const set = (patch: Partial<StageTestDraft>) => onChange({ ...draft, ...patch });
  if (test.kind === 'rom') {
    return (
      <>
        <Ask title="다친 쪽을 움직일 때 아프지 않았어요?">
          <RehabChips
            label="아프지 않았어요"
            options={YES_NO}
            value={draft.painFree}
            onChange={(v) => set({ painFree: v })}
          />
        </Ask>
        <Ask title="반대쪽과 비슷하게 움직여요?">
          <RehabChips
            label="반대쪽과 비슷해요"
            options={YES_NO}
            value={draft.similar}
            onChange={(v) => set({ similar: v })}
          />
        </Ask>
      </>
    );
  }
  const first = num(draft.ckcFirst);
  return (
    <>
      <Ask title={`${test.exercise}, 지칠 때까지 몇 번?`}>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="다친 쪽"
            value={draft.injured}
            onChange={(v) => set({ injured: v })}
          />
          <NumberField
            label="반대쪽"
            value={draft.other}
            onChange={(v) => set({ other: v })}
          />
        </div>
        <p className="text-xs text-muted">
          다친 쪽이 반대쪽의 {test.percent}% 이상이면 통과예요.
        </p>
      </Ask>
      <Ask title="시험 중 가장 아팠던 정도 (0~10)">
        <RehabChips
          label="시험 중 통증"
          options={PAIN_OPTIONS}
          value={draft.pain}
          onChange={(v) => set({ pain: v })}
        />
      </Ask>
      {test.ckc && (
        <Ask title="팔굽혀 터치 15초 (3번 평균)">
          <p className="text-xs text-muted">{CKCUEST_METHOD}</p>
          {firstEditable ? (
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="처음 쟀을 때"
                value={draft.ckcFirst}
                onChange={(v) => set({ ckcFirst: v })}
                decimal
              />
              <NumberField
                label="오늘"
                value={draft.ckcNow}
                onChange={(v) => set({ ckcNow: v })}
                decimal
              />
            </div>
          ) : (
            <NumberField
              label={first == null ? '오늘 (처음이에요)' : `오늘 (내 첫 기록 ${first})`}
              value={draft.ckcNow}
              onChange={(v) => set({ ckcNow: v })}
              decimal
            />
          )}
          <p className="text-xs text-muted">
            {first == null
              ? '처음이면 오늘 기록이 내 첫 기록이 돼요. 다음부터 늘었는지 견줘요.'
              : '아프지 않게, 처음보다 늘었으면 통과예요.'}
          </p>
        </Ask>
      )}
    </>
  );
}

/** 판정 한 칸 — 통과면 체크, 아니면 못 넘은 까닭을 한 줄씩 */
export function JudgedBox({ pass, fails }: { pass: boolean; fails: string[] }) {
  return (
    <div
      className={`rounded-xl px-3.5 py-2.5 ${pass ? 'bg-sky-tint text-ink' : 'bg-surface-2 text-ink/85'}`}
    >
      {pass ? (
        <p className="flex items-center gap-2 font-semibold">
          <Check aria-hidden className="h-4 w-4 text-sky-strong" strokeWidth={3} />
          통과했어요
        </p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 marker:text-muted">
          {fails.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 단계 올리기 시트 — 그 단계의 시험(가이드라인 9절)을 적으면 그 자리에서 판정하고, 통과면 [N단계로].
 * 서버가 올리는 조건과 시험을 한 번 더 본다(app/actions/rehab.ts 의 changeRehabStage).
 */
export function StageTestSheet({
  open,
  onClose,
  test,
  stage,
  ready,
  ckcFirst = null,
}: {
  open: boolean;
  onClose: () => void;
  test: StageTest;
  stage: RehabStage;
  /** 올리는 조건이 다 찼나 — 아니면 시험을 적어도 올리지 못한다 */
  ready: boolean;
  /** 팔굽혀 터치 내 첫 기록(매주 확인에 남은 것) — '처음' 칸을 미리 채운다 */
  ckcFirst?: number | null;
}) {
  const [draft, setDraft] = useState(() => emptyStageTestDraft(ckcFirst));
  const [pending, startPending] = useTransition();
  const [error, setError] = useState<string>();
  const [fails, setFails] = useState<string[]>([]);

  const next = (stage + 1) as RehabStage;
  const input = stageTestInput(test, draft);
  const filled = stageTestFilled(test, draft);
  const judged = judgeStageTest(test, input);

  const submit = () => {
    setError(undefined);
    setFails([]);
    startPending(async () => {
      const res = await orOffline(
        changeRehabStage({ to: next, via: 'test', test: input }),
        { error: OFFLINE_MESSAGE }
      );
      if ('error' in res) {
        setError(res.error);
        if ('fails' in res) setFails(res.fails);
      } else onClose();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="단계 시험"
      description={`${stage}단계 → ${next}단계 ${REHAB_STAGES[next].name}`}
    >
      <div className="space-y-5 text-sm leading-relaxed break-keep">
        <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-ink/85">
          {test.method}
        </p>

        <StageTestFields test={test} draft={draft} onChange={setDraft} />

        {filled && <JudgedBox pass={judged.pass} fails={judged.fails} />}
        {!ready && (
          <p className="text-xs text-muted">
            올리는 조건(기간 · 깨끗한 세션)이 다 차면 올릴 수 있어요.
          </p>
        )}

        {error && (
          <ErrorLine>
            {error}
            {fails.length > 0 && ` ${fails.join(' · ')}`}
          </ErrorLine>
        )}

        <Button
          type="button"
          onClick={submit}
          disabled={!filled || !judged.pass || !ready || pending}
          className="w-full"
        >
          {pending ? '저장하는 중…' : `${next}단계로`}
        </Button>
      </div>
    </Modal>
  );
}

/**
 * [진단 받았어요] — 부위 재활을 병명 재활로. 단계 · 날짜는 그대로, 병명 바닥 기간 · 허용 통증이 붙는다.
 */
export function DiagnosisSheet({
  open,
  onClose,
  choices,
}: {
  open: boolean;
  onClose: () => void;
  choices: { key: RehabConditionKey; label: string }[];
}) {
  const [picked, setPicked] = useState<RehabConditionKey | null>(null);
  const [pending, startPending] = useTransition();
  const [error, setError] = useState<string>();

  const submit = () => {
    if (!picked) return;
    setError(undefined);
    startPending(async () => {
      const res = await orOffline(setRehabCondition(picked), {
        error: OFFLINE_MESSAGE,
      });
      if ('error' in res) setError(res.error);
      else onClose();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="진단 받았어요"
      description="병명에 맞춘 재활로 바꿔요"
    >
      <div className="space-y-5 text-sm leading-relaxed break-keep">
        <RehabChips
          label="진단"
          stacked
          options={choices.map((c) => ({ value: c.key, label: c.label }))}
          value={picked}
          onChange={setPicked}
        />
        <p className="text-xs text-muted">
          단계와 날짜는 그대로예요. 병명에 따라 최소 기간과 허용 통증이 바뀌어요.
        </p>
        {error && <ErrorLine>{error}</ErrorLine>}
        <Button
          type="button"
          onClick={submit}
          disabled={!picked || pending}
          className="w-full"
        >
          {pending ? '저장하는 중…' : '바꾸기'}
        </Button>
      </div>
    </Modal>
  );
}

/**
 * [단계 직접 바꾸기] — 언제나 된다(설계 8-5). 그 단계의 날짜와 세션을 새로 센다.
 */
export function StageChangeSheet({
  open,
  onClose,
  stage,
}: {
  open: boolean;
  onClose: () => void;
  stage: RehabStage;
}) {
  const [picked, setPicked] = useState<RehabStage | null>(null);
  const [pending, startPending] = useTransition();
  const [error, setError] = useState<string>();

  const submit = () => {
    if (!picked) return;
    setError(undefined);
    startPending(async () => {
      const res = await orOffline(changeRehabStage({ to: picked, via: 'direct' }), {
        error: OFFLINE_MESSAGE,
      });
      if ('error' in res) setError(res.error);
      else {
        setPicked(null);
        onClose();
      }
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="단계 직접 바꾸기"
      description={`지금 ${stage}단계 ${REHAB_STAGES[stage].name}`}
    >
      <div className="space-y-5 text-sm leading-relaxed break-keep">
        <RehabChips
          label="바꿀 단계"
          stacked
          options={([1, 2, 3, 4] as const)
            .filter((s) => s !== stage)
            .map((s) => ({ value: s, label: `${s}단계 ${REHAB_STAGES[s].name}` }))}
          value={picked}
          onChange={setPicked}
        />
        <p className="text-xs text-muted">
          바꾸면 그 단계의 날짜와 세션을 새로 세요. 아프면 낮추고, 시험 없이 올리는 것은
          권하지 않아요.
        </p>
        {error && <ErrorLine>{error}</ErrorLine>}
        <Button
          type="button"
          onClick={submit}
          disabled={!picked || pending}
          className="w-full"
        >
          {pending ? '저장하는 중…' : picked ? `${picked}단계로 바꾸기` : '바꾸기'}
        </Button>
      </div>
    </Modal>
  );
}

export function Ask({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <p className="font-semibold text-ink">{title}</p>
      {children}
    </section>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  decimal = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  decimal?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs text-muted">{label}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={decimal ? 'decimal' : 'numeric'}
        aria-label={label}
      />
    </label>
  );
}
