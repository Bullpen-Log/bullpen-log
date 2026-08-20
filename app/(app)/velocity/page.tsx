import { requireUser } from '@/lib/dal';
import { PageHeading } from '@/components/ui';
import { VelocityClient } from './velocity-client';

/**
 * 구속 측정 화면.
 *
 * 계산은 전부 브라우저에서 한다. 서버가 할 일이 없어 이 파일은 로그인 확인과
 * 제목만 맡는다.
 */
export default async function VelocityPage() {
  await requireUser();

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Velocity"
        title="구속 측정"
        description="투구 영상에서 구속을 잽니다. 영상은 서버로 올라가지 않고 기기 안에서만 분석됩니다."
      />
      <VelocityClient />
    </div>
  );
}
