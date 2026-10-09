import { requireUser } from '@/lib/dal';
import { featureLocks } from '@/lib/feature-locks';
import { recentWeightKg } from '@/lib/nutrition/load';
import { ageOn } from '@/lib/nutrition/targets';
import { toDateKey } from '@/lib/pitch-stats';
import { hasFinishedBasics } from '@/lib/program/load';
import { answersOfUser } from '@/lib/training/setup-answers';
import { TrainingSetupWizard } from './training-setup-wizard';

/**
 * 트레이닝 첫 설정 — 처음 가입한 사람은 트레이닝 탭이 잠겨 있어 여기로 온다(lib/feature-locks.ts, 2026-10-09). 경력 →
 * 웨이트 횟수 → 장비 → 하루 운동 시간 → [던지는 손] → [운동 소모] → 요약을 한 화면에 한 질문씩 답하고 한 번에 저장한다
 * (app/actions/training-setup.ts finishTrainingSetup). 저장하면 탭이 열리고, 탭 페이지가 사용법 튜토리얼을 한 번 보인다.
 *
 * 답은 계정에 있는 값으로 미리 채운다 — 설정을 마친 뒤 다시 온 사람이 처음부터 고르지 않게. 처음 온 사람은 다 비어 있다.
 * 던지는 손은 계정에 없을 때만 묻는다(암케어 · 메커니즘이 읽는데, 투구 기록 설정 전이면 비어 있다). 체중은 끼움
 * '운동 소모'가 셈하는 값이라 영양과 같은 길로 읽는다(최근 체중 기록, 없으면 내 정보). 이 화면 자체는 잠금에 걸리지
 * 않는다(isSetupPath).
 *
 * 기본기 4주를 마쳤는지는 다시 온 사람만 읽는다 — 처음 온 사람은 탭이 잠겨 있어 프로그램을 한 적이 없다. 요약의
 * 프로그램 안내가 '입문'을 가를 때 쓴다(training/page.tsx 와 같은 가름). 저장된 경력이 아니라 마법사에서 고르는 경력을
 * 보므로 경력으로 거르지 않고 읽는다.
 */
export default async function TrainingSetupPage() {
  const user = await requireUser();
  const today = toDateKey(new Date());
  const hasSetup = !featureLocks(user).training;
  const [recent, basicsDone] = await Promise.all([
    recentWeightKg(user.id, today),
    hasSetup ? hasFinishedBasics(user.id) : Promise.resolve(false),
  ]);
  return (
    <TrainingSetupWizard
      name={user.nickname}
      age={ageOn(user.birthDate, today)}
      weightKg={recent ?? user.weightKg}
      askHand={user.throwingHand == null}
      hasSetup={hasSetup}
      basicsDone={basicsDone}
      initial={answersOfUser(user)}
    />
  );
}
