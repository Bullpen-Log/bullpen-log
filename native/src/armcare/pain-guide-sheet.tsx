import { SymbolView } from 'expo-symbols';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ArmcareAreaKey } from '@/lib/armcare/anatomy';
import { DISCLAIMER, RED_FLAGS, RED_FLAGS_LINE, guideFor, levelAdvice, type PainGuide } from '@/lib/armcare/pain-guide';
import { REHAB_ENABLED } from '@/lib/armcare/rehab-regions';
import type { Palette } from '~/lib/ui';
import { Sheet } from '~/workout/sheets';
import { Press } from '~/shell/press';

export type PainView = { spots: ArmcareAreaKey[]; level: number | null; age: number | null };

/**
 * 팔 통증 안내 시트(앱) — 웹 app/(app)/training/arm-pain-guide-body.tsx 와 같은 차례 · 같은 글(lib/armcare/pain-guide.ts):
 * 자리마다 [제목 · 이럴 수 있어요(참고, 누르면 설명) · 확인해 볼 증상] → 바로 진료(빨간 상자, 누르면 다섯 줄) → 오늘은 → 맺음 한 줄 → 재활 프로그램.
 * 암케어 탭 안이라 웹처럼 [통증 루틴 하기] 단추는 없다(루틴이 바로 밑에 있다).
 */
export function PainGuideButton({ pain, c, tone }: { pain: PainView; c: Palette; tone: 'sky' | 'warn' }) {
  const [open, setOpen] = useState(false);
  const color = tone === 'warn' ? c.warn : c.sky;
  return (
    <>
      <Press
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={[st.chip, { backgroundColor: tone === 'warn' ? c.card : c.sky + '1a' }]}
      >
        <Text style={[st.chipText, { color }]}>통증 안내 보기 ›</Text>
      </Press>
      <Sheet open={open} onClose={() => setOpen(false)} title="팔 통증 안내" c={c}>
        <PainGuideBody
          pain={pain}
          c={c}
          onRehab={() => {
            setOpen(false);
            const q = new URLSearchParams();
            if (pain.age != null) q.set('age', String(pain.age));
            if (pain.spots[0]) q.set('area', pain.spots[0]);
            if (pain.level) q.set('level', String(pain.level));
            router.push(`/rehab-start?${q}` as Href);
          }}
        />
      </Sheet>
    </>
  );
}

function PainGuideBody({ pain, c, onRehab }: { pain: PainView; c: Palette; onRehab: () => void }) {
  const guides = pain.spots.map(guideFor);
  const advice = levelAdvice(pain.level, { spots: pain.spots, age: pain.age });
  return (
    <View style={{ gap: 20 }}>
      {guides.length > 0 ? (
        guides.map((g) => <SpotGuide key={g.key} guide={g} c={c} />)
      ) : (
        <Text style={[st.body, { color: c.muted }]}>
          어디가 아픈지 고르면 흔한 부상과 확인해 볼 증상이 나와요. 체크인의 몸 상태에서 고를 수 있어요.
        </Text>
      )}
      <RedFlags c={c} />
      <View style={[st.box, { backgroundColor: c.card, boxShadow: c.float }]}>
        <Text style={[st.label, { color: c.sky }]}>오늘은</Text>
        <Text style={[st.body, { color: c.ink }]}>{advice.text}</Text>
      </View>
      <Text style={[st.small, { color: c.muted, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, paddingTop: 12 }]}>{DISCLAIMER}</Text>
      {REHAB_ENABLED ? (
        <Press onPress={onRehab} accessibilityRole="button" style={[st.row, { backgroundColor: c.card, boxShadow: c.float }]}>
          <View style={{ flex: 1 }}>
            <Text style={[st.body, { color: c.ink, fontWeight: '600' }]}>재활 프로그램</Text>
            <Text style={[st.small, { color: c.muted }]}>아픈 곳과 정도에 맞춰 몇 주에 걸쳐 단계별로 해요</Text>
          </View>
          <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={c.muted} />
        </Press>
      ) : null}
    </View>
  );
}

function SpotGuide({ guide, c }: { guide: PainGuide; c: Palette }) {
  const [openName, setOpenName] = useState<string | null>(null);
  return (
    <View style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={[st.title, { color: c.ink }]}>{guide.title}</Text>
      {guide.injuries.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={[st.label, { color: c.sky }]}>이럴 수 있어요 (참고)</Text>
          <View style={[st.list, { borderColor: c.line }]}>
            {guide.injuries.map((inj, i) => {
              const on = openName === inj.name;
              return (
                <View key={inj.name} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
                  <Press
                    onPress={() => setOpenName(on ? null : inj.name)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: on }}
                    style={st.summary}
                  >
                    <Text style={[st.body, { color: c.ink, fontWeight: '600', flex: 1 }]}>{inj.name}</Text>
                    <SymbolView name={on ? 'chevron.up' : 'chevron.down'} size={13} tintColor={c.muted} />
                  </Press>
                  {on ? <Text style={[st.small, { color: c.ink, paddingHorizontal: 14, paddingBottom: 12 }]}>{inj.desc}</Text> : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
      {guide.signs.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={[st.label, { color: c.sky }]}>확인해 볼 증상</Text>
          {guide.signs.map((sign) => (
            <Text key={sign} style={[st.body, { color: c.ink }]}>• {sign}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** 이런 게 있으면 바로 진료 — 접혀 있어도 다섯을 줄인 한 줄이 보이고, 누르면 한 줄씩(웹 RedFlags) */
function RedFlags({ c }: { c: Palette }) {
  const [open, setOpen] = useState(false);
  return (
    <Press
      onPress={() => setOpen((o) => !o)}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      style={[st.red, { backgroundColor: c.danger + '14', borderColor: c.danger + '40' }]}
    >
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <SymbolView name="exclamationmark.triangle" size={16} tintColor={c.danger} />
        <View style={{ flex: 1 }}>
          <Text style={[st.body, { color: c.danger, fontWeight: '700' }]}>이런 게 있으면 바로 진료받으세요</Text>
          <Text style={[st.small, { color: c.danger }]}>{RED_FLAGS_LINE}</Text>
        </View>
        <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={13} tintColor={c.danger} />
      </View>
      {open ? (
        <View style={{ gap: 4, paddingLeft: 24, marginTop: 8 }}>
          {RED_FLAGS.map((f) => (
            <Text key={f} style={[st.small, { color: c.danger }]}>• {f}</Text>
          ))}
        </View>
      ) : null}
    </Press>
  );
}

const st = StyleSheet.create({
  chip: { alignSelf: 'flex-start', minHeight: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22 },
  small: { fontSize: 13, lineHeight: 19 },
  list: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden' },
  summary: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  red: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  box: { borderRadius: 16, padding: 16, gap: 10 },
  row: { minHeight: 56, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
});
