import { requireAdmin } from '@/lib/dal';
import {
  loadVelocityAdminDay,
  loadVelocityAdminOverview,
} from '@/lib/velocity-admin-load';
import { parseExplorerPath, type ExplorerPath } from './explorer-path';
import { VelocityAdminView } from './overview-view';

/**
 * 구속 측정 관리자 — 잰 값을 PC 파일 탐색기처럼 폴더로 찾는다(연도 › 월 › 날짜 › 세션 › 공).
 *
 * 폴더는 주소로 고른다(?at=2026-09-28&s=<세션>&pick=<공>, explorer-path.ts). 폰 틀이 아니라 이
 * 저장소의 보통 웹 화면이다(app/(app) 레이아웃이 위 막대 · 도크 · 판을 붙인다). 그리는 것은
 * overview-view.tsx · explorer.tsx.
 */
export default async function VelocityAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : null);
  let path: ExplorerPath = parseExplorerPath(one(sp.at), one(sp.s));

  const [data, day] = await Promise.all([
    loadVelocityAdminOverview(),
    path.level === 'day' || path.level === 'session'
      ? loadVelocityAdminDay(path.date)
      : Promise.resolve(null),
  ]);

  /* 지워진 세션을 가리키는 주소면 그날 폴더로 */
  if (path.level === 'session') {
    const sid = path.sessionId;
    if (!day?.sessions.some((s) => s.id === sid)) {
      path = { level: 'day', year: path.year, month: path.month, date: path.date };
    }
  }

  return <VelocityAdminView data={data} path={path} day={day} pick={one(sp.pick)} />;
}
