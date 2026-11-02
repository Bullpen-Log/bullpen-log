import { type Href, router } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountFeedback } from '~/account/parts';
import { logoutNow } from '~/account/session';
import { Bar } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { RADIUS, TYPE, usePalette, type Palette } from '~/lib/ui';
import { leaveTo } from '~/shell/web-nav';

/** 계정 설정의 시작 화면. 서버 동작은 기존 앱 세션 경로에서 처리한다. */
export default function AccountScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logout = async () => {
    if (leaving) return;
    setLeaving(true);
    setError(null);
    const result = await logoutNow();
    if ('moved' in result) return leaveTo('/login');
    setLeaving(false);
    setError('error' in result ? result.error : '로그아웃하지 못했어요. 다시 시도해 주세요.');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="내 정보" title="계정" c={c} />
      <ScrollView contentContainerStyle={[s.body, READABLE, { paddingBottom: inset.bottom + 32 }]}>
        <View style={s.intro}>
          <Text accessibilityRole="header" style={[TYPE.section, { color: c.ink }]}>계정 관리</Text>
          <Text style={[TYPE.sub, { color: c.muted }]}>로그인과 보안 설정을 관리해요.</Text>
        </View>

        <View style={s.section}>
          <Text style={[TYPE.sub, s.sectionTitle, { color: c.muted }]}>보안</Text>
          <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
            <AccountRow symbol="key.fill" label="비밀번호 변경" detail="다른 기기의 로그인은 풀려요" onPress={() => router.push('/account/password' as Href)} c={c} />
          </View>
        </View>

        <View style={s.section}>
          <Text style={[TYPE.sub, s.sectionTitle, { color: c.muted }]}>로그인</Text>
          <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
            <AccountRow symbol="rectangle.portrait.and.arrow.right" label={leaving ? '로그아웃하는 중…' : '로그아웃'} detail="이 기기에서 싱커 사용을 마쳐요" onPress={() => void logout()} disabled={leaving} neutral c={c} />
          </View>
          <AccountFeedback text={error} />
        </View>

        <View style={[s.section, s.dangerSection]}>
          <Text style={[TYPE.sub, s.sectionTitle, { color: c.muted }]}>계정 삭제</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="회원 탈퇴, 계정과 남긴 기록이 모두 삭제돼요"
            onPress={() => router.push('/account/delete' as Href)}
            style={({ pressed }) => [s.dangerRow, { backgroundColor: c.dangerBg, borderColor: c.dangerLine, opacity: pressed ? 0.75 : 1 }]}
          >
            <View style={s.dangerText}>
              <Text style={[TYPE.card, { color: c.danger }]}>회원 탈퇴</Text>
              <Text style={[TYPE.sub, { color: c.danger }]}>계정과 남긴 기록이 모두 삭제돼요</Text>
            </View>
            <Text aria-hidden style={[s.chevron, { color: c.danger }]}>›</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function AccountRow({ symbol, label, detail, onPress, disabled = false, neutral = false, c }: { symbol: SFSymbol; label: string; detail: string; onPress: () => void; disabled?: boolean; neutral?: boolean; c: Palette }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${detail}`}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.row, { opacity: disabled ? 0.55 : pressed ? 0.65 : 1 }]}
    >
      <View style={[s.circle, { backgroundColor: neutral ? c.chip : c.skyTint }]}>
        <SymbolView name={symbol} size={16} tintColor={neutral ? c.ink : c.skyStrong} />
      </View>
      <View style={s.rowText}>
        <Text style={[TYPE.card, { color: c.ink }]}>{label}</Text>
        <Text style={[TYPE.sub, { color: c.muted }]}>{detail}</Text>
      </View>
      <Text aria-hidden style={[s.chevron, { color: c.muted }]}>›</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 18, gap: 24 },
  intro: { gap: 3, paddingHorizontal: 3 },
  section: { gap: 9 },
  sectionTitle: { paddingHorizontal: 3, fontWeight: '600' },
  card: { borderRadius: RADIUS.inset, overflow: 'hidden' },
  row: { minHeight: 72, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  circle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  chevron: { fontSize: 23, lineHeight: 26 },
  dangerSection: { marginTop: 38 },
  dangerRow: { minHeight: 68, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.inset, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  dangerText: { flex: 1, gap: 2 },
});
