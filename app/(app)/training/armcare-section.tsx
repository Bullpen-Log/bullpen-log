import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { visibleExercises, type CachedExercise } from '@/lib/library-cache';
import { availableParts } from '@/lib/report/today-pick';
import { ARMCARE_CATEGORY, primaryArea } from '@/lib/armcare/anatomy';
import { throwingSide } from '@/lib/armcare/muscle-map';
import { loadArmcareToday, notAdvised, type UserForArmcare } from '@/lib/armcare/today';
import { armcareMinutes } from '@/lib/armcare/routine';
import { loadArmcareCoverage } from '@/lib/armcare/coverage-load';
import { toDateKey } from '@/lib/pitch-stats';
import { loadMyRoutines } from '@/lib/armcare/my-routines-store';
import { shiftDateKey } from '@/lib/pitch-stats';
import {
  REHAB_CONDITIONS,
  REHAB_ENABLED,
  REHAB_STAGES,
  WEEKLY_EVERY_DAYS,
  conditionsFor,
  daysBetween,
  firstCkcRecord,
  hasPlyoBall,
  rehabAvoid,
  rehabNotes,
  rehabTitle,
  sessionResultText,
  severityLabel,
  stageTestFor,
} from '@/lib/armcare/rehab';
import type { RehabToday } from '@/lib/armcare/today';
import { Card } from '@/components/ui';
import { OpenCheckinButton } from '@/components/notice-bell';
import { ArmcareToday, WeekDots, type ArmcareTodayItem } from './armcare-today';
import { ArmPainGuideButton } from './arm-pain-guide';
import { ArmcareGuide } from './armcare-guide';
import { ArmcareInfoProvider } from './armcare-info';
import { MyRoutines, type MyRoutineView } from './my-routines';
import { SendPendingChecks } from './pending-checks';
import type { ArmcareTab } from './armcare-tabs';
import { toArmcareViews } from './armcare-views';
import { TrainingCheckin } from './training-checkin';
import { RehabCard, type RehabCardView } from './rehab-card';
import { RehabStartLine } from './rehab-start';

/**
 * 트레이닝의 암케어 칸 — 서버에서 자료를 모아 두 화면 중 하나를 그린다.
 *
 * 2026-09-25 사용자분과 정했다: 하단 탭을 늘리지 않고 트레이닝 안에 둔다.
 * 트레이닝의 [트레이닝 | 암케어] 중 둘째 칸이고, 안에서 다시 [루틴 | 부위별 보강]으로
 * 나뉜다(armcare-tabs.tsx).
 *
 * 루틴 칸에는 둘이 선다(2026-09-26 사용자분 요청) — 앱이 오늘 몸 상태를 보고 짜 주는
 * **맞춤 루틴**과, 사용자가 필요한 운동만 골라 만들어 둔 **내 루틴**. 암케어는 운동
 * 일정과 상관없이 언제든 하는 것이라, 내 루틴은 체크인이 없어도 연다.
 */
export async function ArmcareSection({
  user,
  tab,
  today,
  focusMuscle = null,
  openRehab = false,
}: {
  user: UserForArmcare & { throwingHand: string | null };
  tab: ArmcareTab;
  today: Date;
  /** 루틴의 '근육 위치'로 들어오면 3D 근육 지도가 이 근육을 켠 채로 시작한다 */
  focusMuscle?: string | null;
  /** 팔 통증 안내의 '재활 프로그램' 줄(?rehab=start)로 들어왔다 — 재활 중이 아니면 시작 시트를 연다 */
  openRehab?: boolean;
}) {
  if (tab === 'guide') {
    const [library, mine] = await Promise.all([
      visibleExercises(),
      loadMyRoutines(user.id),
    ]);
    const armcareLib = library.filter((ex) => ex.category === ARMCARE_CATEGORY);
    const views = await toArmcareViews(armcareLib);
    /*
     * 내 팔 지도(2026-10-04) — 최근 2주 암케어 기록으로 3D 를 칠하고, 비어 있는 부위 · 오늘이나 어제의 팔 통증을
     * 맨 위에 보인다(lib/armcare/coverage-load.ts).
     */
    const todayKey = toDateKey(today);
    const map = await loadArmcareCoverage(user.id, todayKey, library);
    const routines = mine.map((r) => ({
      id: r.id,
      name: r.name,
      exerciseIds: r.items.map((it) => it.exerciseId),
    }));
    return (
      <ArmcareGuide
        exercises={views}
        routines={routines}
        map={{
          side: throwingSide(user.throwingHand),
          bothHands: user.throwingHand === '양투',
          focusMuscle,
        }}
        coverage={{
          heat: map.coverage.heat,
          areas: map.coverage.primary,
          total: map.coverage.total,
          gaps: map.gaps,
          allCovered: map.allCovered,
          dateKey: todayKey,
          pain: map.pain,
        }}
      />
    );
  }

  const [data, library, mine] = await Promise.all([
    loadArmcareToday(user, today),
    visibleExercises(),
    loadMyRoutines(user.id),
  ]);
  const byId = new Map(library.map((ex) => [ex.id, ex]));

  /*
   * 오늘 팔 통증 — 어깨 · 팔꿈치가 '통증'인 날만. 쉬기 카드와 통증 루틴 카드에 [통증 안내 보기]를 붙인다
   * (2026-10-03 팔 통증 안내). 나이는 '오늘은'이 만 15세 미만에게 진료를 권하는 데 쓴다.
   */
  const painGuide = data.armPain
    ? {
        spots: data.armPain.spots,
        level: data.armPain.level,
        age: data.facts.profile.age,
      }
    : null;

  /* ── 맞춤 루틴 ── 재활 중이면 그 자리에 오늘 재활(재활 2편 — 내 루틴은 그대로) */
  let custom: ReactNode;
  if (data.rehab) {
    custom = (
      <RehabCard
        view={await rehabCardView(data.rehab, data.todayKey, byId, user.ownedEquipment)}
      />
    );
  } else if (!data.hasCheckinToday) {
    /*
     * 체크인 먼저 — 운동 일정과 같은 규칙이다. 던진 날·팔 피로·뻐근한 곳을 모르면
     * 회복을 해야 할 날에 강화를 줄 수 있다. 이 자리에서 바로 체크인 창을 연다.
     */
    custom = (
      <Card className="space-y-3">
        <p className="text-base font-bold text-ink">오늘 체크인을 먼저 남겨주세요</p>
        <TrainingCheckin
          parts={availableParts(library)}
          description="30초면 돼요. 몸 상태를 보고 루틴을 짜 드려요."
        />
      </Card>
    );
  } else if (data.decision.kind === 'rest') {
    /* 통증 — 운동 일정이 멈추는 것과 같은 조건, 같은 말 */
    custom = (
      <Card className="space-y-2 border-warn-line bg-warn-bg">
        <p className="text-sm font-bold text-warn">오늘은 팔을 쉬는 날이에요</p>
        <p className="text-sm leading-relaxed break-keep text-warn">
          {data.decision.reason}
        </p>
        {/* 팔이 아픈 날 — 왜 아플 수 있는지 · 바로 진료할 신호 · 오늘 할 일(정도 2 · 3 · 모름은 진료 권유) */}
        {painGuide && (
          <div>
            <ArmPainGuideButton
              pain={painGuide}
              className="inline-flex min-h-11 items-center gap-0.5 rounded-full bg-surface px-4 text-sm font-semibold text-warn transition-colors hover:bg-surface-2"
            >
              통증 안내 보기
              <ChevronRight aria-hidden className="h-4 w-4" />
            </ArmPainGuideButton>
          </div>
        )}
        <OpenCheckinButton className="text-sm font-semibold text-warn underline">
          통증이 아니면 체크인 고치기
        </OpenCheckinButton>
      </Card>
    );
  } else {
    let items: ArmcareTodayItem[] = [];
    if (data.routine) {
      /*
       * 루틴에 담긴 운동을 라이브러리에서 찾는다. 만든 뒤에 장비 설정을 바꿨어도
       * 담긴 것은 그대로 보여 준다 — 다시 만들지는 본인이 정한다. 숨김 처리된
       * 운동만 빠진다.
       *
       * 만든 뒤에 체크인이 바뀌었으면(오후에 어깨가 뻐근해졌다 등) 지금 규칙으로 다시
       * 본다 — 운동 일정이 볼 때마다 안전을 다시 보는 것과 같다(lib/report/today-data.ts).
       * 빼지는 않고 표시만 한다. 이미 체크한 것은 한 것이라 따지지 않는다.
       */
      const inRoutine = data.routine.items.filter((it) => byId.has(it.exerciseId));
      const views = await toArmcareViews(
        inRoutine.map((it) => byId.get(it.exerciseId)!),
        new Map(inRoutine.map((it) => [it.exerciseId, it.sets]))
      );
      items = inRoutine.map((it, i) => {
        const done = data.doneToday.has(it.exerciseId);
        return {
          area: it.area,
          exercise: views[i],
          done,
          unsafe: !done && notAdvised(data, byId.get(it.exerciseId)!, false),
        };
      });
    }
    custom = (
      <ArmcareToday
        dateKey={data.todayKey}
        decision={data.decision}
        painGuide={painGuide}
        routine={
          data.routine
            ? {
                kind: data.routine.kind,
                reason: data.routine.reason,
                notes: data.routine.notes,
                estimatedMinutes: data.routine.estimatedMinutes,
                items,
              }
            : null
        }
      />
    );
  }

  /* ── 내 루틴 ── 숨긴 운동과 암케어가 아닌 것은 빼고, 담은 차례 그대로 */
  const routines: MyRoutineView[] = await Promise.all(
    mine.map(async (r) => {
      const usable = r.items.filter(
        (it) => byId.get(it.exerciseId)?.category === ARMCARE_CATEGORY
      );
      const views = await toArmcareViews(
        usable.map((it) => byId.get(it.exerciseId)!),
        new Map(usable.map((it) => [it.exerciseId, it.sets]))
      );
      const items: ArmcareTodayItem[] = usable.map((it, i) => {
        const ex = byId.get(it.exerciseId)!;
        const done = data.doneToday.has(it.exerciseId);
        return {
          area: primaryArea(ex.targetMuscles ?? [])?.key ?? 'shoulder-back',
          exercise: views[i],
          done,
          unsafe: !done && notAdvised(data, ex, true),
        };
      });
      const minutes = usable.reduce(
        (sum, it) =>
          sum +
          armcareMinutes(
            {
              ...byId.get(it.exerciseId)!,
              targetMuscles: byId.get(it.exerciseId)!.targetMuscles ?? [],
            },
            it.sets
          ),
        0
      );
      return {
        id: r.id,
        name: r.name,
        items,
        estimatedMinutes: Math.max(1, Math.round(minutes)),
        hidden: r.items.length - usable.length,
      };
    })
  );

  /* 운동의 근육 칩을 누르면 뜨는 3D 그림·설명 창(armcare-info.tsx) — 던지는 팔로 */
  return (
    <ArmcareInfoProvider side={throwingSide(user.throwingHand)}>
      {/* 따라하기에서 신호가 없어 못 보낸 체크가 폰에 남아 있으면 이어서 보낸다 */}
      <SendPendingChecks />
      <div className="space-y-10">
        <section className="space-y-3">
          {data.rehab ? (
            <SectionHead
              title="오늘 재활"
              desc="아픈 곳에 맞춰 단계별로 · 맞춤 루틴 대신"
            />
          ) : (
            <SectionHead title="맞춤 루틴" desc="몸 상태에 맞춰 앱이 짜 줘요" />
          )}
          {custom}
          {/* 들어가는 작은 줄 — 재활 중이 아닐 때만(재활 2편). 오늘 체크인의 아픈 자리 · 정도를 미리 골라 둔다 */}
          {REHAB_ENABLED && !data.rehab && (
            <RehabStartLine
              age={data.facts.profile.age}
              defaults={{
                area: data.armPain?.spots[0] ?? null,
                level:
                  data.armPain?.level === 1 ||
                  data.armPain?.level === 2 ||
                  data.armPain?.level === 3
                    ? data.armPain.level
                    : null,
              }}
              autoOpen={openRehab}
            />
          )}
        </section>

        <section className="space-y-3">
          <SectionHead title="내 루틴" desc="내가 골라 둔 운동 · 언제든" />
          <MyRoutines
            routines={routines}
            painToday={data.decision.kind === 'rest'}
            dateKey={data.todayKey}
          />
        </section>

        <WeekDots week={data.week} />
      </div>
    </ArmcareInfoProvider>
  );
}

/**
 * 오늘 재활 카드에 그릴 것 — 규칙(lib/armcare/rehab.ts)이 낸 상태 · 세션을 화면 모양으로. 운동은 맞춤 루틴과 같은
 * 그림(toArmcareViews)이고, 재활 운동은 카테고리가 여럿이라 체크는 rehab.doneToday 로 본다.
 */
async function rehabCardView(
  rehab: RehabToday,
  dateKey: string,
  byId: Map<string, CachedExercise>,
  ownedEquipment: string[]
): Promise<RehabCardView> {
  const { program, status, session } = rehab;
  const inSession = session.items.filter((it) => byId.has(it.exerciseId));
  const views = await toArmcareViews(
    inSession.map((it) => byId.get(it.exerciseId)!),
    new Map(inSession.map((it) => [it.exerciseId, it.sets]))
  );
  const items: ArmcareTodayItem[] = inSession.map((it, i) => {
    const ex = byId.get(it.exerciseId)!;
    return {
      area: primaryArea(ex.targetMuscles ?? [])?.key ?? program.area,
      exercise: views[i],
      done: rehab.doneToday.has(it.exerciseId),
      unsafe: false,
      note: it.note ?? (it.replaces ? `${it.replaces} 대신` : null),
    };
  });
  const today = status.today;
  /* 매주 확인 — 지난 7일 안의 확인은 투구 복귀표 열기 시트가 그 % · 자신감을 쓴다 */
  const { weekly } = status;
  const recent =
    weekly.last && daysBetween(weekly.last.date, dateKey) < WEEKLY_EVERY_DAYS
      ? weekly.last
      : null;
  return {
    dateKey,
    title: rehabTitle(program.area, program.condition),
    stage: program.stage,
    stageName: REHAB_STAGES[program.stage].name,
    severityLabel: severityLabel(program.severity),
    day: status.day,
    line: status.line,
    rest: status.rest != null && !today,
    today: today ? { result: today.result, text: sessionResultText(today) } : null,
    items,
    estimatedMinutes: session.estimatedMinutes,
    clean: status.gate.clean,
    cleanNeeded: status.gate.cleanNeeded,
    elapsed: status.elapsed,
    minDays: status.minDays,
    gate: { ready: status.gate.ready, checks: status.gate.checks },
    goal: REHAB_STAGES[program.stage].goal,
    notes: [...rehabNotes(program.area, program.condition), ...session.notes],
    avoid: rehabAvoid(program.area, program.condition),
    stageTest: stageTestFor(program.area, program.stage),
    conditionChoices: program.condition
      ? []
      : conditionsFor(program.area).map((key) => ({
          key,
          label: REHAB_CONDITIONS[key].label,
        })),
    activities: rehab.activities,
    weekly: {
      due: weekly.due,
      allowed: weekly.allowed,
      last: weekly.last
        ? { date: weekly.last.date, normalPct: weekly.last.normalPct }
        : null,
      recent: recent
        ? { normalPct: recent.normalPct, confidence: recent.confidence }
        : null,
      nextOn: weekly.allowed
        ? null
        : shiftDateKey(weekly.last?.date ?? program.startedOn, WEEKLY_EVERY_DAYS),
    },
    ckcFirst: firstCkcRecord(rehab.weeklies),
    throwing: status.throwing
      ? {
          ...status.throwing,
          hasPlyo: hasPlyoBall(ownedEquipment),
          severity: program.severity,
          condition: program.condition,
          daysSinceStart: daysBetween(program.startedOn, dateKey),
        }
      : null,
  };
}

function SectionHead({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="space-y-0.5 px-1">
      <h2 className="text-heading text-lg text-ink">{title}</h2>
      <p className="text-xs leading-relaxed break-keep text-muted">{desc}</p>
    </div>
  );
}
