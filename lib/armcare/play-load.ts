import 'server-only';
import { appNow } from '@/lib/clock';
import type { getCurrentUser } from '@/lib/dal';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { visibleExercises } from '@/lib/library-cache';
import { FALLBACK_REST_SECONDS } from '@/lib/exercise-meta';
import { ARMCARE_AREAS, ARMCARE_CATEGORY } from '@/lib/armcare/anatomy';
import { buildFocusRoutine, parseAreas } from '@/lib/armcare/coverage';
import { filterByEquipment } from '@/lib/report/equipment';
import { prisma } from '@/lib/prisma';
import { AFTER_THROWING_TEXT, ARMCARE_KIND_TEXT } from '@/lib/armcare/routine';
import { REHAB_ENABLED, REHAB_STAGES } from '@/lib/armcare/rehab';
import { loadArmcareToday, notAdvised } from '@/lib/armcare/today';
import { isRoutineId } from '@/lib/armcare/my-routines';
import { loadMyRoutine } from '@/lib/armcare/my-routines-store';
import { toArmcareViews } from '@/app/(app)/training/armcare-views';
import type { PlayerItem } from '@/app/(session)/armcare/play/[id]/armcare-player';
import type { RehabCheckInitial } from '@/app/(session)/armcare/play/[id]/rehab-check';

/**
 * 루틴 따라하기에 무엇을 띄울지 — 웹 화면(app/(session)/armcare/play/[id]/page.tsx)과 아이폰 앱 화면(app/actions/app-armcare.ts →
 * native/src/app/armcare/[id].tsx)이 같이 쓴다. 둘이 따로 고르면 같은 루틴이 두 화면에서 다른 운동 · 다른 경고로 열린다.
 *
 * 열 수 없으면 갈 곳(to)을 돌려준다 — 웹은 그리로 redirect(missing 이면 예전처럼 404), 앱은 화면을 닫고 웹을 그리로 보낸다.
 * 'use server' 파일에 두지 않는다 — userId 를 받는 함수가 거기 있으면 누구나 부를 수 있는 입구가 된다.
 */

export const ARMCARE_BACK = '/training?view=armcare';
/** 빈 곳 보강(/armcare/play/focus)은 내 팔 지도에서 들어온다 — 끝나면 그리로 */
const FOCUS_BACK = '/training?view=armcare&tab=guide';

type PlayUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** 따라하기 화면(ArmcarePlayer)이 받는 것 그대로 */
export type ArmcarePlay = {
  title: string;
  backHref: string;
  dateKey: string;
  notice: string | null;
  items: PlayerItem[];
  rehabCheck: { initial: RehabCheckInitial } | null;
};

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
 * 루틴 따라하기 — today (그날의 맞춤 루틴), <내 루틴 id>, rehab (오늘 재활 — 재활 2편: 위에 '아프면 바로 멈추세요', 끝에 3문항),
 * focus (빈 곳 보강, ?areas=).
 *
 * 목록이 보여 주는 것과 같게 한다 — 같은 운동, 같은 체크, 같은 경고:
 *   맞춤 루틴  숨긴 운동만 뺀다(armcare-section.tsx 와 같다)
 *   내 루틴    숨긴 운동과 암케어가 아닌 것을 뺀다
 *   경고       지금 몸 상태에 안 맞는 운동, 만든 뒤 바뀐 루틴 종류, 통증을 남긴 날
 *              (lib/armcare/today.ts 의 notAdvised — 목록과 같은 규칙)
 */
export async function loadArmcarePlay(
  user: PlayUser,
  id: string,
  d: unknown,
  areasParam: unknown
): Promise<({ ok: true } & ArmcarePlay) | { ok: false; to: string; missing?: true }> {
  /* missing — 없는 루틴. 웹은 예전처럼 404, 앱은 암케어 목록으로 */
  if (id !== 'today' && id !== 'rehab' && id !== 'focus' && !isRoutineId(id))
    return { ok: false, to: ARMCARE_BACK, missing: true };
  const rehabPlay = id === 'rehab';
  if (rehabPlay && !REHAB_ENABLED) return { ok: false, to: ARMCARE_BACK };
  /*
   * 빈 곳 보강 — 내 팔 지도의 '2주째 비어 있어요'에서 고른 부위(?areas=)로 그 자리에서 짠 10분 루틴(2026-10-04,
   * lib/armcare/coverage.ts). 저장하지 않는다 — 열 때마다 오래 안 한 운동부터 다시 고른다.
   */
  const focusPlay = id === 'focus';
  // 기록이 적다는 이유만으로 추가 보강을 자동 편성하지 않는다.
  if (focusPlay) return { ok: false, to: FOCUS_BACK };
  const focusAreas = focusPlay ? parseAreas(areasParam) : [];
  if (focusPlay && focusAreas.length === 0) return { ok: false, to: FOCUS_BACK };
  const mine = id !== 'today' && !rehabPlay && !focusPlay;

  const now = appNow();
  const todayKey = toDateKey(now);
  const dateKey = playDay(d, todayKey);
  /* 어제 것을 이어 하면 그날(한국 시간 한낮)의 루틴·체크·몸 상태로 읽는다 */
  const day = dateKey === todayKey ? now : new Date(`${dateKey}T12:00:00+09:00`);

  const [data, library, routine] = await Promise.all([
    loadArmcareToday(user, day),
    visibleExercises(),
    mine ? loadMyRoutine(user.id, id) : Promise.resolve(null),
  ]);

  // Use today's status even when opening yesterday's saved routine.
  const current = dateKey === todayKey ? data : await loadArmcareToday(user, now);
  if (!current.hasCheckinToday || current.decision.kind === 'rest') return { ok: false, to: ARMCARE_BACK };

  let title: string;
  let picks: { exerciseId: string; sets: number; note?: string | null }[];
  let notice: string | null = null;
  /* 그날 이미 체크한 것 — 재활 운동은 카테고리가 여럿이라 따로 읽어 둔 것(lib/armcare/today.ts) */
  let doneBefore = data.doneToday;
  let rehabCheck: { initial: RehabCheckInitial } | null = null;

  if (rehabPlay) {
    /*
     * 재활 — 진행 중인 재활이 없거나 쉬는 날(아직 세션을 안 남긴 날)이면 카드가 그 까닭을 보여 준다. 오늘 이미 남겼으면
     * 다시 답할 수 있게 연다(3문항을 미리 골라 둔다). 운동은 카테고리와 상관없이 세션에 든 그대로.
     */
    const rehab = data.rehab;
    if (!rehab || (rehab.status.rest && !rehab.status.today))
      return { ok: false, to: ARMCARE_BACK };
    title = `오늘 재활 · ${rehab.session.stage}단계 ${REHAB_STAGES[rehab.session.stage].name}`;
    picks = rehab.session.items.map((it) => ({
      exerciseId: it.exerciseId,
      sets: it.sets,
      note: it.note ?? (it.replaces ? `${it.replaces} 대신` : null),
    }));
    notice = '아프면 바로 멈추세요(통증 5 이상).';
    doneBefore = rehab.doneToday;
    const saved = rehab.status.today;
    rehabCheck = {
      initial: saved
        ? {
            leftover: saved.leftover === 1 || saved.leftover === 2 ? saved.leftover : 0,
            pain: saved.pain,
            feel:
              saved.feel === 'sharp' || saved.feel === 'tingle' || saved.feel === 'slip'
                ? saved.feel
                : 'muscle',
          }
        : null,
    };
  } else if (focusPlay) {
    const armcare = library
      .filter((ex) => ex.category === ARMCARE_CATEGORY)
      .map((ex) => ({ ...ex, targetMuscles: ex.targetMuscles ?? [] }));
    /*
     * 오래 안 한 것부터 — 최근 45일 기록에서 운동마다 마지막 날(맞춤 루틴과 같은 기간). 그날 기록은 빼고 본다: 따라 하기는
     * 체크할 때마다 이 화면을 다시 그리는데, 방금 한 운동이 '최근'이 되면 루틴 차례가 도중에 바뀐다.
     */
    const recent = await prisma.userExerciseLog.findMany({
      where: {
        userId: user.id,
        completed: true,
        date: {
          gte: new Date(`${shiftDateKey(dateKey, -45)}T00:00:00.000Z`),
          lt: new Date(`${dateKey}T00:00:00.000Z`),
        },
        exerciseId: { in: armcare.map((ex) => ex.id) },
      },
      orderBy: { date: 'desc' },
      select: { exerciseId: true, date: true },
    });
    const lastDone = new Map<string, string>();
    for (const log of recent) {
      if (!lastDone.has(log.exerciseId)) lastDone.set(log.exerciseId, toDateKey(log.date));
    }
    const focusItems = buildFocusRoutine({
      areas: focusAreas,
      candidates: filterByEquipment(armcare, user.ownedEquipment).pool,
      lastDone,
    });
    if (focusItems.length === 0) return { ok: false, to: FOCUS_BACK };
    title = `빈 곳 보강 · ${focusAreas
      .map((key) => ARMCARE_AREAS.find((a) => a.key === key)?.label ?? key)
      .join(' · ')}`;
    picks = focusItems.map((it) => ({ exerciseId: it.exerciseId, sets: it.sets }));
    if (data.decision.kind === 'rest') notice = '오늘 통증을 남기셨어요. 쉬는 걸 권해요.';
  } else if (!mine) {
    /* 아직 안 만들었거나 통증인 날 — 루틴 칸이 그 까닭을 보여 준다 */
    if (!data.routine || data.decision.kind === 'rest') return { ok: false, to: ARMCARE_BACK };
    title = `오늘의 ${ARMCARE_KIND_TEXT[data.routine.kind].label}`;
    picks = data.routine.items.map((it) => ({ exerciseId: it.exerciseId, sets: it.sets }));
    if (data.routine.kind !== data.decision.kind) {
      notice = `몸 상태가 바뀌었어요. ${data.decision.reason}`;
    }
  } else {
    if (!routine) return { ok: false, to: ARMCARE_BACK, missing: true };
    title = routine.name;
    picks = routine.items;
    /* 내 루틴은 막지 않는다 — 내가 짠 루틴이다. 목록처럼 위에 한 번 알린다 */
    if (data.decision.kind === 'rest') notice = '오늘 통증을 남기셨어요. 쉬는 걸 권해요.';
  }
  /* 등판 날(아직 안 던짐) — 루틴은 그대로, 던진 뒤에 하라고 한 줄(재활은 제 알림이 있다) */
  if (!rehabPlay && data.decision.kind !== 'rest' && data.decision.afterThrowing) {
    notice = notice ? `${notice} ${AFTER_THROWING_TEXT}` : AFTER_THROWING_TEXT;
  }

  const byId = new Map(library.map((ex) => [ex.id, ex]));
  const usable = picks.filter((p) => {
    const ex = byId.get(p.exerciseId);
    return ex != null && (!(mine || focusPlay) || ex.category === ARMCARE_CATEGORY) && !notAdvised(current, ex, mine || focusPlay);
  });
  const views = await toArmcareViews(
    usable.map((p) => byId.get(p.exerciseId)!),
    new Map(usable.map((p) => [p.exerciseId, p.sets]))
  );
  const items: PlayerItem[] = usable.map((p, i) => {
    const ex = byId.get(p.exerciseId)!;
    const done = doneBefore.has(p.exerciseId);
    return {
      exercise: views[i],
      sets: p.sets,
      reps: ex.reps,
      holdSeconds: ex.holdSeconds,
      /* 처방이 비었으면 걸리는 시간을 셀 때와 같은 값으로(lib/exercise-meta.ts) */
      restSeconds: ex.restSeconds ?? FALLBACK_REST_SECONDS,
      perSide: ex.perSide,
      doneBefore: done,
      /* 재활은 그 단계 규칙으로 고른 운동이라 맞춤 루틴의 몸 상태 표시를 달지 않는다 */
      unsafe: !done && !rehabPlay && notAdvised(data, ex, mine || focusPlay),
      note: p.note ?? null,
    };
  });

  return {
    ok: true,
    title,
    backHref: focusPlay ? FOCUS_BACK : ARMCARE_BACK,
    dateKey,
    notice,
    items,
    rehabCheck,
  };
}
