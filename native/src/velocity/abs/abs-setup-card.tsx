import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ABS_DISCLOSURE, AVERAGE_HEIGHT_CM, HEIGHT_MAX_CM, HEIGHT_MIN_CM, RULES, type RuleSetId } from '@/lib/abs/rules';
import { Segmented } from '~/velocity/camera-ui';
import type { AbsSession } from './use-abs';

/**
 * ABS 설정 카드 안(앱) — 웹 components/abs/abs-setup-card.tsx 와 같은 내용: 타자 신장(평균 · 직접) · 규칙 · 홈플레이트 찾기 상태 + [다시 찾기][직접 맞추기].
 * 틀(제목 · 단계 · 완료 단추)은 GuideCard 가 그린다(velocity.tsx).
 */
export function AbsSetupBody({ abs, tiltKnown }: { abs: AbsSession; tiltKnown: boolean }) {
  const { setup, setHeight, setRule, find, ends, manual, setManual, setEnds, detectNow, calib } = abs;
  const [text, setText] = useState(setup.height === 'average' ? '' : String(setup.height));
  const parsed = Number(text);
  const valid = Number.isFinite(parsed) && parsed >= HEIGHT_MIN_CM && parsed <= HEIGHT_MAX_CM;

  const plateText = !ends
    ? (find?.reason ?? '플레이트를 찾는 중이에요. 흰 홈플레이트가 존 밑에 보여야 해요.')
    : !tiltKnown
      ? '폰 기울기를 아직 못 읽었어요. 폰을 잠깐 가만히 두세요.'
      : calib && !calib.ok
        ? (calib.reasons[0] ?? '보정이 안 맞아요.')
        : calib
          ? `플레이트 ${calib.plateDepthM.toFixed(1)}m 앞 · 카메라 높이 ${calib.cameraHeightM.toFixed(1)}m${manual ? ' · 직접 맞춤' : ''}`
          : '보정 계산 중';
  const good = !!ends && tiltKnown && !!calib?.ok;

  /* 직접 맞추는 동안은 카드를 줄여 플레이트가 보이게 — 신장 · 규칙은 숨긴다 */
  const plateRow = (
    <>
      <Text style={[st.label, !manual && { marginTop: 12 }]}>홈플레이트</Text>
      <Text style={[st.status, good && st.statusOk]}>{plateText}</Text>
      <View style={st.row}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setManual(false);
            setEnds(null);
            detectNow();
          }}
          style={({ pressed }) => [st.btn, pressed && { opacity: 0.6 }]}
        >
          <Text style={st.btnText}>다시 찾기</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: manual }}
          onPress={() => setManual(!manual)}
          style={({ pressed }) => [st.btn, manual && st.btnOn, pressed && { opacity: 0.6 }]}
        >
          <Text style={[st.btnText, manual && { color: '#fff' }]}>{manual ? '직접 맞추는 중' : '직접 맞추기'}</Text>
        </Pressable>
      </View>
      {manual ? <Text style={st.hint}>화면의 파란 두 끝을 플레이트 앞변 양 끝으로 끌어요. 끝이 없으면 플레이트를 한 번 누르세요.</Text> : null}
    </>
  );
  if (manual) return <View style={st.body}>{plateRow}</View>;
  return (
    <View style={st.body}>
      <Text style={st.label}>타자 신장</Text>
      <View style={st.chips}>
        <Chip on={setup.height === 'average'} label={`평균 ${AVERAGE_HEIGHT_CM}cm`} onPress={() => setHeight('average')} />
        <View style={[st.chip, setup.height !== 'average' && st.chipOn, st.inputChip]}>
          <TextInput
            value={text}
            onChangeText={(t) => {
              const clean = t.replace(/[^\d]/g, '').slice(0, 3);
              setText(clean);
              const n = Number(clean);
              if (Number.isFinite(n) && n >= HEIGHT_MIN_CM && n <= HEIGHT_MAX_CM) setHeight(n);
            }}
            placeholder="직접"
            placeholderTextColor="#8e8e93"
            keyboardType="number-pad"
            style={[st.input, setup.height !== 'average' && { color: '#fff' }]}
            accessibilityLabel={`타자 신장 직접 입력 ${HEIGHT_MIN_CM}~${HEIGHT_MAX_CM}cm`}
          />
          <Text style={[st.chipText, setup.height !== 'average' && { color: '#fff' }]}>cm</Text>
        </View>
      </View>
      {text && !valid ? (
        <Text style={st.warn}>
          {HEIGHT_MIN_CM}~{HEIGHT_MAX_CM}cm 사이로 넣어 주세요.
        </Text>
      ) : null}

      <Text style={[st.label, { marginTop: 12 }]}>규칙</Text>
      <Segmented
        items={(Object.keys(RULES) as RuleSetId[]).map((k) => ({ value: k, label: RULES[k].label }))}
        value={setup.rule}
        onChange={(v) => setRule(v as RuleSetId)}
      />
      {plateRow}
      <Text style={st.disclosure}>{ABS_DISCLOSURE}</Text>
    </View>
  );
}

function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={onPress} style={[st.chip, on && st.chipOn]}>
      <Text style={[st.chipText, on && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  body: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#6e6e73' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { minHeight: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#e5e5ea', justifyContent: 'center' },
  chipOn: { backgroundColor: '#0a84d6' },
  chipText: { fontSize: 15, fontWeight: '600', color: '#1d1d1f' },
  inputChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 12 },
  input: { width: 48, fontSize: 16, fontWeight: '600', color: '#1d1d1f', textAlign: 'center', paddingVertical: 0, fontVariant: ['tabular-nums'] },
  warn: { color: '#b45309', fontSize: 13 },
  status: { fontSize: 14, lineHeight: 20, color: '#3a3a3c' },
  statusOk: { color: '#047857', fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btn: { flex: 1, minHeight: 40, borderRadius: 20, backgroundColor: '#e5e5ea', alignItems: 'center', justifyContent: 'center' },
  btnOn: { backgroundColor: '#0a84d6' },
  btnText: { fontSize: 15, fontWeight: '600', color: '#1d1d1f' },
  hint: { fontSize: 13, lineHeight: 18, color: '#6e6e73' },
  disclosure: { marginTop: 6, fontSize: 12, lineHeight: 16, color: '#8e8e93' },
});
