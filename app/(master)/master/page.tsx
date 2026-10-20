import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarDays, ClipboardList, KeyRound, Plus, Users } from '@/components/icon';
import { Badge, ButtonLink, Card, EmptyState, PageHeading } from '@/components/ui';
import { InviteCodeCard } from '@/components/master/invite-code-card';
import { requireMaster } from '@/lib/dal';
import { currentOrg } from '@/lib/org/access';
import { ORG_KIND_LABEL, ORG_WORDS, inviteUsable } from '@/lib/org/rules';
import { prisma } from '@/lib/prisma';

/**
 * 마스터 홈 — 조직 종류에 따라 다르다(1단계는 뼈대).
 *   레슨장: 회원 수 · 초대 코드 · 빠른 일(회원 초대 · 회원 목록 · 레슨 노트 · 측정 시작)
 *   팀:     선수단 수 · 초대 코드 · 빠른 일(선수 초대 · 선수단 · 훈련 일정 · 투수 부하판)
 * 오늘의 내용(레슨 시간표 · 투수 부하판 · 체크인 요약)은 2단계가 채운다 — 자리만 비워 둔다.
 */
export default async function MasterHome() {
  const user = await requireMaster();
  const { org } = await currentOrg(user);
  if (!org) {
    if (user.role === 'ADMIN') redirect('/master/orgs');
    return (
      <EmptyState
        icon={<Users />}
        title="아직 조직이 없어요"
        description="가입할 때 만든 레슨장 · 팀이 보이지 않아요. 관리자에게 알려 주세요."
      />
    );
  }
  const words = ORG_WORDS[org.kind];

  const [players, joined, staff, invite, recent] = await Promise.all([
    prisma.orgMember.count({
      where: { orgId: org.id, role: 'PLAYER', status: 'ACTIVE' },
    }),
    prisma.orgMember.count({
      where: { orgId: org.id, role: 'PLAYER', status: 'ACTIVE', userId: { not: null } },
    }),
    prisma.orgMember.count({
      where: { orgId: org.id, role: { in: ['MASTER', 'STAFF'] }, status: 'ACTIVE' },
    }),
    prisma.orgInvite.findFirst({
      where: { orgId: org.id, role: 'PLAYER' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, code: true, role: true, expiresAt: true, usedAt: true },
    }),
    prisma.orgMember.findMany({
      where: { orgId: org.id, role: 'PLAYER', status: 'ACTIVE' },
      orderBy: { joinedAt: 'desc' },
      take: 5,
      select: { id: true, nickname: true, userId: true, tags: true, joinedAt: true },
    }),
  ]);
  const liveInvite = invite && inviteUsable(invite, new Date()) ? invite : null;

  const quick =
    org.kind === 'LESSON'
      ? [
          {
            href: '/master/settings#invite',
            label: '회원 초대',
            hint: '초대 코드 · 참여 링크',
            icon: KeyRound,
          },
          {
            href: '/master/players',
            label: '회원 목록',
            hint: `${players}명`,
            icon: Users,
          },
          { href: null, label: '레슨 노트', hint: '4단계에서', icon: ClipboardList },
          { href: null, label: '대신 기록 · 측정', hint: '3단계에서', icon: Plus },
        ]
      : [
          {
            href: '/master/settings#invite',
            label: '선수 초대',
            hint: '초대 코드 · 참여 링크',
            icon: KeyRound,
          },
          {
            href: '/master/players',
            label: '선수단',
            hint: `${players}명`,
            icon: Users,
          },
          { href: null, label: '훈련 일정', hint: '5단계에서', icon: CalendarDays },
          { href: null, label: '투수 부하판', hint: '2단계에서', icon: ClipboardList },
        ];

  return (
    <div className="stack-page">
      <PageHeading
        kicker={`${ORG_KIND_LABEL[org.kind]} 홈`}
        title={org.name}
        description={[org.region, org.note].filter(Boolean).join(' · ') || undefined}
      />

      {/* 숫자 셋 — 구성원 · 가입한 사람 · 스태프 */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label={words.members}
          value={`${players}명`}
          sub={`가입 ${joined} · 자리 ${players - joined}`}
        />
        <Stat label="스태프" value={`${staff}명`} sub="마스터 · 코치" />
        <Stat
          label="초대 코드"
          value={liveInvite ? liveInvite.code : '없음'}
          sub={
            liveInvite ? `${fmtDate(liveInvite.expiresAt)}까지` : '설정에서 만들어요'
          }
          mono
        />
      </section>

      {/* 빠른 일 */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">빠른 일</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {quick.map((q) => {
            const Icon = q.icon;
            const inner = (
              <>
                <Icon className={`h-5 w-5 ${q.href ? 'text-sky' : 'text-muted/60'}`} />
                <span
                  className={`mt-3 block text-sm font-semibold ${q.href ? 'text-ink' : 'text-muted'}`}
                >
                  {q.label}
                </span>
                <span className="mt-0.5 block text-xs text-muted">{q.hint}</span>
              </>
            );
            return q.href ? (
              <Link
                key={q.label}
                href={q.href}
                className="rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-sky-soft"
              >
                {inner}
              </Link>
            ) : (
              <div
                key={q.label}
                aria-disabled
                className="rounded-2xl border border-dashed border-line bg-surface/60 p-4"
              >
                {inner}
              </div>
            );
          })}
        </div>
      </section>

      {/* 오늘 — 2단계가 채운다 */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">오늘</h2>
        <EmptyState
          icon={<CalendarDays />}
          title={
            org.kind === 'LESSON'
              ? '오늘 레슨 · 회원 상태가 여기 보여요'
              : '투수 부하판 · 오늘 훈련 · 체크인 요약이 여기 보여요'
          }
          description={`${words.member}이 참여해 기록을 공유하면 채워져요. 먼저 초대 코드를 나눠 주세요.`}
          action={
            liveInvite ? (
              <InviteCodeCard
                code={liveInvite.code}
                expiresAt={liveInvite.expiresAt}
                compact
              />
            ) : (
              <ButtonLink href="/master/settings#invite" size="sm">
                초대 코드 만들기
              </ButtonLink>
            )
          }
        />
      </section>

      {/* 최근 들어온 구성원 */}
      {recent.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink">최근 들어온 {words.member}</h2>
            <Link href="/master/players" className="text-xs font-semibold text-sky">
              모두 보기
            </Link>
          </div>
          <Card className="divide-y divide-line p-0">
            {recent.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                  {m.nickname}
                </span>
                {m.tags.slice(0, 2).map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
                {!m.userId && <Badge className="text-warn">가입 전</Badge>}
                <span className="text-xs text-muted">{fmtDate(m.joinedAt)}</span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  mono,
}: {
  label: string;
  value: string;
  sub: string;
  mono?: boolean;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p
        className={`mt-1 text-xl font-bold text-ink ${mono ? 'font-mono tracking-wider' : ''}`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted/80">{sub}</p>
    </Card>
  );
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(d);
}
