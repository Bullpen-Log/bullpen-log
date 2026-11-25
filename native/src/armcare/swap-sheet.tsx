import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import type { PlayerItem } from '@/app/(session)/armcare/play/[id]/armcare-player';
import { ARMCARE_SWAP_TABS, type ArmcareSwapOptions, type ArmcareSwapRequest } from '@/lib/armcare/swap';
import { useArmcareSwap } from '@/lib/armcare/use-swap';
import { rpc } from '~/lib/rpc';
import { TYPE, type Palette } from '~/lib/ui';
import { Press } from '~/shell/press';
import { Segmented } from '~/shell/heading';
import { Sheet } from '~/workout/sheets';

const load = (input: ArmcareSwapRequest) =>
  rpc<ArmcareSwapOptions | { error: string }>('armcare.armcareSwapOptions', input);
const save = (input: ArmcareSwapRequest & { toId: string }) =>
  rpc<{ item: PlayerItem } | { error: string }>('armcare.replaceArmcareExercise', input);

export function ArmcareSwapSheet({ request, title, onDone, onClose, c }: {
  request: ArmcareSwapRequest;
  title: string;
  onDone: (item: PlayerItem) => void;
  onClose: () => void;
  c: Palette;
}) {
  const swap = useArmcareSwap(request, load, save, onDone);
  return (
    <Sheet open title="운동 교체" description={title} onClose={() => { if (!swap.changing.current) onClose(); }} c={c}>
      <Segmented label="운동 교체" size="md" options={ARMCARE_SWAP_TABS} value={swap.tab} onChange={swap.setTab} />
      {swap.tab === 'search' ? (
        <TextInput
          accessibilityLabel="암케어 운동 이름 검색"
          placeholder="암케어 운동 검색"
          placeholderTextColor={c.muted}
          value={swap.query}
          onChangeText={swap.setQuery}
          autoCorrect={false}
          returnKeyType="search"
          style={[st.search, { backgroundColor: c.chip, color: c.ink }]}
        />
      ) : null}
      {swap.loadError ? (
        <View style={st.message}>
          <Text style={[TYPE.body, { color: c.muted }]}>{swap.loadError}</Text>
          <Press onPress={swap.retry} accessibilityRole="button" style={st.retry}>
            <Text style={[TYPE.buttonCompact, { color: c.link }]}>다시 불러오기</Text>
          </Press>
        </View>
      ) : !swap.options ? <ActivityIndicator /> : null}
      {swap.error ? <Text accessibilityRole="alert" style={[TYPE.body, { color: c.danger }]}>{swap.error}</Text> : null}
      {swap.options && swap.rows.length === 0 ? (
        <Text style={[TYPE.body, { color: c.muted }]}>
          {swap.tab === 'similar' ? '비슷한 운동이 없어요. 찾기에서 골라 주세요.' : '검색 결과가 없어요.'}
        </Text>
      ) : null}
      {swap.rows.map((pick) => (
        <View key={pick.id} style={[st.row, { backgroundColor: c.card }]}>
          <View style={st.name}>
            <Text style={[TYPE.card, { color: c.ink }]}>{pick.title}</Text>
            <Text style={[TYPE.sub, { color: c.muted }]}>{pick.detail}</Text>
            {pick.prescription ? <Text style={[TYPE.sub, { color: c.muted }]}>{pick.prescription}</Text> : null}
          </View>
          <Press
            disabled={swap.busyId != null}
            accessibilityRole="button"
            accessibilityLabel={pick.title + '으로 바꾸기'}
            onPress={() => void swap.choose(pick.id)}
            style={[st.pick, { backgroundColor: c.action, opacity: swap.busyId != null ? 0.65 : 1 }]}
          >
            <Text style={[TYPE.buttonCompact, { color: c.onAction }]}>{swap.busyId === pick.id ? '바꾸는 중…' : '바꾸기'}</Text>
          </Press>
        </View>
      ))}
    </Sheet>
  );
}

const st = StyleSheet.create({
  search: { minHeight: 48, borderRadius: 14, paddingHorizontal: 14, fontSize: 16 },
  message: { gap: 4 },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  row: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 12 },
  name: { flex: 1, gap: 2 },
  pick: { minHeight: 44, justifyContent: 'center', borderRadius: 22, paddingHorizontal: 12 },
});
