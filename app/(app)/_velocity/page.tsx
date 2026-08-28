import { requireUser } from '@/lib/dal';
import { PageHeading } from '@/components/ui';
import { VelocityClient } from './velocity-client';

/**
 * 구속 측정 화면 — 지금은 꺼져 있다.
 *
 * 폴더 이름이 밑줄(_)로 시작하면 Next.js 가 주소를 만들지 않는다. 그래서 이
 * 화면은 어디서도 열리지 않는다. 메뉴에서도 뺐다(lib/nav.ts).
 *
 * 지우지 않고 남겨 둔 이유는, 계산하는 부분(lib/velocity-engine)이 아직
 * 쓸모가 있어서다. 자가 시험도 그대로 돈다 — npm run velocity:test.
 *
 * 왜 껐나. 영상으로 재는 구속은 스피드건과 얼마나 맞는지 아직 확인하지 못했다.
 * 맞지 않는 숫자를 보여주면 그 숫자로 훈련을 정하게 되고, 그때는 틀린 것보다
 * 나쁜 일이 된다. 카메라로 직접 찍는 기능과 스피드건 대조가 끝나면 그때 켠다.
 *
 * 다시 켜려면 폴더 이름에서 밑줄을 떼고(_velocity → velocity),
 * lib/nav.ts 에 메뉴를 되돌리면 된다.
 *
 * 스피드건으로 잰 구속을 손으로 적는 것은 그대로다. 그쪽은 투구 일지에 있고
 * 계산은 lib/velocity.ts 가 맡는다 — 이 파일과는 상관이 없다.
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
