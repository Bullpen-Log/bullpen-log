'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { writeReview, type LessonState } from '@/app/actions/lessons';
import { Button, FormError, Textarea } from '@/components/ui';
import { guardFormAction } from '@/lib/action-offline';
import { REVIEW_MAX, REVIEW_TAGS } from '@/lib/market/lessons';

/** 레슨 후기 — 끝난 예약에만. 별 다섯 중 고르고 한마디 */
export function ReviewForm({ bookingId }: { bookingId: string }) {
  const [state, action] = useActionState<LessonState, FormData>(
    guardFormAction(writeReview),
    undefined
  );
  const [rating, setRating] = useState(5);
  if (state?.success)
    return <p className="text-xs font-semibold text-sky-strong">{state.success}</p>;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="rating" value={rating} />
      <div className="flex gap-1" role="radiogroup" aria-label="별점">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            onClick={() => setRating(n)}
            className={`text-2xl ${n <= rating ? 'text-warn' : 'text-line-strong'}`}
          >
            ★
          </button>
        ))}
      </div>
      {/* 좋았던 점 칩(3판) — 코치 상세에 몇 명이 골랐는지 모인다 */}
      <div className="flex flex-wrap gap-1.5">
        {REVIEW_TAGS.map((t) => (
          <label
            key={t.key}
            className="inline-flex min-h-8 cursor-pointer items-center rounded-full border border-line px-3 text-xs font-semibold text-ink has-checked:border-sky has-checked:bg-sky/10 has-checked:text-sky-strong"
          >
            <input type="checkbox" name={`tag-${t.key}`} className="sr-only" />
            {t.label}
          </label>
        ))}
      </div>
      <Textarea
        name="body"
        rows={3}
        maxLength={REVIEW_MAX}
        required
        placeholder="어떤 점이 좋았는지, 다음 사람에게 한마디"
      />
      <FormError>{state?.error}</FormError>
      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="secondary" disabled={pending}>
      {pending ? '남기는 중…' : '후기 남기기'}
    </Button>
  );
}
