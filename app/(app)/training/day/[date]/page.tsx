import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireUser } from '@/lib/dal';
import { trainingDay } from '@/lib/report/training-history';
import { toDateKey } from '@/lib/pitch-stats';
import { DayExercises } from './day-exercises';

/**
 * 그날의 운동 기록 — 한 페이지.
 *
 * 투구 일지와 같은 이유로 창에서 페이지로 옮겼다. 운동은 하루에 열 개가 넘게
 * 나오는 날이 있어서, 작은 창 안에서는 위아래로 굴리다가 어디까지 봤는지
 * 놓치기 쉬웠다.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 2026-08-24 → 8월 24일 (월) */
function spokenDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`;
}

/** 2026-08-24 → 2026년 8월 */
function spokenMonth(key: string) {
  const [y, m] = key.split('-').map(Number);
  return `${y}년 ${m}월`;
}

export default async function TrainingDayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!DATE_RE.test(date)) notFound();

  // 없는 날짜(2026-02-31 같은 것)는 Date 가 조용히 다음 달로 넘긴다. 되돌려 찍어 본다.
  const at = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== date) {
    notFound();
  }

  const user = await requireUser();
  const detail = await trainingDay(user.id, date);
  const todayKey = toDateKey(new Date());

  const count = detail.exercises.length;
  const empty = count === 0 && detail.intensity == null;

  return (
    <div className="space-y-6">
      <Link
        href="/training?view=history"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-sky"
      >
        <ArrowLeft className="h-4 w-4" />
        {spokenMonth(date)} 운동 기록
      </Link>

      <div className="border-b border-line pb-6">
        <h1 className="text-heading text-[1.75rem] leading-[1.15] text-ink sm:text-[2.25rem]">
          {spokenDate(date)}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {empty ? '이 날은 운동 기록이 없습니다' : `운동 ${count}개`}
        </p>
      </div>

      {/* 그날 어땠는지 먼저 — 목록보다 이쪽을 다시 읽으러 온다 */}
      {detail.intensity != null && (
        <div className="rounded-2xl border border-sky-soft/40 bg-sky/[0.04] px-5 py-4">
          <p className="text-sm font-bold text-ink">운동 강도 {detail.intensity}/10</p>
          {detail.memo ? (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/90">
              {detail.memo}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">남긴 메모가 없습니다.</p>
          )}
        </div>
      )}

      {empty ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm leading-relaxed text-muted">
          이 날은 운동 기록이 없습니다.
          {date === todayKey && (
            <>
              <br />
              <Link href="/training" className="font-semibold text-sky underline">
                오늘 탭
              </Link>
              에서 남길 수 있습니다.
            </>
          )}
        </p>
      ) : (
        <DayExercises date={date} detail={detail} />
      )}
    </div>
  );
}
