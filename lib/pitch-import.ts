/**
 * 과거 투구 영상 가져오기 — 갤러리에서 고른 영상 여러 개를 '찍은 날짜'로 묶어 기록 폼 하나씩으로(순수, 시험 npm run pitch-import:test).
 *
 * 왜 있나: 앱 전에 찍어 둔 영상은 사진 앱에 쌓여 언제 · 어떤 느낌으로 던졌는지 못 찾는다(docs/designs/pitch-log-findability.md 2단계).
 * 날짜는 영상 머리에서 읽는다(lib/pitch-lab-file.ts readLabFileFacts): ① 아이폰 creationdate → ② mvhd 만든 시각 → ③ 파일의 lastModified
 * (iOS 사진 선택기는 '지금'을 줄 때가 있어 오늘이면 못 믿는다) → ④ 없음. ③ · ④ 는 '날짜를 확인하세요' 띠.
 * 같은 날은 GROUP_MAX(기록당 영상 상한, app/api/pitch-log MAX_VIDEOS)개씩 묶고, 날짜 없는 영상은 각각 제 묶음.
 * 틀린 날짜로 묶인 영상은 [따로](splitOut)로 제 묶음으로 뺀다 — 폰에 넣기 전 미리보기 단계라 지우고 다시 넣는 일이 없다(D9).
 */
import { toDateKey } from '@/lib/pitch-stats';

/** 기록 하나에 붙는 영상 상한 — app/api/pitch-log/route.ts MAX_VIDEOS 와 같다 */
export const GROUP_MAX = 2;

export type DateSource = 'apple' | 'mvhd' | 'file' | null;

export type ImportFacts = {
  startMs: number | null;
  timeSource: 'apple' | 'mvhd' | null;
} | null;

/** 영상 하나의 날짜 — 머리 시각이 있으면 그것, 없으면 파일 시각(오늘이면 못 믿어 없음으로) */
export function importDateOf(
  facts: ImportFacts,
  lastModified: number,
  nowMs: number
): { date: string | null; source: DateSource } {
  if (facts?.startMs != null && facts.timeSource) {
    return { date: toDateKey(new Date(facts.startMs)), source: facts.timeSource };
  }
  if (lastModified > 0 && lastModified <= nowMs) {
    const key = toDateKey(new Date(lastModified));
    if (key !== toDateKey(new Date(nowMs))) return { date: key, source: 'file' };
  }
  return { date: null, source: null };
}

export type ImportItem = {
  /** 고른 차례(0부터) — 묶음을 옮겨도 그대로 */
  id: number;
  name: string;
  date: string | null;
  source: DateSource;
};

export type ImportGroup = {
  key: string;
  /** 묶음의 날짜 — 없으면 폼에서 꼭 적는다 */
  date: string | null;
  items: ImportItem[];
};

/** 날짜를 믿기 어려운 영상인가 — '확인하세요' 띠 */
export function needsDateCheck(item: Pick<ImportItem, 'source'>): boolean {
  return item.source === 'file' || item.source === null;
}

/** 날짜순(오래된 것부터), 같은 날은 고른 차례 · max 개씩. 날짜 없는 것은 끝에 하나씩 */
export function groupItems(
  items: readonly ImportItem[],
  max = GROUP_MAX
): ImportGroup[] {
  const dated = items
    .filter((i) => i.date != null)
    .sort((a, b) => a.date!.localeCompare(b.date!) || a.id - b.id);
  const groups: ImportGroup[] = [];
  let run: ImportItem[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const date = run[0].date!;
    const n = groups.filter((g) => g.date === date).length;
    groups.push({ key: `${date}#${n}`, date, items: run });
    run = [];
  };
  for (const item of dated) {
    if (run.length > 0 && (run[0].date !== item.date || run.length >= max)) flush();
    run.push(item);
  }
  flush();
  for (const item of items.filter((i) => i.date == null)) {
    groups.push({ key: `none#${item.id}`, date: null, items: [item] });
  }
  return groups;
}

/** 영상 하나를 제 묶음으로 뺀다 — 바로 뒤에 새 묶음. 혼자인 묶음은 그대로 */
export function splitOut(
  groups: readonly ImportGroup[],
  itemId: number
): ImportGroup[] {
  const at = groups.findIndex((g) => g.items.some((i) => i.id === itemId));
  if (at < 0 || groups[at].items.length <= 1) return [...groups];
  const g = groups[at];
  const item = g.items.find((i) => i.id === itemId)!;
  const rest = { ...g, items: g.items.filter((i) => i.id !== itemId) };
  const own: ImportGroup = { key: `${g.key}#s${itemId}`, date: g.date, items: [item] };
  return [...groups.slice(0, at), rest, own, ...groups.slice(at + 1)];
}

/** 묶음 날짜를 고친다 — 묶음 전체에 적용(안의 영상 날짜도) */
export function setGroupDate(
  groups: readonly ImportGroup[],
  key: string,
  date: string
): ImportGroup[] {
  return groups.map((g) =>
    g.key === key ? { ...g, date, items: g.items.map((i) => ({ ...i, date })) } : g
  );
}
