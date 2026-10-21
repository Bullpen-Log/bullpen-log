import Link from 'next/link';
import { Badge, Card, EmptyState, PageHeading } from '@/components/ui';
import { SafeForm } from '@/components/safe-form';
import { SinkerNav } from '@/components/sinker/sinker-nav';
import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { setShareConsent } from '@/app/actions/sharing';
import { ORG_KIND_LABEL } from '@/lib/org/rules';
import { formatDateTime } from '@/components/community/community-format';

const SHARE_OPTIONS = [
  { key: 'pitch', label: '투구 기록' },
  { key: 'training', label: '트레이닝' },
  { key: 'checkin', label: '체크인 · 팔 상태' },
  { key: 'video', label: '영상' },
  { key: 'nutrition', label: '영양' },
  { key: 'weight', label: '몸무게' },
] as const;

/**
 * 연결(PC, 2026-10-21 개편 4단계 4-5, docs/designs/sinker-dugout.md 5-2) — 어느 팀 · 레슨장에 무엇을 보이는지(ShareConsent) · 싱커 앱 연결 상태.
 * 기기 등록(푸시)은 5단계에서 더한다.
 */
export default async function SharingPage() {
  const user = await requireUser();
  const [members, me, devices, lastLog] = await Promise.all([
    prisma.orgMember.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
      select: {
        id: true,
        org: { select: { id: true, name: true, kind: true } },
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
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { signupSource: true, sinkerStartedAt: true, createdAt: true },
    }),
    prisma.pushDevice.findMany({
      where: { userId: user.id },
      orderBy: { lastSeenAt: 'desc' },
      select: { app: true, platform: true, lastSeenAt: true },
    }),
    prisma.pitchLog.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, enteredById: true },
    }),
  ]);
  const sourceLabel: Record<string, string> = {
    'sinker-app': '싱커 앱',
    'dugout-app': '덕아웃 앱',
    web: '웹(덕아웃)',
  };

  return (
    <div className="stack-page">
      <PageHeading
        title="연결"
        description="내 기록을 어디에 보일지, 싱커 앱과 어떻게 이어져 있는지."
      />
      <SinkerNav />

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">팀 · 레슨장에 보이는 것</h2>
        {members.length === 0 ? (
          <EmptyState
            title="아직 들어간 팀 · 레슨장이 없어요"
            description="초대 코드로 들어가거나, 덕아웃에서 레슨을 예약해 확정되면 여기 생겨요."
            action={
              <Link href="/lessons" className="text-sm font-semibold text-sky">
                레슨 찾기
              </Link>
            }
          />
        ) : (
          members.map((m) => {
            const c = m.consent ?? {
              pitch: true,
              training: true,
              checkin: true,
              video: true,
              nutrition: false,
              weight: false,
            };
            return (
              <Card key={m.id}>
                <SafeForm
                  action={setShareConsent}
                  doneToast="저장했어요."
                  className="space-y-3"
                >
                  <input type="hidden" name="memberId" value={m.id} />
                  <div className="flex items-center gap-2">
                    <Badge>{ORG_KIND_LABEL[m.org.kind]}</Badge>
                    <span className="text-sm font-semibold text-ink">{m.org.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {SHARE_OPTIONS.map((o) => (
                      <label
                        key={o.key}
                        className="flex items-center gap-2 text-sm text-ink"
                      >
                        <input
                          type="checkbox"
                          name="keys"
                          value={o.key}
                          defaultChecked={c[o.key]}
                          className="h-4 w-4 accent-sky"
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                  <button
                    type="submit"
                    className="min-h-9 rounded-lg border border-line px-3 text-sm font-semibold text-ink"
                  >
                    저장
                  </button>
                </SafeForm>
              </Card>
            );
          })
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">싱커 앱</h2>
        <Card className="p-0">
          <dl className="divide-y divide-line text-sm">
            <div className="flex justify-between px-4 py-2.5">
              <dt className="text-muted">가입한 곳</dt>
              <dd className="font-semibold text-ink">
                {sourceLabel[me?.signupSource ?? 'web'] ?? me?.signupSource}
              </dd>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <dt className="text-muted">싱커 시작</dt>
              <dd className="font-semibold text-ink">
                {me?.sinkerStartedAt
                  ? formatDateTime(me.sinkerStartedAt).slice(0, 8)
                  : '아직'}
              </dd>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <dt className="text-muted">마지막 기록</dt>
              <dd className="font-semibold text-ink">
                {lastLog
                  ? `${formatDateTime(lastLog.createdAt)}${lastLog.enteredById && lastLog.enteredById !== user.id ? ' (코치 대신 기록)' : ''}`
                  : '없음'}
              </dd>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <dt className="text-muted">알림 기기</dt>
              <dd className="text-right font-semibold text-ink">
                {devices.length === 0
                  ? '없음 — 앱에서 알림을 켜면 여기 떠요'
                  : devices
                      .map(
                        (d) =>
                          `${d.app === 'dugout' ? '덕아웃' : '싱커'} 앱 · ${formatDateTime(d.lastSeenAt).slice(0, 8)}`
                      )
                      .join(', ')}
              </dd>
            </div>
          </dl>
        </Card>
        <p className="text-xs text-muted">
          측정(구속 · ABS · 촬영)은 싱커 앱에서만 해요. 휴대폰에서 앱을 열고 같은
          계정으로 로그인하면 여기 기록이 그대로 보여요.
        </p>
      </section>
    </div>
  );
}
