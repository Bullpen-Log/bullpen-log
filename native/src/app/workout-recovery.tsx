import { Text } from 'react-native';
import { usePalette } from '~/lib/ui';
import { Screen } from '~/training/screen';
import { RecoveryList } from '~/workout/recovery-list';

/**
 * EX-LOAD01-R1 — 못 보낸 운동 세트(앱 화면, /workout-recovery). 운동 화면 밖에서 언제든 연다 — 트레이닝 탭의 알림 한 줄
 * (~/workout/recovery-notice)이 여기로 데려온다. 세트는 이 폰(AsyncStorage)에만 있어 서버에서 받을 것이 없다 — 틀은 늘 그린다.
 * 지금 계정의 세트만 고치고 보내며, 다른 계정 · 계정을 모르는 세트는 수만 보인다(~/workout/recovery-list).
 */
const LOCAL = { data: true, failed: null, refreshing: false, load: () => {}, refresh: () => {} };

export default function WorkoutRecoveryScreen() {
  const c = usePalette();
  return (
    <Screen title="못 보낸 세트" state={LOCAL}>
      <Text style={{ color: c.muted, fontSize: 15, lineHeight: 21 }}>
        이 폰에 남아 아직 서버에 저장되지 않은 운동 세트예요. 저장이 확인되거나 직접 버릴 때까지 지우지 않아요.
      </Text>
      <RecoveryList />
    </Screen>
  );
}
