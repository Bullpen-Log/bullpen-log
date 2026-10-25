'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DRILL_EQUIPMENT } from '@/lib/exercise-meta';
import type { FocusView } from '@/lib/mechanics/program';
import { SKILL_STAGES } from '@/lib/mechanics/progression';
import { saveMechanicsEquipment, convertMechanicsFocus, recordMechanicsNextDay, advanceMechanicsStage } from '@/app/actions/mechanics';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { quietRefresh } from '@/lib/quiet-refresh';

export function MechanicsEquipment({ equipment }: { equipment: string[] }) {
  const [chosen, setChosen] = useState(equipment),
    [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-3 rounded-2xl border border-line p-4">
      <h3 className="font-semibold">오늘 메커니즘 장비</h3>
      <p className="text-sm text-muted">맨몸·야구공 외에 실제 사용할 장비를 확인해 주세요.</p>
      <div className="flex flex-wrap gap-3">
        {DRILL_EQUIPMENT.filter((e) => e !== '맨몸' && e !== '야구공').map((e) => (
          <label key={e} className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={chosen.includes(e)}
              disabled={pending}
              onChange={() => setChosen((v) => (v.includes(e) ? v.filter((x) => x !== e) : [...v, e]))}
            />
            {e}
          </label>
        ))}
      </div>
      <button
        className="min-h-11 font-semibold text-sky-strong"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await orOffline(saveMechanicsEquipment(['맨몸', '야구공', ...chosen.filter((e) => e !== '맨몸' && e !== '야구공')]), {
              error: OFFLINE_MESSAGE,
            });
            if ('error' in r) setError(r.error);
            else quietRefresh(router);
          })
        }
      >
        {pending ? '저장 중' : '사용 장비 저장'}
      </button>
      {error && <p className="text-sm text-warn">{error}</p>}
    </div>
  );
}
export function FocusProgress({ focus }: { focus: FocusView }) {
  const [pending, start] = useTransition(),
    [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const button = (label: string, job: () => Promise<{ ok: true } | { error: string }>, disabled = false) => (
    <button
      key={label}
      className="min-h-11 rounded-xl bg-surface-2 px-3 py-2 text-sm font-semibold text-sky-strong disabled:opacity-50"
      disabled={pending || disabled}
      onClick={() =>
        start(async () => {
          setError(null);
          const r = await orOffline(job(), { error: OFFLINE_MESSAGE });
          if ('error' in r) setError(r.error);
          else quietRefresh(router);
        })
      }
    >
      {label}
    </button>
  );
  const skill = focus.skill;
  if (!skill)
    return focus.canConvert ? (
      <div className="space-y-2">
        <p className="text-sm text-muted">누적 수행 기록은 보존하고 새 진행 기준으로 전환해요. 시작할 단계를 확인해 주세요.</p>
        {button('기초에서 새 기준 적용', () => convertMechanicsFocus({ reportId: focus.reportId, mode: 'basic' }))}
        {button('이전 연습 단계에서 재확인', () => convertMechanicsFocus({ reportId: focus.reportId, mode: 'review' }))}
        {error && <p className="text-sm text-warn">{error}</p>}
      </div>
    ) : null;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">누적 {focus.done}회 연습 · 횟수로 단계가 바뀌지 않아요.</p>
      <p className="text-sm text-muted">아래 확인은 자가 평가이며 3D 측정으로 검증된 개선과 구분해요.</p>
      {skill.blockedReason && <p className="text-sm text-warn">{skill.blockedReason}</p>}
      {skill.elements.map((e) => (
        <div key={e.fault} className="space-y-2 border-t border-line pt-3">
          <h3 className="font-semibold">
            {e.element} · {e.stage}
            {e.finished ? ' 자가 확인 완료' : ' 연습 중'}
          </h3>
          <p className="text-sm">동작 목표: {e.cue}</p>
          <p className="text-sm text-muted">{e.reason}</p>
          {e.evidenceId && !e.finished && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted">{e.practiceOn} 수행 후 반응</p>
              {(['clear', 'pain', 'unknown'] as const).map((response) =>
                button(
                  response === 'clear' ? '다음 날 통증 없었어요' : response === 'pain' ? '다음 날 통증 있었어요' : '아직 확인하지 못했어요',
                  () => recordMechanicsNextDay({ runId: skill.id, evidenceId: e.evidenceId!, response }),
                  !e.canRespond
                )
              )}
            </div>
          )}
          {e.ready &&
            !e.finished &&
            button(
              e.stage === '통합'
                ? '통합 단계 자가 확인 완료'
                : '자가 확인 후 ' + SKILL_STAGES[SKILL_STAGES.indexOf(e.stage) + 1] + ' 단계로 전환',
              () =>
                advanceMechanicsStage({
                  runId: skill.id,
                  fault: e.fault,
                  from: e.stage,
                  evidenceId: e.evidenceId!,
                  requestId: `${skill.id}:${e.fault}:${e.stage}:${e.evidenceId}`,
                }),
              !!skill.blockedReason
            )}
        </div>
      ))}
      <Link href={`/videos/lab/${focus.reportId}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-sky-strong">
        처방의 3D 리포트 보기
      </Link>
      {focus.finished && (
        <Link href="/videos/lab" className="inline-flex min-h-11 items-center text-sm font-semibold text-sky-strong">
          같은 조건으로 다시 촬영하기
        </Link>
      )}
      {error && <p className="text-sm text-warn">{error}</p>}
    </div>
  );
}
