'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { formatSummary, summarizeSets, totalVolumeKg } from '@/lib/workout/summarize';
import { IntensityGuide } from '@/components/intensity-guide';
import type { RunExercise, RunSet } from './session-client';

/**
 * 운동을 마치기 전에 보는 요약.
 *
 * 왜 마치기 '전'인가. 마치고 나면 트레이닝 화면으로 돌아가는데, 거기서는
 * 오늘 무엇을 얼마나 했는지가 체크 표시로만 보인다. 한 시간을 쓰고 나서
 * 남는 것이 체크뿐이면 그 한 시간이 숫자로 안 남는다.
 *
 * 체감 강도도 여기서 받는다. 트레이닝 화면에도 적는 자리가 있지만
 * (training-note.tsx), 운동이 끝난 직후가 가장 정확하게 답하는 순간이고
 * 그 자리를 지나 화면을 옮기고 나면 아무도 다시 안 적는다.
 *
 * 요약은 서버가 저장할 때 쓰는 것과 같은 함수로 접는다
 * (lib/workout/summarize.ts). 규칙이 갈리면 화면에는 60kg 이라고 떠 놓고
 * 기록에는 다른 숫자가 들어간다.
 */
export function FinishSheet({
  exercises,
  sets,
  startedAt,
  priorSeconds,
  onFinish,
  onClose,
  busy,
  error,
}: {
  exercises: RunExercise[];
  sets: RunSet[];
  /** 본운동을 시작한 시각. 워밍업에 쓴 시간은 여기 안 들어간다. */
  startedAt: string;
  /** 다시 연 판이면 앞서 마친 구간들의 시간(초). 운동 시간에 더한다. */
  priorSeconds: number;
  onFinish: (intensity: number | null, memo: string) => void;
  onClose: () => void;
  busy: boolean;
  error: string | null;
}) {
  /*
   * 강도는 미리 고르지 않되, 안 고르면 못 마친다.
   *
   * 두 가지가 같이 간다. 5 를 띄워 두면 그대로 두고 넘기는데 이 숫자가 운동
   * 부하 지수에 곱해지므로, 아무것도 안 골라 둔 채로 연다.
   * 그리고 비워 둔 채로 마치지는 못하게 한다 — 이 앱에서 가장 중요한 입력값
   * 하나이고, 이 자리를 지나면 아무도 다시 안 적는다.
   *
   * 이 앱은 대체로 '권하되 강제하지 않는다'지만 여기는 막는 쪽으로 정했다.
   */
  const [intensity, setIntensity] = useState<number | null>(null);
  const [memo, setMemo] = useState('');

  /* 이 화면을 연 시각으로 못박는다 — 고르는 동안 숫자가 올라가면 산만하다 */
  const [openedAt] = useState(() => Date.now());
  const minutes = Math.max(
    0,
    Math.round((priorSeconds * 1000 + (openedAt - Date.parse(startedAt))) / 60000)
  );

  const summaries = summarizeSets(sets);
  const volume = totalVolumeKg(sets);
  const byId = new Map(exercises.map((e) => [e.id, e]));

  /* 목록 순서대로 — 한 것 먼저, 안 한 것은 아예 안 낸다 */
  const rows = exercises.flatMap((ex) => {
    const s = summaries.find((x) => x.exerciseId === ex.id);
    return s ? [{ ex, s }] : [];
  });
  /* 목록에서 뺀 뒤에도 기록이 남은 운동이 있으면 빠뜨리지 않는다 */
  const orphans = summaries.filter((s) => !byId.has(s.exerciseId));

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-shade/60"
      />

      <div className="relative flex max-h-[92%] flex-col rounded-t-3xl border-t border-line bg-surface">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="text-sm font-bold text-ink">오늘 운동을 마칩니다</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-lg p-1.5 text-muted transition-colors hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* 세 숫자만 크게. 더 늘리면 무엇을 봐야 할지 흐려진다. */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: '운동 시간', value: `${minutes}`, unit: '분' },
              { label: '총 세트', value: `${sets.length}`, unit: '세트' },
              {
                label: '총 볼륨',
                value: volume > 0 ? volume.toLocaleString('ko-KR') : '—',
                unit: volume > 0 ? 'kg' : '',
              },
            ].map((n) => (
              <div
                key={n.label}
                className="rounded-2xl border border-line bg-surface-2 px-2 py-3 text-center"
              >
                <p className="text-[11px] text-muted">{n.label}</p>
                <p className="mt-0.5 text-display text-xl text-ink">
                  {n.value}
                  <span className="ml-0.5 text-xs font-normal text-muted">
                    {n.unit}
                  </span>
                </p>
              </div>
            ))}
          </div>
          {volume > 0 && (
            <p className="mt-1.5 text-center text-[11px] text-muted/80">
              총 볼륨은 무게 × 횟수를 다 더한 값입니다. 맨몸·버티기는 빠집니다.
            </p>
          )}

          {sets.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-xs leading-relaxed text-muted">
              남긴 세트가 없습니다.
              <br />
              이대로 마치면 오늘은 기록이 남지 않습니다.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line">
              {rows.map(({ ex, s }) => (
                <li key={ex.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                    {ex.title}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {formatSummary(s)}
                  </span>
                </li>
              ))}
              {orphans.map((s) => (
                <li
                  key={s.exerciseId}
                  className="flex items-center gap-3 px-3.5 py-2.5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">
                    목록에서 뺀 운동
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {formatSummary(s)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* ── 체감 강도 ── */}
          <div className="mt-5">
            <p className="text-sm font-bold text-ink">
              오늘 얼마나 힘들었나요?
              <span className="ml-1.5 text-[11px] font-semibold text-sky">필수</span>
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              오늘 운동 전체가 얼마나 힘들었는지 고르세요. 이 숫자로 운동 부하 지수를
              계산합니다.
            </p>

            {/*
              1~10 을 눌러서 고른다.
              밀대(slider)는 엄지로 정확한 칸에 세우기가 어렵고, 손을 대는 순간
              어딘가가 골라져 '안 고름'을 남길 수가 없다.
            */}
            <div className="mt-2.5 grid grid-cols-10 gap-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  /* 한 번 고른 뒤 같은 것을 또 눌러도 안 비워진다 — 필수이므로 */
                  onClick={() => setIntensity(n)}
                  aria-pressed={intensity === n}
                  className={`h-11 rounded-lg border text-sm font-semibold tabular-nums transition-colors ${
                    intensity === n
                      ? 'border-sky bg-sky text-white'
                      : 'border-line-strong bg-surface text-ink active:bg-surface-2'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted">
              <span>1 아주 가벼움</span>
              <span>10 최대</span>
            </div>

            {/* 감으로 찍으면 그 뒤 계산이 전부 흔들린다 — 고르는 자리 바로 밑에 기준을 둔다 */}
            <div className="mt-2">
              <IntensityGuide kind="training" />
            </div>

            <label className="mt-3 block space-y-1.5">
              <span className="text-sm font-medium text-ink">
                느낀점
                <span className="ml-1.5 text-[11px] font-normal text-muted">선택</span>
              </span>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={2}
                placeholder="안 적어도 됩니다. 무거웠던 곳, 잘 된 동작 같은 것."
                className="w-full resize-y rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-sky"
              />
            </label>
          </div>
        </div>

        {/* ── 마치기 ── */}
        <div className="shrink-0 space-y-2 border-t border-line px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          {error && (
            <p className="rounded-lg bg-warn-bg px-3 py-2 text-center text-xs text-warn">
              {error}
            </p>
          )}
          {/*
            강도를 안 골랐으면 단추를 끄고 이유를 적는다.

            말없이 꺼 두면 고장 난 줄 안다. 무엇을 하면 켜지는지가 단추 바로
            위에 있어야 한다.
          */}
          {intensity == null && (
            <p className="text-center text-[11px] text-muted">
              오늘 강도를 고르면 마칠 수 있습니다.
            </p>
          )}
          <button
            type="button"
            onClick={() => intensity != null && onFinish(intensity, memo)}
            disabled={busy || intensity == null}
            className="flex h-[72px] w-full items-center justify-center gap-1.5 rounded-2xl bg-sky text-base font-bold text-white transition-transform disabled:opacity-40 motion-safe:active:scale-[0.98]"
          >
            <Check className="h-5 w-5" />
            {busy ? '정리 중' : '운동 마치기'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="w-full rounded-xl py-2.5 text-xs font-semibold text-muted transition-colors disabled:opacity-40 active:text-ink"
          >
            더 하기
          </button>
        </div>
      </div>
    </div>
  );
}
