import { PageHeading } from '@/components/ui';
import { NoticeBoard } from '@/components/master/notice-board';
import { requireMaster } from '@/lib/dal';
import { requireCurrentOrg } from '@/lib/org/access';
import { ORG_WORDS } from '@/lib/org/rules';
import { prisma } from '@/lib/prisma';
import { noticeReads } from '@/lib/org/team-load';

/** 조직 공지(5단계) — 선수는 /join 의 참여한 조직 칸 · 싱커 앱 선수 공간에서 본다. 3단계: 앱에서 본 선수 수(읽음) */
export default async function NoticesPage() {
  const user = await requireMaster();
  const { org } = await requireCurrentOrg(user);
  const notices = await prisma.orgNotice.findMany({
    where: { orgId: org.id },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    select: { id: true, title: true, body: true, pinned: true, createdAt: true },
  });
  const { players, reads } = await noticeReads(org.id, notices.map((n) => n.id));
  return (
    <div className="stack-page">
      <PageHeading title="공지" description={`${ORG_WORDS[org.kind].members}에게 알릴 것 — 참여 화면에서 보여요.`} />
      <NoticeBoard
        orgId={org.id}
        players={players}
        notices={notices.map((n) => ({ id: n.id, title: n.title, body: n.body, pinned: n.pinned, key: n.createdAt.toISOString().slice(0, 10), read: reads[n.id] ?? 0 }))}
      />
    </div>
  );
}
