'use client';

import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { updateCoachProfile, type LessonState } from '@/app/actions/lessons';
import { Button, Field, FormError, Input, Textarea } from '@/components/ui';
import { toast } from '@/components/toast';
import { guardFormAction } from '@/lib/action-offline';
import {
  CAREER_MAX,
  HOURS_MAX,
  INTRO_MAX,
  PRICE_NOTE_MAX,
  SPECIALTIES,
} from '@/lib/market/lessons';

export type CoachProfile = {
  orgId: string;
  publicProfile: boolean;
  coachIntro: string | null;
  coachCareer: string | null;
  specialties: string[];
  priceFrom: number | null;
  priceNote: string | null;
  lessonHours: string | null;
};

/** 코치 프로필(덕아웃 레슨 2판) — 공개 스위치 · 소개 · 경력 · 전문 · 가격 · 시간. 공개하면 /dugout/lessons 에 뜬다 */
export function CoachProfileForm({
  profile,
  canEdit,
}: {
  profile: CoachProfile;
  canEdit: boolean;
}) {
  const [state, action] = useActionState<LessonState, FormData>(
    guardFormAction(updateCoachProfile),
    undefined
  );
  useEffect(() => {
    if (state?.success) toast(state.success);
  }, [state]);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="orgId" value={profile.orgId} />
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-ink">
        <input
          type="checkbox"
          name="publicProfile"
          defaultChecked={profile.publicProfile}
          disabled={!canEdit}
          className="h-5 w-5 accent-sky"
        />
        덕아웃 레슨 목록에 공개 — 선수가 비교하고 예약을 요청할 수 있어요
      </label>
      <Field label="소개" hint="공개하려면 꼭 — 어떤 레슨인지, 누구에게 맞는지">
        <Textarea
          name="coachIntro"
          rows={4}
          maxLength={INTRO_MAX}
          defaultValue={profile.coachIntro ?? ''}
          readOnly={!canEdit}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="경력 한 줄" hint="선택">
          <Input
            name="coachCareer"
            type="text"
            maxLength={CAREER_MAX}
            defaultValue={profile.coachCareer ?? ''}
            readOnly={!canEdit}
            placeholder="선수 10년 · 지도 5년"
          />
        </Field>
        <Field label="레슨 시간" hint="선택">
          <Input
            name="lessonHours"
            type="text"
            maxLength={HOURS_MAX}
            defaultValue={profile.lessonHours ?? ''}
            readOnly={!canEdit}
            placeholder="평일 저녁 · 주말 오전"
          />
        </Field>
        <Field label="1회 가격(원)" hint="선택 — '부터'로 보여요">
          <Input
            name="priceFrom"
            type="text"
            inputMode="numeric"
            defaultValue={profile.priceFrom ?? ''}
            readOnly={!canEdit}
            placeholder="50000"
          />
        </Field>
        <Field label="가격 메모" hint="선택">
          <Input
            name="priceNote"
            type="text"
            maxLength={PRICE_NOTE_MAX}
            defaultValue={profile.priceNote ?? ''}
            readOnly={!canEdit}
            placeholder="10회권 40만"
          />
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-muted">전문 분야</legend>
        <div className="flex flex-wrap gap-2">
          {SPECIALTIES.map((s) => (
            <label
              key={s.key}
              className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 text-xs font-semibold text-ink has-checked:border-sky has-checked:bg-sky/10 has-checked:text-sky-strong"
            >
              <input
                type="checkbox"
                name={`specialty-${s.key}`}
                defaultChecked={profile.specialties.includes(s.key)}
                disabled={!canEdit}
                className="sr-only"
              />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>
      <FormError>{state?.error}</FormError>
      {canEdit ? (
        <Submit />
      ) : (
        <p className="text-xs text-muted">프로필은 레슨장을 만든 사람만 고쳐요.</p>
      )}
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? '저장하는 중…' : '저장'}
    </Button>
  );
}
