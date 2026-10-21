import Link from 'next/link';
import { ArrowRight } from '@/components/icon';
import { RoundLock } from '@/components/round-icon';
import { Badge, Card, PageHeading } from '@/components/ui';
import { SinkerNav } from '@/components/sinker/sinker-nav';
import { LessonFeedCard } from '@/components/dugout/lesson-feed-card';
import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { toDateKey } from '@/lib/pitch-stats';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { loadTrainingToday } from '@/lib/report/training-today-data';
import { loadLessonFeed } from '@/lib/org/lesson-feed';
import {
  armStatusFor,
  checkinTodayOf,
  pitchSummaryOf,
  velocitySummaryOf,
  USER_FOR_FACTS,
} from '@/lib/org/player-data';

/**
 * 내 싱커 대시보드(PC, 2026-10-21 개편 4단계 4-1, docs/designs/sinker-dugout.md 5-3) — 지표 넷 · 주간 투구량 · 구속 추세 · 체크인 ·
 * 오늘의 트레이닝 추천 · 레슨 기록 · 측정은 앱에서. 자료는 코치 화면 · 앱이 읽는 같은 함수들(lib/org/player-data.ts · lib/report/training-today-data.ts).
 * 새 기록 입력은 지금 선수 화면(/today · /videos · /training)에서 그대로 한다 — 이 화면은 큰 화면에 맞게 모아 보는 자리.
 */
export default async function SinkerDashboardPage() {
  const user = await requireUser();
  const now = appNow();
  const todayKey = toDateKey(now);
  const facts = await prisma.user.findUnique({
    where: { id: user.id },
    select: USER_FOR_FACTS,
  });
  const locks = featureLocks(user);
  const [pitch, velocity, arm, checkin, lessons, training] = await Promise.all([
    pitchSummaryOf(user.id, todayKey),
    velocitySummaryOf(user.id),
    facts ? armStatusFor(facts, now) : null,
    checkinTodayOf(user.id, todayKey),
    loadLessonFeed(user.id, 3),
    locks.training ? null : loadTrainingToday(user, now).catch(() => null),
  ]);

  /* 주간 투구량 — 28일을 7일씩 넷(오래된 주부터) */
  const weeks = [0, 1, 2, 3].map((w) => {
    const slice = pitch.days.slice(w * 7, w * 7 + 7);
    return {
      label: w === 3 ? '이번 주' : `${3 - w}주 전`,
      total: slice.reduce((a, d) => a + d.pitches, 0),
    };
  });
  const weekMax = Math.max(1, ...weeks.map((w) => w.total));
  const prevWeek = weeks[2].total;
  const delta =
    prevWeek > 0 ? Math.round(((weeks[3].total - prevWeek) / prevWeek) * 100) : null;
  const vMax = Math.max(1, ...velocity.sessions.map((s) => s.max));
  const vMin = Math.min(...velocity.sessions.map((s) => s.max), vMax);

  const kpis = [
    {
      label: '이번 주 투구',
      value: `${weeks[3].total}개`,
      sub:
        delta == null
          ? '지난주 기록 없음'
          : `지난주보다 ${delta >= 0 ? '+' : ''}${delta}%`,
    },
    {
      label: '최고 구속',
      value: velocity.best ? `${velocity.best} km/h` : '—',
      sub: velocity.latest
        ? `최근 ${velocity.latest.key.slice(5).replace('-', '/')} 세션`
        : '구속 측정은 앱에서',
    },
    { label: '팔 상태', value: arm?.headline ?? '—', sub: arm?.details[0] ?? '' },
    {
      label: '마지막 등판',
      value: pitch.lastOuting ? pitch.lastOuting.key.slice(5).replace('-', '/') : '—',
      sub: pitch.lastOuting
        ? `${pitch.lastOuting.sessionType} · ${pitch.lastOuting.pitches}개`
        : '기록이 없어요',
    },
  ];

  return (
    <div className="stack-page">
      <PageHeading
        title="내 싱커"
        description="큰 화면으로 모아 보는 내 기록 — 입력은 투구 · 트레이닝 탭에서 그대로."
      />
      <SinkerNav />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <p className="text-xs text-muted">{k.label}</p>
            <p className="mt-1 text-xl font-bold text-ink tabular-nums">{k.value}</p>
            <p className="text-[11px] text-muted">{k.sub}</p>
          </Card>
        ))}
      </section>

      <section className="grid gap-3 lg:grid-cols-5">
        <Card className="space-y-3 lg:col-span-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-bold text-ink">주간 투구량</h2>
            <Link href="/sinker/log" className="text-xs font-semibold text-sky">
              기록 표
            </Link>
          </div>
          <div className="flex h-36 items-end gap-3">
            {weeks.map((w) => (
              <div key={w.label} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-semibold text-ink tabular-nums">
                  {w.total}
                </span>
                <div
                  className={`w-full rounded-t-md ${w.label === '이번 주' ? 'bg-sky' : 'bg-sky-soft/60'}`}
                  style={{ height: `${Math.max(4, (w.total / weekMax) * 100)}%` }}
                />
                <span className="text-[11px] text-muted">{w.label}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="space-y-3 lg:col-span-2">
          <h2 className="text-sm font-bold text-ink">오늘 체크인</h2>
          {checkin ? (
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">컨디션</dt>
                <dd className="font-semibold text-ink">{checkin.condition} / 10</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">수면의 질</dt>
                <dd className="font-semibold text-ink">
                  {checkin.sleepQuality != null ? `${checkin.sleepQuality} / 5` : '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">불편한 곳</dt>
                <dd className="font-semibold text-ink">
                  {checkin.painParts.length ? checkin.painParts.join(' · ') : '없음'}
                </dd>
              </div>
              {checkin.note && <p className="text-xs text-muted">{checkin.note}</p>}
            </dl>
          ) : (
            <p className="text-sm text-muted">
              아직 안 했어요.{' '}
              <Link href="/today" className="font-semibold text-sky">
                홈에서 체크인
              </Link>
            </p>
          )}
        </Card>
      </section>

      <section className="grid gap-3 lg:grid-cols-5">
        <Card className="space-y-3 lg:col-span-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-bold text-ink">구속 추세 · 세션 최고</h2>
            <span className="text-xs text-muted">
              최근 {velocity.sessions.length}세션
            </span>
          </div>
          {velocity.sessions.length === 0 ? (
            <p className="text-sm text-muted">
              아직 구속 측정 기록이 없어요. 측정은 싱커 앱의 카메라로 해요.
            </p>
          ) : (
            <div className="flex h-32 items-end gap-1.5">
              {velocity.sessions.map((s) => (
                <div
                  key={s.key}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${s.key} 최고 ${s.max} 평균 ${s.avg} (${s.n}구)`}
                >
                  <span className="text-[10px] text-muted tabular-nums">{s.max}</span>
                  <div
                    className="w-full rounded-t-md bg-sky"
                    style={{
                      height: `${Math.max(6, ((s.max - vMin + 2) / (vMax - vMin + 2)) * 100)}%`,
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="space-y-3 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-bold text-ink">오늘의 트레이닝</h2>
            <Link
              href="/training"
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-sky"
            >
              트레이닝 탭 <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {locks.training ? (
            <p className="text-sm text-muted">
              첫 설정을 하면 몸 상태에 맞춘 오늘 운동이 떠요.{' '}
              <Link href={SETUP_PATH.training} className="font-semibold text-sky">
                설정하기
              </Link>
            </p>
          ) : training ? (
            <div className="space-y-2 text-sm">
              {training.programCard ? (
                <p>
                  <Badge>{training.programCard.basics ? '기본기' : '프로그램'}</Badge>{' '}
                  <span className="font-semibold text-ink">
                    {training.programCard.name}
                  </span>
                  <span className="text-muted"> · {training.programCard.dayLabel}</span>
                </p>
              ) : (
                <p className="text-muted">
                  진행 중인 프로그램 없음 — 오늘 몸 상태로 만든 운동을 트레이닝 탭에서
                  봐요.
                </p>
              )}
              {training.done ? (
                <p className="text-muted">
                  오늘 한 것{' '}
                  <span className="font-semibold text-ink">
                    {training.done.minutes}분 · {training.done.sets}세트
                  </span>
                </p>
              ) : (
                <p className="text-muted">오늘 아직 안 했어요.</p>
              )}
              {training.note.memo && (
                <p className="text-xs text-muted">{training.note.memo}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">
              오늘 셈을 못 읽었어요. 트레이닝 탭에서 봐 주세요.
            </p>
          )}
        </Card>
      </section>

      <LessonFeedCard items={lessons} compact title="최근 레슨" />

      {/* 측정은 앱에서(4-4) — 카메라가 있어야 하는 것 */}
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { title: '구속 측정', body: '고속 촬영이 필요해 앱 카메라로만 재요.' },
          { title: 'ABS 판정', body: '스트라이크 존 판정도 앱 카메라로.' },
          {
            title: '촬영 · 3D 분석',
            body: '영상은 앱에서 찍고, 결과는 여기 영상 탭에서 봐요.',
          },
        ].map((c) => (
          <Card key={c.title} className="flex items-start gap-3 p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink/6 text-muted">
              <RoundLock className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">{c.title} · 싱커 앱에서</p>
              <p className="text-xs text-muted">{c.body}</p>
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
