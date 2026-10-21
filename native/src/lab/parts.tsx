import { type Href, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import type { AppLabListItem } from '@/app/actions/pitch-lab';
import type { LabGuideSection } from '@/lib/pitch-lab-guide';
import type { LabHand } from '@/lib/pitch-lab-meta';
import { Badge, s } from '~/community/parts';
import { rpc } from '~/lib/rpc';
import type { Palette } from '~/lib/ui';

/** 3D 동작 분석 앱 화면들(사용자 /lab · 새 분석 /lab/new · 관리자 /lab/samples)이 같이 쓰는 조각 */
const toneColor = (tone: 'sky' | 'muted' | 'warn', c: Palette) => (tone === 'sky' ? c.sky : tone === 'warn' ? c.warn : undefined);

export function GuideLink({ label, section, hand, c }: { label: string; section: LabGuideSection; hand: LabHand; c: Palette }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(`/lab/guide?hand=${hand}&s=${section}` as Href)} hitSlop={6} style={{ minHeight: 32, justifyContent: 'center' }}>
      <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function NumberInput({ value, onChange, placeholder, c }: { value: string; onChange: (v: string) => void; placeholder: string; c: Palette }) {
  return (
    <TextInput
      value={value}
      onChangeText={(t) => onChange(t.replace(/[^0-9.]/g, '').slice(0, 5))}
      keyboardType="decimal-pad"
      placeholder={placeholder}
      placeholderTextColor={c.muted}
      style={[s.input, { backgroundColor: c.page, color: c.ink }]}
    />
  );
}

/* ─────────────────────────── 샘플 하나 ─────────────────────────── */

export function SampleRow({ item, name, last, onRemoved, c }: { item: AppLabListItem; name: string; last: boolean; onRemoved: () => void; c: Palette }) {
  const [busy, setBusy] = useState(false);
  const remove = () =>
    Alert.alert(`${name}, 지울까요?`, '옆 · 뒤 영상과 3D 결과가 함께 지워져요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const r = await rpc<{ ok: true } | { error: string }>('pitch-lab.removeLabSample', { id: item.id });
            if ('error' in r) return Alert.alert('지우지 못했어요', r.error);
            onRemoved();
          } catch {
            Alert.alert('지우지 못했어요', '신호가 약해 보내지 못했어요. 다시 해 주세요.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  return (
    <View style={[s.row, { opacity: busy ? 0.5 : 1 }, last ? null : { borderBottomWidth: 0.5, borderBottomColor: c.line }]}>
      <Pressable
        accessibilityRole="button"
        disabled={item.broken}
        onPress={() => router.push(`/lab/${item.id}` as Href)}
        style={({ pressed }) => [{ flex: 1, gap: 3, opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }} numberOfLines={1}>
          {name}
          {item.when ? <Text style={[s.meta, { color: c.muted, fontWeight: '400' }]}>{`  ${item.when}`}</Text> : null}
        </Text>
        {item.broken ? (
          <Text style={[s.meta, { color: c.muted }]}>올리다 멈췄어요</Text>
        ) : item.chips.length > 0 ? (
          <Text style={[s.meta, { color: c.muted }]} numberOfLines={1}>
            {item.chips.join(' · ')}
          </Text>
        ) : null}
        {item.memo ? (
          <Text style={[s.meta, { color: c.ink }]} numberOfLines={1}>
            {item.memo}
          </Text>
        ) : null}
        {item.report && item.status?.tone !== 'sky' ? (
          /* 끝난 분석은 리포트 꼬리표(주 문제 · 좋아요 · 판정 못 함), 도는 중 · 실패는 작업 상태 */
          <Badge
            text={item.report.text}
            color={item.report.tone === 'good' ? c.ok : item.report.tone === 'muted' ? undefined : c.warn}
            c={c}
          />
        ) : item.status ? (
          <Badge text={item.status.text} color={toneColor(item.status.tone, c)} c={c} />
        ) : null}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${name} 지우기`} disabled={busy} onPress={remove} hitSlop={6} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <SymbolView name="trash" size={18} tintColor={c.muted} />
      </Pressable>
    </View>
  );
}
