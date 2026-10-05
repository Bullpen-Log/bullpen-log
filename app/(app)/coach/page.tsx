import { Suspense } from 'react';
import { requireUser } from '@/lib/dal';
import { toDateKey } from '@/lib/pitch-stats';
import { PageHeading } from '@/components/ui';
import { BackLink } from '@/components/back-link';
import { AnalysisSkeleton } from '@/app/(app)/today/analysis-block';
import { AnalysisView } from '@/app/(app)/today/analysis-view';
import { loadPitchHistory, readDateParam } from '@/app/(app)/today/history';
import { readCoachView } from './tabs';
import { AnalysisBody } from './analysis-body';

/**
 * 분석 · 그래프 — 홈의 '분석 · 그래프 더 보기'(2026-10-05 홈 정리).
 *
 * 한동안 분석은 홈 캘린더 밑에 늘 떠 있었다(그 전에는 이 주소의 '분석' 탭). 사용자: "주구절절 작은 글씨로 잡다한
 * 정보가 많아서 읽어볼지 모르겠다 · 너무 길어지는 건 싫다" → 홈에는 달라진 것만 문장으로(하이라이트) 남기고,
 * 분석 칸(리포트 · 투구 · 트레이닝)과 그래프는 지운 것 없이 이 화면으로 옮겼다.
 *
 * 주소: ?view=report|pitch|training(처음 펼 칸 — 없으면 투구. 리포트는 AI 를 꺼 둔 동안 '멈췄어요'라 첫 칸으로 두지
 * 않는다), ?date=YYYY-MM-DD(그날 분석 — 홈 그날 칸의 '그날 분석'). 예전 홈 주소(/today?analysis=…)도 여기로 온다.
 */
export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const view = readCoachView(params.view);
  const date = readDateParam(params.date);

  return (
    <div className="stack-page">
      <BackLink href="/today">홈</BackLink>
      <PageHeading title="분석 · 그래프" />
      <Suspense fallback={<AnalysisSkeleton />}>
        <AnalysisSection view={view} date={date} />
      </Suspense>
    </div>
  );
}

async function AnalysisSection({
  view,
  date,
}: {
  view: ReturnType<typeof readCoachView>;
  date: string | null;
}) {
  const user = await requireUser();
  const today = toDateKey(new Date());
  const h = await loadPitchHistory(user);
  return (
    <AnalysisBody
      today={today}
      initialDate={date ?? today}
      initialTab={view}
      todayReport={
        <Suspense fallback={<AnalysisSkeleton />}>
          <AnalysisView user={user} date={today} today={today} tab="report" />
        </Suspense>
      }
      earliest={`${h.loadedFrom}-01`}
      logs={h.logs}
      trainingByDay={h.training}
      nutritionByDay={h.nutritionByDay}
      checkinByDay={h.checkinByDay}
      weightByDay={h.weightByDay}
    />
  );
}
