import { categoryLabel } from '@/lib/wiki/categories';
import { CHECK_SCOPE_LABEL, CLAIM_ROLE_LABEL, SOURCE_DESIGN_LABEL } from '@/lib/wiki/source-labels';
import type { WikiSearchHit } from '@/lib/wiki/search';
import type { WikiArticle, WikiCategoryId, WikiClaim, WikiSource } from '@/lib/wiki/types';

/**
 * 싱커위키 화면 글 — 웹(components/wiki)과 앱(native/src/wiki)이 같은 말을 쓰게 한 곳에 둔다.
 * 계산 없는 글 조각만. 화면 모양은 각자 그린다.
 */
export const WIKI_TEXT = {
  readMore: '자세히 읽기',
  close: '닫기',
  closeBack: '닫고 하던 곳으로',
  openNewWindow: '새 창에서 열기',
  unknownTitle: '아직 쓰지 않은 말',
  unknownBody: '이 말은 싱커위키에 아직 쓰지 않았어요. 정확한 글을 준비하고 있어요.',
  readNext: '이어서 읽기',
  prerequisites: '먼저 알면 좋은 말',
  confusable: '헷갈리기 쉬운 말',
  related: '관련된 말',
  evidence: '자세한 근거',
  evidenceIntro: '아래 주장마다 어떤 자료와 어떻게 이어지는지 적었어요. 자료의 종류와 한계를 함께 읽어 주세요. 확신을 숫자로 매기지 않아요.',
  sources: '자료',
  editorial: '싱커위키 편집 설명이에요. 출처로 확인한 주장이 아니에요',
  care: '몸이 아프거나 다친 곳이 있으면 이 글보다 담당 코치 · 의료진의 판단을 따르세요.',
  previous: (title: string) => `이전: ${title}`,
  searchLabel: '싱커위키에서 찾기',
  searchPlaceholder: '용어 · 운동 · 장비 검색',
  clearQuery: '검색어 지우기',
  clearCategory: '묶음 거르기 풀기',
  all: '전체',
  firstTerms: '먼저 알아두면 좋은 말',
  equipmentTitle: '장비 한눈에',
  equipmentHint: '밴드 · 덤벨은 출처를 확인한 사진과 함께 봐요.',
  equipmentButton: (n: number) => `장비 글 ${n}편 모두 보기`,
  example: '예를 들면',
  keyPoints: '꼭 알아둘 점',
  seeAlso: '같이 보면 좋은 말',
  detail: '자세한 설명',
  evidenceTitle: '근거와 출처',
  editInfo: '편집 정보',
  photoInfo: '사진 정보',
  originalPage: '원본 파일 쪽',
  licenseLink: (license: string) => `라이선스 ${license}`,
  /* 홈 장비 카드는 사진을 4:3 칸에 맞춰 가운데만 보인다(웹 object-cover · 앱 resizeMode cover). 그 자리의 출처 표기에 이렇게 보인다고 밝힌다(CC BY-SA 표기 조건) */
  homeCropNote: '이 카드에서는 사진 가운데를 4:3 으로 잘라 보여요(파일은 그대로). 자르지 않은 사진은 글에서 볼 수 있어요.',
  englishLine: (english: string, others: readonly string[]) => `${english}${others.length ? ` · 다른 이름 ${others.join(', ')}` : ''}`,
  homeNote: '참고 글이에요. 아픈 곳이 있으면 코치 · 의료진과 상의하세요.',
  resultCount: (n: number) => `${n}편`,
  noResult: '맞는 글이 없어요.',
  noResultHint: '아직 쓰지 않은 말일 수 있어요. 다른 이름이나 영어로도 찾아보세요.',
  backlogTitle: (n: number) => `준비 중인 말 ${n}개`,
  backlogIntro: '아직 글로 쓰지 않았어요. 빈 글을 미리 만들지 않고, 출처를 확인한 뒤에 채워요.',
  disclaimer: '싱커위키는 운동 설명을 읽기 위한 참고 글이에요. 진단 · 처방이 아니고, 아픈 곳이 있으면 담당 코치 · 의료진의 판단을 따르세요.',
} as const;



/** 이어서 볼 말 — 먼저 알 말 · 헷갈리는 말 · 관련된 말을 한 줄로(겹치면 한 번) */
export function seeAlsoIds(a: WikiArticle, max = 6): string[] {
  return [...new Set([...a.prerequisites, ...a.confusable, ...a.related])].slice(0, max);
}

/**
 * 결과 줄의 영어 · 다른 이름 힌트 — 찾은 말이 제목에 없을 때만(예: 'isom' → isometric). 제목으로 찾았으면 아무것도 안 붙인다
 */
export function matchHint(h: WikiSearchHit): string | null {
  if (h.field === 'english') return h.article.english;
  if (h.field === 'alias' && !h.article.title.includes(h.matched)) return h.matched;
  if (h.field === 'body') return '본문에서 찾음';
  return null;
}

/** 목록 위 한 줄 — 찾는 중이면 몇 편 찾았는지, 아니면 묶음 이름과 편 수 */
export function resultCountLine(query: string, category: WikiCategoryId | null, n: number): string {
  return query.trim() ? `"${query.trim()}" 찾은 글 ${n}편` : `${category ? categoryLabel(category) : '모든'} 글 ${n}편`;
}

/** 결과 줄 밑 — 묶음과, 다른 이름 · 본문으로 찾았으면 그렇다고 */
export function hitNote(h: WikiSearchHit): string {
  return `${categoryLabel(h.article.category)}${h.field === 'alias' ? ` · '${h.matched}'(으)로 찾음` : ''}${h.field === 'body' ? ' · 본문에서 찾음' : ''}`;
}

/** 제목 · 영어 이름에 이미 든 이름은 빼고 다른 이름 몇 개 */
export function otherNames(a: WikiArticle, max = 6): string[] {
  return a.aliases.filter((n) => !a.title.includes(n) && n.toLowerCase() !== a.english.toLowerCase()).slice(0, max);
}

/** 짧은 뜻 밑 한 줄 — 무엇인지(묶음 · 꼬리표)와 처방이 아니라는 것 */
export function briefCaveat(a: WikiArticle): string {
  return `${a.label ? `${a.label}이에요. ` : ''}${categoryLabel(a.category)} 글의 짧은 뜻이에요. 몸 상태 판단이나 처방이 아니에요.`;
}

/** 주장 밑 한 줄 — 어느 자료와 어떻게 이어지는지(편집 설명이면 그렇다고) */
export function claimSourceLine(c: WikiClaim): string {
  if (c.editorial) return WIKI_TEXT.editorial;
  return c.sources.map((s) => `${s.id} ${CLAIM_ROLE_LABEL[s.role]}${s.note ? `(${s.note})` : ''}`).join(' · ');
}

/** 자료 한 줄 — 지은이 · 연도(모르면 그렇다고) · 실린 곳 · DOI · 자료 종류 */
export function sourceMetaLine(s: WikiSource): string {
  return `${s.authors.length ? `${s.authors.join(', ')} · ` : ''}${s.year ?? '연도 확인 못 함'} · ${s.venue}${s.doi ? ` · DOI ${s.doi}` : ''} · ${SOURCE_DESIGN_LABEL[s.design]}`;
}

/** 누가 언제 어디까지 확인했는지 */
export function sourceChecksLine(s: WikiSource): string {
  return `확인: ${s.checks.map((c) => `${c.by} ${c.at} · ${CHECK_SCOPE_LABEL[c.scope]}`).join(' / ')}`;
}

/** 글이 인용하는 자료 번호(나온 차례) */
export function articleSourceIds(a: WikiArticle): string[] {
  return [...new Set(a.claims.flatMap((c) => c.sources.map((s) => s.id)))];
}

/** 글 끝 — 판 · 작성 · 검토(지어내지 않고 기록 그대로) · 공개 전이라는 것 · 아플 때 */
export function provenanceLines(a: WikiArticle): string[] {
  const last = a.revisions[a.revisions.length - 1];
  const review = last.review
    ? `검토: ${last.review.by} ${last.review.at} (${last.review.kind === 'self' ? '작성자 자체 점검' : '독립 검토'})`
    : '검토 기록 없음';
  return [`${last.version}판 · ${last.date} · 작성 ${last.author}`, `${review} · 로그인한 싱커 회원에게 제공하는 참고 글이에요.`, WIKI_TEXT.care];
}
