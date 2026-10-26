import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Wordmark } from '@/components/logo';
import { getCurrentUser } from '@/lib/dal';
import { isNativeUserAgent } from '@/lib/app-env';
import { OpenNative } from '@/app/(session)/velocity/open-native';

/**
 * 웹 받이 — 조직 알림 · 권한 없음 주소(/org/open · /org/lost, lib/org/space-nav.ts)는 앱 껍데기가 가로채는 앱 주소다(계약 8-4 · 8-5).
 * PC 웹 알림 목록에서 누르거나, 새 화면 묶음을 아직 안 받은 옛 앱이 웹으로 열면 여기로 온다 — 404 대신
 * 마스터 계정은 웹 관리 화면, 앱 웹뷰는 앱에 그 주소를 알리고 돌아가고(새 앱 껍데기가 받는다 · 옛 앱은 그냥 돌아간다), 그 밖(PC 선수)은 '앱에서 열어 주세요'.
 */
export async function OrgFallback({ lost, nativePath }: { lost: boolean; nativePath: string }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.accountType === 'MASTER') redirect('/manage');
  if (isNativeUserAgent((await headers()).get('user-agent'))) return <OpenNative path={nativePath} cover={false} />;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-page px-6 text-center">
      <Wordmark className="text-4xl text-ink" />
      <div className="flex max-w-xs flex-col gap-3">
        <h1 className="text-xl font-semibold text-ink">{lost ? '이 팀 · 레슨장을 볼 수 없어요' : '싱커 앱에서 열어 주세요'}</h1>
        <p className="text-sm leading-relaxed text-muted">
          {lost
            ? '나왔거나 코치가 명단에서 뺐을 수 있어요. 받은 레슨일지는 앱의 더보기 › 소속 관리에서 읽을 수 있어요.'
            : '팀 · 레슨장 소식은 싱커 앱의 팀 · 레슨장 공간에서 봐요. 앱 위쪽의 공간 고르개로 옮겨 가요.'}
        </p>
      </div>
    </main>
  );
}
