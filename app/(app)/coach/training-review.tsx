import type { ReviewWeek, TrainingReview } from '@/lib/report/training-review';

/**
 * 트레이닝 돌아보기 — 최근 4주 한 장.
 *
 * 2026-10-14 사용자 "너무 조잡해 · 중요한 내용만 · 트레이닝에서 누르면 트레이닝만": 예전엔 '최근 4주 운동'(주마다 일 · 분 ·
 * 운동 수 · 강도 + 설명) 과 '투구와 운동'(던진 날 · 운동한 날 · 암케어 한 날 + 28칸 격자 + 설명) 두 장이었다. 이제 한 장 —
 * 위에 운동한 날 · 암케어 한 날 두 숫자, 밑에 주마다 운동한 날 막대. 투구 쪽 숫자(던진 날)는 투구 분석의 몫이라 뺐고, 던진 날이
 * 있는데 암케어가 없을 때만 한 줄로 짚는다(던지는 사람의 어깨 · 팔꿈치 관리는 다른 운동으로 대신할 수 없다).
 */

const FULL_DAYS = 5;

/** 던진 날이 이만큼 되는데 암케어가 하나도 없으면 짚어 준다 */
const ARM_CARE_ALERT_DAYS = 3;

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
        {empty ? (
          <span className="ml-auto text-xs text-muted/60">쉬었어요</span>
        ) : (
          <span className="ml-auto flex items-baseline gap-1.5">
            <span className="text-numeric text-lg leading-none text-ink tabular-nums">
              {week.days}
            </span>
            <span className="text-xs text-muted">일</span>
            <span className="text-xs text-muted">· {week.minutes}분</span>
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

/* ───────────────────────────── 묶음 ───────────────────────────── */

export function TrainingReviewCards({
  review,
  weeks: weekCount,
}: {
  review: TrainingReview;
  /** 보는 주 수 */
  weeks: number;
}) {
  const { weeks, totals } = review;
  const busiest = Math.max(...weeks.map((w) => w.days), 0);
  const anyTraining = weeks.some((w) => w.days > 0);
  /* 던진 적이 없으면 안 챙긴 것이 아니라 챙길 일이 없었던 것 — 그때는 짚지 않는다 */
  const armCareMissing =
    totals.pitchedDays >= ARM_CARE_ALERT_DAYS && totals.armCareDays === 0;
  const counts: { label: string; value: number; alert?: boolean }[] = [
    { label: '운동한 날', value: totals.trainedDays },
    { label: '암케어 한 날', value: totals.armCareDays, alert: armCareMissing },
  ];

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-(--block-pad)">
      <h2 className="text-base font-bold text-ink">최근 {weekCount}주</h2>

      <div className="grid grid-cols-2 gap-2">
        {counts.map((c) => (
          <div
            key={c.label}
            className={`rounded-xl border px-3 py-2.5 ${
              c.alert ? 'border-warn-line bg-warn-bg' : 'border-line bg-surface-2'
            }`}
          >
            <p className="text-xs text-muted">{c.label}</p>
            <p
              className={`text-numeric mt-0.5 text-xl leading-none tabular-nums ${
                c.alert ? 'text-warn' : 'text-ink'
              }`}
            >
              {c.value}
              <span className="ml-0.5 text-xs font-normal text-muted">일</span>
            </p>
          </div>
        ))}
      </div>

      {armCareMissing && (
        <p className="text-xs leading-relaxed text-warn">
          {totals.pitchedDays}일 던지는 동안 암케어 기록이 없어요.
        </p>
      )}

      {anyTraining ? (
        <ul className="space-y-3.5">
          {weeks.map((w) => (
            <WeekRow key={w.ago} week={w} busiest={busiest} />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl empty-well px-4 py-8 text-center text-sm leading-relaxed text-muted">
          최근 {weekCount}주 동안 마친 운동이 없어요.
        </p>
      )}
    </section>
  );
}
