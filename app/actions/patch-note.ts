'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';

export type PatchNoteState = { error?: string; success?: string } | undefined;

const LIMIT = 2000;

/**
 * 패치노트에 붙은 메모를 고친다.
 *
 * 메모만 고칠 수 있다. 커밋·날짜·사람은 깃에서 오는 것이라 여기서 고쳐 봐야
 * 다음에 다시 맞출 때 덮어쓰인다. 고칠 수 있는 것처럼 보여 놓고 조용히
 * 되돌아가는 것보다, 처음부터 못 고치게 두는 편이 낫다.
 */
export async function updatePatchNote(
  _prev: PatchNoteState,
  formData: FormData
): Promise<PatchNoteState> {
  const user = await getCurrentUser();
  if (user?.role !== 'ADMIN') return { error: '관리자만 고칠 수 있습니다.' };

  const id = String(formData.get('id') ?? '');
  const note = String(formData.get('note') ?? '').trim();

  if (!id) return { error: '어느 기록인지 알 수 없습니다.' };
  if (note.length > LIMIT) {
    return { error: `메모는 ${LIMIT}자까지 적을 수 있습니다.` };
  }

  const existing = await prisma.patchNote.findUnique({
    where: { id },
    select: { note: true },
  });
  if (!existing) return { error: '기록을 찾을 수 없습니다.' };

  /*
   * 같은 글이면 아무것도 하지 않는다. 안 그러면 열어서 저장만 눌러도
   * '누가 언제 고쳤다'가 새로 찍혀, 실제로 고친 기록이 묻힌다.
   */
  if ((existing.note ?? '') === note) return { success: '바뀐 것이 없습니다.' };

  await prisma.patchNote.update({
    where: { id },
    data: {
      note: note || null,
      editedAt: new Date(),
      editedBy: user.nickname,
    },
  });

  revalidatePath('/admin/patch-notes');
  revalidatePath(`/admin/patch-notes/${id}`);
  return { success: '저장했습니다.' };
}
