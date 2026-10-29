import { cacheEpoch, cacheGet, cacheSet } from '~/lib/store';
import { outboxOwner } from '~/workout/outbox';

/**
 * 영상 메모의 쓰다 만 글 — 계정 + 영상 경로마다 폰에 둔다(2026-10-29). 화면을 나갈 때 저장 요청 하나에만 기대지 않고(나가는 길에 신호가 끊기면 글이
 * 사라졌다), 다시 들어오면 '쓰던 글'을 되살린다. 저장에 성공하면 지운다.
 * 캐시 칸(cacheSet)에 둬서 로그아웃(cacheClear)이 같이 비우고, 주인(outboxOwner)이 다르면 읽지 않는다 — 앞사람 글이 다음 계정에 안 보이게.
 */
type Drafts = { owner: string | null; notes: Record<string, string> };
const KEY = 'my-videos:note-drafts';
let mem: Drafts | null = null;
let memEpoch = -1;

async function load(): Promise<Drafts> {
  const e = cacheEpoch();
  if (mem && memEpoch === e && mem.owner === outboxOwner()) return mem;
  const raw = (await cacheGet(KEY).catch(() => null)) as Drafts | null;
  const owner = outboxOwner();
  mem = raw && raw.owner === owner && raw.notes && typeof raw.notes === 'object' ? raw : { owner, notes: {} };
  memEpoch = e;
  return mem;
}

export async function loadNoteDraft(path: string): Promise<string | null> {
  const d = await load();
  return typeof d.notes[path] === 'string' ? d.notes[path] : null;
}

/** 쓰는 중인 글 — null 이면 지운다(저장 성공 · 취소) */
export async function keepNoteDraft(path: string, text: string | null): Promise<void> {
  const d = await load();
  const notes = { ...d.notes };
  if (text == null) delete notes[path];
  else notes[path] = text;
  /* 오래 쌓이지 않게 30개까지 */
  const keys = Object.keys(notes);
  for (const k of keys.slice(0, Math.max(0, keys.length - 30))) delete notes[k];
  mem = { owner: d.owner, notes };
  await cacheSet(KEY, mem).catch(() => undefined);
}
