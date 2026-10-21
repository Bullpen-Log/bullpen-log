'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { MESSAGE_MAX } from '@/lib/market/specs';

/**
 * 덕아웃 채팅(2026-10-20) — 물건마다 사는 사람과 파는 사람 사이 방 하나. 처음엔 장터가 쓰고, 레슨(2판) · 장소(3판) 예약이 같은 방을 쓴다.
 * 실시간은 화면이 몇 초마다 다시 읽는다(components/chat-room.tsx) — 사용자가 늘면 그때 바꾼다.
 */

/** 물건에서 '채팅하기' — 이미 방이 있으면 그 방으로 */
export async function openConversation(formData: FormData) {
  const user = await requireUser();
  const listingId = String(formData.get('listingId') ?? '');
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { userId: true, hiddenAt: true },
  });
  if (!listing || listing.hiddenAt) redirect('/market');
  if (listing.userId === user.id) redirect(`/market/${listingId}`);
  const found = await prisma.conversation.findUnique({
    where: { listingId_buyerId: { listingId, buyerId: user.id } },
    select: { id: true },
  });
  if (found) redirect(`/chat/${found.id}`);
  const created = await prisma.conversation.create({
    data: { listingId, buyerId: user.id, sellerId: listing.userId },
    select: { id: true },
  });
  revalidatePath('/chat');
  redirect(`/chat/${created.id}`);
}

export type ChatState = { error?: string } | undefined;

export async function sendMessage(
  _prev: ChatState,
  formData: FormData
): Promise<ChatState> {
  const user = await requireUser();
  const conversationId = String(formData.get('conversationId') ?? '');
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return { error: '내용을 적어 주세요.' };
  if (body.length > MESSAGE_MAX) return { error: `한 번에 ${MESSAGE_MAX}자까지예요.` };
  const room = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { buyerId: true, sellerId: true },
  });
  if (!room || (room.buyerId !== user.id && room.sellerId !== user.id))
    return { error: '내 채팅방이 아니에요.' };
  const now = new Date();
  await prisma.$transaction([
    prisma.message.create({ data: { conversationId, senderId: user.id, body } }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastText: body.length > 80 ? `${body.slice(0, 80)}…` : body,
        lastAt: now,
        ...(room.buyerId === user.id ? { buyerReadAt: now } : { sellerReadAt: now }),
      },
    }),
  ]);
  revalidatePath(`/chat/${conversationId}`);
  revalidatePath('/chat');
  return undefined;
}
