import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { CoachArmNote } from '@/components/master/coach-arm-note';
import { SafeForm } from '@/components/safe-form';
import { Badge, Button, Card, Field, FormError, Input } from '@/components/ui';
import { Bars, Line } from '@/components/master/charts';
import { verifyGuardianCode } from '@/app/actions/org-report';
import { memberScope } from '@/lib/org/access';
import {
  coachArmStatusFor,
  pitchSummaryOf,
  velocitySummaryOf,
  MEMBER_SELECT,
} from '@/lib/org/player-data';
import { ORG_KIND_LABEL, REPORT_TOKEN_RE, realNow } from '@/lib/org/rules';
import { appNow } from '@/lib/clock';
import { toDateKey } from '@/lib/pitch-stats';
import { prisma } from '@/lib/prisma';

/**
 * 보호자 리포트 — 읽기 전용. 코드를 맞히면(쿠키) 투구 · 구속 · 레슨 노트 · 숙제만 보인다. 체크인(통증 · 잠) · 체중 · 영상은 안 보인다 —
 * 보호자에게도 선수가 고른 공유 범위를 넘지 않고, 건강 정보는 코치 화면까지만.
 */
export default async function GuardianReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { token } = await params;
  if (!REPORT_TOKEN_RE.test(token)) notFound();
  const report = await prisma.guardianReport.findUnique({
    where: { token },
    select: {
      id: true,
      expiresAt: true,
      member: {
        select: { ...MEMBER_SELECT, org: { select: { name: true, kind: true } } },
      },
    },
  });
  /* 조직을 떠난 회원의 링크도 끝난 것으로 — 떠난 뒤의 기록은 조직 쪽에서 안 보인다(2026-10-25 0단계 계약) */
  if (!report || report.expiresAt.getTime() < realNow().getTime() || report.member.status !== 'ACTIVE') {
    return (
      <Card className="space-y-1">
        <p className="text-sm font-bold text-ink">이 링크는 끝났어요</p>
        <p className="text-xs text-muted">코치에게 새 링크를 받아 주세요.</p>
      </Card>
    );
  }
  const opened =
    (await cookies()).get(`bp-report-${token.slice(0, 8)}`)?.value === token;
  const rawErr = (await searchParams).error;
  const error = Array.isArray(rawErr) ? rawErr[0] : rawErr;
  const member = report.member;

  if (!opened) {
    return (
      <Card className="space-y-4">
        <div>
          <p className="text-sm font-bold text-ink">
            {member.org.name} · {member.nickname}
          </p>
          <p className="mt-1 text-xs text-muted">
            코치가 알려 준 네 자리 코드를 넣어 주세요.
          </p>
        </div>
        <SafeForm action={verifyGuardianCode} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <Field label="코드">
            <Input
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              pattern="[0-9]{4}"
              required
              className="font-mono text-xl tracking-[0.4em]"
            />
          </Field>
          {error && <FormError>{error}</FormError>}
          <Button type="submit" className="w-full" size="lg">
            열기
          </Button>
        </SafeForm>
      </Card>
    );
  }

  const now = appNow();
  const todayKey = toDateKey(now);
  const scope = memberScope(member.consent, !!member.user);
  const canPitch = !!member.user && scope.pitch;
  const [arm, pitch, velocity, notes] = await Promise.all([
    canPitch ? coachArmStatusFor(member.user!, now, scope) : null,
    canPitch ? pitchSummaryOf(member.user!.id, todayKey) : null,
    canPitch ? velocitySummaryOf(member.user!.id) : null,
    prisma.lessonNote.findMany({
      where: { memberId: member.id },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 10,
      select: { id: true, date: true, body: true, homework: true },
    }),
  ]);
  const fmt = (key: string) => {
    const [, m, d] = key.split('-');
    return `${Number(m)}/${Number(d)}`;
  };
  const homework = notes.find((n) => n.homework);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted">
          {ORG_KIND_LABEL[member.org.kind]} · {member.org.name}
        </p>
        <h1 className="text-xl font-bold text-ink">{member.nickname}</h1>
        <p className="mt-1 text-xs text-muted">
          {new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(
            report.expiresAt
          )}
          까지 볼 수 있어요.
        </p>
      </div>

      {homework && (
        <Card className="border-sky/30 bg-sky/5">
          <p className="text-xs font-semibold text-sky-strong">
            숙제 · {fmt(homework.date.toISOString().slice(0, 10))}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
            {homework.homework}
          </p>
        </Card>
      )}

      {arm && (
        <Card className="space-y-2">
          <h2 className="text-sm font-bold text-ink">지금 팔 상태</h2>
          <CoachArmNote status={arm} />
        </Card>
      )}

      {pitch && (
        <Card className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-bold text-ink">투구</h2>
            <p className="text-xs text-muted">
              7일 <b className="text-ink">{pitch.last7}구</b> · 28일{' '}
              <b className="text-ink">{pitch.last28}구</b>
            </p>
          </div>
          <Bars
            data={pitch.days.map((d) => ({ key: d.key, value: d.pitches }))}
            label="최근 28일 투구수"
          />
        </Card>
      )}

      {velocity && velocity.latest && (
        <Card className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-bold text-ink">구속</h2>
            <p className="text-xs text-muted">
              최고 <b className="text-ink">{velocity.best?.toFixed(1)}km/h</b>
            </p>
          </div>
          <p className="text-xs text-muted">
            최근 {fmt(velocity.latest.key)} · 최고 {velocity.latest.max.toFixed(1)} ·
            평균 {velocity.latest.avg.toFixed(1)}km/h
          </p>
          {velocity.sessions.length >= 2 && (
            <Line
              points={velocity.sessions.map((s) => ({ key: s.key, value: s.max }))}
              unit="km/h"
              decimals={1}
              label="세션 최고 구속"
            />
          )}
        </Card>
      )}

      {!canPitch && (
        <Card>
          <p className="text-xs text-muted">
            {member.user
              ? '선수가 투구 기록 공유를 켜지 않았어요.'
              : '선수가 아직 앱에 가입하지 않아 기록이 없어요.'}{' '}
            코치의 노트는 아래에 있어요.
          </p>
        </Card>
      )}

      <Card className="space-y-2">
        <h2 className="text-sm font-bold text-ink">코치 노트</h2>
        {notes.length === 0 ? (
          <p className="text-xs text-muted">아직 노트가 없어요.</p>
        ) : (
          <ul className="divide-y divide-line">
            {notes.map((n) => (
              <li key={n.id} className="py-2 text-sm">
                <p className="flex items-center gap-2 text-xs text-muted">
                  {fmt(n.date.toISOString().slice(0, 10))}
                  {n.homework && <Badge>숙제</Badge>}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-ink">{n.body}</p>
                {n.homework && (
                  <p className="mt-0.5 text-xs text-sky-strong">숙제: {n.homework}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
