import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import type { FocusView } from '@/lib/mechanics/program';
import { baselineReady, reviewDate, REVIEW_CHOICES, type ComparisonConditions, type ReviewChoice } from '@/lib/mechanics/comparison';
import type { Palette } from '~/lib/ui';
import { Press } from '~/shell/press';
import { act } from '~/mechanics/parts';
type Option = { reportId: string; jobId: string; requestedAt: string };
const number = (v: number | null) => (v === null ? '미측정' : v.toFixed(1));
export function FocusReview({
  focus,
  reload,
  c,
  readOnly = false,
}: {
  focus: FocusView;
  reload: () => Promise<unknown>;
  c: Palette;
  readOnly?: boolean;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<Option[] | null>(null),
    [picked, setPicked] = useState<Option | null>(null);
  const [asBaseline, setAsBaseline] = useState(false);
  const [conditions, setConditions] = useState<ComparisonConditions>('unknown');
  const review = focus.review,
    needsBaseline = !review || !baselineReady(review.baseline),
    adopt = asBaseline || needsBaseline;
  const run = async (action: string, input: unknown) => {
    if (pending) return;
    setPending(true);
    setError(null);
    const r = await act<{ ok: true }>(action, input);
    if ('error' in r) setError(r.error);
    else {
      setOptions(null);
      setPicked(null);
      setAsBaseline(false);
      await reload();
    }
    setPending(false);
  };
  const button = (label: string, job: () => void, disabled = false, selected = false) => (
    <Press
      key={label}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: pending || disabled }}
      disabled={pending || disabled}
      onPress={job}
      style={{ padding: 12, borderRadius: 12, backgroundColor: selected ? c.sky + '22' : c.chip, opacity: pending || disabled ? 0.5 : 1 }}
    >
      <Text style={{ color: c.sky }}>{label}</Text>
    </Press>
  );
  const text = (s: string, warn = false) => (
    <Text key={s} style={{ color: warn ? c.warn : c.muted, lineHeight: 21 }}>
      {s}
    </Text>
  );
  return (
    <View style={{ gap: 12, padding: 14, borderWidth: 1, borderColor: c.line, borderRadius: 16 }}>
      <Text style={{ color: c.ink, fontWeight: '700' }}>처방 전후 측정 비교</Text>
      {text('수행·자가 평가와 측정 수치의 변화를 나눠 확인해요.')}
      {focus.reviewInvalid ? text('저장된 비교 정보를 확인하지 못해요. 기존 진행은 유지해요.', true) : null}
      {review ? (
        <>
          {text(
            `${review.origin === 'start' ? '처방 시작 당시 기준' : '이후 등록한 비교 기준'} · ${reviewDate(review.baseline.savedAt)} · 누적 ${review.baselinePractice}회 시점`
          )}
          {review.origin === 'later' ? text('처방 시작 전 측정이 아니에요. 이 기준 이후에 새로 촬영한 결과와 비교해요.') : null}
          {needsBaseline
            ? text(
                '분석 당시 원본·촬영 조건을 확인하지 못해 직접 비교를 보류해요. 이전 기준은 보존하고 이후 비교 기준을 등록할 수 있어요.',
                true
              )
            : null}
          {button('기준 영상의 현재 리포트 열기', () => router.push(`/lab/${review.baseline.reportId}`))}
          {text('아래 수치는 연결 당시 저장본이에요. 리포트를 다시 분석해도 비교 기록은 바뀌지 않아요.')}
          {!review.followups.length ? text('연결한 재측정이 없어요. 같은 촬영 위치·배율·투구 세기로 새로 촬영한 뒤 분석해 주세요.') : null}
          {review.followups.map((f, i) => (
            <Result
              key={`${f.snapshot.reportId}:${f.snapshot.jobId}`}
              title={`${reviewDate(f.linkedAt)} 연결 · 기준 이후 ${Math.max(0, f.practice - review.baselinePractice)}회 수행 · ${f.comparison.kind === 'measurement' ? '수치 변화 확인' : '비교 보류'}`}
              initial={i === review.followups.length - 1}
              c={c}
            >
              {f.comparison.reasons.map((r) => text(r, true))}
              {f.comparison.rows.map((r) => (
                <View key={r.key} style={{ gap: 4, paddingVertical: 8, borderTopWidth: 1, borderColor: c.line }}>
                  <Text style={{ color: c.ink, fontWeight: '600' }}>{r.label}</Text>
                  {text(`기준 ${number(r.before)}${r.unit} → 재측정 ${number(r.after)}${r.unit}`)}
                  {text(`차이: ${r.delta === null ? '보류' : `${r.delta > 0 ? '+' : ''}${number(r.delta)}${r.unit}`}`)}
                  {r.reason ? text(r.reason) : null}
                </View>
              ))}
              {text(f.comparison.note)}
              {text(
                '선택 기록: ' +
                  (review.decisions
                    .filter((d) => d.jobId === f.snapshot.jobId && d.reportId === f.snapshot.reportId)
                    .map((d) => REVIEW_CHOICES[d.choice])
                    .join(' → ') || '아직 선택하지 않았어요')
              )}
              {!readOnly
                ? (Object.keys(REVIEW_CHOICES) as ReviewChoice[]).map((choice) =>
                    button(
                      REVIEW_CHOICES[choice],
                      () =>
                        void run('mechanics-review.recordMechanicsReviewDecision', {
                          runId: focus.runId,
                          reviewId: review.id,
                          reportId: f.snapshot.reportId,
                          jobId: f.snapshot.jobId,
                          choice,
                        }),
                      (choice === 'new' && !f.snapshot.hasRx) || (choice === 'practice' && !focus.skill)
                    )
                  )
                : null}
              {text(
                '재연습을 선택하면 현재 단계에서 새 수행 확인을 시작해요. 과거 수행은 남아요. 새 처방은 리포트에서 별도로 확인해 시작해요.'
              )}
              {button('이 결과의 현재 리포트 열기', () => router.push(`/lab/${f.snapshot.reportId}`))}
            </Result>
          ))}
        </>
      ) : (
        text('이전 처방에는 시작 당시 비교 기록이 없어요. 새 분석을 이후 비교 기준으로 등록할 수 있어요.')
      )}
      {!readOnly && !focus.reviewInvalid
        ? button(
            adopt ? '이후 비교 기준 등록' : '재측정 결과 연결',
            () =>
              void (async () => {
                if (pending) return;
                setPending(true);
                setError(null);
                const r = await act<{ options: Option[] }>('mechanics-review.loadMechanicsReviewOptions', { runId: focus.runId });
                if ('error' in r) setError(r.error);
                else {
                  setOptions(r.options);
                  setPicked(null);
                  setConditions('unknown');
                }
                setPending(false);
              })()
          )
        : null}
      {!readOnly && review && !adopt && !focus.reviewInvalid
        ? button(
            '이전 기록을 보존하고 이후 비교 기준 새로 등록',
            () =>
              void (async () => {
                if (pending) return;
                setPending(true);
                setError(null);
                const r = await act<{ options: Option[] }>('mechanics-review.loadMechanicsReviewOptions', { runId: focus.runId });
                if ('error' in r) setError(r.error);
                else {
                  setAsBaseline(true);
                  setOptions(r.options);
                  setPicked(null);
                }
                setPending(false);
              })()
          )
        : null}
      {options ? (
        <View style={{ gap: 10 }}>
          {text(
            `${adopt ? '이후 비교 기준으로 사용할 내 분석' : '연결할 내 분석'}을 선택해 주세요. 같은 영상 재계산은 전후 변화로 해석하지 않아요.`
          )}
          {!options.length ? text('완료된 내 투구 분석이 없어요.') : null}
          {options.map((o) =>
            button(
              `${reviewDate(o.requestedAt)} 분석 · ${o.reportId.slice(0, 8)}`,
              () => setPicked(o),
              false,
              picked?.jobId === o.jobId && picked?.reportId === o.reportId
            )
          )}
          {!adopt ? (
            <>
              {text('촬영 위치·배율·투구 세기가 기준과 같았나요? (자가 확인)')}
              {(['same', 'different', 'unknown'] as const).map((x) =>
                button(
                  x === 'same' ? '같았어요' : x === 'different' ? '달랐어요' : '확인 못 했어요',
                  () => setConditions(x),
                  false,
                  conditions === x
                )
              )}
            </>
          ) : null}
          {button(
            '선택한 분석 연결',
            () =>
              picked &&
              void run('mechanics-review.linkMechanicsAnalysis', {
                runId: focus.runId,
                reviewId: review?.id ?? null,
                reportId: picked.reportId,
                jobId: picked.jobId,
                mode: adopt ? 'baseline' : 'followup',
                conditions,
              }),
            !picked
          )}
          {button('닫기', () => {
            setOptions(null);
            setAsBaseline(false);
          })}
        </View>
      ) : null}
      {button('새 영상 촬영·분석으로 이동', () => router.push('/lab'))}
      {focus.reviewHistory?.length ? (
        <Result title={`이전 비교 기준 기록 ${focus.reviewHistory.length}개`} c={c}>
          {focus.reviewHistory.map((r) => (
            <FocusReview key={r.id} focus={{ ...focus, review: r, reviewHistory: [] }} reload={reload} c={c} readOnly />
          ))}
        </Result>
      ) : null}
      {error ? text(error, true) : null}
    </View>
  );
}
function Result({ title, initial = false, c, children }: { title: string; initial?: boolean; c: Palette; children: React.ReactNode }) {
  const [open, setOpen] = useState(initial);
  return (
    <View style={{ gap: 10, borderTopWidth: 1, borderColor: c.line, paddingTop: 10 }}>
      <Press
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={{ paddingVertical: 12 }}
      >
        <Text style={{ color: c.ink, fontWeight: '600' }}>
          {title} {open ? '▴' : '▾'}
        </Text>
      </Press>
      {open ? children : null}
    </View>
  );
}
export function FocusHistory({
  history,
  reload,
  c,
}: {
  history: { focus: FocusView; endedOn: string; reason: string }[];
  reload: () => Promise<unknown>;
  c: Palette;
}) {
  if (!history?.length) return null;
  return (
    <Result title={`이전 처방 기록 ${history.length}개`} c={c}>
      {[...history].reverse().map((h, i) => (
        <View key={i} style={{ gap: 8 }}>
          <Text style={{ color: c.muted }}>
            {h.focus.startedOn} 시작 · {h.endedOn} {h.reason === 'replaced' ? '교체' : h.reason === 'reset' ? '프로그램 초기화' : '종료'} ·{' '}
            {h.focus.done}회 수행
          </Text>
          <FocusReview focus={h.focus} reload={reload} c={c} readOnly />
        </View>
      ))}
    </Result>
  );
}
