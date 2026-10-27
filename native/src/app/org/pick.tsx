import { type Href, router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ME, spaceKeyOf, spaceLabel } from '@/lib/org/space-nav';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { refreshSpaces, setSpace, useSpace } from '~/org/space-store';

/**
 * 공간 고르개(아래 시트, 계약 8-4) — 내 싱커 · 지금 소속 팀 · 레슨장(역할 함께). 고르면 그 자리에서 아래 탭이 바뀐다.
 * 바꾸기는 서버에 아무것도 안 쓴다(나가기는 소속 관리에서만). 마스터 계정은 관리하는 조직만.
 */
export default function PickSpaceScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const sp = useSpace();
  useEffect(() => {
    void refreshSpaces();
  }, []);
  const choose = (key: string) => {
    setSpace(key);
    router.back();
  };
  const go = (href: string) => {
    router.back();
    router.push(href as Href);
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 20, gap: 8, paddingBottom: inset.bottom + 16 }}>
      <Text accessibilityRole="header" style={[TYPE.card, { color: c.ink, paddingHorizontal: 4, paddingBottom: 4 }]}>
        공간
      </Text>
      {sp.hasSinker ? <Row label="내 싱커" on={sp.key === ME} onPress={() => choose(ME)} c={c} /> : null}
      {sp.spaces.map((s) => (
        <Row key={spaceKeyOf(s)} label={spaceLabel(s)} on={sp.key === spaceKeyOf(s)} onPress={() => choose(spaceKeyOf(s))} c={c} />
      ))}
      {!sp.spaces.length && !sp.hasSinker ? <Text style={[TYPE.sub, { color: c.muted, paddingHorizontal: 4 }]}>관리하는 팀 · 레슨장이 없어요.</Text> : null}
      <View style={{ flexDirection: 'row', gap: 20, paddingHorizontal: 4, paddingTop: 8 }}>
        <Pressable accessibilityRole="button" onPress={() => go('/org')} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={[TYPE.body, { color: c.link, fontWeight: '600' }]}>소속 관리</Text>
        </Pressable>
        {sp.hasSinker ? (
          <Pressable accessibilityRole="button" onPress={() => go('/org/join')} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={[TYPE.body, { color: c.link, fontWeight: '600' }]}>코드로 들어가기</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

function Row({ label, on, onPress, c }: { label: string; on: boolean; onPress: () => void; c: Palette }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => [st.row, { backgroundColor: on ? c.chip : c.card }, pressed && { opacity: 0.7 }]}
    >
      <Text style={[TYPE.body, { color: c.ink, flex: 1, fontWeight: on ? '700' : '500' }]} numberOfLines={1}>
        {label}
      </Text>
      {on ? <Icon name="check" size={18} color={c.sky} /> : null}
    </Pressable>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderRadius: 14, paddingHorizontal: 16, gap: 8 },
});
