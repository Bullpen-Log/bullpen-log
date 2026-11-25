import Link from 'next/link';
import { WIKI_BASE, WIKI_NAME } from '@/lib/wiki';

/** 싱커위키에 없는 글 — 아직 쓰지 않은 말일 수 있다고 솔직하게, 지어낸 글을 보이지 않는다 */
export default function TrainingWikiNotFound() {
  return (
    <section data-wiki-not-found="" className="space-y-3 py-10 text-center">
      <h1 className="text-xl font-bold text-ink">찾을 수 없는 글이에요</h1>
      <p className="text-base leading-relaxed text-muted">아직 쓰지 않았거나 주소가 바뀐 글이에요.</p>
      <Link href={WIKI_BASE} className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm text-ink">
        {WIKI_NAME}에서 찾기
      </Link>
    </section>
  );
}
