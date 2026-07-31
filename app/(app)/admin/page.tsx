import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/dal';
import { Badge, Card, PageHeading } from '@/components/ui';
import { DeleteUser, RoleToggle } from './user-row-actions';

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** 최근 7일 안에 가입한 회원 수 */
async function countRecentSignups() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return prisma.user.count({ where: { createdAt: { gte: weekAgo } } });
}

export default async function AdminPage() {
  const admin = await requireAdmin();

  const [users, recentSignups, totalLogs, totalArticles, totalVideos] =
    await Promise.all([
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          nickname: true,
          role: true,
          createdAt: true,
          _count: { select: { pitchLogs: true, articles: true } },
          pitchLogs: {
            orderBy: { date: 'desc' },
            take: 1,
            select: { date: true },
          },
        },
      }),
      countRecentSignups(),
      prisma.pitchLog.count(),
      prisma.article.count(),
      prisma.exerciseVideo.count(),
    ]);

  const activeCount = users.filter(
    (u) => u._count.pitchLogs > 0 || u._count.articles > 0
  ).length;

  const stats = [
    { label: '전체 회원', value: users.length, unit: '명' },
    { label: '최근 7일 신규', value: recentSignups, unit: '명' },
    { label: '활동 회원', value: activeCount, unit: '명' },
    { label: '누적 투구 기록', value: totalLogs, unit: '건' },
  ];

  return (
    <div className="space-y-10">
      <PageHeading
        eyebrow="Admin"
        title="관리자"
        description="가입한 회원과 사이트 활동 현황입니다. 회원에게 관리자 권한을 주거나 계정을 삭제할 수 있습니다."
      />

      {/* 요약 */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface px-5 py-5">
            <p className="text-xs uppercase tracking-wider text-muted">{s.label}</p>
            <p className="text-display mt-2 text-3xl text-cream">
              {s.value}
              <span className="ml-1 text-sm text-muted">{s.unit}</span>
            </p>
          </div>
        ))}
      </div>

      {/* 회원 목록 */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-cream">회원 목록</h2>
          <span className="text-xs text-muted">최근 가입순</span>
        </div>

        <div className="space-y-3">
          {users.map((u) => {
            const isSelf = u.id === admin.id;
            const lastLog = u.pitchLogs[0]?.date;

            return (
              <Card key={u.id} className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-cream">{u.nickname}</span>
                    {u.role === 'ADMIN' && (
                      <Badge className="border-gold-dim/60 text-gold">관리자</Badge>
                    )}
                    {isSelf && <Badge>나</Badge>}
                  </div>
                  <p className="mt-1 truncate text-sm text-muted">{u.email}</p>
                  <p className="mt-2 text-xs text-muted/80">
                    가입 {formatDate(u.createdAt)}
                    <span className="mx-2 text-line-strong">·</span>
                    기록 {u._count.pitchLogs}건
                    <span className="mx-2 text-line-strong">·</span>
                    글 {u._count.articles}개
                    {lastLog && (
                      <>
                        <span className="mx-2 text-line-strong">·</span>
                        최근 기록 {formatDate(lastLog)}
                      </>
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <RoleToggle
                    userId={u.id}
                    nickname={u.nickname}
                    isAdmin={u.role === 'ADMIN'}
                    disabled={isSelf}
                  />
                  <DeleteUser userId={u.id} nickname={u.nickname} disabled={isSelf} />
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* 콘텐츠 현황 */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-cream">콘텐츠 현황</h2>
        <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
          {[
            { label: '트레이닝 영상', value: totalVideos, href: '/training' },
            { label: '자료실 게시글', value: totalArticles, href: '/board' },
            { label: '투구 기록', value: totalLogs, href: '/pitch-log' },
          ].map((c) => (
            <div key={c.label} className="bg-surface px-5 py-5">
              <p className="text-xs uppercase tracking-wider text-muted">{c.label}</p>
              <p className="text-display mt-2 text-2xl text-cream">{c.value}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="rounded-xl border border-line bg-surface px-5 py-4 text-xs leading-relaxed text-muted">
        본인 계정은 실수로 잠기는 것을 막기 위해 권한 변경과 삭제가 막혀 있습니다.
        회원을 삭제하면 그 회원의 투구 기록과 게시글도 함께 지워지며 되돌릴 수 없습니다.
      </p>
    </div>
  );
}
