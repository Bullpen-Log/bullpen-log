/**
 * 투구 기록 '느낌으로 찾기' — 목록의 검색 칸 · 감각 칩 · 만족 칩이 기록을 거르는 규칙(순수, 서버 · 브라우저 공용).
 *
 * 왜 있나: 앱을 만든 까닭은 '남기기'가 아니라 '다시 찾아 그때 느낌 되살리기'다(docs/designs/pitch-log-findability.md).
 * 목록(app/(app)/videos/video-gallery.tsx)이 종류 칩으로만 걸러서 "제구가 좋았던 날"을 못 찾았다.
 *
 * 감각 칩 하나는 세 상태를 돈다 — 끔 → 좋았던 → 아쉬웠던 → 끔(한 줄에 들어가고 강조색 하나로 구분, D8).
 * 켠 칩끼리는 AND. 만족 칩은 '만족(4~5)' · '아쉬움(1~2)' 둘. 검색 칸은 메모 · 종류 · 감각 이름의 부분 일치.
 * 감각 · 만족 칸이 없는 옛 기록(2026-10-06 전 · 캐치볼)은 칩에서 빠지되 검색 · 날짜 점프에는 그대로 나온다.
 *
 * 시험: npm run pitch-find:test
 */
import { GOOD_DAY_MIN, PITCH_CUES } from '@/lib/pitch-satisfaction';

export type CueState = 'good' | 'bad';

/** 만족 칩 — 만족(GOOD_DAY_MIN 이상) · 아쉬움(2 이하) */
export type SatisfactionPick = 'good' | 'bad';
export const SATISFACTION_BAD_MAX = 2;

export type FindQuery = {
  /** 검색 칸 글 — 비었거나 공백만이면 거르지 않는다 */
  text: string;
  /** 감각 이름 → 상태. 없으면 끔 */
  cues: Readonly<Record<string, CueState>>;
  satisfaction: SatisfactionPick | null;
};

export const EMPTY_FIND: FindQuery = { text: '', cues: {}, satisfaction: null };

/** 거르기에 필요한 칸만 — 목록의 VideoLog(videos-client.tsx)가 이 모양을 만족한다 */
export type FindableLog = {
  sessionType: string;
  memo: string | null;
  cuesGood?: readonly string[] | null;
  cuesBad?: readonly string[] | null;
  satisfaction?: number | null;
};

/** 칩을 누를 때의 다음 상태 — 끔 → 좋았던 → 아쉬웠던 → 끔 */
export function cycleCue(state: CueState | undefined): CueState | undefined {
  if (state === undefined) return 'good';
  if (state === 'good') return 'bad';
  return undefined;
}

/** 소문자 · 앞뒤 공백 · 겹친 공백 하나로 */
function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** 조건이 하나라도 켜져 있나 — 켜지면 목록이 달 접기를 풀어 전체를 한 줄로 보인다 */
export function isFindActive(q: FindQuery): boolean {
  return (
    norm(q.text) !== '' || Object.keys(q.cues).length > 0 || q.satisfaction !== null
  );
}

export function matchesFind(log: FindableLog, q: FindQuery): boolean {
  const good = log.cuesGood ?? [];
  const bad = log.cuesBad ?? [];

  for (const [cue, state] of Object.entries(q.cues)) {
    if (state === 'good' && !good.includes(cue)) return false;
    if (state === 'bad' && !bad.includes(cue)) return false;
  }

  if (q.satisfaction !== null) {
    const s = log.satisfaction;
    if (s == null) return false;
    if (q.satisfaction === 'good' && s < GOOD_DAY_MIN) return false;
    if (q.satisfaction === 'bad' && s > SATISFACTION_BAD_MAX) return false;
  }

  const text = norm(q.text);
  if (text !== '') {
    const hay = norm(
      [log.memo, log.sessionType, ...good, ...bad].filter(Boolean).join(' ')
    );
    if (!hay.includes(text)) return false;
  }
  return true;
}

export function filterLogs<T extends FindableLog>(
  logs: readonly T[],
  q: FindQuery
): T[] {
  if (!isFindActive(q)) return [...logs];
  return logs.filter((log) => matchesFind(log, q));
}

/** 칩 줄이 그리는 감각 이름 — PITCH_CUES 그대로(값이 DB 에 남아 바꾸지 않는다) */
export const FIND_CUES: readonly string[] = PITCH_CUES;
