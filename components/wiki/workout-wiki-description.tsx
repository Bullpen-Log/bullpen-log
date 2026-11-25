'use client';

import { WikiDataProvider } from '@/lib/wiki/context';
import { WikiGlossary } from './wiki-glossary';
import { WikiProse } from './wiki-prose';
import { useWikiRead } from './use-wiki-read';

export function WorkoutWikiDescription({ text, ownerId }: { text: string; ownerId: string | null }) {
  const read = useWikiRead(ownerId);
  const className = 'whitespace-pre-wrap text-sm leading-relaxed text-ink/85';
  if (read?.status !== 'ready') return <p className={className}>{text}</p>;

  return (
    <WikiDataProvider snapshot={read.snapshot}>
      <WikiGlossary>
        <p className={className}><WikiProse text={text} /></p>
      </WikiGlossary>
    </WikiDataProvider>
  );
}
