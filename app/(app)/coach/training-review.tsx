import type {
  ReviewDay,
  ReviewWeek,
  TrainingReview,
} from '@/lib/report/training-review';

/**
 * 트레이닝 돌아보기 — 주별 흐름 · 투구와 운동.
 *
 * 분석의 트레이닝 칸이 보는 것은 둘이다.
 *
 *   얼마나 했나            주별 흐름
 *   던진 만큼 챙겼나        투구와 운동
 */

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

/* ──────────────────────────── 투구와 운동 ──────────────────────────── */

/**
 * 던진 날 옆에 운동한 날을 겹쳐 놓는다.
 *
 * 한동안 이 자리가 '부위별 세트 추이'였다. 그런데 이 앱을 쓰는 사람은 투구를
 * 먼저 적고 운동은 나중에 적는다 — 넉 달치를 세어 보니 던진 날은 스물셋인데
 * 운동을 마쳤다고 누른 날은 셋이었다. 그 상태에서 부위별 세트는 무엇을 그려도
 * 빈 표였고, 빈 표는 아무 말도 안 한다.
 *
 * 같은 빈칸이라도 던진 날 옆에 놓으면 그 자체로 할 말이 된다 — "열세 번 던지는
 * 동안 암케어를 한 번도 안 했다". 세트 표가 절대 할 수 없던 말이고, 투구와
 * 운동을 한곳에 적는 이 앱만 할 수 있는 말이다.
 *
 * 암케어를 따로 한 줄 뺀다. 운동 안에 섞어 두면 '운동은 했으니 됐다'로 읽히는데,
 * 던지는 사람에게 어깨·팔꿈치 관리는 다른 운동으로 대신할 수 있는 것이 아니다.
 */

/** 던진 날이 이만큼 되는데 암케어가 하나도 없으면 짚어 준다 */
const ARM_CARE_ALERT_DAYS = 3;

/** 한 줄 — 스물여덟 칸을 주마다 끊어 놓는다 */
function DayStrip({
  label,
  weeks,
  isOn,
  describe,
}: {
  label: string;
  weeks: ReviewDay[][];
  isOn: (day: ReviewDay) => boolean;
  describe: (day: ReviewDay) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-11 shrink-0 text-[11px] font-semibold text-ink">{label}</span>
      {weeks.map((week, i) => (
        <span key={i} className="flex flex-1 gap-0.5">
          {week.map((day) => (
            <span
              key={day.date}
              title={`${day.date} — ${describe(day)}`}
              className={`h-4 flex-1 rounded-sm ${
                isOn(day) ? 'bg-sky' : 'bg-surface-2'
              }`}
            />
          ))}
        </span>
      ))}
    </div>
  );
}

function PitchTraining({
  review,
  weeks: weekCount,
}: {
  review: TrainingReview;
  weeks: number;
}) {
  const { days, totals } = review;

  /* 주 단위로 끊는다 — 스물여덟 칸을 한 줄로 늘어놓으면 어디가 어느 주인지 모른다 */
  const weeks = Array.from({ length: weekCount }, (_, i) =>
    days.slice(i * 7, i * 7 + 7)
  );

  /*
   * 던진 날이 어느 정도 있는데 암케어가 하나도 없을 때만 짚는다.
   *
   * 던진 적이 없으면 안 챙긴 것이 아니라 챙길 일이 없었던 것이다. 그때까지
   * 붉게 두면 경고가 늘 켜져 있게 되고, 늘 켜진 경고는 아무 뜻이 없다.
   */
  const armCareMissing =
    totals.pitchedDays >= ARM_CARE_ALERT_DAYS && totals.armCareDays === 0;

  const counts: { label: string; value: number; alert?: boolean }[] = [
    { label: '던진 날', value: totals.pitchedDays },
    { label: '운동한 날', value: totals.trainedDays },
    { label: '암케어 한 날', value: totals.armCareDays, alert: armCareMissing },
  ];

  return (
    <div className="space-y-4">
      {/* 숫자 셋 — 격자를 보기 전에 요점을 먼저 말한다 */}
      <div className="grid grid-cols-3 gap-2">
        {counts.map((c) => (
          <div
            key={c.label}
            className={`rounded-xl border px-3 py-2.5 ${
              c.alert ? 'border-warn-line bg-warn-bg' : 'border-line bg-surface-2'
            }`}
          >
            <p className="text-[11px] text-muted">{c.label}</p>
            <p
              className={`text-display mt-0.5 text-xl leading-none tabular-nums ${
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
        <p className="rounded-xl border border-warn-line bg-warn-bg px-4 py-3 text-xs leading-relaxed text-warn">
          최근 {weekCount}주 동안 {totals.pitchedDays}일 던졌는데 암케어 기록이
          없습니다. 암케어는 던진 뒤 어깨와 팔꿈치를 관리하는 운동입니다.
        </p>
      )}

      {/* 격자 — 언제 던지고 언제 챙겼는지 */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-11 shrink-0" />
          {weeks.map((_, i) => {
            const ago = weekCount - 1 - i;
            return (
              <span
                key={i}
                className={`flex-1 text-center text-[10px] ${
                  ago === 0 ? 'text-sky' : 'text-muted'
                }`}
              >
                {ago === 0 ? '이번 주' : `${ago}주 전`}
              </span>
            );
          })}
        </div>

        <DayStrip
          label="투구"
          weeks={weeks}
          isOn={(d) => d.pitches > 0}
          describe={(d) => (d.pitches > 0 ? `${d.pitches}구` : '안 던짐')}
        />
        <DayStrip
          label="운동"
          weeks={weeks}
          isOn={(d) => d.trained}
          describe={(d) => (d.trained ? '운동함' : '운동 안 함')}
        />
        <DayStrip
          label="암케어"
          weeks={weeks}
          isOn={(d) => d.armCare}
          describe={(d) => (d.armCare ? '암케어함' : '암케어 안 함')}
        />
      </div>
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

      {/* ── 투구와 운동 ───────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-surface px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-base font-bold text-ink">투구와 운동</h2>
          <p className="text-xs text-muted">던진 날과 챙긴 날을 나란히</p>
        </div>

        <div className="mt-4">
          <PitchTraining review={review} weeks={weekCount} />
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-muted/70">
          칸 하나가 하루입니다. 짚으면 그날 몇 구를 던졌는지 나옵니다. 운동은
          &lsquo;마침&rsquo;을 누른 날만 셉니다 — 했는데 안 눌렀으면 빈칸으로 남습니다.
          암케어를 따로 뺀 것은 던지는 사람에게 어깨·팔꿈치 관리가 다른 운동으로
          대신되지 않기 때문입니다.
        </p>
      </section>
    </>
  );
}
