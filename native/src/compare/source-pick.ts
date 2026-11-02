/**
 * 영상 고르기 한 흐름(F07 — 순수). 처음 A · B, B 더하기, A 바꾸기, B 바꾸기, 없는 영상 다시 잇기가 모두 이것을 쓴다.
 *
 * - beginPick 은 고르기 전 문서를 그대로 쥔다(base). 고르는 동안 문서는 안 바뀐다 — 취소(cancelPick)하면 base 를 그대로 돌려준다
 *   (짝 · 기준 · 자리 · 반복 · 보기 · 그림 모두). 확인(applyPick)할 때만 새 문서를 만든다.
 * - 고를 수 있는 것: 이 문서에 이미 있는 영상(existing) · 새 영상(new — 내 영상 · 기록 · 사진 앱 · 촬영 · 파일) · 같은 영상을 한 칸 더(same).
 * - 사진 앱 · 촬영 · 파일로 가져온 앱 안 복사본은 문서에 넘길 때까지(adopted) 화면이 붙든다 — 넘기지 않은 것은 cancel/discard 로 정리한다.
 * - 고르는 사이 계정이 바뀌었으면(owner) 결과를 버린다 — 다른 계정의 영상 경로가 문서에 들어가지 않게.
 */
import { addSource, pairOf, relinkSource, setActive, sourceOf, swapActive, MAX_SOURCES, type ComparisonDocument, type NewSource, type SourceRef } from '~/compare/doc';

export type PickSlot = 'a' | 'b';
export type PickSession = { owner: string; slot: PickSlot; relink: string | null; base: ComparisonDocument };
export type PickChoice = { kind: 'existing'; sourceId: string } | { kind: 'new'; source: NewSource } | { kind: 'same' };
export type PickResult = { ok: true; doc: ComparisonDocument; sourceId: string; adopted: string[] } | { ok: false; reason: 'owner' | 'full' | 'missing' | 'unchanged' };

export function beginPick(d: ComparisonDocument, slot: PickSlot, opts: { relink?: string } = {}): PickSession {
  return { owner: d.ownerId, slot, relink: opts.relink ?? null, base: d };
}

/** 이 문서에서 그 칸에 고를 수 있는 영상 — 다른 칸에 지금 있는 영상은 뺀다(같은 영상 두 보기는 'same' 으로 따로) */
export function candidatesFor(d: ComparisonDocument, slot: PickSlot): SourceRef[] {
  const other = slot === 'a' ? d.active.b : d.active.a;
  return d.sources.filter((s) => s.id !== other);
}

/** 계정 · 경로 확인 — 새 영상의 앱 안 경로는 그 계정 폴더의 것만 */
const pathMine = (owner: string, s: NewSource) => !s.owned || s.path.startsWith(`${owner}/`);

export function applyPick(s: PickSession, choice: PickChoice, nowIso: string, currentOwner?: string | null): PickResult {
  const d = s.base;
  if (!s.owner || s.owner !== d.ownerId || (currentOwner !== undefined && currentOwner !== s.owner)) return { ok: false, reason: 'owner' };
  if (choice.kind === 'new' && !pathMine(s.owner, choice.source)) return { ok: false, reason: 'owner' };

  /* 없는 영상 다시 잇기 — 같은 칸에 새 경로(기준 · 그림 · 장면 표시는 그 칸에 그대로) */
  if (s.relink) {
    const target = sourceOf(d, s.relink);
    if (!target) return { ok: false, reason: 'missing' };
    const src = choice.kind === 'new' ? choice.source : choice.kind === 'existing' ? sourceOf(d, choice.sourceId) : null;
    if (!src) return { ok: false, reason: 'missing' };
    /* 문서의 다른 칸을 고르면 그 칸이 앱 안 복사본을 가진 채로 둔다(두 칸이 같은 경로를 같이 쓴다) */
    const owned = choice.kind === 'new' ? choice.source.owned : false;
    return { ok: true, doc: relinkSource(d, s.relink, src.path, owned), sourceId: s.relink, adopted: choice.kind === 'new' && owned ? [src.path] : [] };
  }

  const fixed = s.slot === 'a' ? d.active.b : d.active.a;
  let next = d;
  let id: string;
  let adopted: string[] = [];
  if (choice.kind === 'existing') {
    if (!sourceOf(d, choice.sourceId)) return { ok: false, reason: 'missing' };
    id = choice.sourceId;
  } else if (choice.kind === 'same') {
    const from = sourceOf(d, s.slot === 'b' ? d.active.a : (d.active.b ?? d.active.a));
    if (!from) return { ok: false, reason: 'missing' };
    if (d.sources.length >= MAX_SOURCES) return { ok: false, reason: 'full' };
    /* 같은 영상의 둘째 칸 — 보기 · 그림은 따로, 앱 안 복사본은 첫 칸이 가진다 */
    const r = addSource(d, { path: from.path, origin: from.origin, owned: false, label: from.label, date: from.date, facts: from.facts }, nowIso);
    if (!r) return { ok: false, reason: 'full' };
    next = r.doc;
    id = r.id;
  } else {
    /* 내 영상 · 기록에서 이미 넣은 영상이면 그 칸을 다시 쓴다(기준 · 그림 이어서). 가져온 복사본은 늘 새 칸 */
    const reuse = !choice.source.owned ? d.sources.find((x) => x.path === choice.source.path && x.id !== fixed) : undefined;
    if (reuse) id = reuse.id;
    else {
      if (d.sources.length >= MAX_SOURCES) return { ok: false, reason: 'full' };
      const r = addSource(d, choice.source, nowIso);
      if (!r) return { ok: false, reason: 'full' };
      next = r.doc;
      id = r.id;
      adopted = choice.source.owned ? [choice.source.path] : [];
    }
  }

  if (s.slot === 'b') {
    if (id === d.active.a) return { ok: false, reason: 'unchanged' };
    if (id === d.active.b) return { ok: false, reason: 'unchanged' };
    return { ok: true, doc: setActive(next, next.active.a, id), sourceId: id, adopted };
  }
  /* A 바꾸기 — B 는 그대로. 고른 것이 지금 B 면 A · B 를 바꾼 것과 같다 */
  if (id === d.active.a) return { ok: false, reason: 'unchanged' };
  if (id === d.active.b) return { ok: true, doc: swapActive(next), sourceId: id, adopted };
  return { ok: true, doc: setActive(next, id, next.active.b), sourceId: id, adopted };
}

/** 취소 — 문서는 고르기 전 그대로, 가져왔지만 안 쓴 복사본은 정리 대상으로 */
export function cancelPick(s: PickSession, imported: string[]): { doc: ComparisonDocument; discard: string[] } {
  return { doc: s.base, discard: [...new Set(imported)] };
}

/** 확인 뒤 정리할 것 — 가져왔지만 이번에 넘기지 않은 복사본 */
export function leftovers(imported: string[], adopted: string[]): string[] {
  const keep = new Set(adopted);
  return [...new Set(imported)].filter((p) => !keep.has(p));
}

/** 짝이 이미 있으면 그 짝의 기준이 남아 있는가(고른 뒤 '맞추기'를 건너뛸지) */
export const pairReady = (d: ComparisonDocument) => {
  const p = d.active.b ? pairOf(d, d.active.a, d.active.b) : null;
  return !!p && p.anchors.a != null && p.anchors.b != null;
};
