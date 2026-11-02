import type { PrismaClient } from '@prisma/client';
import {
  recordEditable,
  validRecordDate,
  type RecordNote,
} from '@/lib/workout/record-model';

export type NoteSave =
  { ok: true; note: RecordNote } | { error: string; conflict?: boolean };
/** Version compare prevents a historical editor from overwriting a newer note; discomfort is never changed. */
export async function saveRecordNote(
  db: PrismaClient,
  userId: string,
  date: string,
  input: { intensity: number; memo: string; version: string | null },
  today: string,
  now: Date
): Promise<NoteSave> {
  if (!validRecordDate(date) || !recordEditable(date, today))
    return { error: '7일 이내 기록만 수정할 수 있어요.' };
  if (
    !input ||
    !Number.isInteger(input.intensity) ||
    input.intensity < 1 ||
    input.intensity > 10 ||
    typeof input.memo !== 'string' ||
    input.memo.length > 1000 ||
    (input.version !== null && typeof input.version !== 'string')
  )
    return { error: '강도와 메모를 확인해 주세요.' };
  const key = { userId, date: new Date(`${date}T00:00:00Z`) };
  const old = await db.dailyTrainingNote.findUnique({ where: { userId_date: key } });
  if ((old?.updatedAt.toISOString() ?? null) !== input.version)
    return {
      error: '다른 곳에서 기록이 바뀌었어요. 다시 확인해 주세요.',
      conflict: true,
    };
  const updatedAt = new Date(
    Math.max(now.getTime(), (old?.updatedAt.getTime() ?? 0) + 1)
  );
  const data = {
    intensity: input.intensity,
    memo: input.memo.trim() || null,
    updatedAt,
  };
  if (old) {
    const result = await db.dailyTrainingNote.updateMany({
      where: { ...key, updatedAt: old.updatedAt },
      data,
    });
    if (result.count !== 1)
      return {
        error: '다른 곳에서 기록이 바뀌었어요. 다시 확인해 주세요.',
        conflict: true,
      };
  } else {
    try {
      await db.dailyTrainingNote.create({ data: { ...key, ...data } });
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && e.code === 'P2002')
        return {
          error: '다른 곳에서 기록이 바뀌었어요. 다시 확인해 주세요.',
          conflict: true,
        };
      throw e;
    }
  }
  return {
    ok: true,
    note: {
      intensity: data.intensity,
      memo: data.memo,
      version: updatedAt.toISOString(),
    },
  };
}
