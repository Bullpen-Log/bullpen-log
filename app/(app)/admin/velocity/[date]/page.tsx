import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/dal';
import { explorerHref, parseExplorerPath } from '../explorer-path';

/**
 * 예전 날짜 주소(/admin/velocity/2026-09-28) — 이제 탐색기 [원본]의 그 날짜 폴더로 보낸다.
 * 링크 · 즐겨찾기가 그대로 열리게 남겨 둔다. 날짜가 아니면 [원본] 폴더로.
 */
export default async function VelocityAdminDayRedirect({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  await requireAdmin();
  const { date } = await params;
  redirect(explorerHref(parseExplorerPath('orig', date)));
}
