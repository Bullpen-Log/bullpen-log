import { KeyRound } from '@/components/icon';
import { SafeForm } from '@/components/safe-form';
import { Badge, Button, Card, PageHeading } from '@/components/ui';
import { ConfirmButton } from '@/components/master/confirm-button';
import { InviteCodeCard } from '@/components/master/invite-code-card';
import { OrgInfoForm } from '@/components/master/org-info-form';
import { createInvite, revokeInvite } from '@/app/actions/org';
import { requireMaster } from '@/lib/dal';
import { requireCurrentOrg } from '@/lib/org/access';
import { INVITE_DAYS, ORG_WORDS, inviteUsable } from '@/lib/org/rules';
import { prisma } from '@/lib/prisma';

/**
 * 설정 — 조직 정보 · 초대 코드 · 스태프. 1단계는 회원(선수) 초대 코드만 만든다 — 스태프 초대(마스터 계정이 코드로 합류)는 5단계.
 */
export default async function SettingsPage() {
  const user = await requireMaster();
  const { org } = await requireCurrentOrg(user);
  const words = ORG_WORDS[org.kind];
  const canEdit = user.role === 'ADMIN' || org.ownerId === user.id;

  const [invites, staff] = await Promise.all([
    prisma.orgInvite.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        code: true,
        role: true,
        expiresAt: true,
        usedAt: true,
        createdAt: true,
      },
    }),
    prisma.orgMember.findMany({
      where: { orgId: org.id, role: { in: ['MASTER', 'STAFF'] }, status: 'ACTIVE' },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      select: {
        id: true,
        nickname: true,
        role: true,
        user: { select: { email: true } },
      },
    }),
  ]);
  const now = new Date();
  const live = invites.filter((i) => inviteUsable(i, now));
  const dead = invites.filter((i) => !inviteUsable(i, now));

  return (
    <div className="stack-page">
      <PageHeading title="설정 · 초대" description={org.name} />

      <Card className="space-y-4">
        <h2 className="text-sm font-bold text-ink">조직 정보</h2>
        <OrgInfoForm org={org} canEdit={canEdit} />
      </Card>

      <Card id="invite" className="space-y-4">
        <div>
          <h2 className="text-sm font-bold text-ink">{words.member} 초대 코드</h2>
          <p className="mt-1 text-xs text-muted">
            코드 하나를 단톡에 올리면 여럿이 같이 써요. {INVITE_DAYS}일 뒤 기한이 끝나요
            — 새로 만들면 돼요. 참여한 {words.member}은 무엇을 보여 줄지 스스로 골라요.
          </p>
        </div>
        {live.length === 0 ? (
          <p className="text-sm text-muted">지금 쓸 수 있는 코드가 없어요.</p>
        ) : (
          <div className="space-y-2">
            {live.map((i) => (
              <div
                key={i.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-2/60 p-3"
              >
                <InviteCodeCard code={i.code} expiresAt={i.expiresAt} compact />
                {i.role === 'STAFF' && <Badge>스태프</Badge>}
                <span className="ml-auto">
                  <ConfirmButton
                    action={revokeInvite}
                    fields={{ id: i.id }}
                    message={`코드 ${i.code}를 지울까요? 이 코드로는 더 참여할 수 없어요.`}
                    doneToast="코드를 지웠어요."
                  >
                    지우기
                  </ConfirmButton>
                </span>
              </div>
            ))}
          </div>
        )}
        <SafeForm action={createInvite} doneToast="새 초대 코드를 만들었어요.">
          <input type="hidden" name="orgId" value={org.id} />
          <input type="hidden" name="role" value="PLAYER" />
          <Button type="submit" variant={live.length ? 'secondary' : 'primary'}>
            <span className="inline-flex items-center gap-1.5">
              <KeyRound className="h-4 w-4" /> 새 초대 코드 만들기
            </span>
          </Button>
        </SafeForm>
        {dead.length > 0 && (
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">
              기한이 지난 코드 {dead.length}개
            </summary>
            <ul className="mt-2 space-y-1 font-mono">
              {dead.map((i) => (
                <li key={i.id} className="flex items-center gap-3">
                  <span className="tracking-wider">{i.code}</span>
                  <span className="font-sans">
                    {new Intl.DateTimeFormat('ko-KR', {
                      month: 'numeric',
                      day: 'numeric',
                    }).format(i.expiresAt)}{' '}
                    끝
                  </span>
                  <ConfirmButton
                    action={revokeInvite}
                    fields={{ id: i.id }}
                    message="이 코드를 목록에서 지울까요?"
                  >
                    지우기
                  </ConfirmButton>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-ink">스태프</h2>
          <p className="mt-1 text-xs text-muted">
            코치를 더 두는 것(스태프 초대)은 다음 판에서 열려요.
          </p>
        </div>
        <ul className="divide-y divide-line">
          {staff.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <span className="text-sm font-semibold text-ink">{s.nickname}</span>
              <Badge className={s.role === 'MASTER' ? 'text-sky-strong' : undefined}>
                {s.role === 'MASTER' ? '마스터' : '코치'}
              </Badge>
              <span className="ml-auto truncate text-xs text-muted">
                {s.user?.email}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
