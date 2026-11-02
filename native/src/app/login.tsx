import { ActionButton } from '~/shell/action-button';
import * as Haptics from 'expo-haptics';
import { type Href, router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, type TextInputInstance, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AuthState } from '@/app/actions/auth';
import { accountForm, clearSession } from '~/account/session';
import { loadJson, saveJson } from '~/lib/store';
import { loadMe, resetMe } from '~/pitch/api';
import { usePalette, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { leaveTo } from '~/shell/web-nav';
import { Wordmark } from '~/shell/wordmark';
import { READABLE } from '~/lib/layout';

/**
 * 로그인(앱 화면) — 웹 로그인(app/login/auth-form.tsx LoginForm)을 옮겼다. 서버는 같은 auth.login(막힘 · 잠금 규칙 그대로).
 * 사이트 /login 이 앱이면 '/login?native=1' 로 이 화면을 연다(그냥 '/login' 은 웹으로 가 껍데기가 앞사람 기록을 지운다). 그 길로 왔다 = 로그아웃 상태라 열 때 두 저장소의 로그인을 지운다(~/account/session).
 * 딥링크(bullpenlog://login)로 오면 지우지 않는다 — 이미 로그인돼 있으면 바로 닫는다(2026-10-21: 링크 하나로 로그인이 풀렸다).
 * 닫을 수 없다(뒤로 쓸기 막음) — 밑의 웹은 빈 로그인 자리라 닫으면 갈 곳이 없다. 성공하면 웹뷰 로그인을 맞춘 뒤 웹을 /today 로.
 *
 * 앱은 늘 자동 로그인(30일, 2026-10-21 김민 — 끄는 칸 없음). '아이디 기억하기'는 이 폰에만(웹 lib/login-prefs.ts 와 같은 뜻).
 * 비밀번호는 담지 않는다 — iOS 암호 자동 채우기가 맡는다.
 */
const PREFS = 'bullpen-login-prefs';
type Prefs = { email: string | null };
/** 비밀번호를 잊었을 때 물을 곳 — 개인정보 처리방침 8조의 공개 연락처(app/(legal)/privacy/privacy-content.tsx) */
const CONTACT = 'bullpenlog.com@gmail.com';

/** 비밀번호 찾기 — 아직 메일로 재설정하는 길이 없어 운영팀이 임시 비밀번호를 만들어 준다(관리자 '임시 비밀번호 만들기') */
function forgotPassword() {
  Alert.alert('비밀번호를 잊었어요', `가입한 이메일을 적어 운영팀(${CONTACT})에 보내 주세요. 임시 비밀번호를 만들어 드려요. 로그인한 뒤 내 정보에서 바꿔 주세요.`, [
    { text: '닫기', style: 'cancel' },
    { text: '메일 쓰기', onPress: () => void Linking.openURL(`mailto:${CONTACT}?subject=${encodeURIComponent('싱커 비밀번호 찾기')}`).catch(() => undefined) },
  ]);
}

export default function LoginScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const { native } = useLocalSearchParams<{ native?: string }>();
  useEffect(() => {
    if (native === '1') void clearSession();
    else {
      /* 딥링크 — 이미 로그인돼 있으면 로그인 화면을 둘 까닭이 없다 */
      resetMe();
      void loadMe().then(
        () => (router.canGoBack() ? router.back() : router.replace('/')),
        () => undefined
      );
    }
    void loadJson(PREFS).then((raw) => {
      const p = raw as Partial<Prefs> | null;
      if (typeof p?.email === 'string') {
        setRemember(true);
        setEmail((now) => now || (p.email as string));
      }
    });
  }, [native]);

  const savePrefs = (next: Partial<Prefs>) =>
    void saveJson(PREFS, { email: remember ? email.trim() : null, ...next });

  const submit = async () => {
    if (busy) return;
    if (!email.trim() || !password) return setError('이메일과 비밀번호를 입력해 주세요.');
    setBusy(true);
    setError(null);
    savePrefs({});
    const r = await accountForm<AuthState>('auth.login', {
      email: email.trim(),
      password,
      stayLoggedIn: 'on',
    });
    setBusy(false);
    if ('moved' in r) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return leaveTo(r.moved);
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setError('error' in r ? r.error : (r.state?.error ?? '로그인하지 못했어요.'));
  };

  const [showPassword, setShowPassword] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ScrollView
        contentContainerStyle={[{ flexGrow: 1, paddingHorizontal: 20, paddingTop: inset.top + 20, paddingBottom: inset.bottom + 20 }, READABLE]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Wordmark size={24} color={c.ink} />
        <View style={[st.hero, { backgroundColor: c.skyTint }]}>
          <Text accessibilityRole="header" style={{ color: c.ink, fontSize: 28, fontWeight: '800' }}>로그인</Text>
          <Text style={{ color: c.muted, fontSize: 15, lineHeight: 22, marginTop: 8 }}>지난 기록을 확인하고 오늘 훈련을 시작하세요.</Text>
        </View>

        <View style={{ flex: 1, gap: 20, marginTop: 24 }}>
          {error ? (
            <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 15, fontWeight: '600' }}>
              {error}
            </Text>
          ) : null}
          <Labeled label="이메일" c={c}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="pitcher@example.com"
              placeholderTextColor={c.muted}
              keyboardType="email-address"
              textContentType="username"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              accessibilityLabel="이메일"
              style={[st.input, { color: c.ink, backgroundColor: c.card, borderColor: c.line }]}
            />
          </Labeled>
          <Labeled label="비밀번호" c={c}>
            <View style={[st.passwordRow, { backgroundColor: c.card, borderColor: c.line }]}>
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={c.muted}
                secureTextEntry={!showPassword}
                textContentType="password"
                autoComplete="current-password"
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
                accessibilityLabel="비밀번호"
                style={[st.passwordInput, { color: c.ink }]}
              />
              <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} onPress={() => setShowPassword((v) => !v)} hitSlop={8} style={st.passwordToggle}>
                <Text style={{ color: c.link, fontSize: 14, fontWeight: '600' }}>{showPassword ? '숨기기' : '보기'}</Text>
              </Pressable>
            </View>
          </Labeled>

          <View style={{ gap: 4 }}>
            <View style={st.helpRow}>
              <CheckLine
                label="아이디 기억하기"
                value={remember}
                onChange={(v) => {
                  setRemember(v);
                  savePrefs({ email: v ? email.trim() : null });
                }}
                c={c}
              />
              <Pressable accessibilityRole="button" onPress={forgotPassword} hitSlop={8} style={({ pressed }) => [st.text, { paddingHorizontal: 0 }, pressed && { opacity: 0.6 }]}>
                <Text style={{ color: c.link, fontSize: 14, fontWeight: '600' }}>비밀번호를 잊었어요</Text>
              </Pressable>
            </View>
            <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>아이디만 저장해요. 로그인은 30일간 유지돼요.</Text>
          </View>
        </View>

        <View style={{ gap: 10, marginTop: 24 }}>
          <ActionButton onPress={() => void submit()} busy={busy} label={busy ? '로그인 중…' : '로그인'} style={{ width: '100%' }} />
          <Pressable accessibilityRole="link" onPress={() => router.push('/signup' as Href)} style={({ pressed }) => [st.createButton, { backgroundColor: pressed ? c.chip : c.card, borderColor: c.line }]}>
            <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>처음이라면 계정 만들기</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function Labeled({ label, c, children }: { label: string; c: Palette; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: c.muted, fontSize: 13, fontWeight: '400' }}>{label}</Text>
      {children}
    </View>
  );
}

/** 웹 CheckLine 과 같은 네모 체크 + 글 — 누르는 줄 44pt */
function CheckLine({ label, value, onChange, c }: { label: string; value: boolean; onChange: (v: boolean) => void; c: Palette }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}
    >
      <View style={[st.box, value ? { backgroundColor: c.action, borderColor: c.sky } : { borderColor: c.muted }]}>
        {value ? <Icon name="check" size={13} color="#fff" strokeWidth={3} /> : null}
      </View>
      <Text style={{ color: c.muted, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  input: { fontSize: 17, paddingHorizontal: 14, minHeight: 52, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth * 2 },
  hero: { marginTop: 24, padding: 18, borderRadius: 18 },
  passwordRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth * 2 },
  passwordInput: { flex: 1, minHeight: 52, fontSize: 17, paddingLeft: 14, paddingRight: 4 },
  passwordToggle: { minHeight: 44, minWidth: 62, alignItems: 'center', justifyContent: 'center' },
  helpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 12 },
  createButton: { minHeight: 52, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth * 2, alignItems: 'center', justifyContent: 'center' },
  box: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  text: { minHeight: 48, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center' },
});
