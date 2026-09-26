import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/dal';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { visibleExercises } from '@/lib/library-cache';
import { FALLBACK_REST_SECONDS } from '@/lib/exercise-meta';
import { ARMCARE_CATEGORY } from '@/lib/armcare/anatomy';
import { ARMCARE_KIND_TEXT } from '@/lib/armcare/routine';
import { loadArmcareToday, notAdvised } from '@/lib/armcare/today';
import { isRoutineId } from '@/lib/armcare/my-routines';
import { loadMyRoutine } from '@/lib/armcare/my-routines-store';
import { toArmcareViews } from '@/app/(app)/training/armcare-views';
import { ArmcarePlayer, type PlayerItem } from './armcare-player';

const BACK = '/training?view=armcare';

/**
 * 따라하기가 어느 날의 것인가 — 연 링크가 적어 준 날(?d=), 없거나 이상하면 오늘.
 *
 * 따라하기 도중에 체크를 남기면 이 화면이 서버에서 새로 그려진다(체크가 화면을 다시
 * 읽게 한다). 밤 11시 50분에 시작해 자정을 넘겨 체크하면, 새로 그릴 때의 '오늘'은 다음
 * 날이라 그날의 루틴이 없다며 루틴 도중에 암케어 화면으로 튕겼다(2026-09-26 검토). 시작한
 * 날을 주소에 박아 둔다. 어제까지만 받는다 — 그보다 오래된 주소는 오늘로 연다.
 */
function playDay(d: unknown, todayKey: string): string {
  return typeof d === 'string' && (d === todayKey || d === shiftDateKey(todayKey, -1))
    ? d
    : todayKey;
}

/**
 * 루틴 따라하기 — /armcare/play/today (그날의 맞춤 루틴), /armcare/play/<내 루틴 id>.
 *
 * 운동 판(/workout/run)처럼 메뉴가 없는 전체 화면이다((session) 틀). 루틴 목록을 읽지
 * 않고 한 운동씩 따라 하게 한다(2026-09-26, armcare-player.tsx).
 *
 * 목록이 보여 주는 것과 같게 한다 — 같은 운동, 같은 체크, 같은 경고:
 *   맞춤 루틴  숨긴 운동만 뺀다(armcare-section.tsx 와 같다)
 *   내 루틴    숨긴 운동과 암케어가 아닌 것을 뺀다
 *   경고       지금 몸 상태에 안 맞는 운동, 만든 뒤 바뀐 루틴 종류, 통증을 남긴 날
 *              (lib/armcare/today.ts 의 notAdvised — 목록과 같은 규칙)
 */
export default async function ArmcarePlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const [{ id }, { d }] = await Promise.all([params, searchParams]);
  if (id !== 'today' && !isRoutineId(id)) notFound();
  const mine = id !== 'today';

  const now = new Date();
  const todayKey = toDateKey(now);
  const dateKey = playDay(d, todayKey);
  /* 어제 것을 이어 하면 그날(한국 시간 한낮)의 루틴·체크·몸 상태로 읽는다 */
  const day = dateKey === todayKey ? now : new Date(`${dateKey}T12:00:00+09:00`);

  const [data, library, routine] = await Promise.all([
    loadArmcareToday(user, day),
    visibleExercises(),
    mine ? loadMyRoutine(user.id, id) : Promise.resolve(null),
  ]);

  let title: string;
  let picks: { exerciseId: string; sets: number }[];
  let notice: string | null = null;

  if (!mine) {
    /* 아직 안 만들었거나 통증인 날 — 루틴 칸이 그 까닭을 보여 준다 */
    if (!data.routine || data.decision.kind === 'rest') redirect(BACK);
    title = `오늘의 ${ARMCARE_KIND_TEXT[data.routine.kind].label}`;
    picks = data.routine.items.map((it) => ({ exerciseId: it.exerciseId, sets: it.sets }));
    if (data.routine.kind !== data.decision.kind) {
      notice = `몸 상태가 바뀌었어요 — ${data.decision.reason}`;
    }
  } else {
    if (!routine) notFound();
    title = routine.name;
    picks = routine.items;
    /* 내 루틴은 막지 않는다 — 내가 짠 루틴이다. 목록처럼 위에 한 번 알린다 */
    if (data.decision.kind === 'rest') notice = '오늘 통증을 남기셨어요 — 쉬는 걸 권해요.';
  }

  const byId = new Map(library.map((ex) => [ex.id, ex]));
  const usable = picks.filter((p) => {
    const ex = byId.get(p.exerciseId);
    return ex != null && (!mine || ex.category === ARMCARE_CATEGORY);
  });
  const views = await toArmcareViews(
    usable.map((p) => byId.get(p.exerciseId)!),
    new Map(usable.map((p) => [p.exerciseId, p.sets]))
  );
  const items: PlayerItem[] = usable.map((p, i) => {
    const ex = byId.get(p.exerciseId)!;
    const doneBefore = data.doneToday.has(p.exerciseId);
    return {
      exercise: views[i],
      sets: p.sets,
      reps: ex.reps,
      holdSeconds: ex.holdSeconds,
      /* 처방이 비었으면 걸리는 시간을 셀 때와 같은 값으로(lib/exercise-meta.ts) */
      restSeconds: ex.restSeconds ?? FALLBACK_REST_SECONDS,
      perSide: ex.perSide,
      doneBefore,
      unsafe: !doneBefore && notAdvised(data, ex, mine),
    };
  });

  return (
    <ArmcarePlayer
      title={title}
      backHref={BACK}
      dateKey={dateKey}
      notice={notice}
      items={items}
    />
  );
}
