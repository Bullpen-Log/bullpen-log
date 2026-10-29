import { headers } from 'next/headers';
import HomePage from '@/app/(app)/today/home-page';
import { isExpoUserAgent } from '@/lib/app-env';
import { betaPanelHidden } from '@/lib/dal';

/*
 * 새 앱(BullpenNative)에서는 이 판을 그리지 않는다 — 앱이 제 화면(native/src/home · pitch)으로 늘 덮어 아무도 못 보는데, 웹을 새로
 * 불러오거나 덕아웃 · 체크인에서 돌아올 때마다 서버가 통째로 그렸고(조회 수십), 가려진 홈 요약 칸은 3초마다 계속 넘어갔다(2026-10-24 전체 검토).
 * 옛 앱(Capacitor) · 브라우저는 그대로.
 */
export default async function HomeTabPage(props: Parameters<typeof HomePage>[0]) {
  /* 출시 전 베타 — 베타 홈은 틀이 그린다(lib/dal.ts betaPanelHidden) */
  if (await betaPanelHidden()) return null;
  if (isExpoUserAgent((await headers()).get('user-agent'))) return null;
  return <HomePage {...props} />;
}
