'use server';

import { appNow } from '@/lib/clock';
import { getCurrentUser } from '@/lib/dal';
import { readDateParam } from '@/app/(app)/today/history';
import { toDateKey } from '@/lib/pitch-stats';
import { loadAppAnalysisData, type AppAnalysis } from '@/lib/report/analysis-data';

/**
 * 아이폰 앱(native/src/app/analysis.tsx)의 투구 분석 · 트레이닝 분석을 열 때 — 웹 분석 화면(/coach?view=…&date=…)과 같은 카드 · 그래프
 * 재료(lib/report/analysis-data.ts). 웹처럼 분석은 잠그지 않는다(lib/feature-locks.ts 가 /coach 를 안 막는다).
 * view 는 'pitch' | 'training'(모르면 투구), date 는 YYYY-MM-DD 이고 오늘 뒤면 오늘(없으면 오늘). /api/rpc/app-analysis.loadAppAnalysis 로 부른다.
 */
export async function loadAppAnalysis(
  view: string,
  date: string | null
): Promise<({ ok: true } & AppAnalysis) | { ok: false; to: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, to: '/login' };
  const today = toDateKey(appNow());
  const kind = view === 'training' ? 'training' : 'pitch';
  const asked = typeof date === 'string' ? readDateParam(date) : null;
  const day = asked && asked <= today ? asked : today;
  return { ok: true, ...(await loadAppAnalysisData(user, kind, day, today)) };
}
