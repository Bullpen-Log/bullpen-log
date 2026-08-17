import Link from 'next/link';
import { Plus, UserCog } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { ageFromBirthDate } from '@/lib/profile';
import { estimateDailyLoad } from '@/lib/baseline';
import {
  ACWR_TARGET_MAX,
  ACWR_ZONES,
  CHRONIC_WINDOW_DAYS,
  TWO_DAY_INTENSITY_LIMIT,
  buildDateRange,
  buildDateRangeOffset,
  computeAcwr,
  dailyLoad,
  describeRatio,
  findFatigueWindows,
  formatShortDate,
  groupByDay,
  longestThrowStreak,
  summarize,
  toDateKey,
} from '@/lib/pitch-stats';
import { buildFacts } from '@/lib/report/facts';
import { buildVelocityStats } from '@/lib/velocity';
import { buildPitchPlan } from '@/lib/report/plan';
import { TrendChart, type TrendPoint } from './trend-chart';
import { VelocityCard } from './velocity-card';
import { CheckinCard, type CheckinData } from './checkin-card';
import {
  Delta,
  LoadIndexHelp,
  MetricHelp,
  StatCard,
  StatusChip,
  TodayPlanLine,
  TONE,
  WeekStrip,
  ZoneGauge,
  type Tone,
} from './parts';
import { pickCheckinParts } from '@/lib/checkin';
import { availableParts } from '@/lib/report/today-pick';
import { LogCalendar } from './log-calendar';
import { ReportSummaryCard, toReportSummary } from './report-summary';

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

  // 체크인에서 '오늘 하고 싶은 부위'로 고를 수 있는 목록.
  // 코드에 적어두지 않고 라이브러리에 실제로 있는 것만 보여준다.
  const libraryParts = availableParts(
    await prisma.exerciseVideo.findMany({ select: { id: true, bodyParts: true } })
  );

  // 가장 최근 리포트 한 건 — 홈에는 결론 한 줄만 얹는다.
  const latestReport = await prisma.aiReport.findFirst({
    where: { userId: user.id },
    orderBy: { asOf: 'desc' },
    select: { asOf: true, halted: true, haltReason: true, body: true },
  });

  const allTimeMax = await prisma.pitchLog.aggregate({
    where: { userId: user.id },
    _max: { maxVelocity: true },
    _count: true,
  });

  // 구속 추이는 전체 기록으로 본다 — 개인 최고는 70일 안에만 있는 게 아니다.
  const velocityLogs = await prisma.pitchLog.findMany({
    where: { userId: user.id },
    orderBy: { date: 'asc' },
    select: { date: true, maxVelocity: true, avgVelocity: true },
  });
  const velocity = buildVelocityStats(
    velocityLogs.map((l) => ({
      date: l.date.toISOString(),
      maxVelocity: l.maxVelocity,
      avgVelocity: l.avgVelocity,
    }))
  );

  // 오늘 마친 운동 수 — 대시보드에서 이어서 하도록 안내한다.
  const doneToday = await prisma.userExerciseLog.count({
    where: {
      userId: user.id,
      date: new Date(`${todayKey}T00:00:00.000Z`),
      completed: true,
    },
  });

  // 체크인은 오늘 카드에도, 오늘 계획 계산에도 쓰이므로 넉넉히 가져온다.
  // (카드 쪽은 시간대 차이를 감안해 최근 이틀 중에서 자기 날짜를 고른다.)
  const checkinSince = new Date(today);
  checkinSince.setDate(checkinSince.getDate() - 10);
  const allCheckins: CheckinData[] = (
    await prisma.dailyCheckin.findMany({
      where: { userId: user.id, date: { gte: checkinSince } },
      orderBy: { date: 'desc' },
    })
  ).map((c) => ({
    date: c.date.toISOString().slice(0, 10),
    ...pickCheckinParts(c),
    condition: c.condition,
    sleep: c.sleep,
    preferredParts: c.preferredParts,
  }));
  const recentCheckins = allCheckins.slice(0, 3);

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
  // 가입 문진 추정치가 있으면 기록 첫날부터 지수가 나온다.
  const seedDailyLoad = estimateDailyLoad(user);
  const acwr = computeAcwr(byDay, today, { seedDailyLoad });
  const fatigue = findFatigueWindows(byDay, last28);
  const streak = longestThrowStreak(byDay, last28);

  const age = user.birthDate ? ageFromBirthDate(user.birthDate, today) : null;
  const lastThrowKey = [...byDay.keys()].sort().at(-1);
  const restDays = lastThrowKey ? daysSince(lastThrowKey, todayKey) : null;

  // 그래프에서 고를 수 있는 네 가지를 한 번에 만들어 둔다.
  const chartPoints: TrendPoint[] = last28.map((key, i) => {
    const window = last28.slice(Math.max(0, i - 6), i + 1);
    const rollingLoad = window.reduce((sum, k) => {
      const day = byDay.get(k);
      return sum + (day ? dailyLoad(day) : 0);
    }, 0);
    const day = byDay.get(key);
    return {
      label: formatShortDate(key),
      pitches: day?.pitchCount ?? 0,
      intensity: day?.intensity ?? 0,
      // 안 던진 날은 null 이어야 선이 끊긴다. 0으로 두면 구속이 떨어진 것처럼 보인다.
      maxVelocity: day?.maxVelocity ?? null,
      rollingLoad,
    };
  });

  /*
   * 홈 달력용 요약. 투구 일지와 같은 모양이라야 두 화면이 같은 날을
   * 같게 표시한다. (강도 진하기, 영상 있는 날 점)
   */
  const calendarSummaries = logs.reduce<
    Record<string, { pitches: number; maxIntensity: number; hasVideo: boolean }>
  >((acc, log) => {
    const key = log.date.toISOString().slice(0, 10);
    const prev = acc[key] ?? { pitches: 0, maxIntensity: 0, hasVideo: false };
    acc[key] = {
      pitches: prev.pitches + log.pitchCount,
      maxIntensity: Math.max(prev.maxIntensity, log.intensity),
      hasVideo: prev.hasVideo || log.videoPaths.length > 0,
    };
    return acc;
  }, {});

  /*
   * 기록이 있는 가장 최근 달을 펴둔다. 이번 달이 비었는데 이번 달을 열면
   * 아무것도 없는 달력만 보인다.
   */
  const calendarMonth = (lastThrowKey ?? todayKey).slice(0, 7);

  const hasRecords = allTimeMax._count > 0;
  const zone = acwr.zone ? ACWR_ZONES[acwr.zone] : null;
  const recent = logs.slice(0, 4);

  // 오늘 뭘 하면 되는지 한 줄로 보여준다.
  // AI 코치 리포트와 같은 계산을 쓰므로 두 화면의 내용이 어긋나지 않는다.
  const todayPlan = hasRecords
    ? buildPitchPlan(
        buildFacts({
          nickname: user.nickname,
          age,
          heightCm: user.heightCm,
          baselineDailyLoad: seedDailyLoad,
          logs: logs.map((l) => ({
            date: l.date.toISOString(),
            pitchCount: l.pitchCount,
            intensity: l.intensity,
            maxVelocity: l.maxVelocity,
            avgVelocity: l.avgVelocity,
          })),
          checkins: allCheckins,
          memos: logs
            .filter((l) => l.memo?.trim())
            .slice(0, 5)
            .map((l) => ({
              date: l.date.toISOString().slice(0, 10),
              text: l.memo!.trim(),
            })),
          today,
        })
      )
    : null;

  // 인사말은 접속 시각에 맞춘다.
  const hour = today.getHours();
  const greeting =
    hour < 6
      ? '늦은 밤이네요'
      : hour < 12
        ? '좋은 아침입니다'
        : hour < 18
          ? '좋은 오후입니다'
          : '좋은 저녁입니다';
  const todayLabel = today.toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  const intensityTone: Tone =
    current.peakIntensity >= 9 ? 'warn' : current.activeDays > 0 ? 'good' : 'neutral';
  const restTone: Tone =
    restDays == null ? 'neutral' : restDays === 0 ? 'warn' : restDays >= 7 ? 'info' : 'good';

  return (
    <div className="space-y-6">
      {/* ── 인사 히어로 ─────────────────────────────────────── */}
      <section className="bg-hero rounded-2xl px-6 py-6 text-white sm:px-8 sm:py-7">
        <h1 className="text-2xl font-bold sm:text-3xl">
          {greeting}, {user.nickname} ⚡
        </h1>
        <p className="mt-1.5 text-sm text-white/85">
          {todayLabel}
          {restDays != null && ` · 마지막 투구 ${restDays === 0 ? '오늘' : `${restDays}일 전`}`}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/pitch-log"
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-sky-strong transition-colors hover:bg-white/90"
          >
            <Plus className="h-4 w-4" />
            투구 기록하기
          </Link>
          <Link
            href="/coach"
            className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/30"
          >
            🎯 오늘의 코칭 받기
          </Link>
        </div>
      </section>

      {/* ── 오늘 컨디션 체크인 ──────────────────────────────── */}
      <CheckinCard recent={recentCheckins} parts={libraryParts} />

      {/* ── 오늘 뭘 하면 되는지 한 줄 ───────────────────────── */}
      {todayPlan && <TodayPlanLine plan={todayPlan} />}

      {/* ── AI 리포트 요약 ──────────────────────────────────── */}
      <ReportSummaryCard report={toReportSummary(latestReport, todayKey)} />

      {/* ── AI 트레이닝 진행 상황 ───────────────────────────── */}
      <Link
        href="/today"
        className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4 transition-colors hover:border-sky-soft"
      >
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-tint text-xl"
        >
          ✅
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-ink">AI 트레이닝</span>
          <span className="block text-xs text-muted">
            {doneToday > 0
              ? `${doneToday}개 완료 — 이어서 하기`
              : allCheckins.some((c) => c.date === todayKey)
                ? '오늘 몸 상태에 맞춰 고른 운동을 확인하세요'
                : '오늘 고른 운동을 확인하세요 (체크인하면 몸 상태까지 반영됩니다)'}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-muted">
          →
        </span>
      </Link>

      {/* ── 프로필 + 현재 부하 지수 ─────────────────────────── */}
      <section className="bg-spotlight overflow-hidden rounded-3xl border border-line">
        <div className="grid gap-px bg-line lg:grid-cols-[1fr_minmax(0,420px)]">
          {/* 선수 정보 */}
          <div className="flex flex-col justify-between gap-7 bg-surface/80 px-6 py-8 sm:px-8 sm:py-9">
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-sky-soft/50 bg-sky/10 text-2xl font-bold text-sky">
                {user.nickname.slice(0, 1)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xl font-bold text-ink">
                  {user.nickname}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {[
                    age != null ? `만 ${age}세` : null,
                    user.heightCm ? `${user.heightCm}cm` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || (
                    <Link href="/profile" className="text-sky hover:underline">
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
                    <span className="text-display text-2xl leading-none text-ink tabular-nums">
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
                {/* 숫자만으로는 뜻을 알 수 없어 한 줄로 먼저 설명한다. */}
                <p className="mt-1 text-[11px] leading-relaxed text-muted/70">
                  지금 던지는 양이 평소보다 얼마나 많은지
                </p>
              </div>
              {zone ? (
                <StatusChip tone={zone.tone}>{zone.label}</StatusChip>
              ) : (
                <StatusChip tone="neutral">데이터 쌓는 중</StatusChip>
              )}
            </div>

            {acwr.ratio != null && acwr.zone && zone ? (
              <>
                <div>
                  <p className="flex items-baseline gap-2">
                    <span
                      className={`text-display text-5xl leading-none tabular-nums sm:text-6xl ${TONE[zone.tone].text}`}
                    >
                      {acwr.ratio.toFixed(2)}
                    </span>
                    <span className="text-sm text-muted">
                      / {ACWR_TARGET_MAX.toFixed(2)} 이하 권장
                    </span>
                  </p>
                  {/* 배수를 일상어로 바꿔 바로 읽히게 한다. */}
                  <p className={`mt-1.5 text-sm font-medium ${TONE[zone.tone].text}`}>
                    {describeRatio(acwr.ratio)}
                    <span className="ml-1.5 font-normal text-muted">
                      · {zone.meaning}
                    </span>
                  </p>
                  {/* 문진 추정치가 섞여 있는 동안에는 그 사실을 숨기지 않는다. */}
                  {acwr.estimated && (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface-2 px-2.5 py-1 text-[11px] text-muted">
                      문진 추정 기준 · 실측 반영 {Math.round(acwr.realWeight * 100)}%
                      <span className="text-muted/60">— 기록할수록 정확해집니다</span>
                    </p>
                  )}
                </div>

                <ZoneGauge ratio={acwr.ratio} activeZone={acwr.zone} />

                <p className="text-xs leading-relaxed text-muted">{zone.advice}</p>

                <LoadIndexHelp
                  acute={acwr.acute}
                  chronic={acwr.chronic}
                  activeZone={acwr.zone}
                />
              </>
            ) : (
              <>
                {/*
                  지수 자리에 다른 숫자를 크게 띄우면 그게 지수로 읽힌다.
                  그래서 여기서는 "아직 없음"을 분명히 하고,
                  지금 계산되는 원값은 아래에 따로 작게 둔다.
                */}
                <div className="rounded-xl border border-dashed border-line bg-surface-2/40 px-4 py-4">
                  <p className="text-sm font-medium text-ink">
                    {hasRecords ? '아직 지수를 낼 수 없습니다' : '기록을 남기면 표시됩니다'}
                  </p>

                  {hasRecords && (
                    <div className="mt-3 space-y-1.5">
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                        <div
                          className="h-full rounded-full bg-sky/60"
                          style={{
                            width: `${Math.min(100, (acwr.historyDays / CHRONIC_WINDOW_DAYS) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="text-[11px] tabular-nums text-muted/70">
                        기록 {acwr.historyDays}일 / {CHRONIC_WINDOW_DAYS}일 ·{' '}
                        {acwr.daysNeeded}일 더 필요
                      </p>
                    </div>
                  )}

                  <p className="mt-3 text-xs leading-relaxed text-muted">
                    {hasRecords
                      ? '지수는 최근 부하를 평소 부하와 견주는 값입니다. 비교할 기준이 아직 없습니다.'
                      : '투구를 기록하면 이곳에 부하 지수가 표시됩니다.'}
                  </p>

                  {/* 문진만 채우면 기다릴 필요가 없다는 걸 알려준다. */}
                  {seedDailyLoad == null && (
                    <Link
                      href="/profile"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-sky-soft/60 bg-sky/10 px-3 py-2 text-xs font-medium text-sky transition-colors hover:bg-sky/20"
                    >
                      평소 투구량 3문항 입력하고 바로 보기 →
                    </Link>
                  )}
                </div>

                {/* 지금 계산되는 값 — 지수와 헷갈리지 않게 작게, 이름을 붙여서 */}
                <div className="flex items-end justify-between gap-3 border-t border-line pt-3">
                  <div className="min-w-0">
                    <p className="text-[11px] text-ink">
                      최근 7일 부하
                      <span className="ml-1.5 text-muted/60">(지수 아님)</span>
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted/70">
                      던진 날 {current.activeDays}일 · 부하 = 투구수 × 강도
                    </p>
                  </div>
                  <span className="text-display shrink-0 text-2xl leading-none text-ink tabular-nums">
                    {Math.round(acwr.acute)}
                  </span>
                </div>

                {/* 지수가 아직 안 나와도 뭘 보게 될 건지는 미리 알 수 있어야 한다. */}
                <LoadIndexHelp acute={acwr.acute} chronic={acwr.chronic} />
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── 구속 (목표·추이·신기록) ─────────────────────────── */}
      <VelocityCard stats={velocity} target={user.targetVelocity} />

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

      <MetricHelp twoDayLimit={TWO_DAY_INTENSITY_LIMIT} />

      {/* ── 추이 + 최근 기록 ────────────────────────────────── */}
      <section className="grid gap-6 lg:grid-cols-[1fr_minmax(0,340px)]">
        {/* min-w-0이 없으면 그리드 안에서 캔버스가 카드를 밀어낼 수 있다. */}
        <div className="min-w-0 rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-ink">최근 28일 추이</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                보고 싶은 항목을 골라보세요.
              </p>
            </div>
            <Link
              href="/coach"
              className="text-xs text-muted transition-colors hover:text-sky"
            >
              AI 리포트 →
            </Link>
          </div>
          <TrendChart points={chartPoints} />
        </div>

        <div className="space-y-6">
          {/* 날짜를 누르면 그날 일지로 바로 넘어간다 */}
          <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-base font-bold text-ink">기록 달력</h2>
              <span className="text-xs text-muted">눌러서 일지 열기</span>
            </div>
            <LogCalendar
              summaries={calendarSummaries}
              initialMonth={calendarMonth}
            />
          </div>

          <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-base font-bold text-ink">최근 기록</h2>
            <Link
              href="/pitch-log"
              className="text-xs text-muted transition-colors hover:text-sky"
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
                    <span className="text-sm font-medium text-ink tabular-nums">
                      {log.date.toISOString().slice(5, 10).replace('-', '/')}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted tabular-nums">
                      {log.pitchCount}구
                      <span className="text-line-strong">·</span>
                      강도 {log.intensity}
                      <span className="text-line-strong">·</span>
                      <span className="text-sky">{log.maxVelocity}</span>
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
        </div>
      </section>

      {/* ── 생년월일 안내 ───────────────────────────────────── */}
      {!user.birthDate && (
        <Link
          href="/profile"
          className="flex items-center gap-4 rounded-2xl border border-sky-soft/60 bg-sky/5 px-5 py-4 transition-colors hover:border-sky"
        >
          <UserCog className="h-5 w-5 shrink-0 text-sky" />
          <span className="min-w-0 flex-1 text-sm leading-relaxed text-ink/90">
            생년월일이 아직 등록되지 않았습니다. 나이에 맞는 안전한 투구수를
            계산하려면 필요합니다.
          </span>
          <span className="shrink-0 text-xs font-medium uppercase tracking-[0.2em] text-sky">
            입력 →
          </span>
        </Link>
      )}

      <p className="pb-2 text-center text-[11px] leading-relaxed text-muted/60">
        부하 지수는 훈련량 관리를 돕는 참고 지표입니다. 통증이 있다면 수치와 관계없이
        전문의와 상담하세요.
      </p>
    </div>
  );
}
