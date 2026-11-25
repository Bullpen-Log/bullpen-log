import { redirect } from 'next/navigation';
import { WIKI_BASE } from '@/lib/wiki';

/** 옛 주소(v1) — 싱커 틀 안 /training/wiki 로. 검색어 · 묶음(?q= · ?cat=)은 그대로 넘긴다 */
export default async function WikiLegacyHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const keep = new URLSearchParams();
  for (const k of ['q', 'cat']) {
    const v = sp[k];
    if (typeof v === 'string' && v) keep.set(k, v);
  }
  const qs = keep.toString();
  redirect(qs ? `${WIKI_BASE}?${qs}` : WIKI_BASE);
}
