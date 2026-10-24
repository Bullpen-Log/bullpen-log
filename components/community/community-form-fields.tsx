'use client';

import { Field, Input } from '@/components/ui';
import { kept, keptAll, type FormValues } from '@/lib/form-values';
import {
  COMMUNITY_REGIONS,
  MEET_AGES,
  MEET_CAPACITY_MAX,
  MEET_LEVELS,
  WEEKDAYS,
} from '@/lib/community';

const SELECT =
  'w-full rounded-xl border border-transparent bg-ink/5 px-4 py-3 text-sm text-ink focus:border-sky focus:bg-surface focus:outline-none desk:border-line desk:bg-surface-2';
const CHIP =
  'inline-flex min-h-9 items-center rounded-full bg-ink/6 px-3.5 text-sm font-semibold text-ink transition-colors peer-checked:bg-sky peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky desk:bg-surface-2';

/** 내 팀(팀 관리의 TEAM 조직)에서 미리 채울 값 */
export type TeamPrefill = { team: string; region: string; ages: string } | null;

function RegionSelect({ value }: { value?: string }) {
  return (
    <Field label="지역">
      <select name="region" defaultValue={value ?? ''} required className={SELECT}>
        <option value="" disabled>
          시 · 도를 골라 주세요
        </option>
        {COMMUNITY_REGIONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * 번개 · 팀 홍보 · 선수 모집 양식 칸(docs/designs/dugout-community.md) — 게시판을 고르면 그 양식이 나온다. 검사는 서버(lib/community.ts parseMeetup · parseTeam).
 * 연락처 칸은 없다 — 연락은 글에 묶인 대화로만.
 */
export function CommunityFormFields({
  category,
  before,
  teamPrefill,
}: {
  category: string;
  before?: FormValues;
  teamPrefill?: TeamPrefill;
}) {
  if (category === 'meetup') {
    return (
      <fieldset className="space-y-4 rounded-2xl bg-surface-2 p-4 desk:bg-ink/3">
        <legend className="sr-only">번개 양식</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="언제">
            <Input type="datetime-local" name="meetAt" required defaultValue={kept(before, 'meetAt')} />
          </Field>
          <RegionSelect value={kept(before, 'region')} />
        </div>
        <Field label="어디서" hint="공원 · 운동장처럼 여럿이 다니는 곳을 권해요.">
          <Input name="place" required maxLength={60} placeholder="잠원 한강공원 야구장" defaultValue={kept(before, 'place')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="모집 인원" hint="나를 빼고 더 올 사람 수예요.">
            <Input
              type="number"
              name="capacity"
              required
              min={2}
              max={MEET_CAPACITY_MAX}
              inputMode="numeric"
              defaultValue={kept(before, 'capacity') ?? '4'}
            />
          </Field>
          <Field label="실력">
            <select name="level" defaultValue={kept(before, 'level') ?? 'any'} className={SELECT}>
              {MEET_LEVELS.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="준비물(선택)">
            <Input name="gear" maxLength={60} placeholder="글러브 · 공" defaultValue={kept(before, 'gear')} />
          </Field>
          <Field label="비용 나눔(선택)">
            <Input name="cost" maxLength={60} placeholder="구장비 1인 5,000원" defaultValue={kept(before, 'cost')} />
          </Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="block text-xs font-medium text-muted">누가</legend>
          <div className="flex flex-wrap gap-2">
            {MEET_AGES.map((a) => (
              <label key={a.key} className="cursor-pointer">
                <input
                  type="radio"
                  name="age"
                  value={a.key}
                  defaultChecked={(kept(before, 'age') ?? 'teen') === a.key}
                  className="peer sr-only"
                />
                <span className={CHIP}>{a.label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted/80">참가는 만 14세부터예요. 처음 만나는 사람과는 여럿이 다니는 곳에서 만나요.</p>
        </fieldset>
      </fieldset>
    );
  }

  if (category === 'team') {
    const pick = (name: string, fallback?: string) => kept(before, name) ?? fallback;
    const days = keptAll(before, 'days') ?? [];
    return (
      <fieldset className="space-y-4 rounded-2xl bg-surface-2 p-4 desk:bg-ink/3">
        <legend className="sr-only">팀 양식</legend>
        {teamPrefill && !before && (
          <p className="text-xs text-muted">팀 관리의 내 팀 정보로 채워 두었어요.</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="팀 이름(선택)">
            <Input name="team" maxLength={40} defaultValue={pick('team', teamPrefill?.team)} />
          </Field>
          <RegionSelect value={pick('region', teamPrefill?.region)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="리그 · 부(선택)">
            <Input name="league" maxLength={60} placeholder="토요 리그 3부" defaultValue={pick('league')} />
          </Field>
          <Field label="연령대(선택)">
            <Input name="ages" maxLength={60} placeholder="20~40대" defaultValue={pick('ages', teamPrefill?.ages)} />
          </Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="block text-xs font-medium text-muted">연습 요일(선택)</legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => (
              <label key={d} className="cursor-pointer">
                <input type="checkbox" name="days" value={d} defaultChecked={days.includes(d)} className="peer sr-only" />
                <span className={CHIP}>{d}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="회비(선택)">
          <Input name="fee" maxLength={60} placeholder="월 3만 원" defaultValue={pick('fee')} />
        </Field>
      </fieldset>
    );
  }

  return null;
}
