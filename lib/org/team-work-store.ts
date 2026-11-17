import 'server-only';
import { appNow } from '@/lib/clock';
import { prisma } from '@/lib/prisma';
import { exercisesByIds } from '@/lib/library-cache';
import { workoutV2SchemaApplied } from '@/lib/workout/v2/gate';
import { currentContracts, loadStructured } from '@/lib/workout/load/server';
import { writeOrgWorkCore, type OrgWorkDeps, type OrgWorkRejection, type OrgWorkResult } from '@/lib/org/team-work-core';
import type { OrgWorkItem } from '@/lib/org/team-work';

export type { OrgWorkRejection, OrgWorkResult } from '@/lib/org/team-work-core';

/**
 * 코치 운동을 선수의 그날 운동 판에 쓰기(3단계 준비, 규칙은 lib/org/team-work.ts). 서버 동작 파일이 아니다 — 회원 번호를 받으므로
 * 코치 권한 · 선수 공유 동의(트레이닝)를 확인한 서버 코드만 부른다(lib/workout/close-stale.ts 와 같은 까닭).
 *
 * 한 활동(orgEventId)의 코치 세트를 통째로 바꾼다 — items 가 비면 그 활동의 코치 세트를 다 지운다(되돌리기 · 일지 지우기).
 * 판이 없으면 'org' 판(마친 상태)을 만들고, 코치 운동만 있던 판에 세트가 하나도 안 남으면 판째 지운다.
 * 세트를 바꾼 뒤 요약(UserExerciseLog)은 지금처럼 세트에서 다시 셈한다 — 부하 · 달력 · '최근 운동'이 그대로 따라온다.
 *
 * EX-LOAD01 R1-03 — 핵심은 lib/org/team-work-core.ts(격리 시험이 같은 코드를 돈다). 모든 운동 · 세트를 지우기 · 넣기 전에 검사하고,
 * 정규화가 거절하면(꼭 적어야 하는 무게 없음 · 올바르지 않은 수량 · 모르는 운동 · 모르는 선수) **보낸 kg 을 그대로 넣지 않고** 아무것도 쓰지 않은 채
 * 고칠 곳을 가리키는 실패를 돌려준다. 요약도 같은 거래 안에서 다시 셈한다.
 *
 * 답 — 예전 그대로 'saved' · 'deferred'(v2 판이라 복구함에 남김), 더한 갈래로 실패 객체(OrgWorkRejection, ok:false).
 */
export function orgWorkDeps(): OrgWorkDeps {
  return {
    db: prisma,
    exercisesByIds: (ids) => exercisesByIds([...ids]),
    currentContracts,
    structured: loadStructured(),
    v2Applied: workoutV2SchemaApplied(),
    now: appNow,
  };
}

export async function writeOrgWork(a: {
  userId: string;
  dateKey: string;
  orgEventId: string;
  enteredById: string;
  items: readonly OrgWorkItem[];
}): Promise<'saved' | 'deferred' | OrgWorkRejection> {
  const r: OrgWorkResult = await writeOrgWorkCore(orgWorkDeps(), a);
  return r.ok ? r.outcome : r;
}

/** 실패 갈래인가 — 'saved' · 'deferred' 는 문자열, 실패는 객체 */
export const isOrgWorkRejection = (r: Awaited<ReturnType<typeof writeOrgWork>>): r is OrgWorkRejection => typeof r === 'object' && r !== null && r.ok === false;

/** 그 일정에 코치가 남긴 수행일지 — 지우기 · 취소 전에 묻는다(결정 4) */
export async function eventWorkOf(orgEventId: string): Promise<{ sets: number; players: number }> {
  const rows = await prisma.userExerciseSet.groupBy({ by: ['userId'], where: { orgEventId, enteredById: { not: null } }, _count: { _all: true } });
  return { sets: rows.reduce((n, r) => n + r._count._all, 0), players: rows.length };
}

/** 일정을 지우거나 취소하며 '수행일지도 빼기'를 고른 때 — 그 일정의 코치 세트를 선수 · 날마다 통째로 뺀다(writeOrgWork 빈 목록) */
export async function clearEventWork(orgEventId: string, byId: string): Promise<void> {
  const rows = await prisma.userExerciseSet.findMany({ where: { orgEventId, enteredById: { not: null } }, select: { userId: true, date: true }, distinct: ['userId', 'date'] });
  for (const r of rows) await writeOrgWork({ userId: r.userId, dateKey: r.date.toISOString().slice(0, 10), orgEventId, enteredById: byId, items: [] });
}
