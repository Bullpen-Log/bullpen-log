import * as Haptics from 'expo-haptics';
import { type Href, router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, type TextInputInstance, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AuthState } from '@/app/actions/auth';
import { accountForm, clearSession } from '~/account/session';
import { loadJson, saveJson } from '~/lib/store';
import { usePalette, type Palette } from '~/lib/ui';
import { leaveTo } from '~/shell/web-nav';
import { READABLE } from '~/lib/layout';

/**
 * 로그인(앱 화면) — 웹 로그인(app/login/auth-form.tsx LoginForm)을 옮겼다. 서버는 같은 auth.login(막힘 · 잠금 규칙 그대로).
 * 사이트 /login 이 앱이면 '/login?native=1' 로 이 화면을 연다(그냥 '/login' 은 웹으로 가 껍데기가 앞사람 기록을 지운다). 로그인 화면에 왔다 = 로그아웃 상태라 열 때 두 저장소의 로그인을 지운다(~/account/session).
 * 닫을 수 없다(뒤로 쓸기 막음) — 밑의 웹은 빈 로그인 자리라 닫으면 갈 곳이 없다. 성공하면 웹뷰 로그인을 맞춘 뒤 웹을 /today 로.
 *
 * '자동 로그인'(기본 켬) · '아이디 기억하기'는 이 폰에만(웹 lib/login-prefs.ts 와 같은 뜻). 비밀번호는 담지 않는다 — iOS 암호 자동 채우기가 맡는다.
 */
const PREFS = 'bullpen-login-prefs';
type Prefs = { email: string | null; stay: boolean };

export default function LoginScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [stay, setStay] = useState(true);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    void clearSession();
    void loadJson(PREFS).then((raw) => {
      const p = raw as Partial<Prefs> | null;
      if (typeof p?.stay === 'boolean') setStay(p.stay);
      if (typeof p?.email === 'string') {
        setRemember(true);
        setEmail((now) => now || (p.email as string));
      }
    });
  }, []);

  const savePrefs = (next: Partial<Prefs>) =>
    void saveJson(PREFS, { email: remember ? email.trim() : null, stay, ...next });

  const submit = async () => {
    if (busy) return;
    if (!email.trim() || !password) return setError('이메일과 비밀번호를 입력해 주세요.');
    setBusy(true);
    setError(null);
    savePrefs({});
    const r = await accountForm<AuthState>('auth.login', {
      email: email.trim(),
      password,
      stayLoggedIn: stay ? 'on' : null,
    });
    setBusy(false);
    if ('moved' in r) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return leaveTo(r.moved);
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setError('error' in r ? r.error : (r.state?.error ?? '로그인하지 못했어요.'));
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ScrollView
        contentContainerStyle={[{ padding: 20, paddingTop: inset.top + 48, paddingBottom: inset.bottom + 32, gap: 22 }, READABLE]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={{ gap: 6 }}>
          <Text style={{ color: c.sky, fontSize: 15, fontWeight: '700', letterSpacing: 1 }}>BULLPEN LOG</Text>
          <Text style={{ color: c.ink, fontSize: 34, fontWeight: '800' }}>로그인</Text>
          <Text style={{ color: c.muted, fontSize: 16 }}>기록을 이어서 보려면 로그인해 주세요.</Text>
        </View>

        <View style={[st.group, { backgroundColor: c.card, boxShadow: c.float }]}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="이메일"
            placeholderTextColor={c.muted}
            keyboardType="email-address"
            textContentType="username"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            accessibilityLabel="이메일"
            style={[st.input, { color: c.ink, borderBottomColor: c.line, borderBottomWidth: StyleSheet.hairlineWidth }]}
          />
          <TextInput
            ref={passwordRef}
            value={password}
            onChangeText={setPassword}
            placeholder="비밀번호"
            placeholderTextColor={c.muted}
            secureTextEntry
            textContentType="password"
            autoComplete="current-password"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
            accessibilityLabel="비밀번호"
            style={[st.input, { color: c.ink }]}
          />
        </View>

        <View style={[st.group, { backgroundColor: c.card, boxShadow: c.float }]}>
          <ToggleRow
            label="자동 로그인"
            value={stay}
            onChange={(v) => {
              setStay(v);
              savePrefs({ stay: v });
            }}
            c={c}
          />
          <ToggleRow
            label="아이디 기억하기"
            value={remember}
            onChange={(v) => {
              setRemember(v);
              savePrefs({ email: v ? email.trim() : null });
            }}
            last
            c={c}
          />
        </View>
        <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18, marginTop: -14, paddingHorizontal: 16 }}>
          자동 로그인을 끄면 앱을 완전히 닫을 때 로그아웃돼요. 아이디만 기억하고 비밀번호는 저장하지 않아요.
        </Text>

        {error ? (
          <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 15, fontWeight: '600', paddingHorizontal: 4 }}>
            {error}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => void submit()}
          disabled={busy}
          style={({ pressed }) => [st.primary, { backgroundColor: c.sky, opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}
        >
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{busy ? '로그인 중…' : '로그인'}</Text>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.push('/signup' as Href)} hitSlop={8} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: c.sky, fontSize: 16, fontWeight: '600' }}>계정 만들기</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function ToggleRow({ label, value, onChange, last, c }: { label: string; value: boolean; onChange: (v: boolean) => void; last?: boolean; c: Palette }) {
  return (
    <View style={[st.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
      <Text style={{ color: c.ink, fontSize: 16, flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

const st = StyleSheet.create({
  group: { borderRadius: 14, overflow: 'hidden' },
  input: { fontSize: 17, paddingHorizontal: 16, minHeight: 52 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 50 },
  primary: { minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
});
