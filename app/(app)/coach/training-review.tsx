import { VOLUME_GROUPS, type VolumeGroupKey } from '@/lib/training-volume';
import type { ReviewWeek, TrainingReview } from '@/lib/report/training-review';

/**
 * 트레이닝 돌아보기 — 주별 흐름 · 부위 추이.
 *
 * 두 카드가 한 가지씩 답한다.
 *
 *   요즘 꾸준한가          주별 흐름
 *   빠뜨린 부위가 있나      부위 추이
 *
 * 둘 다 4주를 가로로 편다. '이번 주'만 보면 이번 주가 원래 그런 주인지 요즘
 * 계속 그런지 알 수가 없다.
 */

/** 막대를 꽉 채우는 기준 — 주 5일이면 충분히 한 주다 */
const FULL_DAYS = 5;

/** 2026-08-31 → 8/31 */
function shortDate(key: string) {
  const [, m, d] = key.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/* ───────────────────────────── 주별 흐름 ───────────────────────────── */

function WeekRow({ week, busiest }: { week: ReviewWeek; busiest: number }) {
  const empty = week.days === 0;
  return (
    <li className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span
          className={`text-sm font-semibold ${week.ago === 0 ? 'text-sky' : 'text-ink'}`}
        >
          {week.label}
        </span>
        <span className="text-[11px] text-muted/60">
          {shortDate(week.from)}–{shortDate(week.to)}
        </span>
        {empty ? (
          <span className="ml-auto text-xs text-muted/60">쉬었습니다</span>
        ) : (
          <span className="ml-auto flex items-baseline gap-1.5">
            <span className="text-display text-lg leading-none text-ink tabular-nums">
              {week.days}
            </span>
            <span className="text-xs text-muted">일</span>
            <span className="text-xs text-muted/60">
              · {week.minutes}분 · 운동 {week.count}개
              {week.intensity != null && ` · 강도 ${week.intensity}`}
            </span>
          </span>
        )}
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${
            empty ? '' : week.ago === 0 ? 'bg-sky' : 'bg-sky/45'
          }`}
          style={{
            width: `${Math.min(100, (week.days / Math.max(FULL_DAYS, busiest)) * 100)}%`,
          }}
        />
      </div>
    </li>
  );
}

/* ───────────────────────────── 부위 추이 ───────────────────────────── */

/**
 * 부위별 세트를 막대 하나로.
 *
 * 이번 주 것만 있을 때는 "암케어 4세트"가 많은 건지 적은 건지 알 수 없었다.
 * 4주를 나란히 두면 늘 그만큼 했는지, 이번 주만 빠졌는지가 보인다.
 *
 * 한동안 6줄 × 4열 숫자 표였다. 그런데 이 칸이 말하려는 것은 "무엇을 안 했나"인데
 * 숫자를 스물넉 칸 늘어놓으면 눈이 그것을 못 잡는다. 하체 19 · 코어 9 · 등 9 ·
 * 가슴 6 · 팔 7 · 암케어 6 이 하체 편중이라는 사실이 표에서는 안 읽혔다.
 *
 * 막대 하나로 줄인다. 길이가 4주 합계라 부위 사이의 균형이 그대로 보이고, 색의
 * 진하기가 주라서 언제 했는지도 같이 보인다. 옅은 쪽이 오래된 주다.
 *
 * 색을 네 가지 이름(sky-soft·sky·sky-strong…)으로 나누지 않고 한 색의 투명도로
 * 만든다. 어두운 화면에서는 그 이름들의 밝기 순서가 뒤집혀서, 3주 전이 이번 주보다
 * 밝아진다. 투명도는 양쪽에서 똑같이 '옅다 → 진하다'로 읽힌다.
 */
const WEEK_SHADE = ['bg-sky/25', 'bg-sky/45', 'bg-sky/70', 'bg-sky'] as const;

function PartTrend({ weeks }: { weeks: ReviewWeek[] }) {
  /* 오래된 주가 왼쪽 — 왼쪽에서 오른쪽으로 읽는 것이 시간 순이다 */
  const ordered = [...weeks].reverse();
  const rows: { key: VolumeGroupKey | 'armCare'; label: string; hint: string }[] = [
    ...VOLUME_GROUPS.map((g) => ({ key: g.key, label: g.label, hint: g.hint })),
    { key: 'armCare' as const, label: '암케어', hint: '어깨·팔꿈치 관리' },
  ];

  const setsOf = (week: ReviewWeek, key: VolumeGroupKey | 'armCare') =>
    key === 'armCare' ? week.armCare : (week.parts[key] ?? 0);

  const weekLabelOf = (ago: number) => (ago === 0 ? '이번 주' : `${ago}주 전`);

  /* 가장 많이 한 부위가 막대를 가득 채운다 — 부위끼리 견주는 것이 요점이다 */
  const totals = rows.map((r) => ordered.reduce((sum, w) => sum + setsOf(w, r.key), 0));
  const busiest = Math.max(...totals, 1);

  return (
    <div className="space-y-3">
      {/* 어느 진하기가 어느 주인지 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {ordered.map((w, i) => (
          <span
            key={w.ago}
            className="inline-flex items-center gap-1 text-[10px] text-muted"
          >
            <span className={`h-2 w-3 rounded-sm ${WEEK_SHADE[i]}`} />
            {weekLabelOf(w.ago)}
          </span>
        ))}
      </div>

      <ul className="space-y-2.5">
        {rows.map((row, ri) => {
          const values = ordered.map((w) => setsOf(w, row.key));
          const total = totals[ri];
          /* 4주 내내 하나도 안 한 부위는 그 사실이 곧 알림이다 */
          const untouched = total === 0;
          const breakdown = ordered
            .map((w, i) => `${weekLabelOf(w.ago)} ${values[i]}세트`)
            .join(', ');

          return (
            <li key={row.key}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13px] font-semibold text-ink">{row.label}</span>
                <span className="text-[11px] text-muted/70">{row.hint}</span>
                <span
                  className={`ml-auto text-display text-sm leading-none tabular-nums ${
                    untouched ? 'text-warn' : 'text-ink'
                  }`}
                >
                  {total}
                </span>
              </div>

              {/*
                막대 하나에 네 주를 이어 붙인다. 칸을 나눠 그리지 않는 것은
                합계 길이가 부위 사이의 균형이기 때문이다 — 나누면 그 길이가
                끊겨서 안 보인다.
              */}
              <div
                title={breakdown}
                aria-label={`${row.label} 4주 합계 ${total}세트 — ${breakdown}`}
                className={`mt-1.5 flex h-2.5 overflow-hidden rounded-full ${
                  untouched ? 'border border-dashed border-warn-line' : 'bg-surface-2'
                }`}
              >
                {values.map(
                  (sets, i) =>
                    sets > 0 && (
                      <span
                        key={ordered[i].ago}
                        className={WEEK_SHADE[i]}
                        style={{ width: `${(sets / busiest) * 100}%` }}
                      />
                    )
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ───────────────────────────── 묶음 ───────────────────────────── */

export function TrainingReviewCards({
  review,
  weeks: weekCount,
}: {
  review: TrainingReview;
  /** 주별 흐름과 부위 추이가 보는 주 수 */
  weeks: number;
}) {
  const { weeks } = review;
  const busiest = Math.max(...weeks.map((w) => w.days), 0);
  const anyTraining = weeks.some((w) => w.days > 0);

  return (
    <>
      {/* ── 주별 흐름 ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-surface px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-base font-bold text-ink">최근 {weekCount}주 운동</h2>
          <p className="text-xs text-muted">오늘부터 7일씩 거슬러 나눕니다</p>
        </div>

        {anyTraining ? (
          <ul className="mt-4 space-y-3.5">
            {weeks.map((w) => (
              <WeekRow key={w.ago} week={w} busiest={busiest} />
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm leading-relaxed text-muted">
            최근 {weekCount}주 동안 마쳤다고 표시한 운동이 없습니다.
            <br />
            트레이닝에서 운동을 마치고 눌러주시면 여기에 쌓입니다.
          </p>
        )}

        {/* 어떻게 나온 숫자인지 — 안 적어두면 그냥 믿거나 그냥 무시한다 */}
        <p className="mt-3 text-[11px] leading-relaxed text-muted/70">
          날 수는 운동을 하나라도 마쳤다고 표시한 날입니다. 시간은 운동마다 정해진
          세트당 시간(수행 + 세트 사이 휴식)에 실제로 한 세트를 곱해 더한 값이고, 강도는
          그 주에 적은 값의 평균입니다. 부하 지수는 시간이 아니라 세트로 세므로 이
          시간과는 다른 숫자입니다.
        </p>
      </section>

      {/* ── 부위 추이 ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-surface px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-base font-bold text-ink">부위별 세트 추이</h2>
          <p className="text-xs text-muted">주마다 몇 세트씩 했는지</p>
        </div>

        {anyTraining ? (
          <>
            <div className="mt-4">
              <PartTrend weeks={weeks} />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted/70">
              {weekCount}주 내내 비어 있는 줄은 붉게 표시합니다. 지수는 &ldquo;지금
              많은가&rdquo;를 말하고 이 표는 &ldquo;무엇을 안 했나&rdquo;를 말합니다 —
              하체만 하고 암케어를 건너뛴 주와 골고루 한 주는 지수가 같습니다.
            </p>
          </>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm leading-relaxed text-muted">
            아직 쌓인 세트가 없습니다.
          </p>
        )}
      </section>
    </>
  );
}
