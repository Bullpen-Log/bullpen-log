import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarDays, ClipboardList, KeyRound, Megaphone, Plus, Users } from '@/components/icon';
import { RoundPeople } from '@/components/round-icon';
import { Badge, ButtonLink, Card, EmptyState, PageHeading } from '@/components/ui';
import { InviteCodeCard } from '@/components/master/invite-code-card';
import { PitcherBoard } from '@/components/master/pitcher-board';
import { requireMaster } from '@/lib/dal';
import { currentOrg, memberScope, type OrgRow } from '@/lib/org/access';
import { checkinSummaryOf, loadPlayers, pitcherBoardOf } from '@/lib/org/player-data';
import { countOrgRequests } from '@/lib/market/lesson-load';
import { countVenueRequests } from '@/lib/market/venue-load';
import {
  EVENT_KIND_LABEL,
  ORG_KIND_LABEL,
  ORG_WORDS,
  PASS_ALERT_LEFT,
  inviteUsable,
  isEventKind,
  passLeft,
  passUsable,
  realNow,
} from '@/lib/org/rules';
import { appNow } from '@/lib/clock';
import { dbDate } from '@/lib/nutrition/days';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { prisma } from '@/lib/prisma';

/**
 * 마스터 홈 — 조직 종류에 따라 다르다(2단계부터 실제 자료).
 *   레슨장: 오늘 레슨(시간표) · 알림(수강권 3회 이하 · 2주 넘게 노트 없음) · 최근 레슨 노트 · 빠른 일
 *   팀:     투수 부하판(팔 상태, 위험부터) · 오늘 일정 · 아침 체크인 요약 · 공지 · 빠른 일
 * 날짜는 앱 시계(appNow) — 시험 계정의 날짜와 같은 눈금.
 */
export default async function MasterHome() {
  const user = await requireMaster();
  const { org } = await currentOrg(user);
  if (!org) {
    if (user.role === 'ADMIN') redirect('/manage/orgs');
    return (
      <EmptyState
        icon={<RoundPeople />}
        title="아직 조직이 없어요"
        description="가입할 때 만든 레슨장 · 팀이 보이지 않아요. 관리자에게 알려 주세요."
      />
    );
  }
  const now = appNow();
  const todayKey = toDateKey(now);
  const words = ORG_WORDS[org.kind];

  const [players, invite] = await Promise.all([
    loadPlayers(org.id),
    prisma.orgInvite.findFirst({
      where: { orgId: org.id, role: 'PLAYER' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, code: true, role: true, expiresAt: true, usedAt: true },
    }),
  ]);
  const liveInvite = invite && inviteUsable(invite, realNow()) ? invite : null;
  const joined = players.filter((p) => p.user).length;

  return (
    <div className="stack-page">
      <PageHeading
        kicker={`${ORG_KIND_LABEL[org.kind]} 홈 · ${fmtLong(todayKey)}`}
        title={org.name}
        description={[org.region, org.note].filter(Boolean).join(' · ') || undefined}
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label={words.members}
          value={`${players.length}명`}
          sub={`가입 ${joined} · 자리 ${players.length - joined}`}
        />
        {org.kind === 'TEAM' ? (
          <Stat label="오늘 체크인" value="아래" sub="아침 체크인 요약" />
        ) : (
          <Stat label="오늘 레슨" value="아래" sub="시간표에서" />
        )}
        <Stat
          label="초대 코드"
          value={liveInvite ? liveInvite.code : '없음'}
          sub={
            liveInvite
              ? `${fmtShort(liveInvite.expiresAt.toISOString().slice(0, 10))}까지`
              : '설정에서 만들어요'
          }
          mono
        />
      </section>

      <QuickActions kind={org.kind} players={players.length} />

      {org.kind === 'TEAM' ? (
        <TeamHome org={org} now={now} todayKey={todayKey} players={players} />
      ) : (
        <StudioHome org={org} todayKey={todayKey} players={players} />
      )}

      {players.length === 0 && (
        <EmptyState
          icon={<CalendarDays />}
          title={`${words.member}이 들어오면 여기가 채워져요`}
          description="초대 코드를 나눠 주세요. 코치가 먼저 자리를 만들어 둘 수도 있어요."
          action={
            liveInvite ? (
              <InviteCodeCard
                code={liveInvite.code}
                expiresAt={liveInvite.expiresAt}
                compact
              />
            ) : (
              <ButtonLink href="/manage/settings#invite" size="sm">
                초대 코드 만들기
              </ButtonLink>
            )
          }
        />
      )}
    </div>
  );
}

/* ─────────────────────────── 팀 홈 ─────────────────────────── */

async function TeamHome({
  org,
  now,
  todayKey,
  players,
}: {
  org: OrgRow;
  now: Date;
  todayKey: string;
  players: Awaited<ReturnType<typeof loadPlayers>>;
}) {
  const checkinIds = players
    .filter((p) => p.user && memberScope(p.consent, true).checkin)
    .map((p) => p.user!.id);
  const nameOfUser = new Map(
    players.filter((p) => p.user).map((p) => [p.user!.id, p.nickname])
  );
  const [board, events, checkin, notices] = await Promise.all([
    pitcherBoardOf(org.id, now),
    prisma.orgEvent.findMany({
      where: {
        orgId: org.id,
        date: { gte: dbDate(todayKey), lte: dbDate(shiftDateKey(todayKey, 6)) },
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
      select: { id: true, date: true, time: true, kind: true, title: true },
    }),
    checkinSummaryOf(checkinIds, todayKey),
    prisma.orgNotice.findMany({
      where: { orgId: org.id },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 3,
      select: { id: true, title: true, pinned: true, createdAt: true },
    }),
  ]);
  const names = (ids: string[]) =>
    ids.map((id) => nameOfUser.get(id) ?? '?').join(' · ');

  return (
    <>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">투수 부하판</h2>
          <Link href="/manage/record" className="text-xs font-semibold text-sky">
            투구수 적기
          </Link>
        </div>
        <PitcherBoard rows={board.rows} hidden={board.hidden} memberWord="선수" />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink">아침 체크인</h2>
            <span className="text-xs text-muted">
              {checkin.answered}/{checkin.asked}명 답함
            </span>
          </div>
          <Card className="space-y-2 text-sm">
            {checkin.asked === 0 ? (
              <p className="text-xs text-muted">체크인을 공유한 선수가 아직 없어요.</p>
            ) : (
              <>
                <p
                  className={
                    checkin.pain.length ? 'font-semibold text-danger' : 'text-muted'
                  }
                >
                  통증 {checkin.pain.length}명
                  {checkin.pain.length > 0 && (
                    <span className="font-normal">
                      {' '}
                      —{' '}
                      {checkin.pain
                        .map(
                          (p) =>
                            `${nameOfUser.get(p.userId) ?? '?'}(${p.parts.join('·')})`
                        )
                        .join(', ')}
                    </span>
                  )}
                </p>
                <p className={checkin.shortSleep.length ? 'text-warn' : 'text-muted'}>
                  잠 부족 {checkin.shortSleep.length}명
                  {checkin.shortSleep.length > 0 && ` — ${names(checkin.shortSleep)}`}
                </p>
                <p className={checkin.lowCondition.length ? 'text-warn' : 'text-muted'}>
                  컨디션 4 이하 {checkin.lowCondition.length}명
                  {checkin.lowCondition.length > 0 &&
                    ` — ${names(checkin.lowCondition)}`}
                </p>
              </>
            )}
          </Card>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink">이번 주 일정</h2>
            <Link href="/manage/calendar" className="text-xs font-semibold text-sky">
              달력
            </Link>
          </div>
          <Card className="divide-y divide-line p-0">
            {events.length === 0 && (
              <p className="px-4 py-4 text-xs text-muted">
                앞으로 7일 안 일정이 없어요.
              </p>
            )}
            {events.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-12 shrink-0 text-xs text-muted">
                  {fmtShort(e.date.toISOString().slice(0, 10))}
                </span>
                <span className="w-12 shrink-0 text-xs text-muted">
                  {e.time ?? '종일'}
                </span>
                <Badge>{isEventKind(e.kind) ? EVENT_KIND_LABEL[e.kind] : e.kind}</Badge>
                <span className="min-w-0 flex-1 truncate text-ink">{e.title}</span>
              </div>
            ))}
          </Card>
        </section>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">공지</h2>
          <Link href="/manage/notices" className="text-xs font-semibold text-sky">
            공지 쓰기
          </Link>
        </div>
        <Card className="divide-y divide-line p-0">
          {notices.length === 0 && (
            <p className="px-4 py-4 text-xs text-muted">아직 공지가 없어요.</p>
          )}
          {notices.map((n) => (
            <Link
              key={n.id}
              href={`/manage/notices#${n.id}`}
              className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-ink/4"
            >
              {n.pinned && <Badge className="text-sky-strong">고정</Badge>}
              <span className="min-w-0 flex-1 truncate text-ink">{n.title}</span>
              <span className="text-xs text-muted">
                {fmtShort(n.createdAt.toISOString().slice(0, 10))}
              </span>
            </Link>
          ))}
        </Card>
      </section>
    </>
  );
}

/* ─────────────────────────── 레슨장 홈 ─────────────────────────── */

async function StudioHome({
  org,
  todayKey,
  players,
}: {
  org: OrgRow;
  todayKey: string;
  players: Awaited<ReturnType<typeof loadPlayers>>;
}) {
  const nameOf = new Map(players.map((p) => [p.id, p.nickname]));
  const [lessons, passes, lastNotes, recentNotes, requests, venueRequests] = await Promise.all([
    prisma.orgEvent.findMany({
      where: { orgId: org.id, date: dbDate(todayKey) },
      orderBy: [{ time: 'asc' }],
      select: { id: true, time: true, kind: true, title: true, memberId: true },
    }),
    prisma.lessonPass.findMany({
      where: { member: { orgId: org.id, status: 'ACTIVE' } },
      select: { id: true, memberId: true, total: true, used: true, expiresAt: true },
    }),
    prisma.lessonNote.groupBy({
      by: ['memberId'],
      where: { member: { orgId: org.id, status: 'ACTIVE' } },
      _max: { date: true },
    }),
    prisma.lessonNote.findMany({
      where: { member: { orgId: org.id } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 5,
      select: { id: true, date: true, body: true, homework: true, memberId: true },
    }),
    countOrgRequests(org.id),
    countVenueRequests(org.ownerId),
  ]);
  /* 수강권 — 회원마다 쓸 수 있는 것의 남은 회를 더해 3회 이하면 알림 */
  const leftByMember = new Map<string, number>();
  for (const p of passes) {
    if (!passUsable(p, todayKey)) continue;
    leftByMember.set(p.memberId, (leftByMember.get(p.memberId) ?? 0) + passLeft(p));
  }
  const lowPass = players.filter(
    (p) => leftByMember.has(p.id) && leftByMember.get(p.id)! <= PASS_ALERT_LEFT
  );
  const lastNoteOf = new Map(
    lastNotes.map((n) => [n.memberId, n._max.date?.toISOString().slice(0, 10) ?? null])
  );
  const staleCut = shiftDateKey(todayKey, -14);
  const stale = players.filter((p) => {
    const last = lastNoteOf.get(p.id);
    return !last || last < staleCut;
  });

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink">오늘 레슨</h2>
            <Link href="/manage/calendar" className="text-xs font-semibold text-sky">
              시간표
            </Link>
          </div>
          <Card className="divide-y divide-line p-0">
            {lessons.length === 0 && (
              <p className="px-4 py-4 text-xs text-muted">
                오늘 시간표에 레슨이 없어요. 달력에서 더해요.
              </p>
            )}
            {lessons.map((e) => (
              <Link
                key={e.id}
                href={e.memberId ? `/manage/players/${e.memberId}` : '/manage/calendar'}
                className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-ink/4"
              >
                <span className="w-12 shrink-0 text-xs text-muted">
                  {e.time ?? '종일'}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                  {e.memberId ? (nameOf.get(e.memberId) ?? e.title) : e.title}
                </span>
                {e.memberId && leftByMember.has(e.memberId) && (
                  <span className="text-xs text-muted">
                    수강권 {leftByMember.get(e.memberId)}회
                  </span>
                )}
              </Link>
            ))}
          </Card>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-ink">알림</h2>
          <Card className="space-y-2 text-sm">
            {requests > 0 && (
              <p className="text-warn">
                <Link href="/manage/bookings" className="font-bold underline-offset-2 hover:underline">
                  덕아웃 레슨 요청 {requests}건
                </Link>{' '}
                — 시간을 골라 확정해 주세요
              </p>
            )}
            {venueRequests > 0 && (
              <p className="text-warn">
                <Link href="/manage/venues" className="font-bold underline-offset-2 hover:underline">
                  장소 예약 요청 {venueRequests}건
                </Link>
              </p>
            )}
            {lowPass.length === 0 && stale.length === 0 && requests === 0 && venueRequests === 0 && (
              <p className="text-xs text-muted">챙길 것이 없어요.</p>
            )}
            {lowPass.length > 0 && (
              <p className="text-warn">
                <b>수강권 {PASS_ALERT_LEFT}회 이하</b> —{' '}
                {lowPass
                  .map((p) => (
                    <Link
                      key={p.id}
                      href={`/manage/players/${p.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {p.nickname}({leftByMember.get(p.id)}회)
                    </Link>
                  ))
                  .reduce<React.ReactNode[]>(
                    (acc, el, i) => (i ? [...acc, ', ', el] : [el]),
                    []
                  )}
              </p>
            )}
            {stale.length > 0 && (
              <p className="text-muted">
                <b className="text-ink">2주 넘게 노트 없음</b> {stale.length}명 —{' '}
                {stale
                  .slice(0, 6)
                  .map((p) => p.nickname)
                  .join(' · ')}
                {stale.length > 6 && ' …'}
              </p>
            )}
          </Card>
        </section>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">최근 레슨 노트</h2>
          <Link href="/manage/players" className="text-xs font-semibold text-sky">
            회원 목록
          </Link>
        </div>
        <Card className="divide-y divide-line p-0">
          {recentNotes.length === 0 && (
            <p className="px-4 py-4 text-xs text-muted">
              회원 카드에서 레슨 노트를 쓰면 여기 모여요.
            </p>
          )}
          {recentNotes.map((n) => (
            <Link
              key={n.id}
              href={`/manage/players/${n.memberId}`}
              className="block px-4 py-2.5 text-sm hover:bg-ink/4"
            >
              <p className="flex items-center gap-2">
                <span className="text-xs text-muted">
                  {fmtShort(n.date.toISOString().slice(0, 10))}
                </span>
                <span className="font-semibold text-ink">
                  {nameOf.get(n.memberId) ?? '?'}
                </span>
                {n.homework && <Badge>숙제</Badge>}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted">{n.body}</p>
            </Link>
          ))}
        </Card>
      </section>
    </>
  );
}

/* ─────────────────────────── 공통 조각 ─────────────────────────── */

function QuickActions({ kind, players }: { kind: 'LESSON' | 'TEAM'; players: number }) {
  const quick =
    kind === 'LESSON'
      ? [
          {
            href: '/manage/settings#invite',
            label: '회원 초대',
            hint: '초대 코드 · 참여 링크',
            icon: KeyRound,
          },
          {
            href: '/manage/players',
            label: '회원 목록',
            hint: `${players}명`,
            icon: Users,
          },
          {
            href: '/manage/record',
            label: '대신 기록',
            hint: '투구수 적기',
            icon: Plus,
          },
          {
            href: '/manage/calendar',
            label: '레슨 시간표',
            hint: '오늘 · 이번 주',
            icon: CalendarDays,
          },
        ]
      : [
          {
            href: '/manage/settings#invite',
            label: '선수 초대',
            hint: '초대 코드 · 참여 링크',
            icon: KeyRound,
          },
          {
            href: '/manage/players',
            label: '선수단',
            hint: `${players}명`,
            icon: Users,
          },
          {
            href: '/manage/record',
            label: '경기 투구수',
            hint: '한 번에 여럿',
            icon: ClipboardList,
          },
          {
            href: '/manage/notices',
            label: '공지',
            hint: '선수단에 알리기',
            icon: Megaphone,
          },
        ];
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {quick.map((q) => {
        const Icon = q.icon;
        return (
          <Link
            key={q.label}
            href={q.href}
            className="rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-sky-soft"
          >
            <Icon className="h-5 w-5 text-sky" />
            <span className="mt-3 block text-sm font-semibold text-ink">{q.label}</span>
            <span className="mt-0.5 block text-xs text-muted">{q.hint}</span>
          </Link>
        );
      })}
    </section>
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

function fmtShort(key: string): string {
  const [, m, d] = key.split('-');
  return `${Number(m)}/${Number(d)}`;
}
function fmtLong(key: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${key}T00:00:00Z`));
}
