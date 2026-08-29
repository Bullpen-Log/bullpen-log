import Link from 'next/link';
import {
  ACWR_TARGET_MAX,
  ACWR_ZONES,
  CHRONIC_WINDOW_DAYS,
  describeRatio,
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
 * 걱정스러운 정도. 큰 쪽이 위로 온다.
 *
 * '낮음'은 위험하지 않지만 '적정'보다는 할 말이 있다 — 회복 중이거나
 * 기록을 빠뜨렸을 수 있어서다. 지수를 아직 못 내면 맨 아래다.
 */
const CONCERN: Record<AcwrZone, number> = {
  danger: 3,
  caution: 2,
  low: 1,
  optimal: 0,
};

function concernOf(view: LoadView): number {
  return view.zone ? CONCERN[view.zone] : -1;
}

/** 지수를 크게 보여주는 쪽 */
function Primary({ view }: { view: LoadView }) {
  const zone = view.zone ? ACWR_ZONES[view.zone] : null;

  return (
    <div className="space-y-4 px-6 py-7 sm:px-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
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
          <p className="text-xs leading-relaxed text-muted">{view.advice}</p>
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

/** 나머지 하나 — 한 줄로 */
function Secondary({ view }: { view: LoadView }) {
  const zone = view.zone ? ACWR_ZONES[view.zone] : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line px-6 py-4 sm:px-8">
      <span className="text-sm font-medium text-ink">{view.name} 부하</span>
      {view.ratio != null && zone ? (
        <>
          <span
            className={`text-display text-xl leading-none tabular-nums ${TONE[zone.tone].text}`}
          >
            {view.ratio.toFixed(2)}
          </span>
          <StatusChip tone={zone.tone}>{zone.label}</StatusChip>
          <span className="text-xs text-muted">{view.meaning}</span>
        </>
      ) : (
        <span className="text-xs text-muted">
          {view.hasRecords && view.daysNeeded > 0
            ? `기록 ${view.historyDays}일 / ${CHRONIC_WINDOW_DAYS}일 · ${view.daysNeeded}일 더 필요`
            : view.emptyHint}
        </span>
      )}
    </div>
  );
}

export function LoadPanel({
  pitching,
  training,
  /** 최근 28일 중 투구 기록이 빠진 날 수 */
  missingDays,
  missingWarningAt,
}: {
  pitching: LoadView;
  training: LoadView;
  missingDays: number;
  missingWarningAt: number;
}) {
  /*
   * 걱정스러운 쪽을 위로. 같으면 투구가 위로 간다 —
   * 투수에게 팔은 다른 부위와 다르다.
   */
  const [primary, secondary] =
    concernOf(training) > concernOf(pitching)
      ? [training, pitching]
      : [pitching, training];

  return (
    <section className="bg-spotlight overflow-hidden rounded-3xl border border-line bg-surface">
      <Primary view={primary} />
      <Secondary view={secondary} />

      {/*
        기록이 빠진 날이 많으면 지수가 실제보다 낮게 나온다.
        낮은 숫자는 "더 던져도 된다"는 뜻으로 읽히므로 그냥 두면 안 된다.
      */}
      {missingDays >= missingWarningAt && (
        <p className="border-t border-warn-line bg-warn-bg px-6 py-3 text-[11px] leading-relaxed text-warn sm:px-8">
          최근 {CHRONIC_WINDOW_DAYS}일 중 <strong>{missingDays}일</strong>은 투구
          기록이 없어 안 던진 날로 계산했습니다. 실제로 던진 날이 있으면{' '}
          <Link href="/pitch-log" className="underline">
            투구 일지
          </Link>
          에서 추가해주세요. 지수가 실제보다 낮게 나오고 있을 수 있습니다.
        </p>
      )}

      {/* 어떻게 나온 숫자인지 — 안 적어두면 그냥 믿거나 그냥 무시한다 */}
      <div className="px-6 pb-4 sm:px-8">
        <LoadIndexHelp
          acute={pitching.acute}
          chronic={pitching.chronic}
          activeZone={pitching.zone ?? undefined}
          training={{ acute: training.acute, chronic: training.chronic }}
        />
      </div>
    </section>
  );
}
