'use client';

import type { ReactNode } from 'react';
import { Flame, ShieldCheck } from 'lucide-react';
import { CountUp } from '@/components/onboarding/count-up';
import { pitchingBurn, trainingBurn } from '@/lib/nutrition/burn';
import { kcalText } from '@/lib/nutrition/meta';
import { REST_REQUIREMENTS, dailyPitchCap } from '@/lib/report/plan';

/**
 * 끼움 화면 — 질문 사이에 앱이 답으로 셈한 숫자를 보여 준다(인아웃의 '격려 화면' 자리에, 글 대신 실제 함수값).
 *
 * 숫자는 모두 앱이 실제로 쓰는 함수에서 온다(lib/report/plan.ts · lib/nutrition/burn.ts) — 가입 뒤 홈 · 영양 탭이
 * 보일 숫자와 같다. 보이는 순간(active) 큰 숫자가 올라오고 줄이 차례로 떠오른다.
 */
export function InsertCard({
  icon,
  headline,
  lines,
  foot,
}: {
  icon: ReactNode;
  /** 큰 글(숫자 포함) — 제목이 스스로 말한다(작은 윗글 없음) */
  headline: ReactNode;
  lines: ReactNode[];
  foot?: ReactNode;
}) {
  return (
    <div className="rise-in rounded-2xl border border-sky/25 bg-sky/5 p-5 md:p-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky/15 text-sky-strong [&_svg]:h-[18px] [&_svg]:w-[18px]"
        >
          {icon}
        </span>
        <p className="text-heading text-2xl leading-tight text-ink break-keep md:text-[1.75rem]">
          {headline}
        </p>
      </div>
      <ul className="mt-4 space-y-2 md:pl-12">
        {lines.map((line, i) => (
          <li
            key={i}
            style={{ '--row': i + 2 } as React.CSSProperties}
            className="motion-safe:animate-row-in flex gap-2 text-sm leading-relaxed break-keep text-ink/85"
          >
            <span
              aria-hidden
              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky"
            />
            {/* 글은 한 덩어리로 — 조각(글 · 굵은 숫자)이 저마다 flex 칸이 되어 세로로 찢기지 않게 */}
            <span className="min-w-0 flex-1">{line}</span>
          </li>
        ))}
      </ul>
      {foot && (
        <p className="mt-4 text-xs leading-relaxed break-keep text-muted">{foot}</p>
      )}
    </div>
  );
}

/** 생년월일 뒤 — '{나이}세는 하루 {한도}구까지예요'(lib/report/plan.ts dailyPitchCap · REST_REQUIREMENTS) */
export function PitchCapInsert({
  age,
  active,
}: {
  age: number | null;
  active: boolean;
}) {
  const cap = dailyPitchCap(age);
  const rests = REST_REQUIREMENTS.filter((r) => r.restDays > 0)
    .slice()
    .sort((a, b) => a.minPitches - b.minPitches);
  return (
    <InsertCard
      icon={<ShieldCheck aria-hidden />}
      headline={
        <>
          {age === null ? '하루 ' : `만 ${age}세는 하루 `}
          <span className="text-sky-strong">
            <CountUp value={cap} active={active} />구
          </span>
          까지예요
        </>
      }
      lines={[
        `한 번에 ${rests[0].minPitches}구 넘게 던지면 ${rests[0].restDays}일, ${rests[rests.length - 1].minPitches}구 넘게 던지면 ${rests[rests.length - 1].restDays}일은 전력으로 던지지 않아요.`,
        '투구를 적으면 홈이 오늘 던질 수 있는 양과 쉬어야 할 날을 매일 알려 드려요.',
        '기준은 유소년 투구수 가이드(Pitch Smart)예요. 팀 · 지도자의 지침이 먼저예요.',
      ]}
    />
  );
}

/** 체중 뒤 — '운동과 투구를 적으면 쓴 만큼 더 먹어요'(lib/nutrition/burn.ts 로 그 체중의 보기 값) */
export function BurnInsert({
  weightKg,
  active,
}: {
  weightKg: number | null;
  active: boolean;
}) {
  const kg = weightKg ?? 75;
  const training = trainingBurn(60 * 60, kg);
  const bullpen = pitchingBurn('불펜', 40, 7, kg);
  const total = (training?.kcal ?? 0) + (bullpen?.kcal ?? 0);
  return (
    <InsertCard
      icon={<Flame aria-hidden />}
      headline={
        <>
          운동과 투구를 적으면 쓴 만큼{' '}
          <span className="text-sky-strong">더 먹어요</span>
        </>
      }
      lines={[
        <>
          {weightKg === null ? '75kg 기준으로 ' : `${kg}kg 이면 `}웨이트 60분은 약{' '}
          <strong className="font-semibold text-ink">
            {kcalText(training?.kcal ?? 0)}kcal
          </strong>
          , 불펜 40구(전력 7)는 약{' '}
          <strong className="font-semibold text-ink">
            {kcalText(bullpen?.kcal ?? 0)}kcal
          </strong>
          을 써요.
        </>,
        <>
          그날 둘 다 했으면 목표에{' '}
          <strong className="font-semibold text-ink">
            <CountUp value={total} active={active} />
            kcal
          </strong>
          이 더해져요. 따로 적을 것은 없어요 — 트레이닝 · 투구 기록에서 가져와요.
        </>,
        '던지는 날 앞뒤 끼니는 거르지 않는 것이 먼저예요. 영양 탭이 그날 가이드를 줘요.',
      ]}
      foot="대략의 값이에요. 같은 운동이라도 사람마다 20~30% 는 달라요."
    />
  );
}
