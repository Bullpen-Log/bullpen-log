'use server';

import { appNow } from '@/lib/clock';
import { getCurrentUser } from '@/lib/dal';
import { coachPaid } from '@/lib/coach-access';
import { readDateParam } from '@/app/(app)/today/history';
import { toDateKey } from '@/lib/pitch-stats';
import { loadAppAnalysisData, type AppAnalysis } from '@/lib/report/analysis-data';

/**
 * 아이폰 앱(native/src/app/analysis.tsx)의 투구 분석 · 트레이닝 분석을 열 때 — 웹 분석 화면(/coach?view=…&date=…)과 같은 카드 · 그래프
 * 재료(lib/report/analysis-data.ts). 첫 설정으로는 잠그지 않고(lib/feature-locks.ts 가 /coach 를 안 막는다) 유료(lib/coach-access.ts)만 본다.
 * view 는 'pitch' | 'training'(모르면 투구), date 는 YYYY-MM-DD 이고 오늘 뒤면 오늘(없으면 오늘). /api/rpc/app-analysis.loadAppAnalysis 로 부른다.
 */
export async function loadAppAnalysis(
  view: string,
  date: string | null
): Promise<({ ok: true } & AppAnalysis) | { ok: false; to: string; need?: 'paid' }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, to: '/login' };
  /*
   * 분석은 코치 탭의 리뷰라 유료만(docs/designs/ai-coach.md U10). 화면만 막으면 옛 앱 · 직접 부르기로 열린다.
   * need 를 모르는 옛 앱은 to 로 떠나 웹 /coach 의 소개를 본다(app/(app)/coach/page.tsx)
   */
  if (!(await coachPaid(user))) return { ok: false, to: '/coach', need: 'paid' };
  const today = toDateKey(appNow());
  const kind = view === 'training' ? 'training' : 'pitch';
  const asked = typeof date === 'string' ? readDateParam(date) : null;
  const day = asked && asked <= today ? asked : today;
  return { ok: true, ...(await loadAppAnalysisData(user, kind, day, today)) };
}
