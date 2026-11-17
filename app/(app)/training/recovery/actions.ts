'use server';

import { allowFeature } from '@/lib/release-gate';
import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { exercisesByIds } from '@/lib/library-cache';
import { readFrozenPlan } from '@/lib/workout/session-plan';
import { contractOfFrozen, contractOfLibraryRow } from '@/lib/workout/load/frozen';
import type { RecordingContract } from '@/lib/workout/load/contract';

/**
 * EX-LOAD01-R1 — 못 보낸 세트 복구 화면(웹)이 줄마다 붙일 맥락을 읽는다. **읽기만** 한다 — 판을 열거나 만들지 않고, 세트를 쓰지 않는다.
 *
 * - 판(sessionIds): 지금 계정의 판만(userId). 찾은 판은 날짜 · 상태 · 그 판에 얼린 운동(이름 · 버티기 · 기록 계약). 다른 계정의 판 · 지운 판은
 *   답에 없다(없다는 것만 안다 — 무엇이 있는지는 말하지 않는다).
 * - 운동(exerciseIds): 판을 못 찾은 줄의 이름과 지금 라이브러리 장비로 푼 계약(참고용 — 'library'). 얼린 계약('frozen')이 있으면 그것이 이긴다.
 *
 * 화면은 이것을 못 읽어도(신호 없음) 줄을 그대로 보인다 — 이름 · 판 맥락만 빠진다.
 */

export type RecoveryExercise = {
  title: string;
  isHold: boolean;
  contract: RecordingContract;
  /** frozen: 그 판에 얼린 계약(서버가 검사하는 것과 같다) · library: 지금 라이브러리 장비로 푼 참고 계약 */
  source: 'frozen' | 'library';
};

export type RecoverySession = {
  /** 판의 날짜(YYYY-MM-DD) */
  dateKey: string;
  status: 'ACTIVE' | 'FINISHED' | 'ABANDONED' | string;
  exercises: Record<string, RecoveryExercise>;
};

export type RecoveryContext = {
  sessions: Record<string, RecoverySession>;
  /** 판에 없거나 판을 못 찾은 운동 — 라이브러리 기준 */
  library: Record<string, RecoveryExercise>;
};

const ID = /^[\w-]{1,64}$/;
const MAX_IDS = 100;

const ids = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && ID.test(x)))].slice(0, MAX_IDS) : [];

export async function loadRecoveryContext(input: { sessionIds: unknown; exerciseIds: unknown }): Promise<RecoveryContext> {
  allowFeature('training');
  const user = await requireUser();
  const sessionIds = ids(input?.sessionIds);
  const exerciseIds = ids(input?.exerciseIds);

  const rows = sessionIds.length
    ? await prisma.trainingSession.findMany({
        where: { id: { in: sessionIds }, userId: user.id },
        select: { id: true, date: true, status: true, plan: true },
      })
    : [];
  const sessions: Record<string, RecoverySession> = {};
  for (const s of rows) {
    const plan = readFrozenPlan(s.plan);
    const exercises: Record<string, RecoveryExercise> = {};
    for (const e of plan?.exercises ?? []) {
      exercises[e.id] = { title: e.title, isHold: e.isHold, contract: contractOfFrozen(e), source: 'frozen' };
    }
    sessions[s.id] = { dateKey: s.date.toISOString().slice(0, 10), status: s.status, exercises };
  }

  const library: Record<string, RecoveryExercise> = {};
  if (exerciseIds.length) {
    for (const ex of await exercisesByIds(exerciseIds)) {
      library[ex.id] = {
        title: ex.title,
        isHold: ex.holdSeconds != null && ex.reps == null,
        contract: contractOfLibraryRow(ex),
        source: 'library',
      };
    }
  }
  return { sessions, library };
}

/**
 * EX-LOAD01-R1 — 계정 표시가 없는 옛 세트가 이 계정의 것인가(복구 화면의 '내 기록으로 확인하기'). **판 번호만** 받아 그 가운데 지금 계정의 판인
 * 번호만 돌려준다 — 세트 내용은 받지도 쓰지도 않고, 다른 계정의 판에 대해서는 아무것도 말하지 않는다(없는 판과 같다). 화면은 확인된 줄에만 계정을
 * 붙이고(outbox.bindOwner) 나머지는 그대로 '모름'에 둔다.
 */
export async function resolveSessionOwnership(input: { sessionIds: unknown }): Promise<{ mine: string[] }> {
  allowFeature('training');
  const user = await requireUser();
  const sessionIds = ids(input?.sessionIds);
  if (!sessionIds.length) return { mine: [] };
  const rows = await prisma.trainingSession.findMany({
    where: { id: { in: sessionIds }, userId: user.id },
    select: { id: true },
  });
  return { mine: rows.map((r) => r.id) };
}
