import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AVERAGE_HEIGHT_CM, HEIGHT_MAX_CM, HEIGHT_MIN_CM } from '@/lib/abs/rules';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';

/**
 * 측정 중 '타자 N · 175cm' 칩(앱) — 누르면 '다음 타자' 시트: 평균 신장 그대로 또는 숫자 입력(웹 components/abs/batter-chip.tsx 와 같다).
 * 처음 '평균'을 골랐으면 다음 타자에게도 유지, 숫자를 넣으면 그 타자부터 그 값.
 */
export function BatterChip({ batter, height, onNext }: { batter: number; height: number | 'average'; onNext: (height: number | 'average') => void }) {
  const inset = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'average' | 'number'>(height === 'average' ? 'average' : 'number');
  const [text, setText] = useState(height === 'average' ? '' : String(height));
  const cm = height === 'average' ? AVERAGE_HEIGHT_CM : height;
  const parsed = Number(text);
  const valid = mode === 'average' || (Number.isFinite(parsed) && parsed >= HEIGHT_MIN_CM && parsed <= HEIGHT_MAX_CM);
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={({ pressed }) => [st.chip, pressed && { opacity: 0.7 }]}>
        <Icon name="user-round" size={14} color="#fff" />
        <Text style={st.chipText}>
          타자 {batter} · {cm}cm{height === 'average' ? '(평균)' : ''}
        </Text>
        <Icon name="chevron-right" size={14} color="rgba(255,255,255,0.7)" />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={st.scrim} onPress={() => setOpen(false)} accessibilityLabel="닫기" />
        <View style={[st.sheet, { paddingBottom: inset.bottom + 16 }]}>
          <Text style={st.title}>다음 타자</Text>
          <Text style={st.body}>타자 {batter + 1}의 신장을 넣어요. 존 위 · 아래가 신장에 따라 바뀌어요.</Text>
          <View style={st.row}>
            <Press select selected={mode === 'average'} accessibilityRole="radio" accessibilityState={{ selected: mode === 'average' }} onPress={() => setMode('average')} style={[st.opt, mode === 'average' && st.optOn]}>
              <Text style={[st.optText, mode === 'average' && { color: '#fff' }]}>평균 신장 {AVERAGE_HEIGHT_CM}cm</Text>
            </Press>
            <Press select selected={mode === 'number'} accessibilityRole="radio" accessibilityState={{ selected: mode === 'number' }} onPress={() => setMode('number')} style={[st.opt, mode === 'number' && st.optOn]}>
              <Text style={[st.optText, mode === 'number' && { color: '#fff' }]}>직접 입력</Text>
            </Press>
          </View>
          {mode === 'number' ? (
            <View style={st.inputRow}>
              <TextInput
                value={text}
                onChangeText={(t) => setText(t.replace(/[^\d]/g, '').slice(0, 3))}
                placeholder="175"
                placeholderTextColor="#8e8e93"
                keyboardType="number-pad"
                autoFocus
                style={st.input}
              />
              <Text style={st.unit}>
                cm ({HEIGHT_MIN_CM}~{HEIGHT_MAX_CM})
              </Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={!valid}
            onPress={() => {
              onNext(mode === 'average' ? 'average' : parsed);
              setOpen(false);
            }}
            style={({ pressed }) => [st.next, (pressed || !valid) && { opacity: 0.5 }]}
          >
            <Text style={st.nextText}>타자 {batter + 1}로 넘어가기</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  chip: { alignSelf: 'flex-start', height: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)' },
  chipText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#f2f2f7', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#1d1d1f' },
  body: { fontSize: 15, color: '#3a3a3c' },
  row: { flexDirection: 'row', gap: 8 },
  opt: { minHeight: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#e5e5ea', justifyContent: 'center' },
  optOn: { backgroundColor: '#0a84d6' },
  optText: { fontSize: 15, fontWeight: '600', color: '#1d1d1f' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { height: 48, width: 112, borderRadius: 12, borderWidth: 1, borderColor: '#e5e5ea', backgroundColor: '#fff', textAlign: 'center', fontSize: 18, color: '#1d1d1f', fontVariant: ['tabular-nums'] },
  unit: { fontSize: 14, color: '#6e6e73' },
  next: { marginTop: 8, height: 48, borderRadius: 16, backgroundColor: '#0a84d6', alignItems: 'center', justifyContent: 'center' },
  nextText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
