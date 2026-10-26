import type { Metadata } from 'next';
import { OrgFallback } from '../open-fallback';

export const metadata: Metadata = { title: '팀 · 레슨장 소식' };

type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function OrgOpenPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = new URLSearchParams({ org: one(sp.org), as: one(sp.as), to: one(sp.to) });
  return <OrgFallback lost={false} nativePath={`/org/open?${q.toString()}`} />;
}
