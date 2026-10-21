import { KeyRound } from '@/components/icon';
import { SafeForm } from '@/components/safe-form';
import { Badge, Button, Card, PageHeading } from '@/components/ui';
import { ConfirmButton } from '@/components/master/confirm-button';
import { InviteCodeCard } from '@/components/master/invite-code-card';
import { JoinStaffForm } from '@/components/master/join-staff-form';
import { OrgInfoForm } from '@/components/master/org-info-form';
import { CoachProfileForm } from '@/components/master/coach-profile-form';
import { createInvite, removeMember, revokeInvite } from '@/app/actions/org';
import { requireMaster } from '@/lib/dal';
import { requireCurrentOrg } from '@/lib/org/access';
import { INVITE_DAYS, ORG_WORDS, inviteUsable, realNow } from '@/lib/org/rules';
import { prisma } from '@/lib/prisma';

const PLAN_LABEL: Record<string, string> = {
  free: '무료(체험)',
  studio: '레슨장',
  team: '팀',
};

/**
 * 설정 — 조직 정보 · 회원(선수) 초대 코드 · 코치(스태프) 초대 · 요금제(읽기). 조직 정보와 스태프 관리는 만든 마스터와 관리자만(스태프는 읽기).
 * 로그인한 마스터가 다른 조직의 코치로 들어가는 칸도 여기(스태프 코드).
 */
export default async function SettingsPage() {
  const user = await requireMaster();
  const { org } = await requireCurrentOrg(user);
  const words = ORG_WORDS[org.kind];
  const owner = user.role === 'ADMIN' || org.ownerId === user.id;

  const [invites, staff, plan, players] = await Promise.all([
    prisma.orgInvite.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
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
    prisma.org.findUnique({
      where: { id: org.id },
      select: { plan: true, seats: true, planNote: true, publicProfile: true, coachIntro: true, coachCareer: true, specialties: true, priceFrom: true, priceNote: true, lessonHours: true },
    }),
    prisma.orgMember.count({
      where: { orgId: org.id, role: 'PLAYER', status: 'ACTIVE' },
    }),
  ]);
  const now = realNow();
  const livePlayer = invites.filter((i) => i.role === 'PLAYER' && inviteUsable(i, now));
  const liveStaff = invites.filter((i) => i.role === 'STAFF' && inviteUsable(i, now));
  const dead = invites.filter((i) => !inviteUsable(i, now));
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(d);

  return (
    <div className="stack-page">
      <PageHeading title="설정 · 초대" description={org.name} />

      <Card className="space-y-4">
        <h2 className="text-sm font-bold text-ink">조직 정보</h2>
        <OrgInfoForm org={org} canEdit={owner} />
        <p className="text-xs text-muted">
          요금제{' '}
          <b className="text-ink">
            {plan?.plan ? (PLAN_LABEL[plan.plan] ?? plan.plan) : '미정'}
          </b>
          {plan?.seats != null && (
            <>
              {' '}
              · 자리{' '}
              <b className={players > plan.seats ? 'text-warn' : 'text-ink'}>
                {players}/{plan.seats}
              </b>
            </>
          )}{' '}
          — 결제는 아직 없어요. 바꾸려면 운영자에게 알려 주세요.
        </p>
      </Card>

      {org.kind === 'LESSON' && plan && (
        <Card id="coach" className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-ink">덕아웃 코치 프로필 · 레슨 예약</h2>
            <p className="mt-1 text-xs text-muted">공개하면 덕아웃 ‘레슨’에 떠서 선수가 비교하고 시간을 골라 요청해요. 요청은 <a href="/manage/bookings" className="font-semibold text-sky">레슨 요청</a>에서 확정해요.</p>
          </div>
          <CoachProfileForm
            profile={{ orgId: org.id, publicProfile: plan.publicProfile, coachIntro: plan.coachIntro, coachCareer: plan.coachCareer, specialties: plan.specialties, priceFrom: plan.priceFrom, priceNote: plan.priceNote, lessonHours: plan.lessonHours }}
            canEdit={owner}
          />
        </Card>
      )}

      <Card id="invite" className="space-y-4">
        <div>
          <h2 className="text-sm font-bold text-ink">{words.member} 초대 코드</h2>
          <p className="mt-1 text-xs text-muted">
            코드 하나를 단톡에 올리면 여럿이 같이 써요. {INVITE_DAYS}일 뒤 기한이 끝나요
            — 새로 만들면 돼요. 참여한 {words.member}은 무엇을 보여 줄지 스스로 골라요.
          </p>
        </div>
        {livePlayer.length === 0 ? (
          <p className="text-sm text-muted">지금 쓸 수 있는 코드가 없어요.</p>
        ) : (
          <div className="space-y-2">
            {livePlayer.map((i) => (
              <div
                key={i.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-2/60 p-3"
              >
                <InviteCodeCard code={i.code} expiresAt={i.expiresAt} compact />
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
          <Button type="submit" variant={livePlayer.length ? 'secondary' : 'primary'}>
            <span className="inline-flex items-center gap-1.5">
              <KeyRound className="h-4 w-4" /> 새 초대 코드 만들기
            </span>
          </Button>
        </SafeForm>
        {dead.length > 0 && (
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">끝난 코드 {dead.length}개</summary>
            <ul className="mt-2 space-y-1 font-mono">
              {dead.map((i) => (
                <li key={i.id} className="flex items-center gap-3">
                  <span className="tracking-wider">{i.code}</span>
                  <span className="font-sans">
                    {i.role === 'STAFF' ? '코치 · ' : ''}
                    {i.usedAt ? `${fmt(i.usedAt)} 씀` : `${fmt(i.expiresAt)} 끝`}
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

      <Card className="space-y-4">
        <div>
          <h2 className="text-sm font-bold text-ink">코치(스태프)</h2>
          <p className="mt-1 text-xs text-muted">
            코치는 {words.member} 관리 · 기록 · 노트 · 일정 · 공지를 다 하고, 조직 정보
            · 코치 관리만 못 해요. 코치 초대 코드는 한 번만 쓰고, 코치가 가입할
            때(레슨장 · 팀 가입의 ‘코치로 들어가요’ 칸) 또는 아래 칸에 넣어요.
          </p>
        </div>
        <ul className="divide-y divide-line">
          {staff.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <span className="text-sm font-semibold text-ink">{s.nickname}</span>
              <Badge className={s.role === 'MASTER' ? 'text-sky-strong' : undefined}>
                {s.role === 'MASTER' ? '마스터' : '코치'}
              </Badge>
              <span className="min-w-0 flex-1 truncate text-xs text-muted">
                {s.user?.email}
              </span>
              {owner && s.role === 'STAFF' && (
                <ConfirmButton
                  action={removeMember}
                  fields={{ id: s.id }}
                  message={`${s.nickname} 코치를 내보낼까요?`}
                  doneToast="내보냈어요."
                >
                  내보내기
                </ConfirmButton>
              )}
            </li>
          ))}
        </ul>
        {owner ? (
          <div className="space-y-2">
            {liveStaff.map((i) => (
              <div
                key={i.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-2/60 p-3"
              >
                <span className="font-mono text-xl font-bold tracking-[0.2em] text-ink">
                  {i.code}
                </span>
                <span className="text-xs text-muted">
                  코치용 · {fmt(i.expiresAt)}까지 · 한 번만
                </span>
                <span className="ml-auto">
                  <ConfirmButton
                    action={revokeInvite}
                    fields={{ id: i.id }}
                    message={`코드 ${i.code}를 지울까요?`}
                    doneToast="코드를 지웠어요."
                  >
                    지우기
                  </ConfirmButton>
                </span>
              </div>
            ))}
            <SafeForm action={createInvite} doneToast="코치 초대 코드를 만들었어요.">
              <input type="hidden" name="orgId" value={org.id} />
              <input type="hidden" name="role" value="STAFF" />
              <Button type="submit" variant="secondary">
                코치 초대 코드 만들기
              </Button>
            </SafeForm>
          </div>
        ) : (
          <p className="text-xs text-muted">코치 초대 코드는 마스터만 만들어요.</p>
        )}
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-ink">
            다른 레슨장 · 팀에 코치로 들어가기
          </h2>
          <p className="mt-1 text-xs text-muted">
            그 조직의 마스터가 준 코치 초대 코드를 넣으면 위 막대에서 조직을 바꿔 가며
            봐요.
          </p>
        </div>
        <JoinStaffForm />
      </Card>
    </div>
  );
}
