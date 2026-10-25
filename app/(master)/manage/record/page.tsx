import Link from 'next/link';
import { Badge, Card, PageHeading } from '@/components/ui';
import { ConfirmButton } from '@/components/master/confirm-button';
import { RecordForm, type RecordRow } from '@/components/master/record-form';
import { deleteProxyPitchLog } from '@/app/actions/org-record';
import { requireMaster } from '@/lib/dal';
import { memberScope, requireCurrentOrg } from '@/lib/org/access';
import { loadPlayers } from '@/lib/org/player-data';
import { ORG_WORDS } from '@/lib/org/rules';
import { appNow } from '@/lib/clock';
import { toDateKey } from '@/lib/pitch-stats';
import { prisma } from '@/lib/prisma';

/**
 * 대신 기록(3단계) — 코치가 선수들의 투구수를 한 번에 적는다(팀: 경기 투구수표). 구속 측정을 대신 재는 것은 구속 엔진 담당과 맞춘 뒤(HANDOFF).
 * 아래는 이 조직에서 코치가 적은 최근 기록 — 잘못 적은 것은 여기서 되돌린다.
 */
export default async function RecordPage() {
  const user = await requireMaster();
  const { org } = await requireCurrentOrg(user);
  const words = ORG_WORDS[org.kind];
  const todayKey = toDateKey(appNow());
  const [players, recent] = await Promise.all([
    loadPlayers(org.id),
    prisma.pitchLog.findMany({
      where: { orgId: org.id, enteredById: { not: null } },
      orderBy: [{ createdAt: 'desc' }],
      take: 20,
      select: { id: true, userId: true, date: true, sessionType: true, pitchCount: true, effortPct: true, intensity: true, maxVelocity: true },
    }),
  ]);
  const rows: RecordRow[] = players.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    tags: p.tags,
    can: !p.user ? 'no-user' : memberScope(p.consent, true).pitch ? 'ok' : 'no-consent',
  }));
  const nameOfUser = new Map(players.filter((p) => p.user).map((p) => [p.user!.id, p.nickname]));
  const fmt = (d: Date) => new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(d);

  return (
    <div className="stack-page">
      <PageHeading
        title={org.kind === 'TEAM' ? '경기 · 훈련 투구수' : '대신 기록'}
        description={`${words.member}의 투구 기록에 '코치가 기록함'으로 남아요. ${words.member}은 제 화면에서 고칠 수 있어요.`}
      />
      <RecordForm orgId={org.id} rows={rows} todayKey={todayKey} memberWord={words.member} />

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">코치가 적은 최근 기록</h2>
        <Card className="divide-y divide-line p-0">
          {recent.length === 0 && <p className="px-4 py-4 text-xs text-muted">아직 없어요.</p>}
          {recent.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
              <span className="w-12 shrink-0 text-xs text-muted">{fmt(l.date)}</span>
              <Link href={`/manage/players`} className="w-24 shrink-0 truncate font-semibold text-ink">
                {nameOfUser.get(l.userId) ?? '(나간 선수)'}
              </Link>
              <Badge>{l.sessionType}</Badge>
              <span className="text-ink">{l.pitchCount}구</span>
              <span className="text-xs text-muted">{l.effortPct != null ? `${l.effortPct}%` : `강도 ${l.intensity}`}</span>
              {l.maxVelocity != null && <span className="text-xs text-muted">{l.maxVelocity}km/h</span>}
              <span className="ml-auto">
                <ConfirmButton action={deleteProxyPitchLog} fields={{ id: l.id }} message="이 기록을 지울까요? 선수의 투구 기록에서도 사라져요." doneToast="지웠어요.">
                  되돌리기
                </ConfirmButton>
              </span>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
