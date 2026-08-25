import Link from 'next/link';
import { UserCog } from 'lucide-react';
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
  countMissingDays,
  countSessionTypes,
  dailyLoad,
  describeRatio,
  findFatigueWindows,
  formatShortDate,
  groupByDay,
  longestThrowStreak,
  MISSING_DAYS_WARNING,
  summarize,
  toDateKey,
} from '@/lib/pitch-stats';
import { buildVelocityStats } from '@/lib/velocity';
import { TrendChart, type TrendPoint } from './trend-chart';
import { VelocityCard } from './velocity-card';
import {
  Delta,
  LoadIndexHelp,
  MetricHelp,
  StatCard,
  StatusChip,
  TONE,
  WeekStrip,
  ZoneGauge,
  type Tone,
} from './parts';

/**
 * 분석 화면 윗부분 — 지금 몸이 어떤 상태인지.
 *
 * 예전에는 홈(대시보드)에 있었다. 그런데 홈은 입력(체크인)과 출력(부하·추이)이
 * 섞여 있었고, 정작 매일 해야 하는 기록은 다른 화면에 있었다. 그래서 하는 일
 * 기준으로 나눴다 — 오늘 할 일은 트레이닝 화면에, 돌아보는 것은 여기에.
 *
 * 아래에 이어지는 리포트(기간별 정리와 코멘트)와 같은 자료를 쓰므로 두 부분이
 * 서로 다른 말을 하지 않는다.
 */

/** 직전 기간 대비 변화율(%). 견줄 것이 없으면 null */
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

export type OverviewLog = {
  date: string;
  sessionType: string;
  pitchCount: number;
  intensity: number;
  maxVelocity: number | null;
  avgVelocity: number | null;
};

export type OverviewUser = {
  nickname: string;
  birthDate: Date | null;
  heightCm: number | null;
  targetVelocity: number | null;
  baselineFreq: string | null;
  baselineVolume: string | null;
  baselineIntensity: string | null;
};

export function StatsOverview({
  logs,
  user,
  today,
  totalRecords,
}: {
  /** 전체 기록. 개인 최고 구속은 최근 몇 주 안에만 있는 것이 아니다. */
  logs: OverviewLog[];
  user: OverviewUser;
  today: Date;
  /** 기록이 하나라도 있는지 판단할 전체 건수 */
  totalRecords: number;
}) {
  const todayKey = toDateKey(today);
  const velocity = buildVelocityStats(logs);
  const byDay = groupByDay(logs);

  const last7 = buildDateRange(7, today);
  const prev7 = buildDateRangeOffset(7, 7, today);
  const last28 = buildDateRange(CHRONIC_WINDOW_DAYS, today);

  const current = summarize(byDay, last7);
  const previous = summarize(byDay, prev7);
  // 가입 문진 추정치가 있으면 기록 첫날부터 지수가 나온다.
  const seedDailyLoad = estimateDailyLoad(user);
  const acwr = computeAcwr(byDay, today, { seedDailyLoad });
  const fatigue = findFatigueWindows(byDay, last28);
  /*
   * 최근 4주에 무엇을 하며 지냈는지.
   * 같은 800구라도 경기 위주였는지 불펜 위주였는지에 따라 몸에 남는 것이 다르다.
   */
  const sessionCounts = countSessionTypes(
    logs.map((l) => ({
      date: l.date,
      sessionType: l.sessionType,
      pitchCount: l.pitchCount,
    })),
    last28
  );
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

  const hasRecords = totalRecords > 0;
  const zone = acwr.zone ? ACWR_ZONES[acwr.zone] : null;
  /*
   * 최근 28일 중 기록이 아예 없는 날.
   * 쉰 날을 '휴식'으로 적어 둔 것은 여기 들어가지 않는다 — 그건 진짜 0이다.
   */
  const missingDays = countMissingDays(byDay, last28);

  const intensityTone: Tone =
    current.peakIntensity >= 9 ? 'warn' : current.activeDays > 0 ? 'good' : 'neutral';
  const restTone: Tone =
    restDays == null ? 'neutral' : restDays === 0 ? 'warn' : restDays >= 7 ? 'info' : 'good';

  return (
    <div className="space-y-6">
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
                  value: velocity.best ?? '—',
                  unit: 'km/h',
                },
                { label: '최근 7일', value: current.totalPitches, unit: '구' },
                { label: '누적 기록', value: totalRecords, unit: '건' },
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
                  {/*
                    기록이 빠진 날이 많으면 지수가 실제보다 낮게 나온다.
                    낮은 숫자는 "더 던져도 된다"는 뜻으로 읽히므로 그냥 두면 안 된다.
                  */}
                  {missingDays >= MISSING_DAYS_WARNING && (
                    <p className="mt-2 rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-[11px] leading-relaxed text-warn">
                      최근 {CHRONIC_WINDOW_DAYS}일 중 <strong>{missingDays}일</strong>은
                      기록이 없어 안 던진 날로 계산했습니다. 실제로 던진 날이 있으면{' '}
                      <Link href="/pitch-log" className="underline">
                        기록
                      </Link>
                      에서 추가해주세요. 지수가 실제보다 낮게 나오고 있을 수 있습니다.
                    </p>
                  )}

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

      {/* 지표가 어떻게 나오는 숫자인지 — 안 적어두면 그냥 믿거나 그냥 무시한다 */}
      <MetricHelp twoDayLimit={TWO_DAY_INTENSITY_LIMIT} />

      {/* ── 최근 28일 추이 ──────────────────────────────────── */}
      <div className="min-w-0 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="mb-5 min-w-0">
          <h2 className="text-base font-bold text-ink">최근 28일 추이</h2>
          {/*
            무엇을 하며 지냈는지 한 줄로 먼저 보여준다. 그래프는 얼마나
            던졌는지는 알려주지만 무엇을 했는지는 알려주지 않는다.
          */}
          {sessionCounts.length > 0 ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
              {sessionCounts.map((t, i) => (
                <span key={t.name} className="whitespace-nowrap">
                  {i > 0 && <span className="mr-1.5 text-line-strong">·</span>}
                  <span className="text-ink">{t.name}</span>{' '}
                  {t.pitches > 0 ? `${t.count}회 (${t.pitches}구)` : `${t.count}일`}
                </span>
              ))}
            </p>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-muted">
              보고 싶은 항목을 골라보세요.
            </p>
          )}
        </div>
        <TrendChart points={chartPoints} />
      </div>

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
