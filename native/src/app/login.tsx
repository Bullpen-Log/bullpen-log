import { ActionButton } from '~/shell/action-button';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, type TextInputInstance, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import type { AuthState } from '@/app/actions/auth';
import { LoginHero } from '~/account/login-hero';
import { accountForm, clearSession } from '~/account/session';
import { loadJson, saveJson } from '~/lib/store';
import { loadMe, resetMe } from '~/pitch/api';
import { CONTROL, RADIUS, TYPE, usePalette, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { leaveTo } from '~/shell/web-nav';

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
  const { width, height } = useWindowDimensions();
  const compact = height < 740;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRequired, setShowRequired] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);
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
    setError(null);
    if (!email.trim() || !password) {
      setShowRequired(true);
      return;
    }
    setShowRequired(false);
    setBusy(true);
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

  const emailRequired = showRequired && !email.trim();
  const passwordRequired = showRequired && !password;

  return (
    <View style={{ flex: 1, backgroundColor: c.card }}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ScrollView
        contentContainerStyle={[
          st.content,
          {
            paddingTop: inset.top + (width >= 600 ? 32 : 6),
            paddingBottom: inset.bottom + 20,
            paddingLeft: Math.max(12, inset.left),
            paddingRight: Math.max(12, inset.right),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <LoginHero compact={compact} />

        <View style={[st.form, { marginTop: compact ? 20 : 30 }]}>
          <Text accessibilityRole="header" style={[TYPE.title, { color: c.ink }]}>로그인</Text>
          <View style={st.fields}>
            <View style={st.field}>
              <View style={[st.inputRow, { backgroundColor: c.page, borderColor: emailRequired ? c.danger : focused === 'email' ? c.link : c.line }]}>
                <View pointerEvents="none" importantForAccessibility="no-hide-descendants">
                  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <Rect x="3" y="5" width="18" height="14" rx="3" />
                    <Path d="m5 8 5.8 4.5a2 2 0 0 0 2.4 0L19 8" />
                  </Svg>
                </View>
                <TextInput
                  value={email}
                  onChangeText={(value) => { setEmail(value); setError(null); }}
                  placeholder="이메일"
                  placeholderTextColor={c.muted}
                  keyboardType="email-address"
                  textContentType="username"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  accessibilityLabel="이메일"
                  style={[st.input, { color: c.ink }]}
                />
              </View>
              {emailRequired ? <LoginError message="이메일을 입력해 주세요." c={c} inline /> : null}
            </View>
            <View style={st.field}>
              <View style={[st.inputRow, { backgroundColor: c.page, borderColor: passwordRequired ? c.danger : focused === 'password' ? c.link : c.line }]}>
                <Icon name="lock" size={20} color={c.muted} strokeWidth={1.8} />
                <TextInput
                  ref={passwordRef}
                  value={password}
                  onChangeText={(value) => { setPassword(value); setError(null); }}
                  placeholder="비밀번호"
                  placeholderTextColor={c.muted}
                  secureTextEntry={!showPassword}
                  textContentType="password"
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="go"
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  onSubmitEditing={() => void submit()}
                  accessibilityLabel="비밀번호"
                  style={[st.input, { color: c.ink }]}
                />
                <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} onPress={() => setShowPassword((v) => !v)} style={({ pressed }) => [st.passwordToggle, pressed && st.pressed]}>
                  <Text style={[st.link, { color: c.link }]}>{showPassword ? '숨기기' : '보기'}</Text>
                </Pressable>
              </View>
              {passwordRequired ? <LoginError message="비밀번호를 입력해 주세요." c={c} inline /> : null}
            </View>
            {error ? <LoginError message={error} c={c} /> : null}
          </View>

          <View style={st.helpRow}>
            <CheckLine
              label="이메일 기억하기"
              value={remember}
              onChange={(v) => {
                setRemember(v);
                savePrefs({ email: v ? email.trim() : null });
              }}
              c={c}
            />
            <Pressable accessibilityRole="button" onPress={forgotPassword} style={({ pressed }) => [st.textButton, pressed && st.pressed]}>
              <Text style={[st.link, { color: c.link }]}>비밀번호 찾기</Text>
            </Pressable>
          </View>

          <ActionButton onPress={() => void submit()} busy={busy} label={busy ? '로그인 중…' : '로그인'} style={st.submit} />
          <View style={[st.signup, { borderTopColor: c.line }]}>
            <Text style={[TYPE.body, { color: c.muted }]}>싱커가 처음이신가요?</Text>
            <Pressable accessibilityRole="link" onPress={() => router.push('/signup')} style={({ pressed }) => [st.textButton, pressed && st.pressed]}>
              <Text style={[st.link, { color: c.link }]}>계정 만들기</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function LoginError({ message, c, inline = false }: { message: string; c: Palette; inline?: boolean }) {
  return (
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[TYPE.sub, st.error, { color: c.danger }, !inline && [st.errorPanel, { backgroundColor: c.dangerBg }]]}>
      {message}
    </Text>
  );
}

/** 웹 CheckLine 과 같은 네모 체크 + 글 — 누르는 줄 44pt */
function CheckLine({ label, value, onChange, c }: { label: string; value: boolean; onChange: (v: boolean) => void; c: Palette }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={st.checkLine}
    >
      <View style={[st.box, value ? { backgroundColor: c.action, borderColor: c.sky } : { borderColor: c.muted }]}>
        {value ? <Icon name="check" size={13} color="#fff" strokeWidth={3} /> : null}
      </View>
      <Text style={[TYPE.body, { color: c.ink, flexShrink: 1 }]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  content: { flexGrow: 1, width: '100%', maxWidth: 520, alignSelf: 'center' },
  form: { marginHorizontal: 14 },
  fields: { marginTop: 20, gap: 12 },
  field: { gap: 5 },
  inputRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, borderRadius: RADIUS.pill, borderWidth: 1.25 },
  input: { ...TYPE.reading, flex: 1, minWidth: 0, minHeight: 54, paddingVertical: 12 },
  passwordToggle: { minHeight: CONTROL.icon, minWidth: CONTROL.icon, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  helpRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 12 },
  checkLine: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: CONTROL.compact, flexShrink: 1 },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  textButton: { minHeight: CONTROL.compact, justifyContent: 'center', maxWidth: '100%' },
  link: { ...TYPE.buttonCompact },
  pressed: { opacity: 0.65 },
  submit: { marginTop: 9, minHeight: 56 },
  signup: { marginTop: 24, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 8 },
  error: { paddingHorizontal: 14, fontWeight: '600' },
  errorPanel: { borderRadius: 14, paddingVertical: 9 },
});
