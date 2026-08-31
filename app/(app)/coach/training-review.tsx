import { TrendingDown, TrendingUp } from 'lucide-react';
import { VOLUME_GROUPS, type VolumeGroupKey } from '@/lib/training-volume';
import type { ReviewWeek, TrainingReview } from '@/lib/report/training-review';

/**
 * 트레이닝 돌아보기 — 주별 흐름 · 부위 추이 · 무게 변화.
 *
 * 세 카드가 한 가지씩 답한다.
 *
 *   요즘 꾸준한가          주별 흐름
 *   빠뜨린 부위가 있나      부위 추이
 *   더 들게 되었나         무게 변화
 *
 * 셋 다 4주(무게는 8주)를 가로로 편다. '이번 주'만 보면 이번 주가 원래 그런
 * 주인지 요즘 계속 그런지 알 수가 없다.
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
 * 부위별 세트를 주마다 나란히.
 *
 * 이번 주 것만 있을 때는 "암케어 4세트"가 많은 건지 적은 건지 알 수 없었다.
 * 옆에 지난 3주가 있으면 늘 그만큼 했는지, 이번 주만 빠졌는지가 보인다.
 * 0인 칸을 흐리게 두지 않고 눈에 띄게 남기는 것이 요점이다.
 */
function PartTrend({ weeks }: { weeks: ReviewWeek[] }) {
  /* 오래된 주가 왼쪽 — 왼쪽에서 오른쪽으로 읽는 것이 시간 순이다 */
  const ordered = [...weeks].reverse();
  const rows: { key: VolumeGroupKey | 'armCare'; label: string; hint: string }[] = [
    ...VOLUME_GROUPS.map((g) => ({ key: g.key, label: g.label, hint: g.hint })),
    { key: 'armCare' as const, label: '암케어', hint: '어깨·팔꿈치 관리' },
  ];

  const setsOf = (week: ReviewWeek, key: VolumeGroupKey | 'armCare') =>
    key === 'armCare' ? week.armCare : (week.parts[key] ?? 0);

  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
      <table className="w-full min-w-[22rem] border-collapse text-sm">
        <thead>
          <tr>
            <th className="pb-2 text-left text-[11px] font-medium text-muted">
              부위
            </th>
            {ordered.map((w) => (
              <th
                key={w.ago}
                className={`pb-2 text-right text-[11px] font-medium ${
                  w.ago === 0 ? 'text-sky' : 'text-muted'
                }`}
              >
                {w.ago === 0 ? '이번 주' : `${w.ago}주 전`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const values = ordered.map((w) => setsOf(w, row.key));
            /* 4주 내내 하나도 안 한 부위는 그 사실이 곧 알림이다 */
            const untouched = values.every((v) => v === 0);
            return (
              <tr key={row.key} className="border-t border-line">
                <td className="py-2.5 pr-3">
                  <span className="block text-[13px] font-semibold text-ink">
                    {row.label}
                  </span>
                  <span className="block text-[11px] text-muted/70">{row.hint}</span>
                </td>
                {values.map((sets, i) => (
                  <td
                    key={ordered[i].ago}
                    className={`py-2.5 text-right tabular-nums ${
                      sets === 0
                        ? untouched
                          ? 'text-warn'
                          : 'text-line-strong'
                        : ordered[i].ago === 0
                          ? 'font-bold text-ink'
                          : 'text-muted'
                    }`}
                  >
                    {sets === 0 ? '—' : sets}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────────── 무게 변화 ───────────────────────────── */

function WeightRows({ weights }: { weights: TrainingReview['weights'] }) {
  return (
    <ul className="mt-4 space-y-3">
      {weights.map((w) => {
        const diff = Math.round((w.latestKg - w.firstKg) * 10) / 10;
        const up = diff > 0;
        const flat = diff === 0;
        return (
          <li
            key={w.exerciseId}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line pt-3 first:border-0 first:pt-0"
          >
            <span className="min-w-0 flex-1 text-[13px] font-semibold break-keep text-ink">
              {w.title}
            </span>
            <span className="flex items-baseline gap-1.5 tabular-nums">
              <span className="text-xs text-muted/60">{w.firstKg}</span>
              <span className="text-xs text-line-strong">→</span>
              <span className="text-display text-lg leading-none text-ink">
                {w.latestKg}
              </span>
              <span className="text-xs text-muted">kg</span>
            </span>
            <span
              className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums ${
                flat ? 'text-muted/60' : up ? 'text-sky-strong' : 'text-warn'
              }`}
            >
              {flat ? (
                '그대로'
              ) : (
                <>
                  {up ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" />
                  )}
                  {up ? '+' : ''}
                  {diff}kg
                </>
              )}
            </span>
            <span className="w-full text-[11px] text-muted/60">
              {shortDate(w.firstDate)} → {shortDate(w.latestDate)} · {w.records}번
              기록
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ───────────────────────────── 묶음 ───────────────────────────── */

export function TrainingReviewCards({
  review,
  weeks: weekCount,
  days,
}: {
  review: TrainingReview;
  /** 주별 흐름과 부위 추이가 보는 주 수 */
  weeks: number;
  /** 무게 변화가 보는 기간(일) */
  days: number;
}) {
  const { weeks, weights, hasAnyWeight } = review;
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
          날 수는 운동을 하나라도 마쳤다고 표시한 날입니다. 시간은 운동마다
          정해진 세트당 시간(수행 + 세트 사이 휴식)에 실제로 한 세트를 곱해 더한
          값이고, 강도는 그 주에 적은 값의 평균입니다. 부하 지수는 시간이 아니라
          세트로 세므로 이 시간과는 다른 숫자입니다.
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
              많은가&rdquo;를 말하고 이 표는 &ldquo;무엇을 안 했나&rdquo;를
              말합니다 — 하체만 하고 암케어를 건너뛴 주와 골고루 한 주는 지수가
              같습니다.
            </p>
          </>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm leading-relaxed text-muted">
            아직 쌓인 세트가 없습니다.
          </p>
        )}
      </section>

      {/* ── 무게 변화 ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-surface px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-base font-bold text-ink">무게 변화</h2>
          <p className="text-xs text-muted">최근 {days}일 · 톱세트 기준</p>
        </div>

        {weights.length > 0 ? (
          <>
            <WeightRows weights={weights} />
            <p className="mt-3 text-[11px] leading-relaxed text-muted/70">
              운동을 마칠 때 적은 &lsquo;가장 무거웠던 세트&rsquo;를 처음과 마지막으로
              견준 값입니다. 두 번 이상 적은 운동만 나옵니다.
            </p>
          </>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm leading-relaxed text-muted">
            {hasAnyWeight
              ? '무게를 적은 운동이 아직 하나뿐입니다. 같은 운동을 한 번 더 적으면 변화가 보입니다.'
              : '아직 적어둔 무게가 없습니다. 운동을 마칠 때 가장 무거웠던 세트를 적어두면 여기에서 변화를 봅니다.'}
          </p>
        )}
      </section>
    </>
  );
}
