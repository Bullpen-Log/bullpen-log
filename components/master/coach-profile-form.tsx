'use client';

import { useActionState, useEffect, useState } from 'react';
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
import { WEEKDAYS, type VenueHours } from '@/lib/market/venues';

export type CoachProfile = {
  orgId: string;
  publicProfile: boolean;
  coachIntro: string | null;
  coachCareer: string | null;
  specialties: string[];
  priceFrom: number | null;
  priceNote: string | null;
  lessonHours: string | null;
  /* 3판(2026-10-22) */
  coachName: string | null;
  trialPrice: number | null;
  slotMin: number;
  sinkerReview: boolean;
  lessonSlots: VenueHours | null;
  /* 관리자 편집(이름 · 지역도 같이) */
  name?: string;
  region?: string | null;
};

/**
 * 코치 프로필(덕아웃 레슨 3판) — 공개 스위치 · 코치 이름 · 소개 · 경력 · 전문 · 가격 · 체험가 · 레슨 길이 · 요일별 레슨 시간 · 싱커 기록 봐 줌.
 * 공개하면 /lessons 에 뜬다. 관리자(admin)는 레슨장 이름 · 지역도 여기서 고친다(관리자 코치 관리 화면).
 */
export function CoachProfileForm({
  profile,
  canEdit,
  admin = false,
}: {
  profile: CoachProfile;
  canEdit: boolean;
  admin?: boolean;
}) {
  const [state, action] = useActionState<LessonState, FormData>(
    guardFormAction(updateCoachProfile),
    undefined
  );
  const [slotsOn, setSlotsOn] = useState(!!profile.lessonSlots);
  useEffect(() => {
    if (state?.success) toast(state.success);
  }, [state]);
  const chip =
    'inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 text-xs font-semibold text-ink has-checked:border-sky has-checked:bg-sky/10 has-checked:text-sky-strong';
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="orgId" value={profile.orgId} />
      {admin && <input type="hidden" name="adminEdit" value="on" />}
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
      {admin && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="레슨장 이름">
            <Input name="name" type="text" maxLength={40} defaultValue={profile.name ?? ''} readOnly={!canEdit} />
          </Field>
          <Field label="지역" hint="서울 강남 · 경기 수원 처럼">
            <Input name="region" type="text" maxLength={40} defaultValue={profile.region ?? ''} readOnly={!canEdit} />
          </Field>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="코치 이름" hint="비우면 계정 이름으로 보여요">
          <Input
            name="coachName"
            type="text"
            maxLength={30}
            defaultValue={profile.coachName ?? ''}
            readOnly={!canEdit}
            placeholder="홍길동"
          />
        </Field>
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
      </div>
      <Field label="소개" hint="공개하려면 꼭 — 어떤 레슨인지, 누구에게 맞는지">
        <Textarea
          name="coachIntro"
          rows={4}
          maxLength={INTRO_MAX}
          defaultValue={profile.coachIntro ?? ''}
          readOnly={!canEdit}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="1회 가격(원)" hint="'부터'로 보여요">
          <Input
            name="priceFrom"
            type="text"
            inputMode="numeric"
            defaultValue={profile.priceFrom ?? ''}
            readOnly={!canEdit}
            placeholder="50000"
          />
        </Field>
        <Field label="첫 레슨 체험가(원)" hint="선택 — 목록에 ‘체험가’ 칩">
          <Input
            name="trialPrice"
            type="text"
            inputMode="numeric"
            defaultValue={profile.trialPrice ?? ''}
            readOnly={!canEdit}
            placeholder="30000"
          />
        </Field>
        <Field label="한 레슨 길이">
          <select
            name="slotMin"
            defaultValue={String(profile.slotMin || 60)}
            disabled={!canEdit}
            className="w-full rounded-xl border border-transparent bg-ink/5 px-4 py-3 text-sm text-ink desk:border-line desk:bg-surface-2"
          >
            {[30, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m}분
              </option>
            ))}
          </select>
        </Field>
      </div>
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
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-muted">전문 분야</legend>
        <div className="flex flex-wrap gap-2">
          {SPECIALTIES.map((s) => (
            <label key={s.key} className={chip}>
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
      <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="sinkerReview"
          defaultChecked={profile.sinkerReview}
          disabled={!canEdit}
          className="h-5 w-5 accent-sky"
        />
        싱커 기록 · 영상을 보고 레슨해요 <span className="text-xs text-muted">(목록에 ‘싱커 기록 봐 줌’ 칩)</span>
      </label>

      {/* 요일별 레슨 시간 — 켜면 예약 화면이 이 시간을 칸으로 자른다. 끄면 글로만 */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-medium text-muted">레슨 시간</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="slotsOn"
            checked={slotsOn}
            onChange={(e) => setSlotsOn(e.target.checked)}
            disabled={!canEdit}
            className="h-5 w-5 accent-sky"
          />
          요일별로 시간을 열어요 <span className="text-xs text-muted">(선수가 빈 칸을 보고 바로 골라요)</span>
        </label>
        {slotsOn ? (
          <div className="space-y-1.5">
            {WEEKDAYS.map((w, d) => {
              const h = profile.lessonSlots?.[d] ?? null;
              return (
                <div key={w} className="flex items-center gap-2 text-sm">
                  <span className={`w-6 font-semibold ${d === 0 ? 'text-danger' : d === 6 ? 'text-sky' : 'text-ink'}`}>{w}</span>
                  <Input name={`hours-${d}-open`} type="time" defaultValue={h?.open ?? ''} readOnly={!canEdit} className="px-2 py-1.5 text-xs" />
                  <span className="text-muted">~</span>
                  <Input name={`hours-${d}-close`} type="time" defaultValue={h?.close ?? ''} readOnly={!canEdit} className="px-2 py-1.5 text-xs" />
                  <label className="ml-auto inline-flex items-center gap-1 text-xs text-muted">
                    <input type="checkbox" name={`hours-${d}-closed`} defaultChecked={profile.lessonSlots ? !h : false} disabled={!canEdit} className="accent-sky" /> 쉼
                  </label>
                </div>
              );
            })}
          </div>
        ) : (
          <Field label="레슨 시간(글)" hint="선택 — ‘평일 저녁 · 주말 오전’처럼">
            <Input
              name="lessonHours"
              type="text"
              maxLength={HOURS_MAX}
              defaultValue={profile.lessonHours ?? ''}
              readOnly={!canEdit}
              placeholder="평일 저녁 · 주말 오전"
            />
          </Field>
        )}
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
