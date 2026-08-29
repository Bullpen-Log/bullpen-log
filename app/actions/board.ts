'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { withInput, type FormValues } from '@/lib/form-values';

export type BoardState = { error?: string; values?: FormValues } | undefined;

export async function createArticle(
  _prev: BoardState,
  formData: FormData
): Promise<BoardState> {
  // 오류로 끝나면 쓰던 글을 돌려준다. 길게 쓴 내용이 날아가면 안 된다.
  return withInput(await tryCreateArticle(formData), formData);
}

async function tryCreateArticle(formData: FormData): Promise<BoardState> {
  const user = await getCurrentUser();
  if (!user) return { error: '로그인이 필요합니다.' };
  /*
   * 자료실은 운영자가 투구 역학·트레이닝 자료를 올리는 곳이다. 누구나 쓸 수
   * 있게 열어두면 신고·차단 같은 것이 곧 필요해지는데, 지금 그것을 감당할
   * 준비가 안 되어 있다. 커뮤니티가 필요해지면 그때 연다.
   */
  if (user.role !== 'ADMIN') {
    return { error: '자료실 글은 관리자만 올릴 수 있습니다.' };
  }

  const title = String(formData.get('title') ?? '').trim();
  const content = String(formData.get('content') ?? '').trim();
  const attachmentUrl = String(formData.get('attachmentUrl') ?? '').trim();
  const tags = String(formData.get('tags') ?? '')
    .split(',')
    .map((t) => t.trim().replace(/^#/, ''))
    .filter(Boolean)
    .slice(0, 5);

  if (!title || !content) {
    return { error: '제목과 내용을 입력해주세요.' };
  }
  if (title.length > 150) {
    return { error: '제목은 150자 이내로 입력해주세요.' };
  }
  if (attachmentUrl && !/^https?:\/\//i.test(attachmentUrl)) {
    return { error: '자료 링크는 http:// 또는 https:// 로 시작해야 합니다.' };
  }

  const article = await prisma.article.create({
    data: {
      userId: user.id,
      title,
      content,
      tags,
      attachmentUrl: attachmentUrl || null,
    },
    select: { id: true },
  });

  revalidatePath('/board');
  redirect(`/board/${article.id}`);
}

export async function deleteArticle(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;

  const id = String(formData.get('id') ?? '');
  if (!id) return;

  const article = await prisma.article.findUnique({
    where: { id },
    select: { userId: true },
  });

  // 작성자 본인이거나 관리자만 삭제할 수 있다.
  if (!article || (article.userId !== user.id && user.role !== 'ADMIN')) return;

  await prisma.article.delete({ where: { id } });
  revalidatePath('/board');
  redirect('/board');
}
