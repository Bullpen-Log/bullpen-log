'use server';

import type { ReactNode } from 'react';
import { getCurrentUser } from '@/lib/dal';
import { toDateKey } from '@/lib/pitch-stats';
import { AnalysisView } from '@/app/(app)/today/analysis-view';
import { isAnalysisTab } from '@/app/(app)/today/analysis-tabs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 홈 분석 칸 — 고른 날·칸의 분석을 서버에서 그려 돌려준다.
 *
 * 숫자만 보내고 화면에서 그리지 않는 이유: 분석 부품(부하 지수·추이·돌아보기)이
 * 서버에서 셈하도록 짜여 있고, 셈에 쓰는 코드 일부는 서버에서만 돈다. 같은 부품을
 * 화면용으로 한 벌 더 만들면 두 벌이 어긋난다. 그린 결과를 그대로 보낸다.
 *
 * 읽기만 한다 — 아무것도 저장하지 않고, 화면을 새로 고치지도 않는다.
 */
export async function analysisFor(date: string, tab: string): Promise<ReactNode> {
  const user = await getCurrentUser();
  if (!user) {
    return <Notice>로그인이 풀렸어요. 다시 로그인하면 분석을 볼 수 있어요.</Notice>;
  }
  const today = toDateKey(new Date());
  if (!DATE_RE.test(date) || date > today || !isAnalysisTab(tab)) {
    return <Notice>이 날의 분석은 볼 수 없어요.</Notice>;
  }
  return <AnalysisView user={user} date={date} today={today} tab={tab} />;
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-line px-5 py-10 text-center text-sm text-muted">
      {children}
    </p>
  );
}
