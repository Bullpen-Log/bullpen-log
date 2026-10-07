import { requireUser } from '@/lib/dal';
import { toDateKey } from '@/lib/pitch-stats';
import { PageHeading } from '@/components/ui';
import { BackLink } from '@/components/back-link';
import { AnalysisView } from '@/app/(app)/today/analysis-view';
import { loadPitchHistory, readDateParam } from '@/app/(app)/today/history';
import { readCoachView } from './tabs';
import { AnalysisBody } from './analysis-body';

/**
 * 분석 · 그래프 — 홈의 '분석 · 그래프 더 보기'(2026-10-05 홈 정리).
 *
 * 한동안 분석은 홈 캘린더 밑에 늘 떠 있었다(그 전에는 이 주소의 '분석' 탭). 사용자: "주구절절 작은 글씨로 잡다한
 * 정보가 많아서 읽어볼지 모르겠다 · 너무 길어지는 건 싫다" → 홈에는 달라진 것만 문장으로(하이라이트) 남기고,
 * 분석 칸(투구 · 트레이닝 — 리포트 칸은 2026-10-07 AI 를 빼며 지웠다)과 그래프는 이 화면으로 옮겼다.
 *
 * 주소: ?view=pitch|training(처음 펼 칸 — 없으면 투구), ?date=YYYY-MM-DD(그날 분석 — 홈 그날 칸의 '그날 분석').
 * 예전 홈 주소(/today?analysis=…)도 여기로 온다.
 *
 * 한 번에 다 그려 보낸다(2026-10-06 "화면 전환 중 로딩 화면이 깨진다"). 예전에는 화면 뼈대 → 제목 + 분석 뼈대 →
 * 분석 칸이 뜬 뒤 따로 받아 온 내용으로 세 번 바뀌었다. 이제 기다리는 동안은 같은 모양의 loading.tsx 하나, 다 오면
 * 처음 펼 칸까지 함께 바뀐다.
 */
export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const view = readCoachView(params.view);
  const user = await requireUser();
  const today = toDateKey(new Date());
  const date = readDateParam(params.date) ?? today;
  const h = await loadPitchHistory(user);

  return (
    <div className="stack-page">
      <BackLink href="/today">홈</BackLink>
      <PageHeading title="분석 · 그래프" />
      <AnalysisBody
        today={today}
        initialDate={date}
        initialTab={view}
        initialView={<AnalysisView user={user} date={date} today={today} tab={view} />}
        earliest={`${h.loadedFrom}-01`}
        logs={h.logs}
        trainingByDay={h.training}
        nutritionByDay={h.nutritionByDay}
        checkinByDay={h.checkinByDay}
        weightByDay={h.weightByDay}
      />
    </div>
  );
}
