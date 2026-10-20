import { Users } from '@/components/icon';
import { Badge, Button, Card, EmptyState, Input, PageHeading } from '@/components/ui';
import { AddMemberForm } from '@/components/master/add-member-form';
import { ConfirmButton } from '@/components/master/confirm-button';
import { removeMember } from '@/app/actions/org';
import { requireMaster } from '@/lib/dal';
import { requireCurrentOrg } from '@/lib/org/access';
import { CONSENT_SCOPES, ORG_WORDS } from '@/lib/org/rules';
import { prisma } from '@/lib/prisma';

type SP = { [key: string]: string | string[] | undefined };

/**
 * 회원(선수) 목록 — 이름 · 태그 · 가입 여부 · 공유 범위. ?q= 로 이름 · 태그를 거른다. 1단계는 목록과 자리 만들기 · 내보내기까지 —
 * 선수 카드(기록 · 성장 그래프)는 2단계(/master/players/[memberId]).
 */
export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const user = await requireMaster();
  const { org } = await requireCurrentOrg(user);
  const words = ORG_WORDS[org.kind];
  const raw = (await searchParams).q;
  const q = ((Array.isArray(raw) ? raw[0] : raw) ?? '').trim().slice(0, 40);

  const members = await prisma.orgMember.findMany({
    where: {
      orgId: org.id,
      role: 'PLAYER',
      status: 'ACTIVE',
      ...(q
        ? {
            OR: [
              { nickname: { contains: q, mode: 'insensitive' } },
              { tags: { has: q } },
            ],
          }
        : {}),
    },
    orderBy: [{ nickname: 'asc' }],
    select: {
      id: true,
      nickname: true,
      tags: true,
      userId: true,
      joinedAt: true,
      consent: {
        select: {
          pitch: true,
          training: true,
          checkin: true,
          video: true,
          nutrition: true,
          weight: true,
        },
      },
    },
  });
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });

  return (
    <div className="stack-page">
      <PageHeading
        title={`${words.members} 관리`}
        description={`${members.length}명${q ? ` · '${q}' 거름` : ''}`}
      />

      {/* 거르기 — 주소로(새로 고쳐도 같은 목록) */}
      <form method="get" action="/master/players" className="flex gap-2">
        <Input
          name="q"
          type="search"
          defaultValue={q}
          placeholder={`${words.member} 이름 · 태그`}
          aria-label="거르기"
        />
        <Button type="submit" variant="secondary">
          찾기
        </Button>
      </form>

      {members.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={q ? '맞는 사람이 없어요' : `아직 ${words.member}이 없어요`}
          description={
            q
              ? '다른 이름이나 태그로 찾아 보세요.'
              : '초대 코드를 나눠 주거나, 아래에서 자리를 먼저 만들어 두세요.'
          }
        />
      ) : (
        <Card className="divide-y divide-line p-0">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <span className="truncate">{m.nickname}</span>
                  {!m.userId && (
                    <Badge className="text-warn">가입 전 · 코치가 만든 자리</Badge>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {m.userId
                    ? consentText(m.consent)
                    : '가입하면 공유 범위를 스스로 정해요'}{' '}
                  · {fmt.format(m.joinedAt)}
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
          ))}
        </Card>
      )}

      {/* 자리 먼저 만들기 */}
      <Card className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-ink">
            아직 가입 안 한 {words.member} 자리 만들기
          </h2>
          <p className="mt-1 text-xs text-muted">
            코치가 먼저 기록을 적어 둘 수 있어요. 그 사람이 초대 코드로 가입하면 이
            자리를 이어받아요.
          </p>
        </div>
        <AddMemberForm orgId={org.id} memberWord={words.member} />
      </Card>
    </div>
  );
}

function consentText(
  c: Record<(typeof CONSENT_SCOPES)[number]['key'], boolean> | null
): string {
  if (!c) return '공유 범위 미정';
  const on = CONSENT_SCOPES.filter((s) => c[s.key]).map((s) => s.label.split(' · ')[0]);
  return on.length ? `공유 ${on.join(' · ')}` : '공유하는 기록 없음';
}
