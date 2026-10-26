'use client';

import { useState } from 'react';
import { Field, Input } from '@/components/ui';
import { kept, keptAll, type FormValues } from '@/lib/form-values';
import {
  COMMUNITY_REGIONS,
  MEET_AGES,
  MEET_CAPACITY_MAX,
  MEET_CAPACITY_MIN,
  MEET_LEVELS,
  MEET_MIN_AGE,
  POSITIONS,
  TEAM_FIELDS,
  WEEKDAYS,
  teamKindOf,
} from '@/lib/community';
import { DISTRICTS } from '@/lib/kr-districts';

const SELECT =
  'w-full rounded-xl border border-transparent bg-ink/5 px-4 py-3 text-sm text-ink focus:border-sky focus:bg-surface focus:outline-none desk:border-line desk:bg-surface-2';
const CHIP =
  'inline-flex min-h-9 items-center rounded-full bg-ink/6 px-3.5 text-sm font-semibold text-ink transition-colors peer-checked:bg-sky peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky desk:bg-surface-2';

/** 내 팀(팀 관리의 TEAM 조직)에서 미리 채울 값 */
export type TeamPrefill = { team: string; region: string; ages: string } | null;

/** 시 · 도(꼭) → 시 · 군 · 구(골라도 되고 안 골라도 됨). 위치 권한 없이 고른다 */
function RegionDistrict({ region, district }: { region?: string; district?: string }) {
  const [r, setR] = useState(region ?? '');
  const [d, setD] = useState(district ?? '');
  const list = DISTRICTS[r] ?? [];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="지역">
        <select
          name="region"
          value={r}
          onChange={(e) => {
            setR(e.target.value);
            setD('');
          }}
          required
          className={SELECT}
        >
          <option value="" disabled>
            시 · 도를 골라 주세요
          </option>
          {COMMUNITY_REGIONS.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </Field>
      <Field label="시 · 군 · 구(선택)">
        <select name="district" value={d} onChange={(e) => setD(e.target.value)} disabled={list.length === 0} className={SELECT}>
          <option value="">{r ? '전체' : '시 · 도를 먼저 골라 주세요'}</option>
          {list.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

function Chips({ name, options, picked, type = 'checkbox' }: { name: string; options: readonly string[]; picked: string[]; type?: 'checkbox' | 'radio' }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((d) => (
        <label key={d} className="cursor-pointer">
          <input type={type} name={name} value={d} defaultChecked={picked.includes(d)} className="peer sr-only" />
          <span className={CHIP}>{d}</span>
        </label>
      ))}
    </div>
  );
}

/** 번개 인원 — 모집 인원은 글쓴이를 뺀 수, 모두는 +1(목록 · 글 화면과 같은 말) */
function Capacity({ value }: { value?: string }) {
  const [n, setN] = useState(value ?? '3');
  const count = Number(n);
  return (
    <Field
      label="더 모을 인원"
      hint={
        Number.isInteger(count) && count >= MEET_CAPACITY_MIN
          ? `나를 빼고 ${count}명 · 모두 ${count + 1}명이 모여요.`
          : `나를 빼고 ${MEET_CAPACITY_MIN}~${MEET_CAPACITY_MAX}명이에요.`
      }
    >
      <Input
        type="number"
        name="capacity"
        required
        min={MEET_CAPACITY_MIN}
        max={MEET_CAPACITY_MAX}
        inputMode="numeric"
        value={n}
        onChange={(e) => setN(e.target.value)}
      />
    </Field>
  );
}

/**
 * 번개 · 팀 홍보 · 선수 모집 양식 칸(docs/designs/dugout-community.md) — 게시판을 고르면 그 양식, 팀은 말머리마다 칸이 바뀐다
 * (lib/community.ts TEAM_FIELDS — 검사도 같은 표). 검사는 서버(parseMeetup · parseTeam). 연락처 칸은 없다 — 연락은 글에 묶인 대화로만.
 */
export function CommunityFormFields({
  category,
  tag,
  before,
  teamPrefill,
}: {
  category: string;
  tag: string;
  before?: FormValues;
  teamPrefill?: TeamPrefill;
}) {
  if (category === 'meetup') {
    return (
      <fieldset className="space-y-4 rounded-2xl bg-surface-2 p-4 desk:bg-ink/3">
        <legend className="sr-only">번개 양식</legend>
        <Field label="언제">
          <Input type="datetime-local" name="meetAt" required defaultValue={kept(before, 'meetAt')} />
        </Field>
        <RegionDistrict region={kept(before, 'region')} district={kept(before, 'district')} />
        <Field label="어디서" hint="공원 · 운동장처럼 여럿이 다니는 곳을 권해요.">
          <Input name="place" required maxLength={60} placeholder="잠원 한강공원 야구장" defaultValue={kept(before, 'place')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Capacity value={kept(before, 'capacity')} />
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
          <p className="text-xs text-muted/80">참가는 만 {MEET_MIN_AGE}세부터예요. 처음 만나는 사람과는 여럿이 다니는 곳에서 만나요.</p>
        </fieldset>
      </fieldset>
    );
  }

  if (category === 'team') {
    const kind = teamKindOf(tag);
    const uses = new Set<string>(TEAM_FIELDS[kind]);
    const pick = (name: string, fallback?: string) => kept(before, name) ?? fallback;
    const prefill = kind === 'seek' ? null : teamPrefill;
    return (
      <fieldset className="space-y-4 rounded-2xl bg-surface-2 p-4 desk:bg-ink/3">
        <legend className="sr-only">팀 양식</legend>
        {prefill && !before && <p className="text-xs text-muted">팀 관리의 내 팀 정보로 채워 두었어요.</p>}
        {uses.has('team') && (
          <Field label="팀 이름(선택)">
            <Input name="team" maxLength={40} defaultValue={pick('team', prefill?.team)} />
          </Field>
        )}
        <RegionDistrict region={pick('region', prefill?.region)} district={kept(before, 'district')} />
        {uses.has('gameAt') && (
          <Field label="경기 날짜 · 시각">
            <Input type="datetime-local" name="gameAt" required defaultValue={kept(before, 'gameAt')} />
          </Field>
        )}
        {uses.has('venue') && (
          <Field label="구장(선택)">
            <Input name="venue" maxLength={60} placeholder="목동 야구장" defaultValue={pick('venue')} />
          </Field>
        )}
        {uses.has('venueReady') && (
          <fieldset className="space-y-2">
            <legend className="block text-xs font-medium text-muted">구장 확보</legend>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'yes', label: '구장 있어요' },
                { key: 'no', label: '구장 같이 찾아요' },
              ].map((o) => (
                <label key={o.key} className="cursor-pointer">
                  <input type="radio" name="venueReady" value={o.key} defaultChecked={pick('venueReady') === o.key} className="peer sr-only" />
                  <span className={CHIP}>{o.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {uses.has('positions') && (
          <fieldset className="space-y-2">
            <legend className="block text-xs font-medium text-muted">
              {kind === 'seek' ? '내 포지션' : kind === 'merc' ? '필요한 포지션(선택)' : '모집 포지션'}
            </legend>
            <Chips name="positions" options={POSITIONS} picked={keptAll(before, 'positions') ?? []} />
          </fieldset>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {uses.has('count') && (
            <Field label="몇 명(선택)">
              <Input type="number" name="count" min={1} max={30} inputMode="numeric" defaultValue={pick('count')} />
            </Field>
          )}
          {uses.has('career') && (
            <Field label={kind === 'seek' ? '내 경력(선택)' : '경력 조건(선택)'}>
              <Input name="career" maxLength={60} placeholder={kind === 'seek' ? '사회인 3년 · 고교 선수 출신' : '경력 무관'} defaultValue={pick('career')} />
            </Field>
          )}
          {uses.has('league') && (
            <Field label="리그 · 부(선택)">
              <Input name="league" maxLength={60} placeholder="토요 리그 3부" defaultValue={pick('league')} />
            </Field>
          )}
          {uses.has('ages') && (
            <Field label="연령대(선택)">
              <Input name="ages" maxLength={60} placeholder="20~40대" defaultValue={pick('ages', prefill?.ages)} />
            </Field>
          )}
          {uses.has('level') && (
            <Field label={kind === 'scrim' ? '팀 수준(선택)' : '실력 조건(선택)'}>
              <Input name="level" maxLength={60} placeholder={kind === 'scrim' ? '3부 리그 중위권' : '내야 땅볼 처리 가능'} defaultValue={pick('level')} />
            </Field>
          )}
          {uses.has('cost') && (
            <Field label={kind === 'scrim' ? '비용 분담(선택)' : '비용(선택)'}>
              <Input name="cost" maxLength={60} placeholder={kind === 'scrim' ? '구장비 반반' : '참가비 없음'} defaultValue={pick('cost')} />
            </Field>
          )}
          {uses.has('fee') && (
            <Field label="회비(선택)">
              <Input name="fee" maxLength={60} placeholder="월 3만 원" defaultValue={pick('fee')} />
            </Field>
          )}
          {uses.has('schedule') && (
            <Field label="활동 일정(선택)">
              <Input name="schedule" maxLength={60} placeholder="토요일 오전 경기 · 수요일 저녁 연습" defaultValue={pick('schedule')} />
            </Field>
          )}
          {uses.has('areas') && (
            <Field label="다닐 수 있는 곳(선택)">
              <Input name="areas" maxLength={60} placeholder="서울 동남권 · 성남" defaultValue={pick('areas')} />
            </Field>
          )}
        </div>
        {uses.has('days') && (
          <fieldset className="space-y-2">
            <legend className="block text-xs font-medium text-muted">{kind === 'seek' ? '가능한 요일(선택)' : '활동 요일(선택)'}</legend>
            <Chips name="days" options={WEEKDAYS} picked={keptAll(before, 'days') ?? []} />
          </fieldset>
        )}
        {kind === 'seek' && <p className="text-xs text-muted/80">팀이 이 글에 ‘우리 팀 제안하기’로 연락해요. 마음에 드는 팀과 글에 묶인 대화로 이야기해요.</p>}
      </fieldset>
    );
  }

  return null;
}
