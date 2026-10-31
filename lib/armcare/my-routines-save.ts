import { Prisma, type PrismaClient } from '@prisma/client';
import { MY_ROUTINE_MAX, isRoutineId, normalizeRoutineInput, readRoutineItems, type MyRoutineItem } from '@/lib/armcare/my-routines';

/**
 * 내 암케어 루틴 저장의 DB 일(2026-10-31 루틴 만들기 시안) — 서버 동작(app/actions/armcare.ts)은 운영 DB 를, 시험
 * (scripts/armcare-routine-db-selftest.mts)은 따로 띄운 PGlite 를 넘긴다. 담을 수 있는 운동(known)도 부르는 쪽이 넘긴다.
 *
 * 새로 만들기는 key 로 한 번만 만든다 — key 는 앱이 그 초안을 열 때 정해 둔 새 루틴 id(uuid)다. 같은 사람이 같은 key 로 다시 보내면
 * (응답을 못 받아 결과 확인 · 연타 · 겹친 요청) 이미 만든 그 루틴을 그대로 돌려주고 새로 만들지 않는다. 예전 만들기는 개수를 세고 만드는
 * 것을 직렬화로 묶어 10개 한도는 지켰지만, 만들어 놓고 답이 끊기면 다시 눌러 같은 루틴이 하나 더 생겼다.
 *
 * 답의 error 는 '쓰지 않았다'가 확정된 것만이다(입력 · 한도 · 권한 · 겹침). 답을 못 받은 것(끊김 · 서버 오류)은 부르는 쪽이 따로 다룬다.
 */
export type RoutineSaveCode = 'invalid' | 'unavailable' | 'limit' | 'notFound' | 'conflict';
export type RoutineSaved = { ok: true; id: string; name: string; items: MyRoutineItem[] };
export type RoutineRefused = { error: string; code: RoutineSaveCode };
export type RoutineSaveInput = { name: unknown; items: unknown };

type Db = Pick<PrismaClient, 'userArmcareRoutine' | '$transaction'>;
type Row = { id: string; userId: string; name: string; items: Prisma.JsonValue };

const ROW = { id: true, userId: true, name: true, items: true } as const;
const refuse = (error: string, code: RoutineSaveCode): RoutineRefused => ({ error, code });
const savedOf = (r: Row): RoutineSaved => ({ ok: true, id: r.id, name: r.name, items: readRoutineItems(r.items) });
/* 남의 key · 남의 루틴은 있는 줄을 알리지 않는다 */
const BAD = () => refuse('잘못된 요청이에요.', 'invalid');
/* 겹친 직렬화 트랜잭션(P2034) · 같은 key 가 먼저 들어감(P2002) — 다시 읽어 보면 판가름 난다 */
const isRace = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && (e.code === 'P2034' || e.code === 'P2002');

function check(input: RoutineSaveInput, known: ReadonlySet<string>) {
  const clean = normalizeRoutineInput(input);
  if (!clean.ok) return refuse(clean.error, 'invalid');
  if (clean.items.some((it) => !known.has(it.exerciseId)))
    return refuse('지금 담을 수 없는 운동이 섞여 있어요. 그 운동을 빼고 다시 저장해 주세요.', 'unavailable');
  return clean;
}

export async function createRoutineOnce(
  db: Db,
  userId: string,
  key: unknown,
  input: RoutineSaveInput,
  known: ReadonlySet<string>
): Promise<RoutineSaved | RoutineRefused> {
  if (!isRoutineId(key)) return BAD();
  const find = () => db.userArmcareRoutine.findUnique({ where: { id: key }, select: ROW });
  /* 이미 만들었으면 입력 · 운동 검사보다 먼저 그대로 돌려준다 — 그새 운동이 숨겨졌다고 이미 된 저장을 '실패'로 답하지 않게 */
  const before = await find();
  if (before) return before.userId === userId ? savedOf(before) : BAD();
  const clean = check(input, known);
  if ('error' in clean) return clean;
  const items = clean.items as unknown as Prisma.InputJsonValue;

  /* 겹치면 DB 가 한쪽을 되돌린다 — 다시 읽어 같은 key 가 생겼으면 그것, 아니면 몇 번 더(다른 루틴과 겹친 것이면 다시 세면 한도가 맞는다) */
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const out = await db.$transaction(
        async (tx) => {
          const again = await tx.userArmcareRoutine.findUnique({ where: { id: key }, select: ROW });
          if (again) return again;
          const count = await tx.userArmcareRoutine.count({ where: { userId } });
          if (count >= MY_ROUTINE_MAX) return null;
          return tx.userArmcareRoutine.create({ data: { id: key, userId, name: clean.name, items }, select: ROW });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      if (!out) return refuse(`내 루틴은 ${MY_ROUTINE_MAX}개까지 둘 수 있어요. 안 쓰는 루틴을 지우고 만들어 주세요.`, 'limit');
      return out.userId === userId ? savedOf(out) : BAD();
    } catch (e) {
      if (!isRace(e)) throw e;
      const row = await find();
      if (row) return row.userId === userId ? savedOf(row) : BAD();
    }
  }
  return refuse('다른 곳에서 동시에 루틴을 만들고 있어요. 다시 저장해 주세요.', 'conflict');
}

/** 고치기 — 같은 내용으로 몇 번을 보내도 같은 결과다. 지워졌거나 남의 루틴이면 새로 만들지 않는다 */
export async function updateRoutine(
  db: Db,
  userId: string,
  id: unknown,
  input: RoutineSaveInput,
  known: ReadonlySet<string>
): Promise<RoutineSaved | RoutineRefused> {
  if (!isRoutineId(id)) return BAD();
  const clean = check(input, known);
  if ('error' in clean) return clean;
  const res = await db.userArmcareRoutine.updateMany({
    where: { id, userId },
    data: { name: clean.name, items: clean.items as unknown as Prisma.InputJsonValue },
  });
  if (res.count === 0) return refuse('루틴을 찾을 수 없어요. 지워졌을 수 있어요.', 'notFound');
  return { ok: true, id, name: clean.name, items: clean.items };
}
