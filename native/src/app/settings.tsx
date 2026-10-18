import * as Haptics from 'expo-haptics';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LENGTH_UNITS, SPEED_UNITS, WEIGHT_UNITS } from '@/lib/units';
import { CC_BY_SA_URL, CONTACT, MEDICAL_NOTICE, MODEL_CREDIT_CHANGES, MODEL_CREDIT_INTRO, MODEL_CREDITS } from '@/lib/site-info';
import { Bar } from '~/community/parts';
import { THEME_OPTIONS, setPref, usePrefs, type Prefs } from '~/lib/prefs';
import { SITE_URL } from '~/lib/site';
import { usePalette, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';

/**
 * 설정(앱 화면) — 웹 설정 창(components/settings-panel.tsx)을 옮겼다: 화면 테마 · 단위(길이 · 무게 · 구속) · 정보(약관 · 개인정보 · 3D 모델 출처 · 문의).
 * 값은 웹과 같은 열쇠(~/lib/prefs) — 고르면 앱 화면과 웹 화면이 같이 바뀐다. 약관 · 개인정보는 사이트 문서를 앱 안 브라우저로 연다.
 */
export default function SettingsScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const prefs = usePrefs();
  const [credit, setCredit] = useState(false);
  const open = (path: string) => void WebBrowser.openBrowserAsync(`${SITE_URL}${path}`).catch(() => undefined);

  const pick = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    void Haptics.selectionAsync();
    setPref(key, value);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar modal back="더보기" title="설정" c={c} />
      <ScrollView contentContainerStyle={[{ padding: 16, gap: 24, paddingBottom: inset.bottom + 32 }, READABLE]}>
        <Section icon="circle.lefthalf.filled" title="화면" desc="밝게 볼지 어둡게 볼지 골라요. 자동은 기기 설정을 따라요. 이 기기에만 적용돼요." c={c}>
          <Segmented options={THEME_OPTIONS} icons={THEME_ICONS} value={prefs.theme} onChange={(v) => pick('theme', v)} c={c} />
        </Section>

        <Section icon="ruler" title="단위" desc="보여주는 방식만 바뀌어요. 저장은 늘 cm · kg 이라 지난 기록도 그대로예요." c={c}>
          <UnitRow label="길이" hint="키 · 윙스팬" options={LENGTH_UNITS} value={prefs.length} onChange={(v) => pick('length', v)} c={c} />
          <UnitRow label="무게" hint="몸무게 · 운동에서 든 무게" options={WEIGHT_UNITS} value={prefs.weight} onChange={(v) => pick('weight', v)} c={c} />
          <UnitRow label="구속" hint="투구 기록과 목표 구속" options={SPEED_UNITS} value={prefs.speed} onChange={(v) => pick('speed', v)} c={c} />
        </Section>

        <Section icon="info.circle" title="정보" desc="약관 · 출처 · 문의는 여기에 있어요." c={c}>
          <View style={[st.group, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Row label="이용약관" onPress={() => open('/terms')} c={c} />
            <Row label="개인정보 처리방침" onPress={() => open('/privacy')} c={c} />
            <Row label="3D 모델 출처" onPress={() => setCredit((v) => !v)} open={credit} c={c} />
            {credit ? (
              <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 10 }}>
                <Text style={[st.small, { color: c.muted }]}>{MODEL_CREDIT_INTRO}</Text>
                {MODEL_CREDITS.map((cr) => (
                  <View key={cr.quote} style={{ gap: 2 }}>
                    <Text selectable style={{ color: c.ink, fontSize: 14 }}>
                      “{cr.quote}”
                    </Text>
                    <Text selectable style={[st.small, { color: c.muted }]}>
                      {cr.note}
                    </Text>
                  </View>
                ))}
                <Text style={[st.small, { color: c.ink, fontWeight: '700' }]}>바꾼 것</Text>
                <Text style={[st.small, { color: c.muted }]}>{MODEL_CREDIT_CHANGES}</Text>
                <Pressable accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(CC_BY_SA_URL).catch(() => undefined)} hitSlop={6}>
                  <Text style={{ color: c.sky, fontSize: 14, fontWeight: '600' }}>CC BY-SA 4.0 라이선스 전문 ›</Text>
                </Pressable>
              </View>
            ) : null}
            <Row label="문의하기" detail={CONTACT} onPress={() => void Linking.openURL(`mailto:${CONTACT}`).catch(() => undefined)} last c={c} />
          </View>
          <Text style={[st.small, { color: c.muted }]}>{MEDICAL_NOTICE}</Text>
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ icon, title, desc, children, c }: { icon: SFSymbol; title: string; desc: string; children: ReactNode; c: Palette }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View style={[st.icon, { backgroundColor: c.sky }]}>
          <SymbolView name={icon} size={16} tintColor="#fff" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text accessibilityRole="header" style={{ color: c.ink, fontSize: 17, fontWeight: '700' }}>
            {title}
          </Text>
          <Text style={[st.small, { color: c.muted }]}>{desc}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

/** 테마마다 붙는 그림 — 웹 components/theme-toggle.tsx THEME_ICONS(Sun · Moon · MoonStar · SunMoon)와 같은 뜻 */
const THEME_ICONS: Record<Prefs['theme'], SFSymbol> = {
  light: 'sun.max',
  dark: 'moon',
  navy: 'moon.stars',
  system: 'circle.lefthalf.filled',
};

/** 고르개 — 회색 바탕 위 흰 칸(웹 Segmented 와 같은 모양) */
function Segmented<V extends string>({
  options,
  icons,
  value,
  onChange,
  c,
}: {
  options: readonly { value: V; label: string }[];
  icons?: Record<V, SFSymbol>;
  value: V;
  onChange: (v: V) => void;
  c: Palette;
}) {
  return (
    <View accessibilityRole="radiogroup" style={[st.seg, { backgroundColor: c.chip }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[st.segItem, icons && { flexDirection: 'row', gap: 4 }, on && { backgroundColor: c.raised }]}
          >
            {icons ? <SymbolView name={icons[o.value]} size={14} tintColor={c.ink} /> : null}
            <Text style={{ color: c.ink, fontSize: 14, fontWeight: on ? '700' : '500' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function UnitRow<V extends string>({
  label,
  hint,
  options,
  value,
  onChange,
  c,
}: {
  label: string;
  hint: string;
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  c: Palette;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.ink, fontSize: 15 }}>{label}</Text>
        <Text style={[st.small, { color: c.muted }]}>{hint}</Text>
      </View>
      <View style={{ width: 150 }}>
        <Segmented options={options} value={value} onChange={onChange} c={c} />
      </View>
    </View>
  );
}

function Row({ label, detail, onPress, open, last, c }: { label: string; detail?: string; onPress: () => void; open?: boolean; last?: boolean; c: Palette }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [st.row, pressed && { backgroundColor: c.chip }, !last && !open && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}
    >
      <Text style={{ color: c.ink, fontSize: 16, flex: 1 }}>{label}</Text>
      {detail ? (
        <Text style={[st.small, { color: c.muted }]} numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
      <SymbolView name={open ? 'chevron.down' : 'chevron.right'} size={13} weight="semibold" tintColor={c.muted} />
    </Pressable>
  );
}

const st = StyleSheet.create({
  small: { fontSize: 13, lineHeight: 18 },
  icon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  seg: { flexDirection: 'row', borderRadius: 12, padding: 3, gap: 3 },
  segItem: { flex: 1, minHeight: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  group: { borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, minHeight: 50 },
});
