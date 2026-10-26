import type { Metadata } from 'next';
import { OrgFallback } from '../open-fallback';

export const metadata: Metadata = { title: '팀 · 레슨장' };

export default function OrgLostPage() {
  return <OrgFallback lost nativePath="/org/lost" />;
}
