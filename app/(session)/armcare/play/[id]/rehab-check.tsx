'use client';

import { useState, useTransition } from 'react';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import {
  REHAB_FEEL_OPTIONS,
  REHAB_LEFTOVER_OPTIONS,
  type RehabFeel,
  type RehabLeftover,
  type RehabResult,
} from '@/lib/armcare/rehab';
import { saveRehabSession } from '@/app/actions/rehab';
import { RehabChips, PAIN_OPTIONS } from '@/app/(app)/training/rehab-chips';

/** 이미 남긴 오늘 답 — 다시 답할 때 미리 골라 둔다 */
export type RehabCheckInitial = {
  leftover: RehabLeftover;
  pain: number;
  feel: RehabFeel;
} | null;

/**
 * 재활 따라하기 끝의 3문항(가이드라인 7절) — 남은 통증 · 오늘 가장 아팠던 정도(0~10) · 느낌 → 판정 한 줄.
 *
 * 따라하기의 체크가 아직 서버에 가는 중이면(settled 아님) 기다린다 — 한 비율을 그날 체크로 세기 때문이다
 * (app/actions/rehab.ts 의 saveRehabSession). 다시 답하면 그날 줄을 고친다.
 */
export function RehabSessionCheck({
  dateKey,
  settled,
  initial,
}: {
  dateKey: string;
  /** 마친 운동의 체크가 다 갔나(또는 신호가 없어 폰에 담아 둠) */
  settled: boolean;
  initial: RehabCheckInitial;
}) {
  const [leftover, setLeftover] = useState<RehabLeftover | null>(
    initial?.leftover ?? null
  );
  const [pain, setPain] = useState<number | null>(initial?.pain ?? null);
  const [feel, setFeel] = useState<RehabFeel | null>(initial?.feel ?? null);
  const [pending, startPending] = useTransition();
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{ result: RehabResult; text: string } | null>(
    null
  );

  const ready = leftover != null && pain != null && feel != null;

  const submit = () => {
    if (leftover == null || pain == null || feel == null) return;
    setError(undefined);
    startPending(async () => {
      const res = await orOffline(saveRehabSession({ dateKey, leftover, pain, feel }), {
        error: OFFLINE_MESSAGE,
      });
      if ('error' in res) setError(res.error);
      else setResult({ result: res.result, text: res.text });
    });
  };

  if (result) {
    const warn = result.result === 'red' || result.result === 'refer';
    return (
      <p
        role="status"
        className={`finish-pop rounded-xl px-4 py-3 text-left text-sm leading-relaxed font-semibold break-keep ${
          warn ? 'border border-warn-line bg-warn-bg text-warn' : 'bg-sky-tint text-ink'
        }`}
      >
        {result.text}
      </p>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl bg-surface px-4 py-4 text-left text-sm leading-relaxed break-keep">
      <p className="text-heading text-base text-ink">오늘 어땠어요?</p>
      <div className="space-y-1.5">
        <p className="font-semibold text-ink">
          시작할 때 지난번 운동 뒤 통증이 남아 있었어요?
        </p>
        <RehabChips
          label="남은 통증"
          stacked
          options={REHAB_LEFTOVER_OPTIONS}
          value={leftover}
          onChange={setLeftover}
        />
      </div>
      <div className="space-y-1.5">
        <p className="font-semibold text-ink">
          오늘 운동 중 가장 아팠던 정도 <span className="text-muted">(0~10)</span>
        </p>
        <RehabChips
          label="가장 아팠던 정도"
          options={PAIN_OPTIONS}
          value={pain}
          onChange={setPain}
        />
      </div>
      <div className="space-y-1.5">
        <p className="font-semibold text-ink">어떤 느낌이었어요?</p>
        <RehabChips
          label="느낌"
          stacked
          options={REHAB_FEEL_OPTIONS}
          value={feel}
          onChange={setFeel}
        />
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger-line bg-danger-bg px-3.5 py-2.5 text-danger"
        >
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={!ready || !settled || pending}
        className="flex min-h-12 w-full items-center justify-center rounded-xl bg-sky text-base font-bold text-white transition-colors hover:bg-sky-strong disabled:opacity-50"
      >
        {pending ? '남기는 중…' : !settled ? '체크를 남기는 중…' : '남기기'}
      </button>
    </section>
  );
}
