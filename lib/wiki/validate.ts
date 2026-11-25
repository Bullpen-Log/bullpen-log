import { WIKI_CATEGORIES } from '@/lib/wiki/categories';
import { compactWikiText, hasHangul, isLatinTerm, normalizeWikiText } from '@/lib/wiki/normalize';
import type { WikiArticle, WikiAsset, WikiBacklogItem, WikiSource } from '@/lib/wiki/types';

/**
 * 싱커위키 내용 검사 — 화면에 싣기 전, 그리고 시험(scripts/sinker-wiki-selftest.mts)에서 돈다.
 * 오류 문자열 목록을 돌려준다(빈 배열이면 통과). 순수 함수 — DB · 파일 · 네트워크를 안 쓴다.
 */

/**
 * 본문에서 저절로 연결하면 안 되는 말 — 뜻이 여럿이거나 짧은 줄임말 · 단위 · 숫자.
 * ('드롭'은 볼 드롭 · 드롭 캐치 · 뎁스 드롭 같은 다른 운동 이름에도 들어가고, '힌지'는 힌지 스로우 드릴에도 있다)
 */
export const NEVER_AUTO_LINK: readonly string[] = [
  'drop', '드롭', 'hold', '홀드', 'set', '세트', 'rep', '렙', 'ssc', 'mph', 'km/h', 'kmh', 'kg', 'lb',
  'band', 'tube', 'ball', '볼', '공', '힌지', 'hinge', '구속', '마일', '아이소', 'iso', 'plyo', '플라이오', '메디신', 'med',
];

/** 확신을 꾸미는 말 — 의학적 확신 · 보장 · 지어낸 전문가 표시 */
const FORBIDDEN_PHRASES: readonly string[] = [
  '보장해요', '보장합니다', '효과가 확실', '반드시 좋아', '부상을 막아요', '부상을 예방해요', '부상을 예방합니다',
  '구속이 올라가요', '구속이 오릅니다', '전문가 검수', '전문가가 검토', '의사 승인', '의학적으로 검증', '임상적으로 입증',
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type WikiContent = {
  articles: readonly WikiArticle[];
  sources: readonly WikiSource[];
  assets: readonly WikiAsset[];
  backlog: readonly WikiBacklogItem[];
};

function dupes<T>(items: readonly T[], key: (t: T) => string): string[] {
  const seen = new Map<string, number>();
  for (const it of items) seen.set(key(it), (seen.get(key(it)) ?? 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([k]) => k);
}

function articleText(a: WikiArticle): string[] {
  const sec = [a.encounter, a.explain, a.notEstablished];
  return [
    a.title,
    a.summary,
    a.label ?? '',
    a.reading.card,
    a.reading.example,
    ...a.reading.keyPoints,
    ...sec.flatMap((s) => [s.heading, ...s.paragraphs, ...(s.bullets ?? [])]),
    ...a.claims.map((c) => c.text),
  ];
}

/** 글 한 편의 문제 — 고르개(select)가 공개 묶음에서 빼는 데도 쓴다. now = 이 시각보다 뒤의 검토 날짜는 '미리 채운 것' */
export function validateArticle(a: WikiArticle, ctx: { sources: readonly WikiSource[]; assets: readonly WikiAsset[]; articleIds: ReadonlySet<string>; now: string }): string[] {
  const e: string[] = [];
  const at = (m: string) => e.push(`${a.id}: ${m}`);
  if (!/^wk-[a-z0-9-]+$/.test(a.id)) at('id 는 wk-… 영문 소문자');
  if (!SLUG.test(a.slug)) at(`slug "${a.slug}" 는 ASCII 소문자 · 붙임표만`);
  if (!WIKI_CATEGORIES.some((c) => c.id === a.category)) at(`모르는 묶음 ${a.category}`);
  if (!a.title.trim() || !a.english.trim() || !a.summary.trim()) at('제목 · 영어 이름 · 한 줄 뜻이 비어 있음');
  // 짧게 읽기 — 정말 짧게(카드 한 줄 · 예시 한 문장 · 꼭 알아둘 점 1~2개)
  const r = a.reading;
  if (!r || r.card.trim().length < 4 || r.card.length > 40) at('짧게 읽기 카드 한 줄은 4~40자');
  if (!r || r.example.trim().length < 10 || r.example.length > 120) at('짧게 읽기 예시는 10~120자');
  if (!r || r.keyPoints.length < 1 || r.keyPoints.length > 2 || r.keyPoints.some((k) => !k.trim() || k.length > 80)) at('꼭 알아둘 점은 1~2개, 하나에 80자 안');
  for (const s of [a.encounter, a.explain, a.notEstablished]) {
    if (!s.heading.trim() || s.paragraphs.length === 0 || s.paragraphs.some((p) => !p.trim())) at(`"${s.heading}" 칸이 비어 있음`);
  }
  // 이름
  /* 띄어쓰기만 다른 이름(힙 힌지 · 힙힌지)은 본문 연결에 둘 다 필요해 허용 — 글자까지 같은 것만 막는다 */
  const dupAlias = dupes(a.aliases, normalizeWikiText);
  if (dupAlias.length) at(`같은 다른 이름이 둘: ${dupAlias.join(', ')}`);
  for (const t of a.autoLink) {
    if (!a.aliases.some((al) => al === t)) at(`자동 연결 "${t}" 가 다른 이름(aliases)에 없음`);
    if (NEVER_AUTO_LINK.includes(t.toLowerCase())) at(`자동 연결 금지 말 "${t}"`);
    if (/^\d/.test(t)) at(`숫자로 시작하는 자동 연결 "${t}"`);
    if (isLatinTerm(t) && t.replace(/[^A-Za-z]/g, '').length < 4) at(`짧은 영어 자동 연결 "${t}"`);
    if (hasHangul(t) && t.replace(/\s/g, '').length < 2) at(`한 글자 자동 연결 "${t}"`);
  }
  // 이어진 글
  for (const [kind, ids] of [['related', a.related], ['prerequisites', a.prerequisites], ['confusable', a.confusable]] as const) {
    for (const id of ids) {
      if (id === a.id) at(`${kind} 에 자기 자신`);
      else if (!ctx.articleIds.has(id)) at(`${kind} 의 ${id} 는 없는 글(준비 중인 말은 연결하지 않음)`);
    }
    if (dupes(ids, (x) => x).length) at(`${kind} 에 같은 글이 둘`);
  }
  // 주장 · 출처
  if (a.claims.length === 0) at('주장(claims)이 없음');
  if (dupes(a.claims, (c) => c.id).length) at('주장 번호가 겹침');
  for (const c of a.claims) {
    if (!c.text.trim()) at(`주장 ${c.id} 가 비어 있음`);
    if (c.editorial && c.sources.length) at(`주장 ${c.id}: 편집 설명인데 출처가 붙음`);
    if (!c.editorial && c.sources.length === 0) at(`주장 ${c.id}: 출처도 편집 표시도 없음`);
    for (const s of c.sources) if (!ctx.sources.some((x) => x.id === s.id)) at(`주장 ${c.id}: 없는 출처 ${s.id}`);
  }
  // 사진
  for (const id of a.assetIds ?? []) if (!ctx.assets.some((x) => x.id === id)) at(`없는 사진 ${id}`);
  // 판 기록
  if (a.revisions.length === 0) at('판 기록이 없음');
  a.revisions.forEach((r, i) => {
    if (r.version !== i + 1) at(`판 번호가 차례가 아님(${r.version})`);
    if (!DATE.test(r.date) || !r.author.trim() || !r.reason.trim()) at(`판 ${r.version} 의 날짜 · 작성자 · 이유`);
    if (r.review) {
      if (!DATE.test(r.review.at) || !r.review.by.trim()) at(`판 ${r.version} 검토 기록 형식`);
      if (r.review.at > ctx.now) at(`판 ${r.version} 검토 날짜 ${r.review.at} 가 오늘(${ctx.now})보다 뒤 — 미리 채움`);
      if (r.review.at < r.date) at(`판 ${r.version} 검토 날짜가 작성보다 앞`);
    }
  });
  const last = a.revisions[a.revisions.length - 1];
  if ((a.status === 'published' || a.status === 'reviewed') && !last?.review) at(`${a.status} 인데 마지막 판에 검토 기록이 없음`);
  if (a.status === 'retracted' && !a.retraction?.reason) at('내린 글인데 까닭이 없음');
  if (a.status !== 'retracted' && a.retraction) at('내리지 않은 글에 내린 까닭');
  // 확신을 꾸미는 말
  const text = articleText(a).join('\n');
  for (const p of FORBIDDEN_PHRASES) if (text.includes(p)) at(`쓰면 안 되는 표현 "${p}"`);
  // 화면 글 규칙 — 줄표(—) 없이 문장으로 끊는다(프로젝트 화면 글 규칙)
  if (text.includes('—')) at('화면 글에 줄표(—)가 있음 — 마침표나 괄호로');
  return e;
}

export function validateSource(s: WikiSource, now: string): string[] {
  const e: string[] = [];
  const at = (m: string) => e.push(`${s.id}: ${m}`);
  if (!/^S\d{2}$/.test(s.id)) at('id 는 S00 꼴');
  if (!s.title.trim() || !s.venue.trim() || !s.limits.trim()) at('제목 · 출처 · 한계가 비어 있음');
  if (s.year !== null && (s.year < 1900 || Number(now.slice(0, 4)) < s.year)) at(`출판 연도 ${s.year} 가 이상함`);
  if (s.doi !== undefined && !/^10\.\d{4,9}\/\S+$/.test(s.doi)) at(`DOI 형식 ${s.doi}`);
  if (!/^(https:\/\/|repo:)/.test(s.url)) at('주소는 https:// 또는 repo:');
  if (s.checks.length === 0) at('확인 기록이 없음');
  for (const c of s.checks) {
    if (!DATE.test(c.at) || !c.by.trim()) at('확인 기록 형식');
    if (c.at > now) at(`확인 날짜 ${c.at} 가 미래`);
  }
  return e;
}

export function validateAsset(a: WikiAsset, now: string): string[] {
  const e: string[] = [];
  const at = (m: string) => e.push(`${a.id}: ${m}`);
  if (!a.src.startsWith('/wiki/')) at('사진의 묶음 경로는 /wiki/로 시작해야 함');
  for (const k of ['alt', 'caption', 'creator', 'sourcePage', 'originalUrl', 'license', 'licenseUrl', 'credit', 'modification', 'scopeNote'] as const) {
    if (!String(a[k]).trim()) at(`${k} 가 비어 있음`);
  }
  if (!/^https:\/\//.test(a.sourcePage) || !/^https:\/\//.test(a.licenseUrl) || !/^https:\/\//.test(a.originalUrl)) at('원본 · 라이선스 주소는 https');
  // 상업 사용이 되는 사진 라이선스만(NC · ND · 카탈로그 사진은 쓰지 않는다 — 설계 'Photo rights')
  if (!/^(CC BY(-SA)? [0-9.]+|CC0 1\.0|Public domain)$/.test(a.license) || /NC|ND/.test(a.license)) at(`쓸 수 없는 라이선스 ${a.license}`);
  if (!a.verified.by.trim()) at('사진 확인자가 비어 있음');
  if (!/^[0-9a-f]{40}$/.test(a.originalSha1)) at('원본 SHA-1 형식');
  if (a.width <= 0 || a.height <= 0) at('크기');
  if (!a.credit.includes(a.creator) || !a.credit.includes(a.license)) at('출처 표기에 작성자 · 라이선스가 없음');
  if (!DATE.test(a.verified.at) || a.verified.at > now) at('확인 날짜');
  return e;
}

/** 전체 검사 — 겹치는 번호 · 주소 · 이름, 준비 중인 말과 글의 겹침까지 */
export function validateWikiContent(c: WikiContent, now: string): string[] {
  const e: string[] = [];
  const ids = new Set(c.articles.map((a) => a.id));
  for (const d of dupes(c.articles, (a) => a.id)) e.push(`글 번호가 겹침: ${d}`);
  for (const d of dupes(c.articles, (a) => a.slug)) e.push(`주소가 겹침: ${d}`);
  for (const d of dupes(c.sources, (s) => s.id)) e.push(`출처 번호가 겹침: ${d}`);
  for (const d of dupes(c.assets, (s) => s.id)) e.push(`사진 번호가 겹침: ${d}`);
  // 다른 글끼리 같은 이름(자동 연결 · 검색이 갈라짐)
  const owner = new Map<string, string>();
  for (const a of c.articles) {
    for (const n of [a.title, ...a.aliases]) {
      const k = compactWikiText(n);
      const prev = owner.get(k);
      if (prev && prev !== a.id) e.push(`"${n}" 가 ${prev} 와 ${a.id} 에 같이 있음`);
      owner.set(k, a.id);
    }
  }
  for (const b of c.backlog) {
    if (!b.term.trim() || !b.origin.trim()) e.push('준비 중인 말이 비어 있음');
    if (owner.has(compactWikiText(b.term))) e.push(`준비 중인 말 "${b.term}" 이 이미 글로 있음`);
  }
  for (const a of c.articles) e.push(...validateArticle(a, { sources: c.sources, assets: c.assets, articleIds: ids, now }));
  for (const s of c.sources) e.push(...validateSource(s, now));
  for (const a of c.assets) e.push(...validateAsset(a, now));
  const used = new Set(c.articles.flatMap((a) => a.claims.flatMap((cl) => cl.sources.map((s) => s.id))));
  for (const s of c.sources) if (!used.has(s.id)) e.push(`${s.id}: 어느 글도 쓰지 않는 출처`);
  return e;
}
