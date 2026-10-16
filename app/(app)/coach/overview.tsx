import { Speed } from '@/components/speed';
import { estimateDailyLoad } from '@/lib/baseline';
import { LOOKBACK_DAYS } from '@/lib/report/gather';
import {
  CHRONIC_WINDOW_DAYS,
  buildDateRange,
  buildDateRangeOffset,
  acwrTrend,
  computeAcwr,
  pitchLoadByDay,
  countMissingDays,
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
import { LoadPanel, type LoadView } from './load-panel';
import { Delta, StatCard, TONE, type Tone } from './parts';
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
 *   뒷받침 셋      — 이번 주 투구 / 마지막 투구 / 최고 구속
 *
 * 28일 추이 그래프 · 지표 설명 · 생년월일 안내는 2026-10-14 걷었다(사용자 "너무 조잡해 · 중요한 내용만") — 추이는 옆의
 * 그래프(투구수 · 최고 구속)가 같은 것을 보인다.
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
  return Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export type OverviewLog = {
  date: string;
  sessionType: string;
  pitchCount: number;
  intensity: number;
  /** 체감 강도 5~100%(2판 D2). 옛 기록 · 쉰 날은 null — groupByDay(intensityOf)가 intensity 로 메운다 */
  effortPct?: number | null;
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
}: {
  /**
   * 최근 기록. 화면이 쓰는 만큼만 온다(today/analysis-view.tsx 의 LOOKBACK_DAYS).
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
  const acwrFrom = toDateKey(new Date(today.getTime() - LOOKBACK_DAYS * 86400000));
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
  const streak = longestThrowStreak(byDay, last28);

  /* 쉰 날(0구) 기록은 던진 날이 아니다 — 예전에는 오늘 '휴식'을 남기면 마지막 투구가 '오늘'로 떴다 */
  const lastThrowKey = [...byDay.values()]
    .filter((d) => d.pitchCount > 0)
    .map((d) => d.dateKey)
    .sort()
    .at(-1);
  const restDays = lastThrowKey ? daysSince(lastThrowKey, todayKey) : null;

  const hasRecords = totalRecords > 0;
  /*
   * 최근 28일 중 기록이 아예 없는 날.
   * 쉰 날을 '휴식'으로 적어 둔 것은 여기 들어가지 않는다 — 그건 진짜 0이다.
   */
  const missingDays = countMissingDays(byDay, last28);

  const restTone: Tone =
    restDays == null
      ? 'neutral'
      : restDays === 0
        ? 'warn'
        : restDays >= 7
          ? 'info'
          : 'good';

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
      ? '지수는 최근 부하를 평소 부하와 견주는 값이에요. 비교할 기준이 아직 없어요.'
      : '투구를 남기면 부하 지수가 나와요.',
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
        ? '평소 운동량과 견줄 기준이 아직 없어요. 내 정보에서 평소 웨이트 횟수를 답하면 바로 나와요.'
        : '트레이닝에서 운동을 마쳤다고 표시하면 여기에 나와요.',
  };

  return (
    <div className="stack-block">
      {/* ── 투구 ────────────────────────────────────────────── */}
      {view === 'pitch' && (
        <>
          <LoadPanel
            which="pitching"
            view={pitchingView}
            missingDays={missingDays}
            missingWarningAt={MISSING_DAYS_WARNING}
            throwStreak={streak}
          />

          {/* 셋을 늘 한 줄로(휴대폰도 — 세로로 쌓으면 숫자 셋이 화면 한 장을 차지했다, 2026-10-14) */}
          <section className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line">
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
                  <span className="text-xs text-muted">최장 연투 {streak}일</span>
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
              /*
               * 숫자와 단위를 한 조각으로 넘긴다. 단위는 브라우저에만 있는
               * 값이라 서버가 그리는 이 화면은 알 수 없어서, 그 한 조각만
               * 화면 쪽 부품(Speed)에 맡긴다.
               */
              value={bestVelocity ? <Speed kmh={bestVelocity.value} /> : '—'}
              unit=""
              footer={
                bestVelocity ? (
                  /* 목표 구속은 2026-10-10 부터 사용자가 적지 않는다 — 나중에 앱이 계산해 보여 준다 */
                  <span className="text-xs text-muted">
                    {`${formatShortDate(bestVelocity.date)} 기록`}
                  </span>
                ) : (
                  <span className="text-xs text-muted/60">
                    스피드건이 없으면 비워두세요
                  </span>
                )
              }
            />
          </section>

        </>
      )}

      {/* ── 트레이닝 ────────────────────────────────────────── */}
      {/*
        나머지는 페이지가 낸다(training-review.tsx).

        예전에는 여기에 '이번 주 운동' 카드와 '이번 주 부위별 세트'가 있었다.
        둘 다 최근 4주 카드와 부위 추이 표에 그대로 들어가 있어서, 남겨 두면
        같은 숫자를 두 번 보여주게 된다.
      */}
      {view === 'training' && <LoadPanel which="training" view={trainingView} />}
    </div>
  );
}
