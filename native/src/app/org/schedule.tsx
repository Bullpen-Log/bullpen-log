import { useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bar } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { usePalette } from '~/lib/ui';
import { ScheduleTab } from '~/org/coach';
import { spaceOf } from '~/org/space-store';

/** 레슨장 코치 더보기 '예정 활동'(결정 6, 계약 8-3) — 덕아웃 예약 없이 잡은 레슨 시간 · 지도 확인. 예약 관리가 아니다 */
export default function OrgScheduleScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { org } = useLocalSearchParams<{ org: string }>();
  const space = spaceOf(`${org}:c`);
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title="예정 활동" c={c} />
      <ScrollView contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>{space ? <ScheduleTab space={space} c={c} /> : null}</ScrollView>
    </View>
  );
}
