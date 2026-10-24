import 'server-only';
import { prisma } from '@/lib/prisma';

/** 경기 댓글 읽기(2026-10-24) — 오래된 것부터, 가린 것(hiddenAt)은 빼고. 동작은 app/actions/game-comments.ts */
export const GAME_COMMENT_MAX = 500;

export type GameCommentRow = {
  id: string;
  body: string;
  createdAt: Date;
  nickname: string;
  userId: string;
};

export async function loadGameComments(gameId: string): Promise<GameCommentRow[]> {
  const rows = await prisma.gameComment.findMany({
    where: { gameId, hiddenAt: null },
    orderBy: { createdAt: 'asc' },
    take: 300,
    select: { id: true, body: true, createdAt: true, userId: true, user: { select: { nickname: true } } },
  });
  return rows.map((r) => ({ id: r.id, body: r.body, createdAt: r.createdAt, userId: r.userId, nickname: r.user.nickname }));
}
