import Link from 'next/link';
import { createPlaybackUrls } from '@/lib/storage';
import { referenceThumbUrl } from '@/lib/reference-video';
import { formatPrescription } from '@/lib/exercise-meta';
import { visibleExercises } from '@/lib/library-cache';
import { availableParts } from '@/lib/report/today-pick';
import { ARMCARE_CATEGORY } from '@/lib/armcare/anatomy';
import { loadArmcareToday, type UserForArmcare } from '@/lib/armcare/today';
import { armcareBlock } from '@/lib/armcare/routine';
import { Card } from '@/components/ui';
import { ArmcareToday, type ArmcareTodayItem } from './armcare-today';
import { ArmcareGuide } from './armcare-guide';
import type { ArmcareExerciseView } from './armcare-media';
import type { ArmcareTab } from './armcare-tabs';
import { TrainingCheckin } from './training-checkin';

type LibraryExercise = Awaited<ReturnType<typeof visibleExercises>>[number];

/**
 * 트레이닝의 암케어 칸 — 서버에서 자료를 모아 두 화면 중 하나를 그린다.
 *
 * 2026-09-25 사용자분과 정했다: 하단 탭을 늘리지 않고 트레이닝 안에 둔다.
 * 트레이닝의 [오늘 | 기록 | 암케어] 중 셋째 칸이고, 안에서 다시 [오늘의 암케어 |
 * 부위별 보강]으로 나뉜다(armcare-tabs.tsx).
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
  if (tab === 'guide') {
    const all = (await visibleExercises()).filter(
      (ex) => ex.category === ARMCARE_CATEGORY
    );
    return <ArmcareGuide exercises={await toViews(all)} />;
  }

  const data = await loadArmcareToday(user, today);

  /*
   * 체크인 먼저 — 운동 일정과 같은 규칙이다. 던진 날·팔 피로·뻐근한 곳을 모르면
   * 회복을 해야 할 날에 강화를 줄 수 있다. 이 자리에서 바로 체크인 창을 연다.
   */
  if (!data.hasCheckinToday) {
    const library = await visibleExercises();
    return (
      <Card className="space-y-3">
        <p className="text-base font-bold text-ink">오늘 체크인을 먼저 남겨주세요</p>
        <p className="text-sm leading-relaxed break-keep text-muted">
          오늘의 암케어는 던진 날인지, 팔이 얼마나 피곤한지, 어깨·팔꿈치가 뻐근한지를
          보고 회복 루틴과 강화 루틴 중에 고릅니다.
        </p>
        <TrainingCheckin
          parts={availableParts(library)}
          description="30초면 됩니다. 남기면 바로 오늘의 암케어를 만들 수 있습니다."
        />
      </Card>
    );
  }

  /* 통증 — 운동 일정이 멈추는 것과 같은 조건, 같은 말 */
  if (data.decision.kind === 'rest') {
    return (
      <Card className="space-y-2 border-warn-line bg-warn-bg">
        <p className="text-sm font-bold text-warn">오늘은 팔을 쉬는 날입니다</p>
        <p className="text-sm leading-relaxed break-keep text-warn">
          {data.decision.reason}
        </p>
        <p className="text-sm leading-relaxed break-keep text-warn">
          통증이 아니었다면{' '}
          <Link href="/today" className="font-semibold underline">
            홈의 오늘 체크인
          </Link>
          에서 상태를 고쳐주세요.
        </p>
      </Card>
    );
  }

  let items: ArmcareTodayItem[] = [];
  if (data.routine) {
    /*
     * 루틴에 담긴 운동을 라이브러리에서 찾는다. 만든 뒤에 장비 설정을 바꿨어도
     * 담긴 것은 그대로 보여 준다 — 다시 만들지는 본인이 정한다. 숨김 처리된
     * 운동만 빠진다.
     */
    const library = await visibleExercises();
    const byId = new Map(library.map((ex) => [ex.id, ex]));
    const inRoutine = data.routine.items.filter((it) => byId.has(it.exerciseId));
    const sets = new Map(inRoutine.map((it) => [it.exerciseId, it.sets]));
    const views = await toViews(
      inRoutine.map((it) => byId.get(it.exerciseId)!),
      sets
    );
    /*
     * 만든 뒤에 체크인이 바뀌었으면(오후에 어깨가 뻐근해졌다 등) 지금 규칙으로 다시
     * 본다 — 운동 일정이 볼 때마다 안전을 다시 보는 것과 같다(lib/report/today-data.ts).
     * 빼지는 않고 표시만 한다. 이미 체크한 것은 한 것이라 따지지 않는다.
     */
    const decision = data.decision;
    items = inRoutine.map((it, i) => {
      const ex = byId.get(it.exerciseId)!;
      const done = data.doneToday.has(it.exerciseId);
      return {
        area: it.area,
        exercise: views[i],
        done,
        unsafe:
          !done &&
          armcareBlock(
            { ...ex, targetMuscles: ex.targetMuscles ?? [] },
            decision.kind,
            data.facts.condition.today
          ) != null,
      };
    });
  }

  return (
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
      recentDays={data.recentDays}
    />
  );
}

/**
 * 라이브러리 줄을 화면에 그릴 모양으로.
 *
 * 미리보기는 한 번에 몰아서 받는다(lib/storage.ts 가 잠시 돌려 쓴다). 참고 영상은
 * 유튜브 미리보기를 그대로 쓴다 — 우리 저장소에 담긴 것이 없어 받을 주소도 없다.
 */
async function toViews(
  list: LibraryExercise[],
  /** 운동마다 오늘 할 세트 — 루틴은 운동에 적힌 세트와 다를 수 있다 */
  sets?: Map<string, number>
): Promise<ArmcareExerciseView[]> {
  const thumbs = await createPlaybackUrls(
    list.map((ex) => ex.thumbPath).filter((p): p is string => !!p)
  );
  return list.map((ex) => ({
    id: ex.id,
    title: ex.title,
    intensity: ex.intensity,
    difficulty: ex.difficulty,
    equipment: ex.equipment,
    /* 마이그레이션 전에 캐시에 담긴 줄에는 이 칸이 없을 수 있다(lib/library-cache.ts) */
    targetMuscles: ex.targetMuscles ?? [],
    prescription: formatPrescription({ ...ex, sets: sets?.get(ex.id) ?? ex.sets }),
    thumbUrl: ex.referenceVideoId
      ? referenceThumbUrl(ex.referenceVideoId)
      : ex.thumbPath
        ? (thumbs[ex.thumbPath] ?? null)
        : null,
    videoPath: ex.videoPath,
    referenceVideoId: ex.referenceVideoId,
    aspectRatio: ex.aspectRatio,
    isReference: ex.source === 'REFERENCE',
  }));
}
