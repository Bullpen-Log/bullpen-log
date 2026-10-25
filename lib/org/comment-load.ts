import 'server-only';
import { prisma } from '@/lib/prisma';
import type { CommentTarget } from '@/lib/org/comments';

/** 자리마다 말 수 · 안 푼 회원 말 수 — 일지 · 숙제 줄에 '말 3' 처럼 */
export async function commentCounts(targets: CommentTarget[], memberUserId: string | null): Promise<Map<string, { total: number; open: number }>> {
  const noteIds = targets.flatMap((t) => ('noteId' in t ? [t.noteId] : []));
  const aIds = targets.flatMap((t) => ('assignmentId' in t ? [t.assignmentId] : []));
  if (noteIds.length + aIds.length === 0) return new Map();
  const rows = await prisma.orgComment.findMany({
    where: { OR: [...(noteIds.length ? [{ noteId: { in: noteIds } }] : []), ...(aIds.length ? [{ assignmentId: { in: aIds } }] : [])] },
    select: { noteId: true, assignmentId: true, authorId: true, resolvedAt: true },
  });
  const out = new Map<string, { total: number; open: number }>();
  for (const r of rows) {
    const k = r.noteId ?? r.assignmentId!;
    const v = out.get(k) ?? { total: 0, open: 0 };
    v.total += 1;
    if (r.authorId === memberUserId && !r.resolvedAt) v.open += 1;
    out.set(k, v);
  }
  return out;
}
