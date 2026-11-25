'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { wikiReader, type WikiSnapshot } from './snapshot';

const WikiContext = createContext<ReturnType<typeof wikiReader> | null>(null);

export function WikiDataProvider({ snapshot, children }: { snapshot: WikiSnapshot; children: ReactNode }) {
  const reader = useMemo(() => wikiReader(snapshot), [snapshot]);
  return <WikiContext.Provider value={reader}>{children}</WikiContext.Provider>;
}

export function useOptionalWiki() {
  return useContext(WikiContext);
}

export function useWiki() {
  const wiki = useOptionalWiki();
  if (!wiki) throw new Error('Missing authorized Wiki data');
  return wiki;
}
