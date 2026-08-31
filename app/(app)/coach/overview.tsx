import type { ReactNode } from 'react';
import Link from 'next/link';
import { UserCog } from 'lucide-react';
import { estimateDailyLoad } from '@/lib/baseline';
import { LOOKBACK_DAYS } from '@/lib/report/gather';
import {
  CHRONIC_WINDOW_DAYS,
  TWO_DAY_INTENSITY_LIMIT,
  buildDateRange,
  buildDateRangeOffset,
  acwrTrend,
  computeAcwr,
  pitchLoadByDay,
  countMissingDays,
  countSessionTypes,
  dailyLoad,
  findFatigueWindows,
  formatShortDate,
  groupByDay,
  longestThrowStreak,
  MISSING_DAYS_WARNING,
  summarize,
  toDateKey,
} from '@/lib/pitch-stats';
import {
  TRAINING_ADVICE,
  TRAINING_MEANING,
  type TrainingLoad,
} from '@/lib/training-load';
import { ACWR_ZONES } from '@/lib/pitch-stats';
import { TrendChart, type TrendPoint } from './trend-chart';
import { LoadPanel, type LoadView } from './load-panel';
import { PartVolumeCard } from './part-volume';
import { Delta, MetricHelp, StatCard, TONE, type Tone } from './parts';
import type { CoachView } from './tabs';

/**
 * 분석 화면 윗부분 — 지금 몸이 어떤 상태인지.
 *
 * 예전에는 여기에 프로필 카드(이름·나이·키·최근 7일 막대·누적 건수)와 구속
 * 카드가 따로 있었고, 그 밑에 지표 넷과 차트가 또 있었다. 구속만 세 군데에
 * 나왔다. 볼 것이 많으면 아무것도 안 보이는 셈이라, 하나만 크게 두고 나머지는
 * 뒷받침으로 내렸다.
 *
 *   지금 조심할 것 — 투구·운동 부하 지수 (걱정스러운 쪽이 크게)
 *   뒷받침 넷      — 이번 주 투구 / 이번 주 운동 / 마지막 투구 / 최고 구속
 *   28일 추이
 *
 * 프로필 카드는 뺐다. 이름과 나이는 이 화면을 열 때 알고 싶은 것이 아니다.
 * 구속 카드도 뺐다 — 스피드건이 없는 사용자가 대부분이라 크게 둘 값이 아니다.
 *
 * 아래에 이어지는 리포트와 같은 자료를 쓰므로 두 부분이 서로 다른 말을 하지 않는다.
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
  training,
  bestVelocity,
  user,
  today,
  totalRecords,
  view,
  tabs,
}: {
  /**
   * 최근 기록. 화면이 쓰는 만큼만 온다(coach/page.tsx 의 PAGE_LOOKBACK_DAYS).
   * 전체 기간이 필요한 개인 최고 구속은 따로 받는다.
   */
  logs: OverviewLog[];
  /** 전체 기간 개인 최고 구속. 한 번도 안 적었으면 null */
  bestVelocity: { value: number; date: string } | null;
  /** 운동 부하. 투구와 합치지 않고 나란히 둔다. */
  training: TrainingLoad;
  user: OverviewUser;
  today: Date;
  /** 기록이 하나라도 있는지 판단할 전체 건수 */
  totalRecords: number;
  /** 어느 칸을 보고 있는가 */
  view: CoachView;
  /**
   * 칸을 고르는 줄.
   *
   * 부하 지수 바로 아래, 나머지 위에 놓여야 해서 여기서 그린다. 무엇을 그릴지는
   * 이 파일이 정할 일이 아니므로 받아서 끼운다.
   */
  tabs: ReactNode;
}) {
  const todayKey = toDateKey(today);
  const byDay = groupByDay(logs);

  const last7 = buildDateRange(7, today);
  const prev7 = buildDateRangeOffset(7, 7, today);
  const last28 = buildDateRange(CHRONIC_WINDOW_DAYS, today);

  const current = summarize(byDay, last7);
  const previous = summarize(byDay, prev7);
  // 가입 문진 추정치가 있으면 기록 첫날부터 지수가 나온다.
  const seedDailyLoad = estimateDailyLoad(user);
  /*
   * 부하 지수는 다른 화면과 같은 기간에서 낸다.
   *
   * 예전에는 이 화면만 기록 전부로 계산했다. 그러면 오래 쓴 사람에게 홈·트레이닝
   * (45일 기준)과 여기가 미세하게 다른 숫자를 보여준다. 같은 이름의 값이
   * 화면마다 다르면 어느 쪽을 믿어야 할지 알 수 없다.
   */
  const acwrFrom = toDateKey(
    new Date(today.getTime() - LOOKBACK_DAYS * 86400000)
  );
  const acwrByDay = groupByDay(
    logs.filter((l) => toDateKey(new Date(l.date)) >= acwrFrom)
  );
  const pitchLoads = pitchLoadByDay(acwrByDay);
  const acwr = computeAcwr(pitchLoads, today, { seedDailyLoad });
  /*
   * 최근 2주 지수 흐름. 지수 하나만 보여주면 그 값이 요일 때문에 오르내린다는
   * 것을 알 수가 없어서 함께 낸다.
   */
  const acwrHistory = acwrTrend(pitchLoads, today, 14, { seedDailyLoad });
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
  /*
   * 최근 28일 중 기록이 아예 없는 날.
   * 쉰 날을 '휴식'으로 적어 둔 것은 여기 들어가지 않는다 — 그건 진짜 0이다.
   */
  const missingDays = countMissingDays(byDay, last28);

  const restTone: Tone =
    restDays == null ? 'neutral' : restDays === 0 ? 'warn' : restDays >= 7 ? 'info' : 'good';

  /*
   * 부하 지수 둘. 합치지 않고 나란히 둔다 —
   * 투구는 '투구수 × 강도', 운동은 '분 × 강도'라 단위가 다르다.
   */
  const pitchingView: LoadView = {
    name: '투구',
    what: '지금 던지는 양이 평소보다 얼마나 많은지',
    ratio: acwr.ratio,
    zone: acwr.zone,
    historyDays: acwr.historyDays,
    daysNeeded: acwr.daysNeeded,
    estimated: acwr.estimated,
    realWeight: acwr.realWeight,
    acute: acwr.acute,
    chronic: acwr.chronic,
    advice: acwr.zone ? ACWR_ZONES[acwr.zone].advice : '',
    trend: acwrHistory,
    meaning: acwr.zone ? ACWR_ZONES[acwr.zone].meaning : '',
    hasRecords,
    emptyHint: hasRecords
      ? '지수는 최근 부하를 평소 부하와 견주는 값입니다. 비교할 기준이 아직 없습니다.'
      : '투구를 기록하면 이곳에 부하 지수가 표시됩니다.',
  };
  const trainingView: LoadView = {
    name: '운동',
    what: '지금 하는 운동량이 평소보다 얼마나 많은지',
    ratio: training.ratio,
    zone: training.zone,
    historyDays: training.historyDays,
    daysNeeded: training.daysNeeded,
    estimated: training.estimated,
    realWeight: training.realWeight,
    acute: training.acute,
    chronic: training.chronic,
    advice: training.zone ? TRAINING_ADVICE[training.zone] : '',
    trend: training.trend,
    meaning: training.zone ? TRAINING_MEANING[training.zone] : '',
    hasRecords: training.historyDays > 0,
    /*
     * 투구와 마찬가지로, 문진에 '평소 웨이트 빈도'를 답하면 첫날부터 나온다.
     * 안 답한 사람에게는 그 길이 있다는 것을 알려준다.
     */
    emptyHint:
      training.historyDays > 0
        ? '평소 운동량과 견줄 기준이 아직 없습니다. 내 정보에서 평소 웨이트 횟수를 답하면 바로 나옵니다.'
        : '트레이닝에서 운동을 마쳤다고 표시하면 여기에 나옵니다.',
  };

  return (
    <div className="space-y-6">
      {/* ── 지금 조심할 것 ──────────────────────────────────── */}
      <LoadPanel
        pitching={pitchingView}
        training={trainingView}
        missingDays={missingDays}
        missingWarningAt={MISSING_DAYS_WARNING}
        throwStreak={streak}
      />

      {tabs}

      {/* ── 투구 ────────────────────────────────────────────── */}
      {view === 'pitch' && (
      <>
      {/* 셋이라 두 칸으로 두면 남는 칸이 회색 덩이로 보인다 */}
      <section className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
        <StatCard
          label="이번 주 투구"
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
          label="마지막 투구"
          value={restDays == null ? '—' : restDays === 0 ? '오늘' : restDays}
          unit={restDays == null || restDays === 0 ? '' : '일 전'}
          tone={restTone}
          footer={
            /*
              이틀 연속 높은 강도로 던진 것이 연투 일수보다 먼저다.
              사흘 가볍게 던진 것보다 이틀 세게 던진 쪽이 팔에 남는다.
            */
            fatigue.length > 0 ? (
              <span className={`text-xs ${TONE.warn.text}`}>
                이틀 연속 과부하 {fatigue.length}회
              </span>
            ) : streak >= 3 ? (
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
        {/*
          구속은 크게 두지 않는다. 스피드건이 없어 못 적는 사용자가 대부분이라,
          큰 자리를 주면 대다수 화면에 빈칸이 크게 남는다. 적은 사람에게는
          여기서 개인 최고를 보여주고, 추이는 아래 그래프에서 본다.
        */}
        <StatCard
          label="개인 최고 구속"
          value={bestVelocity?.value ?? '—'}
          unit={bestVelocity ? 'km/h' : ''}
          footer={
            bestVelocity ? (
              <span className="text-xs text-muted">
                {user.targetVelocity
                  ? `목표 ${user.targetVelocity} km/h`
                  : `${formatShortDate(bestVelocity.date)} 기록`}
              </span>
            ) : (
              <span className="text-xs text-muted/60">스피드건이 없으면 비워두세요</span>
            )
          }
        />
      </section>

      {/* 지표가 어떻게 나오는 숫자인지 — 안 적어두면 그냥 믿거나 그냥 무시한다 */}
      <MetricHelp
        twoDayLimit={TWO_DAY_INTENSITY_LIMIT}
        show={['이번 주 투구', '마지막 투구', '개인 최고 구속']}
      />

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
          <span className="shrink-0 text-xs font-medium tracking-normal text-sky">
            입력 →
          </span>
        </Link>
      )}
      </>
      )}

      {/* ── 트레이닝 ────────────────────────────────────────── */}
      {view === 'training' && (
        <>
          <section className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line">
            {/*
              운동은 '몇 개 했나'가 아니라 '며칠·몇 분 했나'로 보여준다.
              부하를 시간으로 세기 때문에, 개수만으로는 그 숫자와 이어지지 않는다.
            */}
            <StatCard
              label="이번 주 운동"
              value={training.recentDays || '—'}
              unit={training.recentDays ? '일' : ''}
              footer={
                training.recentDays ? (
                  <span className="text-xs text-muted">
                    {training.recentMinutes}분 · 운동 {training.recentCount}개
                  </span>
                ) : (
                  <span className="text-xs text-muted/60">기록 없음</span>
                )
              }
            />
          </section>

          <MetricHelp
            twoDayLimit={TWO_DAY_INTENSITY_LIMIT}
            show={['이번 주 운동']}
          />

          {/*
            지수는 "지금 많은가"를 말하고 여기는 "무엇을 하고 무엇을 안 했나"를
            말한다. 지수 하나로는 하체만 잔뜩 하고 암케어를 건너뛴 주와 골고루
            한 주가 똑같아 보인다.
          */}
          <PartVolumeCard volume={training.volume} />
        </>
      )}

    </div>
  );
}
