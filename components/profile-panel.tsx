import { AvatarPicker } from '@/app/(app)/profile/avatar-picker';
import { ProfileForm } from '@/app/(app)/profile/profile-form';
import { AccountActions } from '@/app/(app)/profile/account-actions';
import type { Sex } from '@/lib/profile';

export type ProfileData = {
  email: string;
  nickname: string;
  /** YYYY-MM-DD. 아직 안 적었으면 빈 문자열 */
  birthDate: string;
  /** 'M' | 'F'. 이 칸이 생기기 전에 가입했으면 null */
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  wingspanCm: number | null;
  targetVelocity: number | null;
  dailyWorkoutMinutes: number | null;
  baseline: {
    baselineFreq: string | null;
    baselineVolume: string | null;
    baselineIntensity: string | null;
    baselineWorkoutFreq: string | null;
    throwingHand: string | null;
    competitionLevel: string | null;
  };
  isAdmin: boolean;
};

/**
 * 내 정보 전부 — 창 안에서 다 끝낸다.
 *
 * 한동안 두 벌이었다. 창에는 자주 고치는 넷만 있고, 나머지는 '자세히'를 눌러
 * 화면으로 나가서 고쳤다. 그런데 무엇이 창에 있고 무엇이 화면에 있는지 외워야
 * 했고, 넷 중 하나를 고치러 열었다가 결국 나가는 일이 잦았다.
 *
 * 그래서 화면을 없애고 전부 여기로 넣었다 — 사진 · 기본 정보 · 평소 문진 ·
 * 계정. 길지만 창 안에서 굴러가고, 나가야 할 일이 없다.
 *
 * 저장 버튼이 두 벌인 것은 그대로 둔다. 사진은 고르는 순간 올라가고 나머지는
 * 다 고친 뒤 한 번에 저장한다. 하나로 묶으면 사진만 바꾸려 해도 문진을 전부
 * 지나야 한다.
 */
export function ProfilePanel({
  data,
  avatarUrl,
  today,
}: {
  data: ProfileData;
  /** 지금 걸려 있는 사진의 임시 주소 */
  avatarUrl: string | null;
  /** 오늘 날짜(YYYY-MM-DD). 생년월일에서 앞날을 못 고르게 막는다. */
  today: string;
}) {
  return (
    <div className="space-y-6">
      <AvatarPicker nickname={data.nickname} initialUrl={avatarUrl} />

      <div className="border-t border-line pt-6">
        <ProfileForm
          nickname={data.nickname}
          birthDate={data.birthDate}
          sex={data.sex}
          heightCm={data.heightCm}
          weightKg={data.weightKg}
          wingspanCm={data.wingspanCm}
          targetVelocity={data.targetVelocity}
          dailyWorkoutMinutes={data.dailyWorkoutMinutes}
          baseline={data.baseline}
          today={today}
        />
      </div>

      <section className="space-y-3 border-t border-line pt-6">
        <div>
          <h3 className="text-sm font-bold text-ink">계정</h3>
          <p className="mt-0.5 text-xs break-all text-muted">{data.email}</p>
        </div>
        {data.isAdmin && (
          <p className="text-xs text-muted">
            관리자 계정입니다 — 트레이닝 영상과 메커니즘 가이드를 등록·삭제할 수
            있습니다.
          </p>
        )}
        <AccountActions />
      </section>
    </div>
  );
}
