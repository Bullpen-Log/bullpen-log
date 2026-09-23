import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { PageHeading } from '@/components/ui';
import { PatchNoteList, type PatchRow } from './patch-note-list';

/**
 * 패치노트 목록 — 프로그램을 고친 기록.
 *
 * 한 줄이 '누가 · 어느 날'이다. 그날 그 사람이 한 일을 한 장으로 묶어 둔다.
 * 같이 하는 사람이 "저 사람이 지난주에 뭘 해뒀지"를 물을 때 보는 자리다.
 *
 * 내용은 깃에서 온다(scripts/sync-patch-notes.mjs). 여기서는 읽기만 한다.
 */
export default async function PatchNotesPage() {
  const user = await requireUser();
  if (user.role !== 'ADMIN') redirect('/today');

  const notes = await prisma.patchNote.findMany({
    orderBy: [{ day: 'desc' }, { authorName: 'asc' }],
    select: {
      id: true,
      day: true,
      authorName: true,
      commitCount: true,
      filesChanged: true,
      insertions: true,
      deletions: true,
      areas: true,
      commits: true,
      note: true,
    },
  });

  const rows: PatchRow[] = notes.map((n) => ({
    id: n.id,
    day: n.day,
    authorName: n.authorName,
    commitCount: n.commitCount,
    filesChanged: n.filesChanged,
    insertions: n.insertions,
    deletions: n.deletions,
    areas: n.areas,
    /*
     * 목록에는 첫 커밋 제목만 보낸다. 20개짜리 하루가 있어서 전부 보내면
     * 목록 한 번 여는 데 필요 없는 글이 몇 백 줄 따라온다. 나머지는 들어가서 본다.
     */
    headline: Array.isArray(n.commits) && n.commits.length > 0
      ? String((n.commits[0] as { subject?: string }).subject ?? '')
      : '',
    hasNote: Boolean(n.note?.trim()),
  }));

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Patch notes"
        title="패치노트"
        description="프로그램을 고친 기록입니다. 한 장이 '누가 · 어느 날'이고, 그날 한 일이 모두 담겨 있습니다. 올릴 때마다 깃 기록에서 저절로 채워집니다."
      />
      <PatchNoteList rows={rows} />
    </div>
  );
}
