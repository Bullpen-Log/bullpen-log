import { headers } from 'next/headers';
import { expoLevel } from '@/lib/app-env';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { requireAdmin } from '@/lib/dal';
import { PageHeading } from '@/components/ui';
import { ArticleForm } from './article-form';

export default async function NewArticlePage() {
  // 자료실은 운영자가 올리는 곳이다. 주소를 직접 쳐서 들어와도 막힌다.
  await requireAdmin();
  /* 새 아이폰 앱(Expo, BullpenNative/7 부터)이면 앱 글쓰기 화면으로(native/src/app/board/new.tsx) */
  if (expoLevel((await headers()).get('user-agent')) >= 7) return <OpenNative path="/board/new" cover={false} />;

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageHeading eyebrow="Library" title="자료 등록" />
      <ArticleForm />
    </div>
  );
}
