import { Shield } from '@/components/icon';
import { Badge, Button, Card, EmptyState, PageHeading } from '@/components/ui';
import { PlanForm } from '@/components/master/plan-form';
import { chooseOrg } from '@/app/actions/org';
import { requireAdmin } from '@/lib/dal';
import { ORG_KIND_LABEL } from '@/lib/org/rules';
import { prisma } from '@/lib/prisma';

/** 모든 레슨장 · 팀(관리자) — 하나를 골라 그 조직의 마스터 화면을 보고(쿠키, app/actions/org.ts chooseOrg), 요금제 · 자리를 손으로 적는다(6단계) */
export default async function AdminOrgsPage() {
  await requireAdmin();
  const orgs = await prisma.org.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      kind: true,
      name: true,
      region: true,
      note: true,
      plan: true,
      seats: true,
      planNote: true,
      createdAt: true,
      owner: { select: { nickname: true, email: true } },
      _count: { select: { members: { where: { status: 'ACTIVE', role: 'PLAYER' } } } },
    },
  });
  return (
    <div className="stack-page">
      <PageHeading kicker="관리자" title="모든 레슨장 · 팀" description={`${orgs.length}개 — 보기를 누르면 그 조직의 화면으로`} />
      {orgs.length === 0 ? (
        <EmptyState icon={<Shield />} title="아직 만들어진 레슨장 · 팀이 없어요" description="가입 화면에서 레슨장 · 팀으로 가입하면 여기 보여요." />
      ) : (
        <Card className="divide-y divide-line p-0">
          {orgs.map((o) => (
            <div key={o.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="text-sky-strong">{ORG_KIND_LABEL[o.kind]}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{o.name}</p>
                  <p className="truncate text-xs text-muted">
                    {[o.region, o.note].filter(Boolean).join(' · ') || '지역 · 소개 없음'} · 마스터 {o.owner.nickname} ({o.owner.email})
                  </p>
                </div>
                <span className="text-xs text-muted">선수 {o._count.members}명</span>
                <span className="text-xs text-muted">{new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(o.createdAt)}</span>
                <form action={chooseOrg}>
                  <input type="hidden" name="orgId" value={o.id} />
                  <Button type="submit" variant="secondary" size="sm">
                    보기
                  </Button>
                </form>
              </div>
              <PlanForm org={{ id: o.id, plan: o.plan, seats: o.seats, planNote: o.planNote }} />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
