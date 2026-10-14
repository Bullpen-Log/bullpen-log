'use client';

import { useFormStatus } from 'react-dom';
import { RefreshCw } from '@/components/icon';
import { generateTodayPlan } from '@/app/actions/training-setup';
import { SafeForm } from '@/components/safe-form';
import { OpenCheckinButton } from '@/components/notice-bell';
import {
  STATE_NOTICE_TEXT,
  moreText,
  type StateNotice,
} from '@/lib/report/state-notice';

/**
 * 상태 바뀜 띠 — 트레이닝 일정 카드 위(트레이닝 추천 2판 P6-6, 2026-10-13).
 *
 * 일정을 만든 뒤 판단 입력(컨디션 · 아픈 곳 · 던진 기록 · 등판 답 …)이 바뀌었으면 무엇이 바뀌었는지 최대 세 줄과 '지금 상태로 다시 만들기'
 * 한 번 누름을 낸다. 띄울지 · 무엇을 · 누를 수 있는지는 순수 함수(lib/report/state-notice.ts stateNoticeOf)가 정하고, 여기서는 그리기만 한다.
 *
 * 다시 만들기는 만들 때 고른 조건 그대로(remakeFieldsOf — 숨은 칸)를 일정 만들기(generateTodayPlan)에 보낸다. 조건까지 바꾸고 싶으면 일정 카드의
 * '조건 바꿔 다시 만들기'를 펴면 된다(두 길을 다 둔다). SafeForm 이라 신호가 끊겨도 화면이 오류로 바뀌지 않고 띠 밑에 한 줄로 알린다
 * (lib/action-offline.ts orOffline). 성공하면 서버 동작이 이 화면으로 되돌려 보내 새 일정과 함께 띠가 사라진다(새 지문은 지금 상태와 같다).
 *
 * 경고 색 상자(border-warn-line bg-warn-bg)라 휴대폰은 테두리 없는 옅은 면, PC 는 테두리(globals.css). 누르는 자리는 44px.
 */
export function StateNoticeBand({
  notice,
  fields,
}: {
  notice: StateNotice;
  /** 다시 만들기가 보낼 숨은 칸(lib/report/state-notice.ts remakeFieldsOf) */
  fields: readonly (readonly [string, string])[];
}) {
  if (notice.kind !== 'remake') return null;
  return (
    <section
      aria-label={STATE_NOTICE_TEXT.title}
      className="space-y-2.5 rounded-2xl border border-warn-line bg-warn-bg px-(--block-pad) py-3 motion-safe:animate-fade-in"
    >
      <div className="flex items-start gap-2.5">
        <RefreshCw aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-bold text-warn">{STATE_NOTICE_TEXT.title}</p>
          <ul className="list-disc space-y-0.5 pl-4 text-xs leading-relaxed break-keep text-warn marker:text-warn/60">
            {notice.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
            {notice.more > 0 && <li>{moreText(notice.more)}</li>}
          </ul>
          {notice.note && (
            <p className="text-xs leading-relaxed break-keep text-warn">
              {notice.note}
            </p>
          )}
        </div>
      </div>
      {notice.canRemake ? (
        <SafeForm action={generateTodayPlan}>
          {fields.map(([name, value], i) => (
            <input key={`${name}-${i}`} type="hidden" name={name} value={value} />
          ))}
          <RemakeButton />
        </SafeForm>
      ) : notice.blockedBy === 'checkin' ? (
        <OpenCheckinButton className="inline-flex min-h-11 items-center rounded-full px-1 text-sm font-semibold text-sky-strong desk:min-h-8">
          {STATE_NOTICE_TEXT.checkinButton}
        </OpenCheckinButton>
      ) : null}
    </section>
  );
}

/** 한 번 누름 — 보내는 동안 글이 바뀌고 다시 못 누른다(두 번 만들지 않게). 모양은 일정 만들기 폼의 단추와 같다(components/training-forms.tsx) */
function RemakeButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 rounded-xl bg-sky px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong disabled:opacity-60 desk:min-h-0"
    >
      {pending ? STATE_NOTICE_TEXT.remaking : STATE_NOTICE_TEXT.remake}
    </button>
  );
}
