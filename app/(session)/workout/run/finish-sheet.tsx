'use client';

import { useState } from 'react';
import { Check } from '@/components/icon';
import { Modal } from '@/components/modal';
import { summarizeSets } from '@/lib/workout/summarize';
import { IntensityGuide } from '@/components/intensity-guide';
import type { RunSet } from './session-client';

/**
 * 운동을 마치기 직전 — 체감 강도를 받고 마친다.
 *
 * 마치면 축하 화면(app/(session)/workout/done)이 세 숫자 · 새 최고 · 한 운동을 크게 보여준다. 예전에는 그
 * 요약을 여기서 보였는데(마치면 곧장 트레이닝 목록으로 가서 숫자가 안 남았다), 이제 요약은 끝 화면의 몫이고
 * 이 창은 '마칠까요?'와 강도 하나에 집중한다 — 고를 것이 맨 위에 있다(2026-10-01 '감성').
 *
 * 체감 강도는 여기서 받는다. 트레이닝 화면에도 적는 자리가 있지만(training-note.tsx), 운동이 끝난 직후가
 * 가장 정확하게 답하는 순간이다. 여기서 안 골랐으면 축하 화면이 칩 하나로 한 번 더 묻는다(done/effort-card.tsx,
 * 트레이닝 추천 2판 P2) — 그래서 이제 여기서는 막지 않는다.
 */
export function FinishSheet({
  open,
  sets,
  startedAt,
  priorSeconds,
  pendingCount,
  onFinish,
  onClose,
  busy,
  error,
  program = null,
}: {
  /** 열림 — 닫힐 때 시트가 내려가도록 부모가 잠시 붙들어 둔다(components/modal.tsx useLinger) */
  open: boolean;
  sets: RunSet[];
  /**
   * 근력 · 파워 프로그램 날이면 — 다음 일차로 가는지(처방 세트 절반) 한 줄과 아직 안 답한 '몇 개 더?'(설계 §13-7 · 9).
   * 절반이 안 되면 조용히 안 넘어가는 대신 여기서 숫자로 미리 말한다.
   */
  program?: { line: string; reached: boolean; unanswered: string[] } | null;
  /** 본운동을 시작한 시각. 워밍업에 쓴 시간은 여기 안 들어간다. */
  startedAt: string;
  /** 다시 연 판이면 앞서 마친 구간들의 시간(초). 운동 시간에 더한다. */
  priorSeconds: number;
  /**
   * 폰에만 있고 아직 서버에 못 보낸 세트 수.
   *
   * 마치면 서버가 저장된 세트로 요약을 만든다. 못 보낸 것이 남은 채로 마치면
   * 그 세트는 요약에서 빠지고, 이 판은 닫혀 다시 받지도 않는다. 그래서 다
   * 보내질 때까지 마치기를 막는다.
   */
  pendingCount: number;
  onFinish: (intensity: number | null, memo: string) => void;
  onClose: () => void;
  busy: boolean;
  error: string | null;
}) {
  /*
   * 강도는 미리 고르지 않는다 — 5 를 띄워 두면 그대로 두고 넘기는데 이 숫자가 운동 부하 지수에 곱해진다.
   *
   * 예전에는 안 고르면 못 마치게 막았다(2026-10-01 — 이 자리를 지나면 아무도 다시 안 적는다). 2026-10-12 부터는 선택이다:
   * 안 고르고 마치면 축하 화면(done/effort-card.tsx)이 칩 하나(가벼움 · 보통 · 힘듦 · 아주 힘듦)로 한 번 더 묻는다 —
   * 열 칸을 고르는 것보다 누르기 쉬워 실제로 더 남는다(트레이닝 추천 2판 P2). 정밀하게 적고 싶은 사람은 여기 열 칸을 그대로 쓴다.
   *
   * 단 느낀점만 적고 강도를 안 고르면 막는다 — 강도 없이 온 메모는 서버가 버린다(DailyTrainingNote.intensity 가 비면 안 되고,
   * finishWorkout 은 강도가 숫자일 때만 저장한다). 적은 글이 말없이 사라지는 것이 가장 나쁘다.
   */
  const [intensity, setIntensity] = useState<number | null>(null);
  const [memo, setMemo] = useState('');
  const memoNeedsIntensity = memo.trim() !== '' && intensity == null;

  /* 이 화면을 연 시각으로 못박는다 — 고르는 동안 숫자가 올라가면 산만하다 */
  const [openedAt] = useState(() => Date.now());
  const minutes = Math.max(
    0,
    Math.round((priorSeconds * 1000 + (openedAt - Date.parse(startedAt))) / 60000)
  );
  const exerciseCount = summarizeSets(sets).length;

  /*
   * 앱의 다른 창과 같은 시트(components/modal.tsx) — 끌어내려 닫기 · ESC · 뒤 화면 막기 · 닫힐 때 내려가는 움직임 · 자판 위로 올라가기가
   * 같이 온다(2026-10-16 UI 검토, 예전엔 손으로 만든 div 시트). 마치기 단추는 굴러가지 않게 footer 로.
   */
  const footer = (
    <div className="space-y-2">
      {error && (
        <p className="rounded-xl bg-warn-bg px-3 py-2 text-center text-xs text-warn">
          {error}
        </p>
      )}
      {/*
        단추를 꺼야 할 때는 이유를 적는다 — 말없이 꺼 두면 고장 난 줄 안다. 무엇을 하면 켜지는지가 단추 바로
        위에 있어야 한다. 강도만 안 골랐으면 켜 둔다(마친 뒤 칩이 한 번 더 묻는다).
      */}
      {pendingCount > 0 ? (
        <p className="text-center text-xs leading-relaxed text-warn">
          아직 못 보낸 세트가 {pendingCount}개 있어요. 신호가 잡혀 저절로 보내지면 마칠
          수 있어요.
        </p>
      ) : (
        memoNeedsIntensity && (
          <p className="text-center text-xs text-muted">
            느낀점을 남기려면 강도도 골라 주세요.
          </p>
        )
      )}
      <button
        type="button"
        onClick={() =>
          !memoNeedsIntensity && pendingCount === 0 && onFinish(intensity, memo)
        }
        disabled={busy || memoNeedsIntensity || pendingCount > 0}
        className="flex h-[72px] w-full items-center justify-center gap-2 rounded-full bg-sky text-lg font-bold text-white transition disabled:opacity-40 motion-safe:active:scale-[0.98]"
      >
        <Check className="h-6 w-6" />
        {busy ? '정리 중' : '운동 마치기'}
      </button>
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        className="min-h-11 w-full rounded-full text-sm font-semibold text-sky transition-opacity disabled:opacity-40 active:opacity-60"
      >
        더 하기
      </button>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="오늘 운동을 마칠까요?"
      description={
        sets.length > 0
          ? `운동 ${exerciseCount}개 · ${sets.length}세트 · ${minutes}분`
          : `${minutes}분`
      }
      footer={footer}
    >
      {program && (
        <div className="mb-5 space-y-1 rounded-2xl bg-ink/6 px-4 py-3 text-sm leading-relaxed">
          <p className={program.reached ? 'font-semibold text-ink' : 'text-ink'}>
            {program.line}
          </p>
          {program.unanswered.length > 0 && (
            <p className="text-muted">
              아직 안 답한 &lsquo;몇 개 더?&rsquo;: {program.unanswered.join(', ')}
            </p>
          )}
        </div>
      )}
      {sets.length === 0 && (
        <p className="mb-5 rounded-2xl bg-ink/6 px-4 py-3 text-sm leading-relaxed text-muted">
          남긴 세트가 없어요. 이대로 마치면 오늘은 기록이 남지 않아요.
        </p>
      )}

      {/* ── 체감 강도 ── */}
      <p className="text-base font-bold text-ink">
        오늘 얼마나 힘들었나요?
        <span className="ml-1.5 text-xs font-semibold text-muted">선택</span>
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">
        얼마나 힘들었는지 골라요. 운동 부하를 이 숫자로 셈해요(나중에 골라도 돼요).
      </p>

      {/*
            1~10 을 눌러서 고른다.
            밀대(slider)는 엄지로 정확한 칸에 세우기가 어렵고, 손을 대는 순간
            어딘가가 골라져 '안 고름'을 남길 수가 없다.
          */}
      <div className="mt-3 grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            /* 한 번 고른 뒤 같은 것을 또 눌러도 안 비워진다 — 필수이므로 */
            onClick={() => setIntensity(n)}
            aria-pressed={intensity === n}
            className={`h-11 rounded-full text-sm font-semibold tabular-nums transition ${
              intensity === n
                ? 'bg-sky text-white motion-safe:scale-105'
                : 'bg-ink/6 text-ink active:bg-ink/12'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between px-1 text-caption text-muted">
        <span>1 아주 가벼움</span>
        <span>10 최대</span>
      </div>

      {/* 감으로 찍으면 그 뒤 계산이 전부 흔들린다 — 고르는 자리 바로 밑에 기준을 둔다 */}
      <div className="mt-2">
        <IntensityGuide kind="training" />
      </div>

      <label className="mt-4 block space-y-1.5">
        <span className="text-sm font-medium text-ink">
          느낀점
          <span className="ml-1.5 text-caption font-normal text-muted">선택</span>
        </span>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={2}
          placeholder="안 적어도 돼요. 무거웠던 곳, 잘 된 동작 같은 것."
          className="w-full resize-y rounded-2xl bg-ink/6 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-muted focus:bg-surface focus:ring-2 focus:ring-sky"
        />
      </label>
    </Modal>
  );
}
