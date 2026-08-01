import Link from 'next/link';
import {
  Activity,
  BookOpen,
  CalendarDays,
  FileText,
  Plus,
  TrendingUp,
  UserCog,
  Users,
  Video,
} from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { ageFromBirthDate } from '@/lib/profile';
import {
  ACWR_TARGET_MAX,
  ACWR_ZONES,
  CHRONIC_WINDOW_DAYS,
  buildDateRange,
  buildDateRangeOffset,
  computeAcwr,
  dailyLoad,
  findFatigueWindows,
  formatShortDate,
  groupByDay,
  longestThrowStreak,
  summarize,
  toDateKey,
} from '@/lib/pitch-stats';
import { LoadChart, type LoadPoint } from './load-chart';
import {
  Delta,
  StatCard,
  StatusChip,
  TONE,
  WeekStrip,
  ZoneGauge,
  type Tone,
} from './parts';

const QUICK_LINKS = [
  { href: '/pitch-log', label: '투구기록', icon: CalendarDays },
  { href: '/analysis', label: '영상분석', icon: Video },
  { href: '/report', label: '리포트', icon: TrendingUp },
  { href: '/training', label: '트레이닝', icon: Activity },
  { href: '/mechanics', label: '메커니즘', icon: BookOpen },
  { href: '/board', label: '자료실', icon: FileText },
] as const;

/** 렌더 중에 현재 시각을 직접 읽지 않도록 함수로 감싼다. */
function now() {
  return new Date();
}

function changeRate(current: number, previous: number) {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** 마지막으로 던진 날로부터 며칠 지났는지 */
function daysSince(dateKey: string, todayKey: string) {
  const [fy, fm, fd] = dateKey.split('-').map(Number);
  const [ty, tm, td] = todayKey.split('-').map(Number);
  return Math.floor(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const today = now();
  const todayKey = toDateKey(today);

  // 28일 차트와 직전 기간 비교까지 필요해 넉넉히 60일치를 가져온다.
  const since = new Date(today);
  since.setDate(since.getDate() - 70);

  const logs = await prisma.pitchLog.findMany({
    where: { userId: user.id, date: { gte: since } },
    orderBy: { date: 'desc' },
    select: {
      id: true,
      date: true,
      pitchCount: true,
      intensity: true,
      maxVelocity: true,
      avgVelocity: true,
      memo: true,
      videoPaths: true,
    },
  });

  const allTimeMax = await prisma.pitchLog.aggregate({
    where: { userId: user.id },
    _max: { maxVelocity: true },
    _count: true,
  });

  const byDay = groupByDay(
    logs.map((l) => ({
      date: l.date.toISOString(),
      pitchCount: l.pitchCount,
      intensity: l.intensity,
      maxVelocity: l.maxVelocity,
      avgVelocity: l.avgVelocity,
    }))
  );

  const last7 = buildDateRange(7, today);
  const prev7 = buildDateRangeOffset(7, 7, today);
  const last28 = buildDateRange(CHRONIC_WINDOW_DAYS, today);

  const current = summarize(byDay, last7);
  const previous = summarize(byDay, prev7);
  const acwr = computeAcwr(byDay, today);
  const fatigue = findFatigueWindows(byDay, last28);
  const streak = longestThrowStreak(byDay, last28);

  const age = user.birthDate ? ageFromBirthDate(user.birthDate, today) : null;
  const lastThrowKey = [...byDay.keys()].sort().at(-1);
  const restDays = lastThrowKey ? daysSince(lastThrowKey, todayKey) : null;

  // 차트: 막대는 그날 투구수, 선은 그날까지의 7일 누적 부하
  const chartPoints: LoadPoint[] = last28.map((key, i) => {
    const window = last28.slice(Math.max(0, i - 6), i + 1);
    const rollingLoad = window.reduce((sum, k) => {
      const day = byDay.get(k);
      return sum + (day ? dailyLoad(day) : 0);
    }, 0);
    return {
      label: formatShortDate(key),
      pitches: byDay.get(key)?.pitchCount ?? 0,
      rollingLoad,
    };
  });

  const hasRecords = allTimeMax._count > 0;
  const zone = acwr.zone ? ACWR_ZONES[acwr.zone] : null;
  const recent = logs.slice(0, 4);

  const intensityTone: Tone =
    current.peakIntensity >= 9 ? 'warn' : current.activeDays > 0 ? 'good' : 'neutral';
  const restTone: Tone =
    restDays == null ? 'neutral' : restDays === 0 ? 'warn' : restDays >= 7 ? 'info' : 'good';

  return (
    <div className="space-y-8">
      {/* ── 헤더 ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-gold">
            Live Dashboard
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-cream sm:text-3xl">
            {user.nickname}님의 컨디션
          </h1>
        </div>
        <Link
          href="/pitch-log"
          className="inline-flex items-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-gold-bright"
        >
          <Plus className="h-4 w-4" />
          투구 기록하기
        </Link>
      </div>

      {/* ── 프로필 + 현재 부하 지수 ─────────────────────────── */}
      <section className="bg-spotlight overflow-hidden rounded-3xl border border-line">
        <div className="grid gap-px bg-line lg:grid-cols-[1fr_minmax(0,420px)]">
          {/* 선수 정보 */}
          <div className="flex flex-col justify-between gap-7 bg-surface/80 px-6 py-8 sm:px-8 sm:py-9">
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-gold-dim/50 bg-gold/10 text-2xl font-bold text-gold">
                {user.nickname.slice(0, 1)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xl font-bold text-cream">
                  {user.nickname}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {[
                    age != null ? `만 ${age}세` : null,
                    user.heightCm ? `${user.heightCm}cm` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || (
                    <Link href="/profile" className="text-gold hover:underline">
                      신체 정보 입력하기 →
                    </Link>
                  )}
                </p>
              </div>
            </div>

            <WeekStrip
              bars={last7.map((key) => ({
                label: formatShortDate(key),
                pitches: byDay.get(key)?.pitchCount ?? 0,
              }))}
            />

            <dl className="grid grid-cols-3 gap-4 border-t border-line pt-6">
              {[
                {
                  label: '개인 최고',
                  value: allTimeMax._max.maxVelocity ?? '—',
                  unit: 'km/h',
                },
                { label: '최근 7일', value: current.totalPitches, unit: '구' },
                { label: '누적 기록', value: allTimeMax._count, unit: '건' },
              ].map((s) => (
                <div key={s.label}>
                  <dt className="text-[10px] uppercase tracking-[0.18em] text-muted">
                    {s.label}
                  </dt>
                  {/* 단위까지 디스플레이 글꼴이 되지 않게 숫자에만 적용한다. */}
                  <dd className="mt-2 flex items-baseline gap-1">
                    <span className="text-display text-2xl leading-none text-cream tabular-nums">
                      {s.value}
                    </span>
                    <span className="text-[11px] text-muted">{s.unit}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* 현재 부하 지수 */}
          <div className="flex flex-col justify-center gap-4 bg-surface px-6 py-7 sm:px-8">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
                  현재 부하 지수
                </p>
                <p className="mt-0.5 text-[11px] text-muted/70">
                  최근 7일 ÷ 평소 4주 평균
                </p>
              </div>
              {zone ? (
                <StatusChip tone={zone.tone}>{zone.label}</StatusChip>
              ) : (
                <StatusChip tone="neutral">데이터 쌓는 중</StatusChip>
              )}
            </div>

            {acwr.ratio != null && zone ? (
              <>
                <p className="flex items-baseline gap-2">
                  <span
                    className={`text-display text-5xl leading-none tabular-nums sm:text-6xl ${TONE[zone.tone].text}`}
                  >
                    {acwr.ratio.toFixed(2)}
                  </span>
                  <span className="text-sm text-muted">
                    / {ACWR_TARGET_MAX.toFixed(2)} 목표
                  </span>
                </p>
                <ZoneGauge ratio={acwr.ratio} />
                <p className="text-xs leading-relaxed text-muted">{zone.advice}</p>
                <p className="border-t border-line pt-3 text-[11px] tabular-nums text-muted/70">
                  최근 7일 부하 {Math.round(acwr.acute)} · 평소 주당{' '}
                  {Math.round(acwr.chronic)} · 부하 = 투구수 × 강도
                </p>
              </>
            ) : (
              <>
                {/* 비율은 아직 못 내지만 최근 7일 부하는 실제로 계산된 값이다. */}
                <div>
                  <p className="text-[11px] text-muted">최근 7일 부하</p>
                  <p className="mt-1 flex items-baseline gap-2">
                    <span className="text-display text-5xl leading-none text-cream tabular-nums sm:text-6xl">
                      {Math.round(acwr.acute)}
                    </span>
                    <span className="text-xs text-muted">투구수 × 강도</span>
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-gold/60"
                      style={{
                        width: `${Math.min(100, (acwr.historyDays / CHRONIC_WINDOW_DAYS) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="text-[11px] tabular-nums text-muted/70">
                    기록 {acwr.historyDays}일 / {CHRONIC_WINDOW_DAYS}일
                  </p>
                </div>

                <p className="border-t border-line pt-3 text-xs leading-relaxed text-muted">
                  {hasRecords
                    ? `부하 지수는 최근 7일을 평소 4주 평균과 견줍니다. 아직 비교할 4주치가 없어 ${acwr.daysNeeded}일 더 쌓이면 표시됩니다.`
                    : '투구를 기록하면 이곳에 부하 지수가 표시됩니다.'}
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── 핵심 지표 4개 ───────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
        <StatCard
          label="최근 7일 투구수"
          value={current.totalPitches}
          unit="구"
          tone={
            current.totalPitches > previous.totalPitches * 1.3 ? 'warn' : 'neutral'
          }
          footer={
            <Delta
              percent={changeRate(current.totalPitches, previous.totalPitches)}
              invert
            />
          }
        />
        <StatCard
          label="최근 7일 구속"
          value={current.maxVelocity ?? '—'}
          unit="km/h 최고"
          footer={
            current.avgVelocity != null ? (
              <span className="text-xs text-muted">
                평균 {current.avgVelocity.toFixed(1)} km/h
              </span>
            ) : (
              <span className="text-xs text-muted/60">기록 없음</span>
            )
          }
        />
        <StatCard
          label="평균 투구 강도"
          value={current.activeDays ? current.avgIntensity.toFixed(1) : '—'}
          unit="/ 10"
          tone={intensityTone}
          footer={
            fatigue.length > 0 ? (
              <span className={`text-xs ${TONE.warn.text}`}>
                이틀 연속 과부하 {fatigue.length}회
              </span>
            ) : current.activeDays ? (
              <span className={`text-xs ${TONE.good.text}`}>연속 과부하 없음</span>
            ) : (
              <span className="text-xs text-muted/60">기록 없음</span>
            )
          }
        />
        <StatCard
          label="마지막 투구"
          value={restDays == null ? '—' : restDays === 0 ? '오늘' : restDays}
          unit={restDays == null || restDays === 0 ? '' : '일 전'}
          tone={restTone}
          footer={
            streak >= 3 ? (
              <span className={`text-xs ${TONE.warn.text}`}>
                최장 {streak}일 연투
              </span>
            ) : lastThrowKey ? (
              <span className="text-xs text-muted">
                최근 4주 최장 연투 {streak}일
              </span>
            ) : (
              <span className="text-xs text-muted/60">기록 없음</span>
            )
          }
        />
      </section>

      {/* ── 추이 + 최근 기록 ────────────────────────────────── */}
      <section className="grid gap-6 lg:grid-cols-[1fr_minmax(0,340px)]">
        {/* min-w-0이 없으면 그리드 안에서 캔버스가 카드를 밀어낼 수 있다. */}
        <div className="min-w-0 rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-cream">28일 투구 부하 추이</h2>
              <p className="mt-1 text-xs text-muted">
                막대 = 그날 투구수 · 선 = 7일 누적 부하
              </p>
            </div>
            <Link
              href="/report"
              className="text-xs text-muted transition-colors hover:text-gold"
            >
              상세 리포트 →
            </Link>
          </div>
          <LoadChart points={chartPoints} />
        </div>

        <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-base font-bold text-cream">최근 기록</h2>
            <Link
              href="/pitch-log"
              className="text-xs text-muted transition-colors hover:text-gold"
            >
              전체 →
            </Link>
          </div>

          {recent.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
              아직 기록이 없습니다
            </p>
          ) : (
            <ul className="space-y-3">
              {recent.map((log) => (
                <li
                  key={log.id}
                  className="rounded-xl border border-line bg-surface-2 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-cream tabular-nums">
                      {log.date.toISOString().slice(5, 10).replace('-', '/')}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted tabular-nums">
                      {log.pitchCount}구
                      <span className="text-line-strong">·</span>
                      강도 {log.intensity}
                      <span className="text-line-strong">·</span>
                      <span className="text-gold">{log.maxVelocity}</span>
                    </span>
                  </div>
                  {log.memo && (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">
                      {log.memo}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── 생년월일 안내 ───────────────────────────────────── */}
      {!user.birthDate && (
        <Link
          href="/profile"
          className="flex items-center gap-4 rounded-2xl border border-gold-dim/60 bg-gold/5 px-5 py-4 transition-colors hover:border-gold"
        >
          <UserCog className="h-5 w-5 shrink-0 text-gold" />
          <span className="min-w-0 flex-1 text-sm leading-relaxed text-cream/90">
            생년월일이 아직 등록되지 않았습니다. 나이에 맞는 안전한 투구수를
            계산하려면 필요합니다.
          </span>
          <span className="shrink-0 text-xs font-medium uppercase tracking-[0.2em] text-gold">
            입력 →
          </span>
        </Link>
      )}

      {/* ── 바로가기 ────────────────────────────────────────── */}
      <section className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-6">
        {[
          ...QUICK_LINKS,
          ...(user.role === 'ADMIN'
            ? [{ href: '/admin', label: '관리자', icon: Users } as const]
            : []),
        ].map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col items-center gap-2 bg-surface px-3 py-5 transition-colors hover:bg-surface-2"
          >
            <Icon className="h-4 w-4 text-muted transition-colors group-hover:text-gold" />
            <span className="text-xs text-muted transition-colors group-hover:text-cream">
              {label}
            </span>
          </Link>
        ))}
      </section>

      <p className="pb-2 text-center text-[11px] leading-relaxed text-muted/60">
        부하 지수는 훈련량 관리를 돕는 참고 지표입니다. 통증이 있다면 수치와 관계없이
        전문의와 상담하세요.
      </p>
    </div>
  );
}
