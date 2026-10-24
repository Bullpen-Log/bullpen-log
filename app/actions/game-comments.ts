'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { withInput, type FormValues } from '@/lib/form-values';
import { isGameId } from '@/lib/game-detail';
import { GAME_COMMENT_MAX } from '@/lib/game-comments';

/**
 * 덕아웃 경기 댓글 동작(2026-10-24) — 쓰기는 로그인한 회원, 지우기는 쓴 사람 · 관리자. 경기는 네이버 경기 번호(gameId)로 잇는다(우리 표 없음).
 */
export type GameCommentState = { error?: string; values?: FormValues } | undefined;

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '').trim();

export async function addGameComment(_prev: GameCommentState, formData: FormData): Promise<GameCommentState> {
  return withInput(await tryAdd(formData), formData);
}

async function tryAdd(formData: FormData): Promise<GameCommentState> {
  const user = await getCurrentUser();
  if (!user) return { error: '로그인이 필요해요.' };
  const gameId = field(formData, 'gameId');
  const body = field(formData, 'body');
  if (!isGameId(gameId)) return { error: '경기를 찾지 못했어요.' };
  if (!body) return { error: '댓글을 적어 주세요.' };
  if (body.length > GAME_COMMENT_MAX) return { error: `댓글은 ${GAME_COMMENT_MAX}자까지 적을 수 있어요.` };

  /* 1분 안 같은 댓글이면 새로 안 만든다(끊긴 응답에 다시 보냄) */
  const same = await prisma.gameComment.findFirst({
    where: { gameId, userId: user.id, body, createdAt: { gte: new Date(Date.now() - 60_000) } },
    select: { id: true },
  });
  if (!same) await prisma.gameComment.create({ data: { gameId, userId: user.id, body } });
  revalidatePath(`/baseball/${gameId}`);
  return undefined;
}

export async function deleteGameComment(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const id = field(formData, 'id');
  if (!id) return;
  const c = await prisma.gameComment.findUnique({ where: { id }, select: { userId: true, gameId: true } });
  if (!c || (c.userId !== user.id && user.role !== 'ADMIN')) return;
  await prisma.gameComment.delete({ where: { id } });
  revalidatePath(`/baseball/${c.gameId}`);
}
