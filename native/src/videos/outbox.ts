import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MyVideoItem, NewVideo } from '@/lib/my-videos';
import { isPhoneVideoPath } from '@/lib/phone-video-path';
import { rpc } from '~/lib/rpc';
import { outboxOwner } from '~/workout/outbox';
import { refreshMyVideos } from './store';

/**
 * 영상만 저장의 대기열(폰) — 운동 세트 대기열(workout/outbox.ts)과 같은 규칙.
 *   - [저장]을 누르면 여기에 담고 곧바로 보낸다. 신호가 없으면 남겨 두고 '동기화 대기'로 보인다 — 저장 완료로 보이지 않는다.
 *   - 같은 번호(clientId)를 다시 보내도 서버가 하나만 남긴다. 서버가 거절(retry: false)한 것은 뺀다. 서버 오류가 8번이면 뺀다.
 *   - 줄마다 주인(owner) — 다른 계정이 로그인하면 앞사람 것은 보내지도 보이지도 않는다.
 * 찍거나 고른 직후의 '저장 전'(draft)도 폰에 둔다 — 앱이 죽어 [저장]을 못 눌렀어도 다음에 켤 때 메모 없이 저장한다(찍은 영상을 잃지 않게).
 */
type Row = { owner: string; input: NewVideo; fails: number };
type Draft = { owner: string; input: NewVideo };

const KEY = 'bullpen-my-videos:outbox:v1';
const DRAFT_KEY = 'bullpen-my-videos:draft:v1';
const FAIL_LIMIT = 8;

let rows: readonly Row[] = [];
const listeners = new Set<() => void>();
function set(next: readonly Row[]) {
  rows = next;
  listeners.forEach((l) => l());
  void (next.length ? AsyncStorage.setItem(KEY, JSON.stringify(next)) : AsyncStorage.removeItem(KEY)).catch(() => undefined);
}
const loaded: Promise<void> = AsyncStorage.getItem(KEY)
  .then((raw) => {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return;
    const stored = (parsed as Row[]).filter((r) => r && typeof r.owner === 'string' && typeof r.input?.clientId === 'string');
    const extra = stored.filter((s) => !rows.some((r) => r.input.clientId === s.input.clientId));
    if (extra.length) set([...extra, ...rows]);
  })
  .catch(() => undefined);

let cache: { owner: string | null; src: readonly Row[]; out: MyVideoItem[] } = { owner: null, src: [], out: [] };
export const videoOutbox = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  /** 지금 계정의 보내지 못한 영상 — 갤러리 카드 꼴로(같은 값이면 같은 배열) */
  snapshot(): MyVideoItem[] {
    const owner = outboxOwner();
    if (cache.owner !== owner || cache.src !== rows)
      cache = { owner, src: rows, out: rows.filter((r) => r.owner === owner).map((r) => itemOf(r.input)) };
    return cache.out;
  },
};

const itemOf = (v: NewVideo): MyVideoItem => ({
  path: v.path,
  storage: isPhoneVideoPath(v.path) ? 'phone' : 'server',
  sport: v.sport,
  date: v.capturedDate,
  dateSource: v.capturedDate ? v.capturedSource : 'unknown',
  origin: v.origin,
  note: v.feelNote,
  revisit: false,
  saved: false,
  createdAt: v.capturedAt,
  durationSec: v.durationSec,
  logs: [],
  clip: null,
});

/** [저장] — 담고 보낸다 */
export function addVideo(input: NewVideo) {
  const owner = outboxOwner();
  if (!owner) return;
  set([...rows.filter((r) => r.input.clientId !== input.clientId), { owner, input, fails: 0 }]);
  void drainVideos();
}

let draining = false;
/** 담긴 영상을 하나씩 보낸다 — 앱을 켤 때 · 로그인 뒤(index.tsx drainQueues) · 담을 때 */
export async function drainVideos(): Promise<void> {
  await loaded;
  await adoptDraft();
  if (draining) return;
  draining = true;
  let sent = 0;
  try {
    for (;;) {
      const owner = outboxOwner();
      const row = rows.find((r) => r.owner === owner);
      if (!row || !owner) break;
      let res: { ok: true } | { ok: false; error: string; retry?: false };
      try {
        res = await rpc('my-videos.createMyVideo', row.input);
      } catch {
        /* 신호 없음 · 서버 오류 — 여덟 번이면 뺀다(한 줄이 뒤를 다 막지 않게) */
        if (row.fails + 1 >= FAIL_LIMIT) set(rows.filter((r) => r !== row));
        else set(rows.map((r) => (r === row ? { ...r, fails: r.fails + 1 } : r)));
        break;
      }
      if (res.ok || res.retry === false) {
        set(rows.filter((r) => r.input.clientId !== row.input.clientId));
        if (res.ok) sent++;
      } else break; // 로그인이 풀림 — 다음에
    }
  } finally {
    draining = false;
  }
  if (sent) void refreshMyVideos(true);
}

/** 찍거나 고른 직후 — 아직 저장 전. 앱이 죽으면 다음에 켤 때 저장한다 */
export async function saveDraft(input: NewVideo) {
  const owner = outboxOwner();
  if (owner) await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ owner, input } satisfies Draft)).catch(() => undefined);
}
export async function clearDraft() {
  await AsyncStorage.removeItem(DRAFT_KEY).catch(() => undefined);
}
/** 남은 '저장 전' — 지금 계정 것이면 메모 없이 저장으로 옮긴다(저장 화면이 열려 있는 동안은 그 화면이 정한다) */
let editing = false;
export const setDraftEditing = (on: boolean) => {
  editing = on;
};
async function adoptDraft() {
  if (editing) return;
  const raw = await AsyncStorage.getItem(DRAFT_KEY).catch(() => null);
  if (!raw) return;
  const d = JSON.parse(raw) as Draft;
  if (d?.owner !== outboxOwner() || !d.input) return;
  await clearDraft();
  set([...rows.filter((r) => r.input.clientId !== d.input.clientId), { owner: d.owner, input: d.input, fails: 0 }]);
}
