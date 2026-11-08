/**
 * 영상 비교 한 화면의 '잰 자리에 맞추기' 순수 계산(2026-11-03 — docs/designs/sinker-pitch-video-single-screen-review-2026-11-03.md SS01~SS04 · SS07).
 *
 * - 글자 폭은 어림으로 시작하고, 화면이 실제로 잰 폭 · 높이가 오면 그 값으로 다시 나눈다(measured ?? estimate).
 *   어림은 넉넉하게(한글 한 글자 = 글자 크기 1배, 단어 단위 줄바꿈) — 어림이 맞으면 실제로도 들어간다.
 * - 글자 크기는 기기 설정을 2배까지 그대로 따른다(FS_MAX). 이 기능의 핵심 글자는 2배에서 멈추고, 칸 수 · 줄 수를 그만큼 줄인다.
 * - 단추 줄(planBar): 꼭 있어야 할 단추(essential)는 늘 보이고, 자리가 모자라면 덜 중요한 것부터 '더보기'로 옮긴다. 터치 자리(44)는 줄이지 않는다.
 * - 쪽(packPages): 한 쪽에 들어가는 만큼 담는다. 한 덩어리가 쪽보다 크면 그 덩어리를 나누라고(oversize) 알린다 — 잘라 숨기지 않는다.
 * - 메모(paginateNote · editPage): 원문 하나에 쪽 = 원문 구간. 줄바꿈 · 폭으로 줄을 세서 나누고, 이어 붙이면 원문 그대로다.
 */

/* ---- 글자 크기 · 폭 ---- */

/** 이 기능의 핵심 글자가 따르는 최대 배율(접근성 큰 글씨 200%) */
export const FS_MAX = 2;
export const fsOf = (fontScale: number) => Math.min(FS_MAX, Math.max(1, Number.isFinite(fontScale) ? fontScale : 1));

const isJoiner = (cp: number) =>
  cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0x1f3fb && cp <= 0x1f3ff) || (cp >= 0x0300 && cp <= 0x036f) || (cp >= 0x1160 && cp <= 0x11ff) || (cp >= 0xe0020 && cp <= 0xe007f);

/** 글자 하나의 폭(글자 크기의 몇 배) — 넉넉한 어림 */
export function charUnits(cp: number): number {
  if (cp === 10) return 0;
  if (isJoiner(cp)) return 0;
  if (cp === 32) return 0.3;
  if (cp === 0x3000) return 1;
  if ((cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xff00 && cp <= 0xff60)) return 1;
  if (cp >= 0x1f000) return 1.25;
  if (cp >= 0x2190 && cp <= 0x2bff) return 1;
  if (cp === 0xb7) return 0.4;
  if (cp === 0xd7) return 0.62;
  if (cp >= 48 && cp <= 57) return 0.62;
  if (cp >= 65 && cp <= 90) return 0.72;
  if (cp >= 97 && cp <= 122) return 0.6;
  return 0.55;
}
export function textUnits(s: string): number {
  let u = 0;
  for (const ch of s) u += charUnits(ch.codePointAt(0) ?? 0);
  return u;
}
export const textW = (s: string, fontSize: number, fs: number) => textUnits(s) * fontSize * fs;

/* ---- 단추 · 줄 크기(workspace-parts 의 모양과 같은 값) ---- */

/** 작은 단추 글자(TYPE.buttonCompact 15/21) + 위아래 4 */
export const ctlH = (fs: number) => Math.max(44, Math.ceil(21 * fsOf(fs) + 8));
export const iconW = 44;
export const textBtnW = (label: string, fs: number) => Math.max(44, Math.ceil(textW(label, 15, fsOf(fs)) + 26));
/** 고르기(라디오 묶음) 칸 하나 · 묶음 전체 */
export const segItemW = (label: string, fs: number) => Math.max(44, Math.ceil(textW(label, 15, fsOf(fs)) + 22));
export const segW = (labels: readonly string[], fs: number) => 4 + labels.reduce((s, l) => s + segItemW(l, fs), 0) + 2 * Math.max(0, labels.length - 1);
export const segH = (fs: number) => Math.max(44, Math.ceil(21 * fsOf(fs) + 12));
/** 제목 줄(buttonCompact) · 보조 글(sub 13/19) · 본문(body 15/22) */
export const headH = (fs: number) => Math.ceil(21 * fsOf(fs));
export const LINE = { sub: { size: 13, line: 19 }, body: { size: 15, line: 22 }, note: { size: 16, line: 22 } } as const;

/* ---- 줄바꿈 어림(단어 단위 · 넘치는 단어는 글자 단위) ---- */

/** 이 글이 폭 w 에서 그려질 때 각 줄의 시작 자리(원문 index). 끝이 줄바꿈이면 마지막 빈 줄의 시작(=길이)도 넣는다 */
export function visualLines(text: string, w: number, fontPx: number): number[] {
  const width = Math.max(fontPx, w);
  const starts: number[] = [0];
  let x = 0;
  let lineStart = 0;
  /* 지금 줄에서 끊을 수 있는 마지막 자리(빈칸 다음)와 그때까지의 폭 */
  let breakAt = -1;
  let breakX = 0;
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i) ?? 0;
    let j = i + (cp > 0xffff ? 2 : 1);
    if (cp === 10) {
      starts.push(j);
      lineStart = j;
      x = 0;
      breakAt = -1;
      i = j;
      continue;
    }
    /* 이어지는 글자(ZWJ · 변형 선택자 · 받침 자모)는 앞 글자와 한 덩어리 — 그 사이에서 끊지 않는다 */
    let cw = charUnits(cp) * fontPx;
    while (j < text.length) {
      const nx = text.codePointAt(j) ?? 0;
      if (!isJoiner(nx) && text.codePointAt(j - 1) !== 0x200d) break;
      cw += charUnits(nx) * fontPx;
      j += nx > 0xffff ? 2 : 1;
    }
    if (cp === 32 || cp === 0x3000) {
      /* 빈칸은 줄 끝에 걸쳐 둔다(줄을 넘기지 않는다) */
      x += cw;
      breakAt = j;
      breakX = x;
      i = j;
      continue;
    }
    if (x > 0 && x + cw > width + 0.01) {
      if (breakAt > lineStart) {
        starts.push(breakAt);
        lineStart = breakAt;
        x -= breakX;
      } else {
        starts.push(i);
        lineStart = i;
        x = 0;
      }
      breakAt = -1;
      if (x > 0 && x + cw > width + 0.01) {
        /* 옮긴 단어만으로도 넘친다 — 그 자리에서 글자 단위로 */
        starts.push(i);
        lineStart = i;
        x = 0;
      }
    }
    x += cw;
    i = j;
  }
  return starts;
}
export const lineCount = (text: string, w: number, fontPx: number) => visualLines(text, w, fontPx).length;
/** 글 덩어리 높이(줄 수 × 줄 높이) */
export const textBlockH = (text: string, w: number, size: number, line: number, fs: number) => Math.ceil(lineCount(text, w, size * fsOf(fs)) * line * fsOf(fs));

/** 긴 글을 높이 maxH 안에 들어가는 조각으로(원문 구간 — 이어 붙이면 원문) */
export function splitTextToHeight(text: string, w: number, size: number, line: number, fs: number, maxH: number): { start: number; end: number }[] {
  const per = Math.max(1, Math.floor(maxH / (line * fsOf(fs))));
  return pagesOfLines(text, visualLines(text, w, size * fsOf(fs)), per);
}
function pagesOfLines(text: string, starts: number[], per: number): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (let k = 0; k < starts.length; k += per) out.push({ start: starts[k], end: k + per < starts.length ? starts[k + per] : text.length });
  return out.length ? out : [{ start: 0, end: 0 }];
}

/* ---- 단추 줄(SS01) ---- */

export type BarItem = {
  key: string;
  /** 잰 폭(없으면 어림) */
  w: number;
  /** 늘 보여야 하는 것(되돌리기 · 완료 · 지금 도구 · 대상) */
  essential?: boolean;
  /** 자리가 모자라면 큰 수부터 뺀다(essential 은 안 뺌) */
  priority?: number;
  /** 빼면 '더보기'로 옮긴다(아니면 다른 길이 있는 것 — 예: 빠른 도구는 도구 고르기에 다 있다) */
  overflow?: boolean;
  /** 자리가 정말 모자랄 때 쓸 좁은 모양의 폭(예: 이름 없이 그림만) */
  compactW?: number;
  /** 줄 끝으로 민다(완료 · 저장) */
  push?: boolean;
};
export type BarPlan = { lines: string[][]; hidden: string[]; overflow: string[]; compact: string[]; fits: boolean; width: number };
export const MORE_KEY = '__more';

function flow(items: { key: string; w: number }[], width: number, gap: number): string[][] {
  const lines: string[][] = [];
  let cur: string[] = [];
  let x = 0;
  for (const it of items) {
    const need = cur.length ? x + gap + it.w : it.w;
    if (cur.length && need > width + 0.5) {
      lines.push(cur);
      cur = [it.key];
      x = it.w;
    } else {
      cur.push(it.key);
      x = need;
    }
  }
  if (cur.length) lines.push(cur);
  return lines;
}
/** 한 줄의 폭(사이 간격 포함) */
export const lineWidth = (keys: readonly string[], w: Record<string, number>, gap: number) => keys.reduce((s, k, i) => s + (w[k] ?? 0) + (i ? gap : 0), 0);

/**
 * 단추들을 폭 width · 줄 maxRows 안에 차례대로 놓는다. 넘치면 priority 큰 것부터 빼고(overflow 면 '더보기'에),
 * 그래도 넘치면 compactW 가 있는 것을 좁게. fits=false 면 꼭 있어야 할 단추도 안 들어간다(시험이 실패로 본다).
 */
export function planBar(items: readonly BarItem[], opts: { width: number; maxRows: number; gap?: number; moreW?: number }): BarPlan {
  const gap = opts.gap ?? 4;
  const width = Math.max(0, opts.width);
  const moreW = opts.moreW ?? iconW;
  const hidden = new Set<string>();
  const compact = new Set<string>();
  const order = [...items].filter((x) => !x.essential).sort((p, q) => (q.priority ?? 0) - (p.priority ?? 0) || items.indexOf(q) - items.indexOf(p));
  const compactable = items.filter((x) => x.compactW != null && x.compactW < x.w);
  const build = () => {
    const shown = items.filter((x) => !hidden.has(x.key));
    const needMore = items.some((x) => hidden.has(x.key) && x.overflow);
    const list = shown.map((x) => ({ key: x.key, w: compact.has(x.key) ? (x.compactW as number) : x.w }));
    if (needMore) {
      /* 더보기는 맨 끝 '밀린'(완료) 단추 앞에 */
      const at = list.findIndex((x) => items.find((y) => y.key === x.key)?.push);
      list.splice(at >= 0 ? at : list.length, 0, { key: MORE_KEY, w: moreW });
    }
    return flow(list, width, gap);
  };
  /* 혼자서도 줄보다 넓은 단추는 처음부터 좁은 모양으로(있으면) */
  for (const x of compactable) if (x.w > width + 0.5) compact.add(x.key);
  const wOf = (k: string) => (k === MORE_KEY ? moreW : compact.has(k) ? (items.find((y) => y.key === k)?.compactW as number) : (items.find((y) => y.key === k)?.w ?? 0));
  const ok = (ls: string[][]) => ls.length <= opts.maxRows && ls.every((ln) => ln.length > 0 && ln.reduce((a, k, i) => a + wOf(k) + (i ? gap : 0), 0) <= width + 0.5);
  let lines = build();
  for (const x of order) {
    if (ok(lines)) break;
    hidden.add(x.key);
    lines = build();
  }
  for (const x of compactable) {
    if (ok(lines)) break;
    compact.add(x.key);
    lines = build();
  }
  const fits = ok(lines);
  return { lines, hidden: [...hidden], overflow: items.filter((x) => hidden.has(x.key) && x.overflow).map((x) => x.key), compact: [...compact], fits, width };
}
/**
 * 줄 수를 1 부터 늘려 가며 아무것도 빼지 않고 들어가는 가장 적은 줄을 고른다(영상 자리를 덜 쓰게). preferCompact 면 좁은 모양을
 * 줄을 늘리는 것보다 먼저 쓴다(재생 줄 — 대상 고르기를 작은 단추로). 끝까지 안 되면 maxRows 줄에서 빼고 좁힌다.
 */
export function planBarAdaptive(items: readonly BarItem[], opts: { width: number; maxRows: number; gap?: number; moreW?: number; preferCompact?: boolean }): BarPlan {
  for (let r = 1; r <= Math.max(1, opts.maxRows); r++) {
    const p = planBar(items, { ...opts, maxRows: r });
    if (p.fits && p.hidden.length === 0 && (p.compact.length === 0 || opts.preferCompact)) return p;
  }
  return planBar(items, opts);
}
/** 놓은 단추들이 정말 폭 안인가(시험 · 개발 확인) */
export function barFits(plan: BarPlan, widths: Record<string, number>, gap = 4, moreW = iconW): boolean {
  const w = { ...widths, [MORE_KEY]: moreW };
  return plan.fits && plan.lines.every((ln) => lineWidth(ln, w, gap) <= plan.width + 0.5);
}

/* ---- 작은 창 쪽(SS02) ---- */

export type Block = { h: number; keepWithNext?: boolean };
export type PagePlan = { pages: number[][]; oversize: number[]; bodyH: number };
/**
 * 덩어리들을 높이 bodyH 의 쪽으로. 한 덩어리가 bodyH 보다 크면 oversize 에 넣는다(화면은 그 덩어리를 더 잘게 나눈다 —
 * 잘라 숨기지 않는다). 제목 줄(keepWithNext)은 쪽 끝에 홀로 남지 않는다.
 */
export function packPages(blocks: readonly Block[], bodyH: number, gap = 8): PagePlan {
  const pages: number[][] = [];
  const oversize: number[] = [];
  let cur: number[] = [];
  let used = 0;
  blocks.forEach((b, i) => {
    const h = Math.max(0, b.h);
    if (h > bodyH + 0.5) oversize.push(i);
    const need = cur.length ? used + gap + h : h;
    if (cur.length && need > bodyH + 0.5) {
      const tail: number[] = [];
      while (cur.length > 1 && blocks[cur[cur.length - 1]].keepWithNext) tail.unshift(cur.pop() as number);
      pages.push(cur);
      cur = [...tail, i];
      used = tail.reduce((s, j) => s + Math.max(0, blocks[j].h) + gap, 0) + h;
      if (used > bodyH + 0.5 && tail.length) {
        /* 제목과 같이 옮겼더니 넘친다 — 제목은 앞 쪽에 두는 수밖에 */
        pages[pages.length - 1].push(...tail);
        cur = [i];
        used = h;
      }
    } else {
      cur.push(i);
      used = need;
    }
  });
  if (cur.length) pages.push(cur);
  return { pages: pages.length ? pages : [[]], oversize, bodyH };
}
/** 쪽마다 높이 합이 bodyH 안인가 */
export const pagesFit = (plan: PagePlan, heights: readonly number[], gap = 8) =>
  plan.oversize.length === 0 && plan.pages.every((pg) => pg.reduce((s, i, k) => s + Math.max(0, heights[i]) + (k ? gap : 0), 0) <= plan.bodyH + 0.5);

/** 단추 여럿을 폭에 맞춰 줄로(한 줄이 한 덩어리) — 큰 Wrap 하나 대신 */
export function flowLines(widths: readonly number[], width: number, gap = 6): number[][] {
  return flow(
    widths.map((w, i) => ({ key: String(i), w: Math.min(w, width) })),
    width,
    gap
  ).map((ln) => ln.map(Number));
}

/** 작은 창의 머리(제목 · 쪽 · 닫기) · 안쪽 여백 */
export const inspChrome = (fs: number) => ({ head: Math.max(44, headH(fs) + 12), pad: 10 + 10 });
/**
 * 작은 창이 무대(영상)를 얼마나 가릴까 — 기본은 무대의 약 1/3. 가장 큰 덩어리 하나도 못 담으면 그만큼 키우되
 * 영상 미리보기(PREVIEW_MIN)는 남긴다. 그래도 모자라면 compact(화면이 도구 칸 자리로 옮기거나 덩어리를 더 나눈다).
 */
export const PREVIEW_MIN = 64;
export function inspectorBudget(o: { stageH: number; fs: number; needBody: number }): { avail: number; bodyH: number; share: number; compact: boolean } {
  const ch = inspChrome(o.fs);
  const third = Math.round(o.stageH * 0.36);
  const want = Math.max(third, ch.head + ch.pad + o.needBody);
  const cap = Math.max(0, o.stageH - PREVIEW_MIN);
  const avail = Math.max(0, Math.min(want, cap));
  const bodyH = Math.max(0, avail - ch.head - ch.pad);
  return { avail, bodyH, share: o.stageH > 0 ? avail / o.stageH : 1, compact: bodyH < o.needBody };
}

/** 장면 모음 한 칸(A · B 그림) — 쪽 높이에 맞춰 크기 · 위아래/나란히를 고른다(B 그림이 잘리지 않게) */
export function shotLayout(o: { bodyH: number; w: number; hasB: boolean; fs: number }): { size: number; row: boolean; perLine: number; h: number } {
  const label = Math.ceil(19 * fsOf(o.fs)) + 4;
  const tall = (size: number, row: boolean) => label + (o.hasB && !row ? 2 : 1) * (size * 0.9 + 4);
  const cellW = (size: number, row: boolean) => (row && o.hasB ? size * 2 + 4 : size);
  /* 위아래 · 나란히 가운데 그림이 더 큰 쪽(같으면 위아래) — 쪽 높이 · 폭 안에서 */
  let best: { size: number; row: boolean } | null = null;
  for (const row of o.hasB ? [false, true] : [false])
    for (let size = 96; size >= 56; size -= 8)
      if (tall(size, row) <= o.bodyH && cellW(size, row) <= Math.max(56, o.w)) {
        if (!best || size > best.size) best = { size, row };
        break;
      }
  const pick = best ?? { size: 56, row: o.hasB };
  return { size: pick.size, row: pick.row, perLine: Math.max(1, Math.floor((o.w + 8) / (cellW(pick.size, pick.row) + 8))), h: Math.ceil(tall(pick.size, pick.row)) };
}

/* ---- 메모 쪽(SS04) ---- */

export type Range = { start: number; end: number };
/** 메모 칸 한 쪽 — 줄 수 · 폭 · 글자 크기로 원문을 쪽으로(이어 붙이면 원문). 끝 줄바꿈 뒤 빈 줄(커서 자리)도 쪽에 든다 */
export function paginateNote(text: string, o: { w: number; fontPx: number; lines: number }): Range[] {
  return pagesOfLines(text, visualLines(text, o.w, o.fontPx), Math.max(1, Math.floor(o.lines)));
}
export const joinPages = (text: string, pages: readonly Range[]) => pages.map((p) => text.slice(p.start, p.end)).join('');
/** 쪽들이 원문을 빈틈 · 겹침 없이 덮는가 */
export function pagesCover(text: string, pages: readonly Range[]): boolean {
  if (!pages.length) return false;
  if (pages[0].start !== 0 || pages[pages.length - 1].end !== text.length) return false;
  for (let i = 1; i < pages.length; i++) if (pages[i].start !== pages[i - 1].end) return false;
  return pages.every((p) => p.end >= p.start);
}
export const pageOfCaret = (pages: readonly Range[], caret: number) => {
  for (let i = pages.length - 1; i >= 0; i--) if (caret >= pages[i].start) return caret > pages[i].end && i < pages.length - 1 ? i + 1 : i;
  return 0;
};
/** 한 쪽 글이 차지하는 줄 수 — 쪽 끝 줄바꿈 뒤의 빈 줄은 다음 쪽 몫이라 세지 않는다(쪽을 넘길 때 커서는 그 줄바꿈 앞에 둔다) */
export const pageLines = (pageText: string, w: number, fontPx: number) => lineCount(pageText.endsWith('\n') ? pageText.slice(0, -1) : pageText, w, fontPx);
/** 이 쪽의 글이 칸(줄 수)보다 긴가 */
export const pageOverflows = (text: string, p: Range, o: { w: number; fontPx: number; lines: number }) => pageLines(text.slice(p.start, p.end), o.w, o.fontPx) > Math.max(1, o.lines);
/** 쪽 끝 커서 자리 — 쪽이 줄바꿈으로 끝나면 그 앞(다음 쪽 몫인 빈 줄에 커서를 두지 않게) */
export const pageEndCaret = (text: string, p: Range) => (p.end > p.start && text.charCodeAt(p.end - 1) === 10 ? p.end - 1 : p.end);
/** 글자 경계로 자르기 — 짝 글자 · 결합 글자(ZWJ · 변형 선택자 · 피부색) 가운데서 자르지 않는다 */
export function graphemeCut(s: string, n: number): number {
  let i = Math.max(0, Math.min(s.length, n));
  const lo = (c: number) => c >= 0xdc00 && c <= 0xdfff;
  while (i > 0 && i < s.length) {
    const cp = s.codePointAt(i) ?? 0;
    if (lo(s.charCodeAt(i)) || isJoiner(cp) || s.charCodeAt(i - 1) === 0x200d) i--;
    else break;
  }
  return i;
}

/**
 * 한 쪽을 고친 결과를 원문에 — 바뀐 자리(앞 · 뒤 같은 부분을 뺀 가운데)만 바꾸고, 전체 글자 한도(max)는 원문에 건다(넘치는 넣기는 앞부분만).
 * 커서 = 넣은 글 끝. 쪽 경계는 고친 쪽만 늘고 줄며 뒤 쪽은 그만큼 민다(다시 나누기는 따로 — 한글 조합을 끊지 않게).
 */
export function editPage(text: string, pages: readonly Range[], k: number, nextPage: string, max: number): { text: string; pages: Range[]; caret: number; clipped: boolean } {
  const p = pages[Math.min(Math.max(0, k), pages.length - 1)] ?? { start: 0, end: text.length };
  const old = text.slice(p.start, p.end);
  let pre = 0;
  while (pre < old.length && pre < nextPage.length && old.charCodeAt(pre) === nextPage.charCodeAt(pre)) pre++;
  let suf = 0;
  while (suf < old.length - pre && suf < nextPage.length - pre && old.charCodeAt(old.length - 1 - suf) === nextPage.charCodeAt(nextPage.length - 1 - suf)) suf++;
  /* 짝 글자(그림 문자) 가운데서 자르지 않게 */
  const hi = (c: number) => c >= 0xd800 && c <= 0xdbff;
  if (pre > 0 && hi(old.charCodeAt(pre - 1))) pre--;
  let ins = nextPage.slice(pre, nextPage.length - suf);
  const removed = old.length - pre - suf;
  const room = Math.max(0, max - (text.length - removed));
  let clipped = false;
  if (ins.length > room) {
    ins = ins.slice(0, graphemeCut(ins, room));
    clipped = true;
  }
  const at = p.start + pre;
  const out = text.slice(0, at) + ins + text.slice(at + removed);
  const delta = ins.length - removed;
  const next = pages.map((r, i) => (i < k ? { ...r } : i === k ? { start: r.start, end: r.end + delta } : { start: r.start + delta, end: r.end + delta }));
  return { text: out, pages: next, caret: at + ins.length, clipped };
}

/**
 * 한글을 조합하는 중인 듯한 고침인가(어림) — 커서 자리 한 글자를 바꾸거나 한 글자를 더한 것이 한글 자모 · 음절이면.
 * 조합 중에는 지금 쪽의 글(입력칸 값)을 바꾸지 않는다(바꾸면 조합이 끊긴다). 붙여넣기 · 줄바꿈 · 지우기 · 영문은 조합이 아니다.
 */
export function probablyComposing(prevPage: string, nextPage: string): boolean {
  const d = nextPage.length - prevPage.length;
  if (d !== 0 && d !== 1) return false;
  let pre = 0;
  while (pre < prevPage.length && pre < nextPage.length && prevPage[pre] === nextPage[pre]) pre++;
  if (pre >= nextPage.length) return false;
  const restSame = d === 1 ? nextPage.slice(pre + 1) === prevPage.slice(pre) : nextPage.slice(pre + 1) === prevPage.slice(pre + 1);
  if (!restSame) return false;
  const cp = nextPage.charCodeAt(pre);
  return (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0x3131 && cp <= 0x318e) || (cp >= 0x1100 && cp <= 0x11ff);
}

/* ---- 메모 편집 자리(SS03) ---- */

/** 화면 아래 끝(창 좌표)과 자판 윗변이 겹치는 높이 — 한 번만 뺀다 */
export const keyboardOverlap = (rootBottom: number, keyboardTop: number | null) => (keyboardTop == null ? 0 : Math.max(0, Math.round(rootBottom - keyboardTop)));

export type EditorPlan = {
  /** 한 줄 모음(닫기 · 제목 · 쪽 · 버리기 · 저장을 한 줄에) — 짧은 화면 */
  merged: boolean;
  /** 입력칸까지 한 줄에(닫기 · 한 줄 입력 · 더보기 · 저장) — 아주 짧은 화면(가로 폰 + 큰 자판) */
  inline?: boolean;
  lines: number;
  inputH: number;
  height: number;
  previewH: number;
  fits: boolean;
};
export const EDITOR_PREVIEW = 56;
/**
 * 자판 위에 남은 높이(avail — 머리 · 자판 겹침 · 안전 영역을 한 번씩 뺀 것)에 편집 줄을 맞춘다. 저장 · 닫기와 지금 쓰는 줄이 먼저,
 * 남으면 영상 미리보기, 그다음 입력 줄 수(최대 6). 아주 짧으면 머리와 단추 줄을 한 줄로 합치고 입력은 한 줄까지 줄인다.
 */
export function planEditor(o: { avail: number; fs: number; maxLines?: number }): EditorPlan {
  const fs = fsOf(o.fs);
  const ctl = ctlH(fs);
  const lineH = LINE.note.line * fs;
  const inputH = (n: number) => Math.ceil(n * lineH + 16);
  const gap = 6;
  const max = o.maxLines ?? 6;
  const tryPlan = (merged: boolean, withPreview: boolean): EditorPlan | null => {
    const chrome = merged ? ctl + gap : ctl + gap + ctl + gap;
    const room = o.avail - chrome - (withPreview ? EDITOR_PREVIEW : 0);
    const n = Math.min(max, Math.floor((room - 16) / lineH));
    if (n < 1) return null;
    const height = chrome + inputH(n);
    return { merged, lines: n, inputH: inputH(n), height, previewH: Math.max(0, o.avail - height), fits: true };
  };
  /* 차례: 두 줄 + 미리보기 → 한 줄 모음 + 미리보기 → 두 줄 → 한 줄 모음(미리보기는 저장 · 쓰는 글 다음) */
  return (
    tryPlan(false, true) ??
    tryPlan(true, true) ??
    tryPlan(false, false) ??
    tryPlan(true, false) ?? {
      merged: true,
      inline: true,
      lines: 1,
      inputH: inputH(1),
      height: Math.max(ctl, inputH(1)),
      previewH: Math.max(0, o.avail - Math.max(ctl, inputH(1))),
      fits: o.avail >= Math.max(ctl, inputH(1)),
    }
  );
}

/* ---- 작은 창 줄 → 덩어리(SS02) ---- */

export type InspItem<N> = { key: string; w: number; node: N };
/** 작은 창 한 줄 — node(한 덩어리) · items(단추들, 폭에 맞춰 여러 줄) · text(긴 글, 높이에 맞춰 조각) 중 하나 */
export type InspRow<N> = { key: string; h: number; node?: N; head?: boolean; items?: InspItem<N>[]; text?: { s: string; danger?: boolean; style?: 'sub' | 'body' } };
export type InspBlock<N> = { key: string; rowKey: string; h: number; head: boolean } & ({ kind: 'node'; node: N } | { kind: 'line'; items: InspItem<N>[] } | { kind: 'text'; s: string; danger: boolean; style: 'sub' | 'body' });

/** 줄들을 덩어리로 — 단추 묶음은 폭에 맞춰 줄마다 한 덩어리, 긴 글은 쪽 높이에 맞춰 조각마다 한 덩어리 */
export function expandRows<N>(rows: readonly InspRow<N>[], o: { width: number; bodyH: number; fs: number; measuredW?: Record<string, number>; textFit?: Record<string, number> }): InspBlock<N>[] {
  const out: InspBlock<N>[] = [];
  const fs = fsOf(o.fs);
  for (const r of rows) {
    if (r.items) {
      const ws = r.items.map((it) => o.measuredW?.[it.key] ?? it.w);
      const lines = flowLines(ws, o.width, 6);
      /* 줄보다 넓은 단추는 글이 두 줄로 감긴다 — 그 줄은 한 줄 높이만큼 더 */
      lines.forEach((ln, i) => {
        const lineH = Math.max(ctlH(fs), r.h, ...ln.map((j) => (ws[j] > o.width ? ctlH(fs) + Math.ceil(21 * fs) : 0)));
        out.push({ key: `${r.key}#${i}`, rowKey: r.key, h: lineH, head: false, kind: 'line', items: ln.map((j) => r.items![j]) });
      });
      continue;
    }
    if (r.text) {
      const style = r.text.style ?? 'sub';
      const L = LINE[style];
      const fit = o.textFit?.[r.key] ?? 1;
      const parts = splitTextToHeight(r.text.s, o.width, L.size, L.line, fs, Math.max(L.line * fs, o.bodyH * fit));
      parts.forEach((p, i) => {
        const s = r.text!.s.slice(p.start, p.end).replace(/\n$/, '');
        out.push({ key: `${r.key}~${i}`, rowKey: r.key, h: textBlockH(s, o.width, L.size, L.line, fs), head: false, kind: 'text', s, danger: !!r.text!.danger, style });
      });
      continue;
    }
    out.push({ key: r.key, rowKey: r.key, h: r.h, head: !!r.head, kind: 'node', node: r.node as N });
  }
  return out;
}
/** 나눌 수 없는 가장 큰 덩어리(단추 한 줄 · 한 덩어리 · 글 한 줄) — 작은 창이 적어도 이만큼은 받아야 한다 */
export function atomicNeed<N>(rows: readonly InspRow<N>[], o: { width: number; fs: number }): number {
  const fs = fsOf(o.fs);
  let need = 0;
  for (const b of expandRows(rows, { width: o.width, bodyH: 1e6, fs }))
    need = Math.max(need, b.kind === 'text' ? Math.ceil(LINE[b.style].line * fs) : b.h);
  /* 제목 줄은 다음 줄과 함께 */
  rows.forEach((r, i) => {
    if (r.head && rows[i + 1]) need = Math.max(need, r.h + 8 + (rows[i + 1].items ? Math.max(ctlH(fs), rows[i + 1].h) : rows[i + 1].text ? Math.ceil(LINE[rows[i + 1].text!.style ?? 'sub'].line * fs) : rows[i + 1].h));
  });
  return need;
}
/**
 * 고르기 묶음 모양 — 한 줄(row) · 두 줄까지 감기(wrap) · 그보다 길거나 maxH 를 넘으면 '지금 값' 단추 + 동작 시트(pick).
 * 고르기 칸을 줄이거나 자르지 않는다. 시험 · 화면 · 높이 어림이 같은 함수를 쓴다.
 */
export function segMode(labels: readonly string[], width: number, fs: number, maxH = Infinity): { mode: 'row' | 'wrap' | 'pick'; h: number } {
  if (segW(labels, fs) <= width) return { mode: 'row', h: segH(fs) };
  const lines = flowLines(labels.map((l) => segItemW(l, fs)), Math.max(44, width - 4), 2).length;
  const h = lines * (segH(fs) - 4) + (lines - 1) * 2 + 4;
  if (lines <= 2 && h <= maxH) return { mode: 'wrap', h };
  return { mode: 'pick', h: ctlH(fs) };
}
export const segBlockH = (labels: readonly string[], width: number, fs: number, maxH = Infinity) => segMode(labels, width, fs, maxH).h;
