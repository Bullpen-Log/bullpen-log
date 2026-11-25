import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { requireUser } from '@/lib/dal';
import { WIKI_NAME, WIKI_SUBTITLE } from '@/lib/wiki/categories';

export const metadata: Metadata = {
  title: WIKI_NAME,
  description: WIKI_SUBTITLE,
  robots: { index: false, follow: false },
};

export default async function TrainingWikiLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return children;
}
