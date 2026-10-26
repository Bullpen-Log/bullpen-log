import { useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bar } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette } from '~/lib/ui';
import { ReceivedNotes } from '~/org/player';
import { useSpace } from '~/org/space-store';

/** 지난 소속의 받은 일지(결정 8, 계약 8-4) — 읽기만. 말 · 영상 보내기 · 숙제 · 그 조직의 지금 화면은 열리지 않는다 */
export default function FormerScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const org = useSpace().former.find((s) => s.memberId === id);
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title={org?.name ?? '지난 소속'} c={c} />
      <ScrollView contentContainerStyle={[{ padding: 16, gap: 12, paddingBottom: inset.bottom + 32 }, READABLE]}>
        <Text style={[TYPE.sub, { color: c.muted, paddingHorizontal: 4 }]}>나온 곳이라 받은 일지만 읽을 수 있어요.</Text>
        {id ? <ReceivedNotes memberId={id} readOnly /> : null}
      </ScrollView>
    </View>
  );
}
