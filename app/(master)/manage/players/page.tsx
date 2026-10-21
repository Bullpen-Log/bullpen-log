import Link from 'next/link';
import { Users } from '@/components/icon';
import { Badge, Button, Card, EmptyState, Input, PageHeading } from '@/components/ui';
import { AddMemberForm } from '@/components/master/add-member-form';
import { ConfirmButton } from '@/components/master/confirm-button';
import { removeMember } from '@/app/actions/org';
import { requireMaster } from '@/lib/dal';
import { requireCurrentOrg } from '@/lib/org/access';
import { CONSENT_SCOPES, ORG_WORDS, passLeft, passUsable } from '@/lib/org/rules';
import { appNow } from '@/lib/clock';
import { dbDate } from '@/lib/nutrition/days';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { prisma } from '@/lib/prisma';

type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? '').trim().slice(0, 40);

/**
 * 회원(선수) 목록 — 이름 · 태그(묶음) · 가입 여부 · 공유 범위 · 최근 30일 레슨(노트 수) · 수강권(레슨장). ?q= 이름 거르기, ?tag= 묶음 거르기.
 * 카드(기록 · 성장 그래프 · 노트)는 /manage/players/[memberId].
 */
export default async function PlayersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireMaster();
  const { org } = await requireCurrentOrg(user);
  const words = ORG_WORDS[org.kind];
  const sp = await searchParams;
  const q = one(sp.q);
  const tag = one(sp.tag);
  const todayKey = toDateKey(appNow());

  const [members, noteCounts, passes] = await Promise.all([
    prisma.orgMember.findMany({
      where: {
        orgId: org.id,
        role: 'PLAYER',
        status: 'ACTIVE',
        ...(q ? { nickname: { contains: q, mode: 'insensitive' } } : {}),
        ...(tag ? { tags: { has: tag } } : {}),
      },
      orderBy: [{ nickname: 'asc' }],
      select: {
        id: true,
        nickname: true,
        tags: true,
        userId: true,
        joinedAt: true,
        consent: { select: { pitch: true, training: true, checkin: true, video: true, nutrition: true, weight: true } },
      },
    }),
    prisma.lessonNote.groupBy({
      by: ['memberId'],
      where: { member: { orgId: org.id, status: 'ACTIVE' }, date: { gte: dbDate(shiftDateKey(todayKey, -29)) } },
      _count: { _all: true },
      _max: { date: true },
    }),
    org.kind === 'LESSON'
      ? prisma.lessonPass.findMany({
          where: { member: { orgId: org.id, status: 'ACTIVE' } },
          select: { memberId: true, total: true, used: true, expiresAt: true },
        })
      : Promise.resolve([]),
  ]);
  const notesOf = new Map(noteCounts.map((n) => [n.memberId, { n: n._count._all, last: n._max.date?.toISOString().slice(0, 10) ?? null }]));
  const leftOf = new Map<string, number>();
  for (const p of passes) if (passUsable(p, todayKey)) leftOf.set(p.memberId, (leftOf.get(p.memberId) ?? 0) + passLeft(p));
  const allTags = [...new Set(members.flatMap((m) => m.tags))].sort((a, b) => a.localeCompare(b, 'ko'));
  const fmt = (key: string) => `${Number(key.slice(5, 7))}/${Number(key.slice(8))}`;
  const href = (params: Record<string, string>) => {
    const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    return `/manage/players${s.size ? `?${s}` : ''}`;
  };

  return (
    <div className="stack-page">
      <PageHeading title={`${words.members} 관리`} description={`${members.length}명${q ? ` · '${q}'` : ''}${tag ? ` · #${tag}` : ''}`} />

      <form method="get" action="/manage/players" className="flex gap-2">
        {tag && <input type="hidden" name="tag" value={tag} />}
        <Input name="q" type="search" defaultValue={q} placeholder={`${words.member} 이름`} aria-label="이름으로 거르기" />
        <Button type="submit" variant="secondary">
          찾기
        </Button>
      </form>

      {allTags.length > 0 && (
        <nav aria-label="묶음" className="flex flex-wrap gap-2">
          <Link
            href={href({ q })}
            aria-current={!tag ? 'page' : undefined}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${!tag ? 'border-sky bg-sky/10 text-sky-strong' : 'border-line text-muted hover:border-sky-soft'}`}
          >
            전체
          </Link>
          {allTags.map((t) => (
            <Link
              key={t}
              href={href({ q, tag: t })}
              aria-current={tag === t ? 'page' : undefined}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${tag === t ? 'border-sky bg-sky/10 text-sky-strong' : 'border-line text-muted hover:border-sky-soft'}`}
            >
              {t}
            </Link>
          ))}
        </nav>
      )}

      {members.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={q || tag ? '맞는 사람이 없어요' : `아직 ${words.member}이 없어요`}
          description={q || tag ? '다른 이름이나 묶음으로 찾아 보세요.' : '초대 코드를 나눠 주거나, 아래에서 자리를 먼저 만들어 두세요.'}
        />
      ) : (
        <Card className="divide-y divide-line p-0">
          {members.map((m) => {
            const notes = notesOf.get(m.id);
            const left = leftOf.get(m.id);
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/manage/players/${m.id}`} className="flex items-center gap-2 text-sm font-semibold text-ink hover:text-sky">
                    <span className="truncate">{m.nickname}</span>
                    {!m.userId && <Badge className="text-warn">가입 전</Badge>}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">
                    {m.userId ? consentText(m.consent) : '가입하면 공유 범위를 스스로 정해요'}
                    {' · '}
                    {notes ? `30일 ${words.session} ${notes.n}회(마지막 ${fmt(notes.last!)})` : `30일 ${words.session} 0회`}
                    {org.kind === 'LESSON' && left != null && (
                      <>
                        {' · '}
                        <span className={left <= 3 ? 'font-semibold text-warn' : ''}>수강권 {left}회</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {m.tags.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
                <ConfirmButton
                  action={removeMember}
                  fields={{ id: m.id }}
                  message={`${m.nickname}을(를) ${org.name}에서 내보낼까요? 선수의 기록은 그대로 남고, 이 화면에서만 사라져요.`}
                  doneToast="내보냈어요."
                >
                  내보내기
                </ConfirmButton>
              </div>
            );
          })}
        </Card>
      )}

      <Card className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-ink">아직 가입 안 한 {words.member} 자리 만들기</h2>
          <p className="mt-1 text-xs text-muted">코치가 먼저 노트 · 숙제 · 일정을 적어 둘 수 있어요. 그 사람이 초대 코드로 가입하면 이 자리를 이어받아요.</p>
        </div>
        <AddMemberForm orgId={org.id} memberWord={words.member} />
      </Card>
    </div>
  );
}

function consentText(c: Record<(typeof CONSENT_SCOPES)[number]['key'], boolean> | null): string {
  if (!c) return '공유 범위 미정';
  const on = CONSENT_SCOPES.filter((s) => c[s.key]).map((s) => s.label.split(' · ')[0]);
  return on.length ? `공유 ${on.join(' · ')}` : '공유하는 기록 없음';
}
