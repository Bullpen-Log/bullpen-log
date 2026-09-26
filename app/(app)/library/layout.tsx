import type { ReactNode } from 'react';
import { PageHeading } from '@/components/ui';
import { LibraryTabs } from './tabs';

/**
 * 트레이닝 운동과 메커니즘 드릴을 한 지붕 아래 둔다.
 * 나중에 AI가 처방한 운동도 이 목록에서 골라오므로,
 * 회원은 "라이브러리"를 재료 창고로 인식하면 된다.
 */
export default function LibraryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-8">
      <PageHeading eyebrow="Library" title="라이브러리" />
      <LibraryTabs />
      {children}
    </div>
  );
}
