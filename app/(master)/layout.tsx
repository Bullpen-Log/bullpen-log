import { currentOrg, requireOperator } from '@/lib/org/access';
import { headers } from 'next/headers';
import { surfaceOf } from '@/lib/app-env';
import { MasterShell } from '@/components/master/master-shell';
import { DugoutTopBar } from '@/components/dugout/dugout-topbar';
import { countUnread } from '@/lib/market/load';
import { countUnreadNotifications } from '@/lib/notify';

/**
 * 팀 · 레슨장 마스터 화면의 틀(2026-10-20, docs/designs/team-lesson-build-prompt.md) — 선수 화면((app))과 아예 별개.
 *
 * 이 앱에는 미들웨어가 없어 방어선은 requireOperator 하나다(lib/org/access.ts, 2026-11-01 교정 F03) — 관리자 · 마스터 계정 · 어느 조직의 소유자/스태프 회원만 지나고,
 * 조직 관계가 없는 선수 · 학부모 계정은 /today 로 돌아간다. 어느 조직을 다루나는 requireOrg · requireOrgCan 이 다시 본다. 관리자는 선수 화면의 '관리' 메뉴에서 넘어오고 위 막대의 '선수 화면으로'로 돌아간다.
 *
 * 지금 보는 조직은 쿠키(bp-org)로 — 마스터는 보통 하나, 관리자는 모든 조직을 고를 수 있다(lib/org/access.ts currentOrg).
 */
export default async function MasterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireOperator();
  /* 덕아웃 앱 안에서는 싱커 화면(/today)이 막혀 있다(proxy.ts) — '선수 화면으로'를 안 보인다 */
  const dugoutApp = surfaceOf((await headers()).get('user-agent')) === 'dugout-app';
  const { org, orgs } = await currentOrg(user);
  const pick = (o: (typeof orgs)[number]) => ({ id: o.id, kind: o.kind, name: o.name });
  const [unread, alerts] = await Promise.all([
    countUnread(user.id),
    countUnreadNotifications(user.id),
  ]);
  return (
    <div className="flex min-h-dvh flex-col">
      {/* 사이트 공용 위 막대(2026-10-21 2단계) — 관리는 덕아웃 웹의 한 부분 */}
      <DugoutTopBar
        user={{ nickname: user.nickname }}
        unread={unread}
        alerts={alerts}
        sinker={user.role === 'ADMIN'}
        manage
        current="manage"
        sticky={false}
        className="hidden md:block"
      />
      <MasterShell
        user={{ nickname: user.nickname, isAdmin: user.role === 'ADMIN' }}
        toSinker={user.role === 'ADMIN' && !dugoutApp}
        org={org ? pick(org) : null}
        orgs={orgs.map(pick)}
      >
        {children}
      </MasterShell>
    </div>
  );
}
