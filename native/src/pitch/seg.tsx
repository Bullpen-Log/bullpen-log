import { Segmented } from '~/shell/heading';
import { RECORDS_PATH } from '~/records/intent';

/** 기록 화면의 껍데기 주소(웹에는 없다 — 앱 화면만, app/index.tsx pressTab · goTab). 약속은 records/intent.ts 한 곳 */
export { RECORDS_PATH };

const OPTIONS = [
  { value: '/videos', label: '투구' },
  { value: RECORDS_PATH, label: '기록' },
] as const;

/**
 * 투구 탭 맨 위 [투구 | 기록] 고르개(2026-11-01, docs/designs/ai-coach.md U11) — 사이트가 옛 탭(판 14)을 보낼 때만 쓴다.
 * 판 15 탭부터는 기록이 제 하단 탭이라(홈 · 코치 · 기록 · 투구 …, 2026-11-25) 두 화면 모두 이 고르개를 숨긴다.
 * 두 화면은 판 넘기기의 이웃 판이라(app/index.tsx PAGER_KEYS) 고르면 옆으로 미끄러진다. 투구 탭을 누르면 늘 투구부터(기억은 안 함).
 */
export function PitchSeg({ value, onTab }: { value: '/videos' | typeof RECORDS_PATH; onTab: (href: string) => void }) {
  return <Segmented label="투구 · 기록" options={OPTIONS} value={value} onChange={(v) => v !== value && onTab(v)} />;
}
