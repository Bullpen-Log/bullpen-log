import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ClipboardList } from '@/components/icon';
import { CoachArmNote } from '@/components/master/coach-arm-note';
import { Badge, Card, PageHeading } from '@/components/ui';
import { Bars, Line } from '@/components/master/charts';
import { MemberEditForm } from '@/components/master/member-edit-form';
import { LessonNotes } from '@/components/master/lesson-notes';
import { PassCard } from '@/components/master/pass-card';
import { GuardianLinkCard } from '@/components/master/guardian-link-card';
import { requireMaster } from '@/lib/dal';
import { requireCurrentOrg } from '@/lib/org/access';
import { loadMember, memberCardOf } from '@/lib/org/player-data';
import { CONSENT_SCOPES, ORG_WORDS, realNow } from '@/lib/org/rules';
import { SLEEP_QUALITY_LEVELS } from '@/lib/checkin';
import { appNow } from '@/lib/clock';
import { toDateKey } from '@/lib/pitch-stats';
import { prisma } from '@/lib/prisma';

/**
 * 선수(회원) 카드 — 코치가 보는 한 사람(2단계). 선수 화면이 쓰는 같은 계산으로 읽고(lib/org/player-data.ts), 선수가 공유를 끈 범위는
 * 서버에서 아예 안 읽는다. 레슨 노트 · 숙제(4단계)는 가입 전 자리에도 쓴다 — 기록은 선수가 가입한 뒤 이어진다.
 */
export default async function MemberPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const user = await requireMaster();
  const { org } = await requireCurrentOrg(user);
  const { memberId } = await params;
  const member = await loadMember(org.id, memberId);
  if (!member || member.role !== 'PLAYER') notFound();
  const words = ORG_WORDS[org.kind];
  const now = appNow();
  const todayKey = toDateKey(now);

  const [card, notes, passes, reports] = await Promise.all([
    memberCardOf(member, now),
    prisma.lessonNote.findMany({
      where: { memberId: member.id },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 30,
      select: {
        id: true,
        date: true,
        body: true,
        homework: true,
        authorId: true,
        createdAt: true,
      },
    }),
    org.kind === 'LESSON'
      ? prisma.lessonPass.findMany({
          where: { memberId: member.id },
          orderBy: { createdAt: 'desc' },
          select: { id: true, total: true, used: true, expiresAt: true, memo: true },
        })
      : Promise.resolve([]),
    prisma.guardianReport.findMany({
      where: { memberId: member.id, expiresAt: { gt: realNow() } },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, token: true, expiresAt: true, lastOpenedAt: true },
    }),
  ]);
  const shared = CONSENT_SCOPES.filter((s) => card?.scope[s.key]).map(
    (s) => s.label.split(' · ')[0]
  );
  const fmt = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' });
  const staffNote = member.status !== 'ACTIVE' ? '나간 구성원' : null;

  return (
    <div className="stack-page">
      <Link
        href="/manage/players"
        className="inline-flex items-center gap-1 text-sm font-semibold text-sky"
      >
        <ArrowLeft className="h-4 w-4" /> {words.members}
      </Link>
      <PageHeading
        kicker={words.member}
        title={member.nickname}
        description={
          member.user
            ? `${fmt.format(member.joinedAt)} 참여 · 공유 ${shared.length ? shared.join(' · ') : '없음'}`
            : '아직 가입 전 — 초대 코드로 가입하면 이 자리를 이어받아요'
        }
      />
      <div className="flex flex-wrap gap-1.5">
        {member.tags.map((t) => (
          <Badge key={t}>{t}</Badge>
        ))}
        {staffNote && <Badge className="text-warn">{staffNote}</Badge>}
        {!member.user && <Badge className="text-warn">가입 전</Badge>}
      </div>

      {card && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* 팔 상태 */}
          {card.arm && (
            <Card className="space-y-2">
              <h2 className="text-sm font-bold text-ink">지금 팔 상태</h2>
              <CoachArmNote status={card.arm} />
            </Card>
          )}

          {/* 투구 */}
          {card.pitch && (
            <Card className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-bold text-ink">투구</h2>
                <p className="text-xs text-muted">
                  7일 <b className="text-ink">{card.pitch.last7}구</b> · 28일{' '}
                  <b className="text-ink">{card.pitch.last28}구</b>
                </p>
              </div>
              <Bars
                data={card.pitch.days.map((d) => ({ key: d.key, value: d.pitches }))}
                label="최근 28일 투구수"
              />
              {card.pitch.lastOuting ? (
                <p className="text-xs text-muted">
                  마지막 등판{' '}
                  {fmt.format(new Date(`${card.pitch.lastOuting.key}T00:00:00Z`))} ·{' '}
                  {card.pitch.lastOuting.sessionType} {card.pitch.lastOuting.pitches}구
                </p>
              ) : (
                <p className="text-xs text-muted">최근 28일 투구 기록이 없어요.</p>
              )}
              {card.pitch.logs.length > 0 && (
                <ul className="divide-y divide-line text-xs">
                  {card.pitch.logs.map((l) => (
                    <li key={l.id} className="flex items-center gap-2 py-1.5">
                      <span className="w-10 shrink-0 text-muted">
                        {fmt.format(new Date(`${l.key}T00:00:00Z`))}
                      </span>
                      <span className="w-12 shrink-0 text-ink">{l.sessionType}</span>
                      <span className="w-12 shrink-0 font-semibold text-ink">
                        {l.pitchCount}구
                      </span>
                      <span className="w-12 shrink-0 text-muted">
                        {l.effortPct != null
                          ? `${l.effortPct}%`
                          : `강도 ${l.intensity}`}
                      </span>
                      {l.maxVelocity != null && (
                        <span className="shrink-0 text-muted">{l.maxVelocity}km/h</span>
                      )}
                      {l.memo && (
                        <span className="min-w-0 flex-1 truncate text-muted">
                          {l.memo}
                        </span>
                      )}
                      {l.byCoach && <Badge className="ml-auto">코치 기록</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {/* 구속 */}
          {card.velocity && (
            <Card className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-bold text-ink">구속</h2>
                {card.velocity.best != null && (
                  <p className="text-xs text-muted">
                    최고 <b className="text-ink">{card.velocity.best.toFixed(1)}km/h</b>
                  </p>
                )}
              </div>
              {card.velocity.latest ? (
                <>
                  <p className="text-xs text-muted">
                    최근 세션{' '}
                    {fmt.format(new Date(`${card.velocity.latest.key}T00:00:00Z`))} ·
                    최고 {card.velocity.latest.max.toFixed(1)} · 평균{' '}
                    {card.velocity.latest.avg.toFixed(1)}km/h · {card.velocity.latest.n}
                    구
                  </p>
                  {card.velocity.sessions.length >= 2 && (
                    <Line
                      points={card.velocity.sessions.map((s) => ({
                        key: s.key,
                        value: s.max,
                      }))}
                      unit="km/h"
                      decimals={1}
                      label={`세션 최고 구속 · 최근 ${card.velocity.sessions.length}회`}
                    />
                  )}
                </>
              ) : (
                <p className="text-xs text-muted">카메라로 잰 구속이 아직 없어요.</p>
              )}
            </Card>
          )}

          {/* 체크인 */}
          {card.scope.checkin && (
            <Card className="space-y-2">
              <h2 className="text-sm font-bold text-ink">오늘 체크인</h2>
              {card.checkin ? (
                <div className="space-y-1 text-sm text-ink">
                  <p>
                    컨디션 <b>{card.checkin.condition}</b>/10 · 잠{' '}
                    <b>
                      {card.checkin.sleepQuality != null
                        ? (SLEEP_QUALITY_LEVELS[card.checkin.sleepQuality - 1] ??
                          card.checkin.sleepQuality)
                        : '미기록'}
                    </b>
                  </p>
                  <p
                    className={
                      card.checkin.painParts.length
                        ? 'font-semibold text-danger'
                        : 'text-muted'
                    }
                  >
                    {card.checkin.painParts.length
                      ? `통증: ${card.checkin.painParts.join(' · ')}`
                      : card.checkin.stiffParts.length
                        ? `뻐근: ${card.checkin.stiffParts.join(' · ')}`
                        : '통증 없음'}
                  </p>
                  {card.checkin.note && (
                    <p className="text-xs text-muted">“{card.checkin.note}”</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted">오늘 체크인을 아직 안 했어요.</p>
              )}
            </Card>
          )}

          {/* 재활 */}
          {card.scope.training && (
            <Card className="space-y-2">
              <h2 className="text-sm font-bold text-ink">재활</h2>
              {card.rehab ? (
                <p className="text-sm text-ink">
                  <b>{card.rehab.area}</b> · {card.rehab.stage}단계 ·{' '}
                  {card.rehab.severity} ·{' '}
                  {fmt.format(new Date(`${card.rehab.startedOn}T00:00:00Z`))}부터
                </p>
              ) : (
                <p className="text-xs text-muted">진행 중인 재활이 없어요.</p>
              )}
            </Card>
          )}

          {/* 영상 */}
          {card.scope.video && (
            <Card className="space-y-2">
              <h2 className="text-sm font-bold text-ink">최근 투구 영상</h2>
              {card.clips.length ? (
                <div className="grid grid-cols-2 gap-2">
                  {card.clips.map((c) => (
                    <figure key={c.url} className="space-y-1">
                      <video
                        src={c.url}
                        controls
                        preload="metadata"
                        playsInline
                        className="aspect-[9/16] w-full rounded-xl bg-black"
                      />
                      <figcaption className="text-[11px] text-muted">
                        {fmt.format(new Date(`${c.key}T00:00:00Z`))}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted">
                  저장소에 올린 투구 영상이 아직 없어요.
                </p>
              )}
            </Card>
          )}

          {/* 체중 */}
          {card.scope.weight && (
            <Card className="space-y-2">
              <h2 className="text-sm font-bold text-ink">체중</h2>
              {card.weight.length >= 2 ? (
                <Line points={card.weight} unit="kg" decimals={1} label="최근 90일" />
              ) : (
                <p className="text-xs text-muted">
                  체중 기록이 둘 이상 쌓이면 그래프가 보여요.
                </p>
              )}
            </Card>
          )}
        </div>
      )}

      {!card && (
        <Card className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <ClipboardList className="h-4 w-4 text-muted" /> 기록은 {words.member}이
            가입한 뒤 이어져요
          </p>
          <p className="text-xs text-muted">
            지금은 레슨 노트 · 숙제만 남길 수 있어요. 설정의 초대 코드로 가입하면 이
            자리를 이어받고 공유 범위를 스스로 정해요.
          </p>
        </Card>
      )}

      {/* 레슨 노트 · 숙제(4단계) — 팀은 '코치 노트' */}
      <LessonNotes
        memberId={member.id}
        orgKind={org.kind}
        todayKey={todayKey}
        notes={notes.map((n) => ({
          id: n.id,
          key: n.date.toISOString().slice(0, 10),
          body: n.body,
          homework: n.homework,
          mine: n.authorId === user.id,
        }))}
      />

      {org.kind === 'LESSON' && (
        <PassCard memberId={member.id} passes={passes} todayKey={todayKey} />
      )}

      <GuardianLinkCard memberId={member.id} reports={reports} />

      <Card className="space-y-3">
        <h2 className="text-sm font-bold text-ink">이름 · 태그 · 메모</h2>
        <MemberEditForm
          member={{
            id: member.id,
            nickname: member.nickname,
            tags: member.tags,
            memo: member.memo,
          }}
        />
      </Card>
    </div>
  );
}
