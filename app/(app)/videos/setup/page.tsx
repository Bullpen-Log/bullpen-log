import { requireUser } from '@/lib/dal';
import { toDateKey } from '@/lib/pitch-stats';
import { ageOn } from '@/lib/nutrition/targets';
import { pitchAnswersOf } from '@/lib/pitching/setup-answers';
import { PitchSetupWizard } from './pitch-setup-wizard';

/**
 * 투구 기록 첫 설정 — 처음 가입한 사람은 투구 기록 탭이 잠겨 있어 여기로 온다(lib/feature-locks.ts, 2026-10-09).
 * 하루 투구 한도(왜 묻는지) → 던지는 손 → 평소 투구량 → 요약을 한 화면에 한 질문씩 답하고 한 번에
 * 저장한다(app/actions/pitch-setup.ts finishPitchSetup). 저장하면 탭이 열리고, 탭 페이지가 사용법 튜토리얼을 한 번 보인다.
 *
 * 계정에 있는 값으로 칸을 미리 채운다 — 설정을 마친 사람이 다시 들어와 고칠 수 있게(옛 계정은 가입 때 답한 값이
 * 들어 있다). 나이는 생년월일로(하루 투구 한도 카드). 이 화면 자체는 잠금에 걸리지 않는다(isSetupPath).
 */
export default async function PitchSetupPage() {
  const user = await requireUser();
  const age = ageOn(user.birthDate, toDateKey(new Date()));
  return (
    <PitchSetupWizard
      name={user.nickname}
      age={age}
      done={user.pitchSetupAt !== null}
      initial={pitchAnswersOf(user)}
    />
  );
}
