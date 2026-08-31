import Link from 'next/link';
import {
  ACWR_TARGET_MAX,
  ACWR_ZONES,
  CHRONIC_WINDOW_DAYS,
  describeRatio,
  formatShortDate,
  zoneOf,
  type AcwrTrendPoint,
  type AcwrZone,
} from '@/lib/pitch-stats';
import { LoadIndexHelp, StatusChip, TONE, ZoneGauge } from './parts';

/**
 * 부하 지수 둘 — 투구와 운동.
 *
 * 합치지 않는다. 합치려면 투구수를 분으로 바꿔야 하는데 구당 몇 초인지를 재본
 * 적이 없다. 대신 나란히 둔다 — 지수는 '평소 대비 몇 배'라 단위가 없어서
 * 그대로 견줄 수 있다.
 *
 * 걱정스러운 쪽을 크게 보여준다. 이 화면을 여는 이유가 "지금 조심할 게 있나"라
 * 조심할 쪽이 먼저 눈에 들어와야 한다. 둘 다 괜찮은 날에는 투구가 크게 나온다 —
 * 투수에게 팔은 다른 부위와 다르다.
 */

export type LoadView = {
  /** '투구' 또는 '운동' */
  name: string;
  /** 무엇을 재는 값인지 한 줄로 */
  what: string;
  /** 지수. 아직 못 내면 null */
  ratio: number | null;
  zone: AcwrZone | null;
  /** 지수를 못 낼 때 — 며칠 쌓였고 며칠 더 필요한지 */
  historyDays: number;
  daysNeeded: number;
  /** 문진 추정치가 섞여 있는가 */
  estimated: boolean;
  realWeight: number;
  /** 기록이 하나라도 있는가 */
  hasRecords: boolean;
  /** 지수를 못 낼 때 대신 보여줄 안내 */
  emptyHint: string;
  /** 지금 계산되고 있는 급성·만성 부하 — "어떻게 나온 숫자인가"에 쓴다 */
  acute: number;
  chronic: number;
  /**
   * 이 구간에서 무엇을 하라는 조언.
   *
   * 투구와 운동이 다르다. 투구 쪽 문구를 운동에 그대로 쓰면 "투구량을 줄이세요"가
   * 운동 부하 밑에 붙는다 — 운동을 많이 한 사람에게 던지는 것을 줄이라는 말이 된다.
   */
  advice: string;
  /** 최근 2주 지수 흐름. 요일 때문에 오르내리는 것을 보여주려고 함께 낸다. */
  trend: AcwrTrendPoint[];
  /**
   * 이 구간이 무슨 뜻인지 한 줄로.
   *
   * 조언과 같은 이유로 갈라 둔다. 예전에는 지수 구간표(ACWR_ZONES)의 문장을
   * 둘 다 썼는데, 그 문장이 투구용이라 운동 부하 밑에 "던지고 있습니다"가
   * 붙었다.
   */
  meaning: string;
};

/**
 * 이 날 수 이상 쉬는 날 없이 던졌으면 지수 옆에 알린다.
 *
 * 사흘은 흔하다 — 그것까지 알리면 잔소리가 되어 결국 아무도 안 읽는다.
 * 일주일을 하루도 안 쉬었으면 그때부터는 말할 값어치가 있다.
 */
const STREAK_WARNING = 7;

/**
 * 최근 2주 지수 흐름.
 *
 * 지수 하나만 크게 보여주면 그 값이 요일 때문에 오르내린다는 것을 알 수가
 * 없다. 같은 훈련을 12주 반복한 선수도 오늘이 목요일이냐 일요일이냐에 따라
 * 0.79 와 1.25 를 오간다 — 목요일에는 '낮음'으로 떨어져 "복귀할 때는 조금씩
 * 올리세요"가 뜬다. 8주째 똑같이 훈련해 온 사람에게.
 *
 * 계산은 그대로 둔다. 이 방식은 급증을 빨리 잡아내려고 고른 것이고 실제로 잘
 * 잡는다. 대신 흐름을 옆에 둬서, 오늘이 낮아도 선이 평평하면 그게 보이게 한다.
 */
function TrendLine({ trend }: { trend: AcwrTrendPoint[] }) {
  const points = trend.filter((p) => p.ratio != null);
  // 이틀 이하로는 선이라 할 것이 없다.
  if (points.length < 3) return null;

  const W = 100;
  const H = 26;
  /* 0.5~2.0 을 세로로 편다. 구간 경계(0.8·1.3)가 눈금 노릇을 한다. */
  const LO = 0.5;
  const HI = 2.0;
  const y = (r: number) =>
    H - ((Math.min(HI, Math.max(LO, r)) - LO) / (HI - LO)) * H;
  const x = (i: number) => (i / (trend.length - 1)) * W;

  const path = trend
    .map((p, i) => (p.ratio == null ? null : `${x(i)},${y(p.ratio)}`))
    .filter((v): v is string => v != null)
    .join(' ');

  const last = trend[trend.length - 1];
  const lastZone = last.ratio != null ? zoneOf(last.ratio) : null;

  return (
    <div className="rounded-xl border border-line bg-surface-2/40 px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium text-muted">최근 2주 흐름</p>
        <p className="text-[10px] tabular-nums text-muted/60">
          {formatShortDate(trend[0].dateKey)} — {formatShortDate(last.dateKey)}
        </p>
      </div>

      {/*
        가로를 꽉 채워야 이레 간격이 눈에 들어와서 preserveAspectRatio 를 끈다.
        그러면 그림이 가로로 늘어나므로 오늘 점은 SVG 안에 그리지 않고 위에
        얹는다 — 안에 넣으면 동그라미가 납작한 타원이 된다.
      */}
      <div className="relative mt-2 h-14">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-label={`최근 2주 부하 지수 흐름. ${points
            .map((p) => `${formatShortDate(p.dateKey)} ${p.ratio!.toFixed(2)}`)
            .join(', ')}`}
        >
          {/* 구간 경계 — 선이 어디를 지나는지 알려면 눈금이 있어야 한다 */}
          <line x1="0" y1={y(1.3)} x2={W} y2={y(1.3)}
            className="stroke-warn/50" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          <line x1="0" y1={y(0.8)} x2={W} y2={y(0.8)}
            className="stroke-line-strong" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          <polyline points={path} fill="none"
            className="stroke-sky" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"
            vectorEffect="non-scaling-stroke" />
        </svg>

        {last.ratio != null && (
          <span
            aria-hidden
            className={`absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${
              lastZone ? TONE[ACWR_ZONES[lastZone].tone].dot : 'bg-sky'
            }`}
            style={{ left: '100%', top: `${(y(last.ratio) / H) * 100}%` }}
          />
        )}
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
        <span className="text-muted/70">점선 = 0.8 · 1.3 경계.</span> 요일에 따라
        오르내립니다 — 훈련이 그대로여도 던진 다음 날은 높고 이틀 쉰 날은 낮게
        나옵니다. 하루 값보다 흐름을 보세요.
      </p>
    </div>
  );
}

/** 지수를 크게 보여주는 쪽 */
function Primary({ view }: { view: LoadView }) {
  const zone = view.zone ? ACWR_ZONES[view.zone] : null;

  return (
    <div className="space-y-4 px-6 py-7 sm:px-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-normal text-muted">
            {view.name} 부하 지수
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted/70">{view.what}</p>
        </div>
        {zone ? (
          <StatusChip tone={zone.tone}>{zone.label}</StatusChip>
        ) : (
          <StatusChip tone="neutral">쌓는 중</StatusChip>
        )}
      </div>

      {view.ratio != null && view.zone && zone ? (
        <>
          <div>
            <p className="flex items-baseline gap-2">
              <span
                className={`text-display text-5xl leading-none tabular-nums sm:text-6xl ${TONE[zone.tone].text}`}
              >
                {view.ratio.toFixed(2)}
              </span>
              <span className="text-sm text-muted">
                / {ACWR_TARGET_MAX.toFixed(2)} 이하 권장
              </span>
            </p>
            <p className={`mt-1.5 text-sm font-medium ${TONE[zone.tone].text}`}>
              {describeRatio(view.ratio)}
              <span className="ml-1.5 font-normal text-muted">· {view.meaning}</span>
            </p>
            {/* 문진 추정치가 섞여 있는 동안에는 그 사실을 숨기지 않는다. */}
            {view.estimated && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface-2 px-2.5 py-1 text-[11px] text-muted">
                문진 추정 기준 · 실측 반영 {Math.round(view.realWeight * 100)}%
                <span className="text-muted/60">— 기록할수록 정확해집니다</span>
              </p>
            )}
          </div>

          <ZoneGauge ratio={view.ratio} activeZone={view.zone} />
          <p className="text-xs leading-relaxed text-muted">
            {view.advice}
            {/*
              평소치가 아직 문진 추정일 때는 조언을 단정하지 않는다.

              가입 첫날에 52구를 한 번 남겼더니 지수가 1.42(주의)가 되면서
              "이번 주는 투구수나 강도를 조금 낮추는 편이 안전합니다"가 떴다.
              실측이 7%뿐인데 처음 쓰는 사람에게는 앱이 "무리했다"고 말한
              것으로 읽힌다. 리포트를 쓰는 AI 에게는 이미 같은 조건에서
              단정하지 말라고 일러두고 있었는데, 규칙으로 내는 이 문장에는
              그 장치가 없었다.
            */}
            {view.estimated && (
              <span className="text-muted/70">
                {' '}다만 아직 평소치가 문진 추정이라 이 숫자는 크게 흔들립니다.
                며칠만 더 남기면 자리를 잡습니다.
              </span>
            )}
          </p>
          <TrendLine trend={view.trend} />
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-line bg-surface-2/40 px-4 py-4">
          <p className="text-sm font-medium text-ink">
            {view.hasRecords ? '아직 지수를 낼 수 없습니다' : '기록을 남기면 표시됩니다'}
          </p>
          {view.hasRecords && view.daysNeeded > 0 && (
            <div className="mt-3 space-y-1.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-sky/60"
                  style={{
                    width: `${Math.min(100, (view.historyDays / CHRONIC_WINDOW_DAYS) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-[11px] tabular-nums text-muted/70">
                기록 {view.historyDays}일 / {CHRONIC_WINDOW_DAYS}일 ·{' '}
                {view.daysNeeded}일 더 필요
              </p>
            </div>
          )}
          <p className="mt-3 text-xs leading-relaxed text-muted">{view.emptyHint}</p>
        </div>
      )}
    </div>
  );
}

/**
 * 부하 지수 카드 — 한 번에 하나.
 *
 * 예전에는 투구와 운동 지수를 한 카드에 위아래로 두고 걱정스러운 쪽을 위로
 * 올렸다. 분석이 칸으로 갈리면서 투구 지수는 투구 칸, 운동 지수는 트레이닝
 * 칸으로 갔다 — 각 칸이 자기 지수만 크게 보여준다.
 *
 * 기록 빠진 날과 연투 알림은 투구에만 붙는다. 운동에는 해당하는 것이 없다.
 */
export function LoadPanel({
  which,
  view,
  /** 최근 28일 중 투구 기록이 빠진 날 수. 투구 칸에서만 온다. */
  missingDays,
  missingWarningAt,
  /** 최근 4주 최장 연투 일수. 투구 칸에서만 온다. */
  throwStreak,
}: {
  which: 'pitching' | 'training';
  view: LoadView;
  missingDays?: number;
  missingWarningAt?: number;
  throwStreak?: number;
}) {
  const isPitching = which === 'pitching';

  return (
    <section className="bg-spotlight overflow-hidden rounded-3xl border border-line bg-surface">
      <Primary view={view} />

      {/*
        기록이 빠진 날이 많으면 지수가 실제보다 낮게 나온다.
        낮은 숫자는 "더 던져도 된다"는 뜻으로 읽히므로 그냥 두면 안 된다.
      */}
      {isPitching &&
        missingDays != null &&
        missingWarningAt != null &&
        missingDays >= missingWarningAt && (
        <p className="border-t border-warn-line bg-warn-bg px-6 py-3 text-[11px] leading-relaxed text-warn sm:px-8">
          최근 {CHRONIC_WINDOW_DAYS}일 중 <strong>{missingDays}일</strong>은 투구
          기록이 없어 안 던진 날로 계산했습니다. 실제로 던진 날이 있으면{' '}
          <Link href="/pitch-log" className="underline">
            투구 일지
          </Link>
          에서 추가해주세요. 지수가 실제보다 낮게 나오고 있을 수 있습니다.
        </p>
      )}

      {/*
        지수는 '평소와 견준' 값이라, 늘 많이 던져온 사람은 높게 안 나온다.
        한 달을 하루도 안 쉬고 던져도 1.13 '적정'이 뜬다. 큰 글씨로 '적정'을
        보고 나면 한참 아래 작은 카드에 있는 연투 숫자는 눈에 안 들어온다.
        그래서 지수 옆에 붙인다.
      */}
      {isPitching && throwStreak != null && throwStreak >= STREAK_WARNING && (
        <p className="border-t border-warn-line bg-warn-bg px-6 py-3 text-[11px] leading-relaxed text-warn sm:px-8">
          최근 4주에 <strong>{throwStreak}일 연속</strong>으로 던진 구간이 있습니다.
          지수는 평소와 견준 값이라 늘 많이 던져온 사람은 높게 나오지 않습니다 —
          숫자와 별개로 쉬는 날을 넣는 것이 좋습니다.
        </p>
      )}

      {/* 어떻게 나온 숫자인지 — 안 적어두면 그냥 믿거나 그냥 무시한다 */}
      <div className="px-6 pb-4 sm:px-8">
        <LoadIndexHelp
          which={which}
          acute={view.acute}
          chronic={view.chronic}
          activeZone={view.zone ?? undefined}
        />
      </div>
    </section>
  );
}
