import type { ReactNode } from 'react';
import { visibleExercises, type CachedExercise } from '@/lib/library-cache';
import { availableParts } from '@/lib/report/today-pick';
import { ARMCARE_CATEGORY, primaryArea } from '@/lib/armcare/anatomy';
import { loadArmcareToday, type UserForArmcare } from '@/lib/armcare/today';
import { armcareBlock, armcareMinutes } from '@/lib/armcare/routine';
import { loadMyRoutines } from '@/lib/armcare/my-routines-store';
import { Card } from '@/components/ui';
import { OpenCheckinButton } from '@/components/notice-bell';
import { ArmcareToday, RecentLine, type ArmcareTodayItem } from './armcare-today';
import { ArmcareGuide } from './armcare-guide';
import { ArmcareMethods } from './armcare-methods';
import { MyRoutines, type MyRoutineView } from './my-routines';
import type { ArmcareTab } from './armcare-tabs';
import { toArmcareViews } from './armcare-views';
import { TrainingCheckin } from './training-checkin';

/**
 * 트레이닝의 암케어 칸 — 서버에서 자료를 모아 세 화면 중 하나를 그린다.
 *
 * 2026-09-25 사용자분과 정했다: 하단 탭을 늘리지 않고 트레이닝 안에 둔다.
 * 트레이닝의 [트레이닝 | 암케어] 중 둘째 칸이고, 안에서 다시 [루틴 | 부위별 보강 |
 * 훈련 방식]으로 나뉜다(armcare-tabs.tsx).
 *
 * 루틴 칸에는 둘이 선다(2026-09-26 사용자분 요청) — 앱이 오늘 몸 상태를 보고 짜 주는
 * **맞춤 루틴**과, 사용자가 필요한 운동만 골라 만들어 둔 **내 루틴**. 암케어는 운동
 * 일정과 상관없이 언제든 하는 것이라, 내 루틴은 체크인이 없어도 연다.
 */
export async function ArmcareSection({
  user,
  tab,
  today,
}: {
  user: UserForArmcare;
  tab: ArmcareTab;
  today: Date;
}) {
  if (tab === 'guide' || tab === 'methods') {
    const [library, mine] = await Promise.all([
      visibleExercises(),
      loadMyRoutines(user.id),
    ]);
    const views = await toArmcareViews(
      library.filter((ex) => ex.category === ARMCARE_CATEGORY)
    );
    const routines = mine.map((r) => ({
      id: r.id,
      name: r.name,
      exerciseIds: r.items.map((it) => it.exerciseId),
    }));
    return tab === 'guide' ? (
      <ArmcareGuide exercises={views} routines={routines} />
    ) : (
      <ArmcareMethods exercises={views} routines={routines} />
    );
  }

  const [data, library, mine] = await Promise.all([
    loadArmcareToday(user, today),
    visibleExercises(),
    loadMyRoutines(user.id),
  ]);
  const byId = new Map(library.map((ex) => [ex.id, ex]));

  /*
   * 지금 몸 상태로 보면 권하지 않는 운동인가 — 맞춤 루틴을 짤 때와 같은 규칙.
   *
   * 체크인이 없으면 몸 상태를 모르니 표시하지 않는다. 통증인 날은 운동마다 달지 않고
   * 위에 한 번 알린다. 팔 근력 운동(컬·푸시다운)은 맞춤 루틴에 안 넣을 뿐 위험해서가
   * 아니라, 내 루틴에서는 표시하지 않는다.
   */
  const notAdvised = (ex: CachedExercise, forMine: boolean) => {
    if (!data.hasCheckinToday || data.decision.kind === 'rest') return false;
    const why = armcareBlock(
      { ...ex, targetMuscles: ex.targetMuscles ?? [] },
      data.decision.kind,
      data.facts.condition.today
    );
    return forMine
      ? why === 'intensity' || why === 'heavy' || why === 'stiff'
      : why != null;
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
        <p className="text-sm leading-relaxed break-keep text-muted">
          맞춤 루틴은 던진 날인지, 팔이 얼마나 피곤한지, 어깨·팔꿈치가 뻐근한지를 보고
          회복 루틴과 강화 루틴 중에 고릅니다.
        </p>
        <TrainingCheckin
          parts={availableParts(library)}
          description="30초면 됩니다. 남기면 바로 맞춤 루틴을 만들 수 있습니다."
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
        <p className="text-sm leading-relaxed break-keep text-warn">
          통증이 아니었다면{' '}
          <OpenCheckinButton className="font-semibold underline">
            오늘 체크인
          </OpenCheckinButton>
          에서 상태를 고쳐주세요.
        </p>
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
        <SectionHead
          title="맞춤 루틴"
          desc="오늘 투구량·팔 피로·통증을 보고 앱이 짜 줍니다. 하루에 하나."
        />
        {custom}
      </section>

      <section className="space-y-3">
        <SectionHead
          title="내 루틴"
          desc="필요한 운동만 골라 이름을 붙여 두고, 언제든 여기서 체크하며 하세요."
        />
        <MyRoutines routines={routines} painToday={data.decision.kind === 'rest'} />
      </section>

      <RecentLine days={data.recentDays} />
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
