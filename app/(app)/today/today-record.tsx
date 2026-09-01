'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil } from 'lucide-react';
import { EntryForm, type EntryDraft } from '@/app/(app)/pitch-log/entry-form';
import { REST_SESSION_TYPE } from '@/lib/session-type';

/**
 * 오늘의 투구 기록.
 *
 * 예전에는 오늘 던진 것을 남기려면 투구 일지 화면으로 건너가야 했다. 그런데
 * 컨디션 체크인은 홈에 있고 운동 체크는 트레이닝에 있어서, 하루를 마치려면
 * 화면 셋을 돌아야 했다. 매일 해야 하는 일에 그만한 품이 들면 결국 안 하게
 * 되고, 기록이 없으면 부하 지수도 트레이닝도 돌지 않는다.
 *
 * 그래서 오늘 것만 여기로 가져왔다. 지난 날짜를 고치는 일은 그대로 투구
 * 일지에서 한다 — 화요일 기록을 깜빡했을 때 갈 곳이 있어야 한다.
 *
 * 값을 미리 채워두지는 않는다. 지난번 기록을 채워두면 누르기는 편하지만,
 * 실제로 던진 것과 다른 숫자가 그대로 저장될 수 있다. 그 숫자로 부하와
 * 휴식일이 정해지므로 편한 것보다 맞는 것이 먼저다.
 */

export type TodayLog = {
  id: string;
  sessionType: string;
  pitchCount: number;
  intensity: number;
  maxVelocity: number | null;
  avgVelocity: number | null;
  memo: string | null;
  /** 붙어 있는 영상. 고치는 폼이 이걸 그대로 다시 보내므로 빠뜨리면 안 된다. */
  videoPaths: string[];
};

/** 오늘의 투구 계획 — 기록과 나란히 두어 지켰는지 바로 보이게 한다. */
export type TodayPitchPlan = {
  throwing: boolean;
  /** 계획을 낼 수 없는 날은 null */
  maxPitches: number | null;
  maxIntensity: number | null;
};

export function TodayRecord({
  date,
  log,
  plan,
  analyzedPaths,
}: {
  /** 오늘 날짜 (YYYY-MM-DD) */
  date: string;
  /** 오늘 남긴 기록. 없으면 null */
  log: TodayLog | null;
  /** 폼 분석이 저장된 영상 경로 — 뺄 때 함께 사라진다고 알리는 데 쓴다 */
  analyzedPaths?: readonly string[];
  /** 오늘의 투구 계획. 계획을 안 낸 날은 null */
  plan: TodayPitchPlan | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'new' | 'edit'>('view');
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();

  const done = async () => {
    setMode('view');
    router.refresh();
  };

  /** 안 던진 날을 한 번에 남긴다. 폼을 열어 종류를 고르게 할 일이 아니다. */
  const markRested = () => {
    setError(undefined);
    startSaving(async () => {
      const res = await fetch('/api/pitch-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          sessionType: REST_SESSION_TYPE,
          videoPaths: [],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '저장에 실패했습니다.');
        return;
      }
      router.refresh();
    });
  };

  const resting = log?.sessionType === REST_SESSION_TYPE;

  /*
   * 계획을 넘겼는지 본다.
   *
   * 계획만 세워주고 지켰는지 아무도 안 보면 그 계획은 장식이다. 저장을 막지는
   * 않는다 — 이미 던진 것을 못 적게 하면 기록이 사라질 뿐이다.
   */
  const over =
    log && plan && !resting
      ? {
          pitches:
            plan.maxPitches != null && log.pitchCount > plan.maxPitches
              ? log.pitchCount - plan.maxPitches
              : 0,
          intensity: plan.maxIntensity != null && log.intensity > plan.maxIntensity,
          restDay: !plan.throwing,
        }
      : null;
  const overAnything = over && (over.pitches > 0 || over.intensity || over.restDay);

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {mode !== 'view' ? (
        <EntryForm
          date={date}
          initial={mode === 'edit' && log ? (log as EntryDraft) : undefined}
          onSaved={done}
          onError={setError}
          onCancel={() => setMode('view')}
          analyzedPaths={analyzedPaths}
        />
      ) : log ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky">
            <Check className="h-4 w-4" strokeWidth={3} />
            {resting ? '오늘은 쉬는 날로 남겼습니다' : '오늘 기록 완료'}
          </span>
          {!resting && (
            <span className="text-sm text-muted">
              {log.sessionType} · {log.pitchCount}구 · 강도 {log.intensity}
              {log.maxVelocity != null && ` · 최고 ${log.maxVelocity}km/h`}
            </span>
          )}
          <button
            type="button"
            onClick={() => setMode('edit')}
            className="inline-flex items-center gap-1 rounded-lg border border-line-strong px-2.5 py-1 text-xs text-ink transition-colors hover:border-sky hover:text-sky"
          >
            <Pencil className="h-3 w-3" />
            고치기
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <p className="text-sm leading-relaxed text-muted">
            아직 오늘 기록이 없습니다.{' '}
            <span className="text-ink">남기지 않으면 안 던진 날로 봅니다.</span> 나중에
            언제든 고칠 수 있습니다.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMode('new')}
              className="rounded-xl bg-sky px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-strong"
            >
              오늘 투구 기록하기
            </button>
            <button
              type="button"
              onClick={markRested}
              disabled={saving}
              className="rounded-xl border border-line-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-sky hover:text-sky disabled:opacity-60"
            >
              {saving ? '저장 중…' : '오늘 안 던졌어요'}
            </button>
          </div>
        </div>
      )}

      {/* 계획을 넘겼으면 알린다. 막지는 않고 알리기만 한다. */}
      {mode === 'view' && overAnything && (
        <p className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-xs leading-relaxed text-warn">
          {over.restDay
            ? '오늘은 쉬는 것이 계획이었습니다.'
            : [
                over.pitches > 0 ? `계획보다 ${over.pitches}구 많습니다` : null,
                over.intensity ? `계획 강도(${plan!.maxIntensity})를 넘었습니다` : null,
              ]
                .filter(Boolean)
                .join(' · ')}{' '}
          내일 계획에 반영됩니다. 어깨나 팔꿈치가 무거우면 체크인에 남겨주세요.
        </p>
      )}
    </div>
  );
}
