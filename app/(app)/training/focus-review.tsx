'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FocusView } from '@/lib/mechanics/program';
import { baselineReady, reviewDate, REVIEW_CHOICES, type ComparisonConditions, type ReviewChoice } from '@/lib/mechanics/comparison';
import { loadMechanicsReviewOptions, linkMechanicsAnalysis, recordMechanicsReviewDecision } from '@/app/actions/mechanics-review';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { quietRefresh } from '@/lib/quiet-refresh';

type Option = { reportId: string; jobId: string; requestedAt: string };
const number = (v: number | null) => (v === null ? '미측정' : v.toFixed(1));
export function FocusReview({ focus, readOnly = false }: { focus: FocusView; readOnly?: boolean }) {
  const router = useRouter(),
    [pending, start] = useTransition();
  const [options, setOptions] = useState<Option[] | null>(null),
    [picked, setPicked] = useState<Option | null>(null);
  const [asBaseline, setAsBaseline] = useState(false);
  const [conditions, setConditions] = useState<ComparisonConditions>('unknown'),
    [error, setError] = useState<string | null>(null);
  const review = focus.review,
    needsBaseline = !review || !baselineReady(review.baseline),
    adopt = asBaseline || needsBaseline;
  const run = (work: () => Promise<{ ok: true } | { error: string }>) =>
    start(async () => {
      setError(null);
      const r = await orOffline(work(), { error: OFFLINE_MESSAGE });
      if ('error' in r) setError(r.error);
      else {
        setOptions(null);
        setPicked(null);
        setAsBaseline(false);
        quietRefresh(router);
      }
    });
  return (
    <section className="space-y-3 rounded-xl border border-line p-4">
      <h3 className="font-semibold">처방 전후 측정 비교</h3>
      <p className="text-sm text-muted">수행·자가 평가와 측정 수치의 변화를 나눠 확인해요.</p>
      {focus.reviewInvalid ? <p className="text-sm text-warn">저장된 비교 정보를 확인하지 못해요. 기존 진행은 유지해요.</p> : null}
      {review ? (
        <>
          <p className="text-sm">
            {review.origin === 'start' ? '처방 시작 당시 기준' : '이후 등록한 비교 기준'} · {reviewDate(review.baseline.savedAt)} · 누적{' '}
            {review.baselinePractice}회 시점
          </p>
          {review.origin === 'later' ? (
            <p className="text-sm text-muted">처방 시작 전 측정이 아니에요. 이 기준 이후에 새로 촬영한 결과와 비교해요.</p>
          ) : null}
          {needsBaseline ? (
            <p className="text-sm text-warn">
              분석 당시 원본·촬영 조건을 확인하지 못해 직접 비교를 보류해요. 이전 기준은 보존하고 이후 비교 기준을 등록할 수 있어요.
            </p>
          ) : null}
          <Link className="inline-flex min-h-11 items-center text-sm text-sky-strong" href={`/videos/lab/${review.baseline.reportId}`}>
            기준 영상의 현재 리포트 열기
          </Link>
          <p className="text-xs text-muted">아래 수치는 연결 당시 저장본이에요. 리포트를 다시 분석해도 비교 기록은 바뀌지 않아요.</p>
          {review.followups.length === 0 ? (
            <p className="text-sm text-muted">연결한 재측정이 없어요. 같은 촬영 위치·배율·투구 세기로 새로 촬영한 뒤 분석해 주세요.</p>
          ) : null}
          {review.followups.map((f, i) => (
            <details
              key={`${f.snapshot.reportId}:${f.snapshot.jobId}`}
              open={i === review.followups.length - 1}
              className="space-y-2 border-t border-line pt-3"
            >
              <summary className="min-h-11 cursor-pointer text-sm font-semibold">
                {reviewDate(f.linkedAt)} 연결 · 기준 이후 {Math.max(0, f.practice - review.baselinePractice)}회 수행 ·{' '}
                {f.comparison.kind === 'measurement' ? '수치 변화 확인' : '비교 보류'}
              </summary>
              {f.comparison.reasons.map((r) => (
                <p key={r} className="text-sm text-warn">
                  {r}
                </p>
              ))}
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>지표</th>
                    <th>기준</th>
                    <th>재측정</th>
                    <th>차이</th>
                  </tr>
                </thead>
                <tbody>
                  {f.comparison.rows.map((r) => (
                    <tr key={r.key} className="border-t border-line">
                      <td className="py-2">
                        {r.label}
                        <span className="block text-xs text-muted">{r.reason ?? '수치 비교 가능'}</span>
                      </td>
                      <td>
                        {number(r.before)}
                        {r.unit}
                      </td>
                      <td>
                        {number(r.after)}
                        {r.unit}
                      </td>
                      <td>{r.delta === null ? '보류' : `${r.delta > 0 ? '+' : ''}${number(r.delta)}${r.unit}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-sm text-muted">{f.comparison.note}</p>
              <p className="text-sm">
                선택 기록:{' '}
                {review.decisions
                  .filter((d) => d.jobId === f.snapshot.jobId && d.reportId === f.snapshot.reportId)
                  .map((d) => REVIEW_CHOICES[d.choice])
                  .join(' → ') || '아직 선택하지 않았어요'}
              </p>
              {!readOnly ? (
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(REVIEW_CHOICES) as ReviewChoice[]).map((choice) => (
                    <button
                      key={choice}
                      disabled={pending || (choice === 'new' && !f.snapshot.hasRx) || (choice === 'practice' && !focus.skill)}
                      className="min-h-11 rounded-lg bg-surface-2 px-3 text-sm disabled:opacity-50"
                      onClick={() =>
                        run(() =>
                          recordMechanicsReviewDecision({
                            runId: focus.runId,
                            reviewId: review.id,
                            reportId: f.snapshot.reportId,
                            jobId: f.snapshot.jobId,
                            choice,
                          })
                        )
                      }
                    >
                      {REVIEW_CHOICES[choice]}
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="text-xs text-muted">
                재연습을 선택하면 현재 단계에서 새 수행 확인을 시작해요. 과거 수행은 남아요. 새 처방은 리포트에서 별도로 확인해 시작해요.
              </p>
              <Link className="inline-flex min-h-11 items-center text-sm text-sky-strong" href={`/videos/lab/${f.snapshot.reportId}`}>
                이 결과의 현재 리포트 열기
              </Link>
            </details>
          ))}
        </>
      ) : (
        <p className="text-sm text-muted">이전 처방에는 시작 당시 비교 기록이 없어요. 새 분석을 이후 비교 기준으로 등록할 수 있어요.</p>
      )}
      {!readOnly && !focus.reviewInvalid ? (
        <button
          disabled={pending}
          className="min-h-11 text-sm font-semibold text-sky-strong"
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await orOffline(loadMechanicsReviewOptions({ runId: focus.runId }), { error: OFFLINE_MESSAGE });
              if ('error' in r) setError(r.error ?? OFFLINE_MESSAGE);
              else {
                setOptions(r.options);
                setPicked(null);
                setConditions('unknown');
              }
            })
          }
        >
          {adopt ? '이후 비교 기준 등록' : '재측정 결과 연결'}
        </button>
      ) : null}
      {!readOnly && review && !adopt && !focus.reviewInvalid ? (
        <button
          disabled={pending}
          className="min-h-11 text-sm text-muted"
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await orOffline(loadMechanicsReviewOptions({ runId: focus.runId }), { error: OFFLINE_MESSAGE });
              if ('error' in r) setError(r.error ?? OFFLINE_MESSAGE);
              else {
                setAsBaseline(true);
                setOptions(r.options);
                setPicked(null);
              }
            })
          }
        >
          이전 기록을 보존하고 이후 비교 기준 새로 등록
        </button>
      ) : null}
      {options ? (
        <div className="space-y-3 border-t border-line pt-3">
          <p className="text-sm">
            {adopt ? '이후 비교 기준으로 사용할 내 분석' : '연결할 내 분석'}을 선택해 주세요. 같은 영상 재계산은 전후 변화로 해석하지
            않아요.
          </p>
          {options.length === 0 ? <p className="text-sm text-muted">완료된 내 투구 분석이 없어요.</p> : null}
          <div className="max-h-56 space-y-2 overflow-auto">
            {options.map((o) => (
              <button
                key={`${o.reportId}:${o.jobId}`}
                aria-pressed={picked?.jobId === o.jobId && picked?.reportId === o.reportId}
                disabled={pending}
                className={`block min-h-11 w-full rounded-lg border p-2 text-left text-sm ${picked?.jobId === o.jobId && picked?.reportId === o.reportId ? 'border-sky' : 'border-line'}`}
                onClick={() => setPicked(o)}
              >
                {reviewDate(o.requestedAt)} 분석 · {o.reportId.slice(0, 8)}
              </button>
            ))}
          </div>
          {!adopt ? (
            <>
              <p className="text-sm">촬영 위치·배율·투구 세기가 기준과 같았나요? (자가 확인)</p>
              <div className="flex gap-2">
                {(['same', 'different', 'unknown'] as const).map((c) => (
                  <button
                    key={c}
                    disabled={pending}
                    aria-pressed={conditions === c}
                    className="min-h-11 rounded-lg bg-surface-2 px-3 text-sm"
                    onClick={() => setConditions(c)}
                  >
                    {c === 'same' ? '같았어요' : c === 'different' ? '달랐어요' : '확인 못 했어요'}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <button
            disabled={pending || !picked}
            className="min-h-11 font-semibold text-sky-strong disabled:opacity-50"
            onClick={() =>
              picked &&
              run(() =>
                linkMechanicsAnalysis({
                  runId: focus.runId,
                  reviewId: review?.id ?? null,
                  reportId: picked.reportId,
                  jobId: picked.jobId,
                  mode: adopt ? 'baseline' : 'followup',
                  conditions,
                })
              )
            }
          >
            선택한 분석 연결
          </button>
          <button
            className="min-h-11 px-3 text-sm text-muted"
            disabled={pending}
            onClick={() => {
              setOptions(null);
              setAsBaseline(false);
            }}
          >
            닫기
          </button>
        </div>
      ) : null}
      <Link className="inline-flex min-h-11 items-center text-sm text-sky-strong" href="/videos/lab">
        새 영상 촬영·분석으로 이동
      </Link>
      {focus.reviewHistory?.length ? (
        <details>
          <summary className="min-h-11 cursor-pointer text-sm">이전 비교 기준 기록 {focus.reviewHistory.length}개</summary>
          {focus.reviewHistory.map((r) => (
            <FocusReview key={r.id} focus={{ ...focus, review: r, reviewHistory: [] }} readOnly />
          ))}
        </details>
      ) : null}
      {error ? <p className="text-sm text-warn">{error}</p> : null}
    </section>
  );
}
export function FocusHistory({ history }: { history: { focus: FocusView; endedOn: string; reason: string }[] }) {
  if (!history?.length) return null;
  return (
    <details className="rounded-2xl border border-line p-4">
      <summary className="min-h-11 cursor-pointer font-semibold">이전 처방 기록 {history.length}개</summary>
      {[...history].reverse().map((h, i) => (
        <div key={i} className="space-y-2 py-3">
          <p className="text-sm">
            {h.focus.startedOn} 시작 · {h.endedOn} {h.reason === 'replaced' ? '교체' : h.reason === 'reset' ? '프로그램 초기화' : '종료'} ·{' '}
            {h.focus.done}회 수행
          </p>
          <FocusReview focus={h.focus} readOnly />
        </div>
      ))}
    </details>
  );
}
