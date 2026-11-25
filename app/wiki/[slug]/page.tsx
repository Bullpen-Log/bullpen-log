import { redirect } from 'next/navigation';
import { wikiHref } from '@/lib/wiki';

/** 옛 글 주소(v1) — 싱커 틀 안 /training/wiki/[slug] 로. 없는 글이면 거기서 '찾을 수 없는 글' */
export default async function WikiLegacyArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(wikiHref(encodeURIComponent(slug)));
}
