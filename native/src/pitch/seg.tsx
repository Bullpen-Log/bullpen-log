import { Segmented } from '~/shell/heading';

/** 기록 화면의 껍데기 주소(웹에는 없다 — 앱 화면만, app/index.tsx pressTab · goTab) */
export const RECORDS_PATH = '/records';

const OPTIONS = [
  { value: '/videos', label: '투구' },
  { value: RECORDS_PATH, label: '기록' },
] as const;

/**
 * 투구 탭 맨 위 [투구 | 기록] 고르개(2026-11-01, docs/designs/ai-coach.md U11) — 기록은 하단 탭에서 빠져 투구 탭 안으로 들어왔다.
 * 두 화면은 판 넘기기의 이웃 판이라(app/index.tsx PAGER_KEYS) 고르면 옆으로 미끄러진다. 투구 탭을 누르면 늘 투구부터(기억은 안 함).
 */
export function PitchSeg({ value, onTab }: { value: '/videos' | typeof RECORDS_PATH; onTab: (href: string) => void }) {
  return <Segmented label="투구 · 기록" options={OPTIONS} value={value} onChange={(v) => v !== value && onTab(v)} />;
}
