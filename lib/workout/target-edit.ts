import { appNow } from '@/lib/clock';
import { hasPain, pickCheckinParts } from '@/lib/checkin';
import { readFrozenPlan, type FrozenExercise, type FrozenPlan } from '@/lib/workout/session-plan';
import {
  checkTargetInput,
  recommendedOf,
  type TargetInput,
} from '@/lib/workout/target-override';

/**
 * 운동 중 '내 목표' 저장(EX-RX01) — 서버 동작(app/actions/workout.ts setSessionTarget)의 몸통.
 *
 * DB 를 받아 쓰게 떼어 둔 까닭: 시험(scripts/workout-target-selftest.mts)이 메모리 DB 로 같은 코드를 돈다
 * (다른 사람의 판 · 마친 판 · 동시에 바뀐 판 · 통증 날).
 *
 * 지키는 것.
 * - 이 사람(userId)의 열린 판(ACTIVE)만, 판 번호를 꼭 받는다(지난 판 · 남의 판을 고치지 않게 '가장 최근 판'으로 대신하지 않는다).
 * - 판 JSON 안 그 운동 하나의 userTarget 칸만 바꾼다. 라이브러리(ExerciseVideo) · 그날 일정 · 세트 기록(UserExerciseSet)은 안 건드린다
 *   — 목표를 남긴 세트보다 낮춰도 세트는 그대로다.
 * - 판의 다른 칸 · 다른 운동은 받은 JSON 그대로 옮긴다(위쪽 키를 버리는 readFrozenPlan 으로 다시 쓰지 않는다).
 * - 읽은 뒤 판이 바뀌었으면(다른 기기의 순서 바꾸기 · 교체) 다시 읽어 그 위에 얹는다 — updatedAt 이 같을 때만 쓴다.
 */

export type TargetEditDb = {
  trainingSession: {
    findFirst(args: {
      where: { id: string; userId: string };
      select: { id: true; userId: true; status: true; plan: true; updatedAt: true; date: true };
    }): Promise<{ id: string; userId: string; status: string; plan: unknown; updatedAt: Date; date: Date } | null>;
    updateMany(args: {
      where: { id: string; userId: string; status: 'ACTIVE'; updatedAt: Date };
      data: { plan: object };
    }): Promise<{ count: number }>;
  };
  dailyCheckin: {
    findFirst(args: {
      where: { userId: string; date: Date };
      select: Record<'shoulder' | 'elbow' | 'wrist' | 'lowerBack' | 'lowerBody', true>;
    }): Promise<Partial<Record<'shoulder' | 'elbow' | 'wrist' | 'lowerBack' | 'lowerBody', string>> | null>;
  };
};

const CHECKIN_PART_SELECT = { shoulder: true, elbow: true, wrist: true, lowerBack: true, lowerBody: true } as const;

/** 그 판 날짜의 체크인에 통증이 있는가 — 체크인이 없으면 false(통증 날의 처방 막기는 일정 · 운동 시작이 이미 했다) */
export async function loadPainToday(db: Pick<TargetEditDb, 'dailyCheckin'>, userId: string, date: Date): Promise<boolean> {
  /* 체크인 날짜는 DATE 칸(자정 UTC) — 판 날짜를 그날 자정으로 맞춰 묻는다(run-load 의 그날 메모 읽기와 같다) */
  const day = new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const row = await db.dailyCheckin.findFirst({ where: { userId, date: day }, select: CHECKIN_PART_SELECT });
  return row ? hasPain(pickCheckinParts(row)) : false;
}

export type TargetEditInput = {
  sessionId: unknown;
  exerciseId: unknown;
  /** null · 빈 값이면 '오늘 추천으로 되돌리기' */
  target: TargetInput | null | undefined;
};

export type TargetEditResult =
  | { ok: true; exercise: FrozenExercise; plan: FrozenPlan; sessionDate: Date; painToday: boolean }
  | { ok: false; error: string; field?: keyof TargetInput; code?: string };

/** 같은 판을 다른 곳이 바꿨을 때 다시 읽어 얹는 횟수 */
const CAS_TRIES = 3;

export async function editSessionTarget(
  db: TargetEditDb,
  userId: string,
  input: TargetEditInput,
  deps: {
    /** 처방을 찍기 전에 연 옛 판(restSeconds 가 없는 운동)의 라이브러리 휴식 — 오늘 추천의 휴식으로 쓴다 */
    libraryRestOf: (exerciseId: string) => Promise<number | null>;
    now?: () => Date;
  }
): Promise<TargetEditResult> {
  if (typeof input.sessionId !== 'string' || !input.sessionId) return { ok: false, error: '운동 판을 찾지 못했어요. 화면을 다시 열어 주세요.' };
  if (typeof input.exerciseId !== 'string' || !input.exerciseId) return { ok: false, error: '오늘 목록에 없는 운동이에요.' };
  const now = deps.now ?? appNow;

  for (let attempt = 0; attempt < CAS_TRIES; attempt++) {
    const session = await db.trainingSession.findFirst({
      where: { id: input.sessionId, userId },
      select: { id: true, userId: true, status: true, plan: true, updatedAt: true, date: true },
    });
    /* 남의 판은 '없는 판'과 똑같이 답한다(있는지조차 알리지 않는다) */
    if (!session || session.userId !== userId) return { ok: false, error: '운동 판을 찾지 못했어요. 화면을 다시 열어 주세요.' };
    if (session.status !== 'ACTIVE') return { ok: false, error: '이미 마친 운동이라 목표를 바꾸지 못했어요.' };

    const plan = readFrozenPlan(session.plan);
    const ex = plan?.exercises.find((e) => e.id === input.exerciseId);
    if (!plan || !ex) return { ok: false, error: '오늘 목록에 없는 운동이에요.' };

    const rest = ex.restSeconds !== undefined ? ex.restSeconds : await deps.libraryRestOf(ex.id);
    const recommended = recommendedOf(ex, rest);
    const painToday = await loadPainToday(db, userId, session.date);
    /*
     * EX-LOAD01-R1 — 지금 저장된 장비 목표(받은 JSON 그대로 — 다른 판의 값도). 장비 목표 칸이 없는 요청(옛 화면 · 숫자만)은 이것을
     * 그대로 옮기고, 지움은 loadV:1 + null 일 때만. 같은 거래 바깥에서 읽은 값이라도 아래 updatedAt 비교가 그사이 바뀐 판을 막는다.
     */
    const rawNow = Array.isArray((session.plan as Record<string, unknown>)?.exercises)
      ? ((session.plan as Record<string, unknown>).exercises as Record<string, unknown>[]).find((e) => e?.id === ex.id)
      : undefined;
    const prevLoad = (rawNow?.userTarget as { load?: unknown } | undefined)?.load;
    const check = checkTargetInput(input.target ?? null, ex, recommended, { painToday, prevLoad });
    if (!check.ok) return check;

    const { userTarget: _old, ...rest0 } = ex;
    void _old;
    const nextEx: FrozenExercise = check.target ? { ...rest0, userTarget: { ...check.target, at: now().toISOString() } } : rest0;

    /* 받은 JSON 을 그대로 두고 그 운동 하나만 갈아 끼운다 */
    const raw = session.plan as Record<string, unknown>;
    const rawList = Array.isArray(raw.exercises) ? (raw.exercises as Record<string, unknown>[]) : [];
    const nextRaw = {
      ...raw,
      exercises: rawList.map((e) => {
        if (e?.id !== ex.id) return e;
        const { userTarget: _u, ...keep } = e;
        void _u;
        return check.target ? { ...keep, userTarget: nextEx.userTarget } : keep;
      }),
    };

    const res = await db.trainingSession.updateMany({
      where: { id: session.id, userId, status: 'ACTIVE', updatedAt: session.updatedAt },
      data: { plan: nextRaw },
    });
    if (res.count === 1) {
      const nextPlan: FrozenPlan = { ...plan, exercises: plan.exercises.map((e) => (e.id === ex.id ? nextEx : e)) };
      return { ok: true, exercise: nextEx, plan: nextPlan, sessionDate: session.date, painToday };
    }
    /* 그 사이 판이 바뀌었다(다른 기기 · 순서 바꾸기 · 마침) — 다시 읽어 그 위에 얹는다 */
  }
  return { ok: false, error: '다른 곳에서 운동 목록이 바뀌고 있어요. 잠시 뒤 다시 저장해 주세요.' };
}
