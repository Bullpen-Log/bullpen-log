import type { ReactNode } from 'react';
import { prisma } from '@/lib/prisma';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { visibleExercises, type CachedExercise } from '@/lib/library-cache';
import { availableParts } from '@/lib/report/today-pick';
import {
  ARMCARE_AREAS,
  ARMCARE_CATEGORY,
  areasOf,
  primaryArea,
  type ArmcareAreaKey,
} from '@/lib/armcare/anatomy';
import { throwingSide } from '@/lib/armcare/muscle-map';
import { loadArmcareToday, type UserForArmcare } from '@/lib/armcare/today';
import { armcareBlock, armcareMinutes, bodyStateBlock } from '@/lib/armcare/routine';
import { loadMyRoutines } from '@/lib/armcare/my-routines-store';
import { Card } from '@/components/ui';
import { OpenCheckinButton } from '@/components/notice-bell';
import { ArmcareToday, WeekDots, type ArmcareTodayItem } from './armcare-today';
import { ArmcareGuide } from './armcare-guide';
import { MyRoutines, type MyRoutineView } from './my-routines';
import type { ArmcareTab } from './armcare-tabs';
import { toArmcareViews } from './armcare-views';
import { TrainingCheckin } from './training-checkin';

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
}: {
  user: UserForArmcare & { throwingHand: string | null };
  tab: ArmcareTab;
  today: Date;
  /** 루틴의 '근육 위치'로 들어오면 3D 근육 지도가 이 근육을 켠 채로 시작한다 */
  focusMuscle?: string | null;
}) {
  if (tab === 'guide') {
    const [library, mine, counts] = await Promise.all([
      visibleExercises(),
      loadMyRoutines(user.id),
      careCounts(user.id, today),
    ]);
    const views = await toArmcareViews(
      library.filter((ex) => ex.category === ARMCARE_CATEGORY)
    );
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
          counts,
          focusMuscle,
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
   * 지금 몸 상태로 보면 권하지 않는 운동인가.
   *
   * 체크인이 없으면 몸 상태를 모르니 표시하지 않는다. 통증인 날은 운동마다 달지 않고
   * 위에 한 번 알린다.
   *   맞춤 루틴  만들 때와 같은 규칙(armcareBlock) — 만든 뒤 몸 상태가 바뀐 것을 잡는다
   *   내 루틴    몸 상태 몫만(bodyStateBlock) — 팔 근력 운동도 보고, 맞춤 루틴의 강도
   *              한도('높음'을 안 넣는 것)는 몸 상태가 아니라 보지 않는다
   */
  const notAdvised = (ex: CachedExercise, forMine: boolean) => {
    if (!data.hasCheckinToday || data.decision.kind === 'rest') return false;
    const candidate = { ...ex, targetMuscles: ex.targetMuscles ?? [] };
    const today = data.facts.condition.today;
    return forMine
      ? bodyStateBlock(candidate, data.decision.kind, today) != null
      : armcareBlock(candidate, data.decision.kind, today) != null;
  };

  /* ── 맞춤 루틴 ── */
  let custom: ReactNode;
  if (!data.hasCheckinToday) {
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
        <p className="text-sm font-bold text-warn">오늘은 팔을 쉬는 날입니다</p>
        <p className="text-sm leading-relaxed break-keep text-warn">
          {data.decision.reason}
        </p>
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
          unsafe: !done && notAdvised(byId.get(it.exerciseId)!, false),
        };
      });
    }
    custom = (
      <ArmcareToday
        decision={data.decision}
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
          unsafe: !done && notAdvised(ex, true),
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

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <SectionHead title="맞춤 루틴" desc="몸 상태에 맞춰 앱이 짜 줘요" />
        {custom}
      </section>

      <section className="space-y-3">
        <SectionHead title="내 루틴" desc="내가 골라 둔 운동 · 언제든" />
        <MyRoutines routines={routines} painToday={data.decision.kind === 'rest'} />
      </section>

      <WeekDots week={data.week} />
    </div>
  );
}

function SectionHead({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="space-y-0.5 px-1">
      <h2 className="text-heading text-lg text-ink">{title}</h2>
      <p className="text-xs leading-relaxed break-keep text-muted">{desc}</p>
    </div>
  );
}

/** 3D 근육 지도의 '내 기록 색칠'이 보는 기간 — 오늘 포함 2주 */
const CARE_DAYS = 14;

/**
 * 부위마다 최근 2주에 암케어 운동을 몇 번 체크했는가.
 *
 * 맞춤 루틴이든 내 루틴이든 체크는 운동 기록 하나에 남는다. 운동 하나가 여러 부위를
 * 쓰면(외회전 90도는 어깨 후방과 견갑) 그 부위마다 한 번씩 센다. 날로 세지 않는 것은
 * 매일 하는 가벼운 운동이라 '며칠 했나'보다 '몇 번 챙겼나'가 부위 사이의 차이를 더
 * 잘 보여 주기 때문이다.
 */
async function careCounts(
  userId: string,
  today: Date
): Promise<Record<ArmcareAreaKey, number>> {
  const todayKey = toDateKey(today);
  const [logs, library] = await Promise.all([
    prisma.userExerciseLog.findMany({
      where: {
        userId,
        completed: true,
        date: {
          gte: new Date(`${shiftDateKey(todayKey, -(CARE_DAYS - 1))}T00:00:00.000Z`),
          lte: new Date(`${todayKey}T00:00:00.000Z`),
        },
        exercise: { category: ARMCARE_CATEGORY },
      },
      select: { exerciseId: true },
    }),
    visibleExercises(),
  ]);
  const muscles = new Map(library.map((ex) => [ex.id, ex.targetMuscles ?? []]));
  const counts = Object.fromEntries(ARMCARE_AREAS.map((a) => [a.key, 0])) as Record<
    ArmcareAreaKey,
    number
  >;
  for (const log of logs) {
    for (const area of areasOf(muscles.get(log.exerciseId) ?? [])) counts[area.key]++;
  }
  return counts;
}
