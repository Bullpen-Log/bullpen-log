import type { requireUser } from '@/lib/dal';
import { REVIEW_WEEKS } from '@/lib/report/training-review';
import { loadAnalysisCards } from '@/lib/report/analysis-data';
import { StatsOverview } from '@/app/(app)/coach/overview';
import { TrainingReviewCards } from '@/app/(app)/coach/training-review';
import { GoodDaysCard } from '@/app/(app)/coach/good-days';
import type { AnalysisTab } from './analysis-tabs';
import { Highlights } from './highlights';

/**
 * 홈 분석 칸의 속 — 고른 날 기준의 분석. 서버에서 그린다.
 *
 * 분석 탭(app/(app)/coach)의 부품을 그대로 쓴다. 다른 것은 기준일이다. 분석 탭은 늘
 * 오늘로 셈했지만, 여기는 캘린더에서 고른 날로 셈한다 — 그날까지의 기록으로, 그날
 * 부하 지수·추이·돌아보기가 어땠는지를 본다.
 *
 * 처음 칸은 coach/page.tsx 가 함께 그려 보내고, 다른 날·칸은 분석 칸이 바꿀 때마다
 * app/actions/analysis.tsx 가 그려 돌려준다. 읽기 · 셈은 아이폰 앱 분석 화면과 같은 lib/report/analysis-data.ts.
 */

type User = Awaited<ReturnType<typeof requireUser>>;

export async function AnalysisView({
  user,
  date,
  today,
  tab,
}: {
  user: User;
  /** 기준일 (YYYY-MM-DD) */
  date: string;
  today: string;
  tab: AnalysisTab;
}) {
  return <LoadView user={user} date={date} today={today} tab={tab} />;
}

/* ─────────────────────────── 투구 · 트레이닝 ─────────────────────────── */

/**
 * 부하와 추이 — 그날까지의 기록으로 셈한다.
 *
 * 투구: 하이라이트 · 부하 지수 · 이번 주 · 마지막 투구 · 개인 최고 구속 · 잘 던진 날.
 * 트레이닝: 하이라이트 · 운동 부하 지수 · 최근 4주.
 *
 * 2026-10-14 사용자 "너무 조잡해 · 중요한 내용만": 투구의 28일 추이(옆 그래프와 겹침) · 기간별 기록(투구량 · 강도 · 코멘트 ·
 * 메모) · 지표 설명을 걷고, 트레이닝의 '투구와 운동' 격자를 최근 4주 카드의 두 숫자로 줄였다.
 */
async function LoadView({
  user,
  date,
  today,
  tab,
}: {
  user: User;
  date: string;
  today: string;
  tab: AnalysisTab;
}) {
  const { highlights, overview, review, goodDays } = await loadAnalysisCards(user, date, today, tab);

  return (
    <div className="stack-block">
      {highlights.length > 0 && <Highlights items={highlights} />}
      <StatsOverview view={tab} overview={overview} />

      {tab === 'training' && review && (
        <TrainingReviewCards review={review} weeks={REVIEW_WEEKS} />
      )}
      {tab === 'pitch' && goodDays && <GoodDaysCard result={goodDays} />}

      <p className="text-center text-xs leading-relaxed text-muted/70">
        부하 지수는 훈련량 관리를 돕는 참고 지표예요. 통증이 있다면 수치와 관계없이
        전문의와 상담하세요.
      </p>
    </div>
  );
}
