import type { WikiCategoryId } from '@/lib/wiki/types';

/**
 * 싱커위키 글 묶음(docs/designs/sinker-wiki01.md 'IA'). 칸마다 글 수를 맞추려고 채우지 않는다.
 * 보이는 이름은 R1 에서 쉬운 말로(투구 움직임 · 운동 방식) — 번호(id)와 검색은 그대로다.
 */
export const WIKI_CATEGORIES: readonly { id: WikiCategoryId; label: string; hint: string }[] = [
  { id: 'pitching-mechanics', label: '투구 움직임', hint: '코칭에서 쓰는 말과 측정으로 본 것을 나눠 적어요' },
  { id: 'training-concepts', label: '운동 방식', hint: '근육이 힘을 내는 방식과 훈련 방법' },
  { id: 'movements-postures', label: '동작·자세', hint: '움직임 모양과 시작 자세' },
  { id: 'equipment', label: '장비', hint: '무엇인지, 무엇과 다른지, 사진 출처' },
  { id: 'records-metrics', label: '기록·단위', hint: '단위, 잰 값과 적은 값' },
  { id: 'basic-terms', label: '기본 용어', hint: '여러 곳에 걸치는 말' },
];

export function categoryLabel(id: WikiCategoryId): string {
  return WIKI_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export const WIKI_NAME = '싱커위키';
export const WIKI_SUBTITLE = '운동하다 궁금한 말';

export const WIKI_BASE = '/training/wiki';
export const wikiHref = (slug?: string) => (slug ? `${WIKI_BASE}/${slug}` : WIKI_BASE);
