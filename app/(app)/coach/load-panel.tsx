import Link from 'next/link';
import {
  ACWR_ZONES,
  CHRONIC_WINDOW_DAYS,
  describeRatio,
} from '@/lib/pitch-stats';
import { StatusChip, TONE } from './parts';
import { LoadTrend } from './load-trend';
import type { AnalysisOverview, LoadView } from '@/lib/report/analysis-overview';

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

/* LoadView(지수 한 장의 재료)와 경고 문턱은 lib/report/analysis-overview.ts 로 옮겼다 — 앱 분석 화면과 같은 값(2026-10-18) */

/** 지수를 크게 보여주는 쪽 */
function Primary({ view }: { view: LoadView }) {
  const zone = view.zone ? ACWR_ZONES[view.zone] : null;

  return (
    <div className="space-y-4 p-(--block-pad)">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-normal text-muted">
            {view.name} 부하 지수
          </p>
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
              {/* 큰 숫자는 검정 — 상태 색은 위 배지 · 밑 한 줄이 말한다(2026-10-16 디자인 점검 '색 줄이기') */}
              <span className="text-numeric text-5xl leading-none tabular-nums text-ink sm:text-6xl">
                {view.ratio.toFixed(2)}
              </span>
            </p>
            <p className={`mt-1.5 text-sm font-medium ${TONE[zone.tone].text}`}>
              {describeRatio(view.ratio)}
              <span className="ml-1.5 font-normal text-muted">· {view.meaning}</span>
            </p>
            {/* 문진 추정치가 섞여 있는 동안에는 그 사실을 숨기지 않는다 — 단정하지 않게 한 줄로 */}
            {view.estimated && (
              <p className="mt-2 text-xs text-muted">
                아직 기록이 적어 숫자가 크게 흔들려요. 한 달쯤 기록이 쌓이면 자리를 잡아요.
              </p>
            )}
          </div>

          {/* 최근 2주 흐름 — 건강 앱 그래프처럼(load-trend.tsx) */}
          <LoadTrend trend={view.trend} />
        </>
      ) : (
        <div className="rounded-xl empty-well px-4 py-4">
          <p className="text-sm font-medium text-ink">
            {view.hasRecords ? '아직 지수를 낼 수 없어요' : '기록을 남기면 표시돼요'}
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
              <p className="text-caption tabular-nums text-muted/70">
                기록 {view.historyDays}일 / {CHRONIC_WINDOW_DAYS}일 · {view.daysNeeded}
                일 더 필요
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
  /** 투구 칸 경고 — 기록 빠진 날 · 최장 연투(값이 있을 때만 띄운다, 문턱은 analysis-overview.ts). 투구 칸에서만 온다. */
  notices,
}: {
  which: 'pitching' | 'training';
  view: LoadView;
  notices?: AnalysisOverview['notices'];
}) {
  const isPitching = which === 'pitching';
  const missingDays = notices?.missingDays ?? null;
  const throwStreak = notices?.throwStreak ?? null;

  return (
    /* 평평한 흰 면 — 은은한 빛 그라데이션(bg-spotlight)은 AI 템플릿의 카드 같았다(2026-10-04) */
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <Primary view={view} />

      {/*
        기록이 빠진 날이 많으면 지수가 실제보다 낮게 나온다.
        낮은 숫자는 "더 던져도 된다"는 뜻으로 읽히므로 그냥 두면 안 된다.
      */}
      {isPitching && missingDays != null && (
          <p className="border-t border-warn-line bg-warn-bg px-(--block-pad) py-3 text-xs leading-relaxed text-warn">
            기록 없는 날이 {missingDays}일이라 지수가 낮게 나올 수 있어요.{' '}
            <Link href="/today" className="font-semibold text-sky-strong">
              투구 일지
            </Link>
            에 남겨 주세요.
          </p>
        )}

      {/*
        지수는 '평소와 견준' 값이라, 늘 많이 던져온 사람은 높게 안 나온다.
        한 달을 하루도 안 쉬고 던져도 1.13 '적정'이 뜬다. 큰 글씨로 '적정'을
        보고 나면 한참 아래 작은 카드에 있는 연투 숫자는 눈에 안 들어온다.
        그래서 지수 옆에 붙인다.
      */}
      {isPitching && throwStreak != null && (
        <p className="border-t border-warn-line bg-warn-bg px-(--block-pad) py-3 text-xs leading-relaxed text-warn">
          최근 4주에 {throwStreak}일 연속으로 던진 구간이 있어요. 지수가 높지 않아도
          쉬는 날을 넣어 주세요.
        </p>
      )}

    </section>
  );
}
