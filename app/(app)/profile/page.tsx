import { requireUser } from '@/lib/dal';
import { Badge, Card, PageHeading } from '@/components/ui';
import { ageFromBirthDate, toDateInputValue } from '@/lib/profile';
import { toDateKey } from '@/lib/pitch-stats';
import { ProfileForm } from './profile-form';

/** 렌더 중에 현재 시각을 직접 읽지 않도록 함수로 감싼다. */
function todayKey() {
  return toDateKey(new Date());
}

export default async function ProfilePage() {
  const user = await requireUser();
  const age = user.birthDate ? ageFromBirthDate(user.birthDate) : null;

  return (
    <div className="space-y-10">
      <PageHeading
        eyebrow="Profile"
        title="내 정보"
        description="투구량 조언과 영상 분석에 쓰이는 기본 정보입니다. 기록이나 영상은 본인만 볼 수 있습니다."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <ProfileForm
            nickname={user.nickname}
            birthDate={user.birthDate ? toDateInputValue(user.birthDate) : ''}
            heightCm={user.heightCm}
            today={todayKey()}
          />
        </Card>

        <div className="space-y-6">
          <Card className="space-y-4">
            <h2 className="text-sm font-bold text-cream">계정</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">이메일</dt>
                <dd className="mt-1 break-all text-cream">{user.email}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">만 나이</dt>
                <dd className="mt-1 text-cream">
                  {age != null ? `${age}세` : '생년월일을 입력해주세요'}
                </dd>
              </div>
              {user.role === 'ADMIN' && (
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted">권한</dt>
                  <dd className="mt-1">
                    <Badge className="border-gold-dim/60 text-gold">관리자</Badge>
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          <p className="rounded-xl border border-line bg-surface px-5 py-4 text-xs leading-relaxed text-muted">
            나이는 안전한 투구수 한도를 정하는 기준이라 투구량 조언에 꼭 필요합니다.
            키는 지금 넣지 않아도 되지만, 영상에서 잰 보폭 같은 길이를 몸 크기로 나눠
            비교할 때 쓰이므로 넣어두면 나중에 분석이 정확해집니다.
          </p>
        </div>
      </div>
    </div>
  );
}
