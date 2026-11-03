import * as Haptics from 'expo-haptics';
import { Icon, type IconName } from '~/shell/icon';
import * as WebBrowser from 'expo-web-browser';
import { type Href, router } from 'expo-router';
import Constants from 'expo-constants';
import { useEffect, useState, type ReactNode } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LENGTH_UNITS, SPEED_UNITS, WEIGHT_UNITS } from '@/lib/units';
import { CC_BY_SA_URL, CONTACT, MEDICAL_NOTICE, MODEL_CREDIT_CHANGES, MODEL_CREDIT_INTRO, MODEL_CREDITS } from '@/lib/site-info';
import { Bar } from '~/community/parts';
import { setPref, usePrefs, type Prefs } from '~/lib/prefs';
import { SITE_URL } from '~/lib/site';
import { CONTROL, RADIUS, TYPE, usePalette, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';
import { loadBundleInfo } from '~/shell/app-update';
import { useRelease, useReleaseDecided } from '~/shell/release';

type InfoSheet = 'credits' | 'app' | null;
type BundleInfo = Awaited<ReturnType<typeof loadBundleInfo>>;

const THEME_CARDS: readonly { value: Prefs['theme']; label: string; hint: string; icon: IconName }[] = [
  { value: 'system', label: '자동', hint: '기기 설정', icon: 'circle' },
  { value: 'light', label: '라이트', hint: '밝은 화면', icon: 'sun' },
  { value: 'dark', label: '다크', hint: '어두운 화면', icon: 'moon' },
  { value: 'navy', label: '네이비', hint: '푸른 화면', icon: 'moon-star' },
];

/** 앱 설정. 테마·표시 단위는 고르는 즉시 앱 저장소와 웹 화면에 같이 반영된다. */
export default function SettingsScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const prefs = usePrefs();
  const [sheet, setSheet] = useState<InfoSheet>(null);
  const [bundle, setBundle] = useState<BundleInfo | null>(null);
  const release = useRelease();
  const decided = useReleaseDecided();
  const stageText = !release
    ? decided
      ? '서버에 묻지 못했어요'
      : '확인 중…'
    : release.stage === 'restricted_beta'
      ? release.restricted
        ? '베타 체험(3D 분석만)'
        : '베타 켜짐 · 이 계정은 다 열림'
      : '정식(잠금 없음)';
  const version = Constants.expoConfig?.version ?? '확인 중…';
  const updateText = !bundle ? '확인 중…' : bundle.dev ? '개발' : bundle.update ? `화면 ${bundle.update}` : '앱에 든 그대로';
  const runtimeText = !bundle ? '확인 중…' : bundle.dev ? '개발 환경' : bundle.runtime ?? '확인할 수 없어요';

  useEffect(() => {
    void loadBundleInfo().then(setBundle);
  }, []);

  const open = (path: string) => void WebBrowser.openBrowserAsync(`${SITE_URL}${path}`).catch(() => undefined);
  const pick = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    if (prefs[key] === value) return;
    void Haptics.selectionAsync();
    setPref(key, value);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar modal back="뒤로" title="설정" c={c} />
      <ScrollView contentContainerStyle={[st.body, { paddingBottom: inset.bottom + 32 }, READABLE]}>
        <Text style={[st.intro, { color: c.muted }]}>화면과 단위는 고르면 바로 적용돼요.</Text>

        <Section title="화면" c={c}>
          <View accessibilityRole="radiogroup" style={st.themeGrid}>
            {THEME_CARDS.map((option) => {
              const selected = prefs.theme === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option.label}, ${option.hint}`}
                  accessibilityState={{ selected }}
                  onPress={() => pick('theme', option.value)}
                  style={({ pressed }) => [st.themeCard, { backgroundColor: selected ? c.skyTint : c.card, borderColor: selected ? c.link : c.line, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Icon name={option.icon} size={19} color={selected ? c.link : c.ink} />
                  <Text style={[st.themeLabel, { color: selected ? c.link : c.ink }]}>{option.label}</Text>
                  <Text style={[st.themeHint, { color: c.muted }]} numberOfLines={2}>{option.hint}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[st.note, { color: c.muted }]}>이 기기에서만 바뀌어요.</Text>
        </Section>

        <Section title="표시 단위" c={c}>
          <View style={[st.group, { backgroundColor: c.card }]}>
            <UnitRow label="길이" hint="키 · 윙스팬" options={LENGTH_UNITS} value={prefs.length} onChange={(v) => pick('length', v)} c={c} />
            <UnitRow label="무게" hint="몸무게 · 운동 무게" options={WEIGHT_UNITS} value={prefs.weight} onChange={(v) => pick('weight', v)} c={c} />
            <UnitRow label="구속" hint="기록 · 목표 구속" options={SPEED_UNITS} value={prefs.speed} onChange={(v) => pick('speed', v)} c={c} last />
          </View>
          <Text style={[st.note, { color: c.muted }]}>숫자를 보여주는 단위만 바뀌어요. 지난 기록은 그대로예요.</Text>
        </Section>

        <Section title="서비스 정보" c={c}>
          <View style={[st.group, { backgroundColor: c.card }]}>
            <Row label="이용약관" onPress={() => open('/terms')} c={c} />
            <Row label="개인정보 처리방침" onPress={() => open('/privacy')} c={c} />
            <Row label="3D 분석 국외 이전 동의" onPress={() => router.push('/lab/consent' as Href)} c={c} />
            <Row label="3D 모델 출처" onPress={() => setSheet('credits')} c={c} />
            <Row label="문의하기" onPress={() => void Linking.openURL(`mailto:${CONTACT}`).catch(() => undefined)} c={c} last />
          </View>
        </Section>

        <Section title="앱 정보" c={c}>
          <View style={[st.group, { backgroundColor: c.card }]}>
            <Row label="버전 · 이용 상태" detail={version} onPress={() => setSheet('app')} c={c} last />
          </View>
        </Section>
        <Text style={[st.medical, { color: c.muted }]}>{MEDICAL_NOTICE}</Text>
      </ScrollView>

      <Modal visible={sheet !== null} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <View style={st.overlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="정보 창 닫기" style={StyleSheet.absoluteFill} onPress={() => setSheet(null)} />
          <View accessibilityViewIsModal style={[st.sheet, { backgroundColor: c.card, paddingBottom: inset.bottom + 18 }]}>
            {sheet === 'credits' ? (
              <>
                <Text accessibilityRole="header" style={[st.sheetTitle, { color: c.ink }]}>3D 모델 출처</Text>
                <ScrollView contentContainerStyle={{ gap: 12 }}>
                  <Text style={[st.sheetText, { color: c.muted }]}>{MODEL_CREDIT_INTRO}</Text>
                  {MODEL_CREDITS.map((cr) => (
                    <View key={cr.quote} style={{ gap: 2 }}>
                      <Text selectable style={[st.sheetText, { color: c.ink }]}>“{cr.quote}”</Text>
                      <Text selectable style={[st.note, { color: c.muted }]}>{cr.note}</Text>
                    </View>
                  ))}
                  <Text style={[st.sheetText, { color: c.ink, fontWeight: '700' }]}>바꾼 것</Text>
                  <Text style={[st.sheetText, { color: c.muted }]}>{MODEL_CREDIT_CHANGES}</Text>
                  <Pressable accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(CC_BY_SA_URL).catch(() => undefined)} style={{ paddingVertical: 8 }}>
                    <Text style={[st.sheetText, { color: c.link, fontWeight: '600' }]}>CC BY-SA 4.0 라이선스 전문 ›</Text>
                  </Pressable>
                </ScrollView>
              </>
            ) : sheet === 'app' ? (
              <>
                <Text accessibilityRole="header" style={[st.sheetTitle, { color: c.ink }]}>앱 정보</Text>
                <ScrollView contentContainerStyle={{ gap: 12 }}>
                  <Fact label="버전" value={version} c={c} />
                  <Fact label="이용 상태" value={stageText} c={c} />
                  <Fact label="화면 업데이트" value={updateText} c={c} />
                  <Fact label="바닥 판" value={runtimeText} c={c} />
                </ScrollView>
              </>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => setSheet(null)} style={[st.close, { backgroundColor: c.chip }]}>
              <Text style={{ color: c.ink, fontSize: 16, fontWeight: '600' }}>닫기</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Section({ title, children, c }: { title: string; children: ReactNode; c: Palette }) {
  return (
    <View style={st.section}>
      <Text accessibilityRole="header" style={[st.sectionTitle, { color: c.ink }]}>{title}</Text>
      {children}
    </View>
  );
}

function UnitRow<V extends string>({ label, hint, options, value, onChange, c, last }: {
  label: string;
  hint: string;
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  c: Palette;
  last?: boolean;
}) {
  return (
    <View style={[st.unitRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[st.unitLabel, { color: c.ink }]}>{label}</Text>
        <Text style={[st.unitHint, { color: c.muted }]} numberOfLines={2}>{hint}</Text>
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel={`${label} 단위`} style={[st.segment, { backgroundColor: c.chip }]}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => onChange(option.value)} style={[st.segmentItem, selected && { backgroundColor: c.raised }]}>
              <Text style={{ color: c.ink, fontSize: 15, fontWeight: selected ? '700' : '500' }}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Row({ label, detail, onPress, last, c }: { label: string; detail?: string; onPress: () => void; last?: boolean; c: Palette }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [st.row, pressed && { backgroundColor: c.chip }, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
      <Text style={{ color: c.ink, fontSize: 17, flex: 1 }} numberOfLines={2}>{label}</Text>
      {detail ? <Text style={[st.note, { color: c.muted }]} numberOfLines={1}>{detail}</Text> : null}
      <Icon name="chevron-right" size={16} color={c.muted} />
    </Pressable>
  );
}

function Fact({ label, value, c }: { label: string; value: string; c: Palette }) {
  return (
    <View style={[st.fact, { backgroundColor: c.page }]}>
      <Text style={[st.note, { color: c.muted }]}>{label}</Text>
      <Text selectable style={[st.sheetText, { color: c.ink }]}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  body: { padding: 16, gap: 24 },
  intro: { fontSize: 14, paddingHorizontal: 3 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 3 },
  note: { ...TYPE.sub, lineHeight: 18, paddingHorizontal: 3 },
  medical: { ...TYPE.sub, lineHeight: 18, paddingHorizontal: 3 },
  themeGrid: { flexDirection: 'row', gap: 8 },
  themeCard: { flex: 1, minWidth: 0, minHeight: 92, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 2, borderWidth: 1, borderRadius: 16 },
  themeLabel: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  themeHint: { fontSize: 11, textAlign: 'center' },
  group: { borderRadius: RADIUS.card, overflow: 'hidden' },
  unitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 62, paddingHorizontal: 15 },
  unitLabel: { fontSize: 15, fontWeight: '500' },
  unitHint: { ...TYPE.sub },
  segment: { width: '50%', maxWidth: 150, minWidth: 128, flexDirection: 'row', borderRadius: 12, padding: 3, gap: 3 },
  segmentItem: { flex: 1, minHeight: CONTROL.compact, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, minHeight: 52, paddingVertical: 9 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(6,15,29,0.36)' },
  sheet: { maxHeight: '84%', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 18, paddingTop: 18, gap: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  sheetText: { fontSize: 14, lineHeight: 20 },
  fact: { padding: 12, borderRadius: 12, gap: 3 },
  close: { minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
