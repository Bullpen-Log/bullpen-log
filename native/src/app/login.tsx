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
    { text: '메일 쓰기', onPress: () => void Linking.openURL(`mailto:${CONTACT}?subject=${encodeURIComponent('불펜로그 비밀번호 찾기')}`).catch(() => undefined) },
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

  const [hint, setHint] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      {/* 웹 로그인(StepCard)과 같은 차례 — 로고 · 제목 · 한 줄 · 이름 붙은 칸 둘 · 체크 줄 · 아래 [계정 만들기][로그인] */}
      <ScrollView
        contentContainerStyle={[{ flexGrow: 1, paddingHorizontal: 20, paddingTop: inset.top + 20, paddingBottom: inset.bottom + 20 }, READABLE]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Wordmark size={24} color={c.ink} />
        <Text style={{ color: c.ink, fontSize: 28, fontWeight: '800', marginTop: 24 }}>로그인</Text>
        <Text style={{ color: c.muted, fontSize: 15, lineHeight: 22, marginTop: 10 }}>기록을 이어서 보려면 로그인해 주세요.</Text>

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
            <TextInput
              ref={passwordRef}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={c.muted}
              secureTextEntry
              textContentType="password"
              autoComplete="current-password"
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
              accessibilityLabel="비밀번호"
              style={[st.input, { color: c.ink, backgroundColor: c.card, borderColor: c.line }]}
            />
          </Labeled>

          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <CheckLine
                label="아이디 기억하기"
                value={remember}
                onChange={(v) => {
                  setRemember(v);
                  savePrefs({ email: v ? email.trim() : null });
                }}
                c={c}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="자동 로그인 · 아이디 기억하기 설명"
                accessibilityState={{ expanded: hint }}
                onPress={() => setHint((h) => !h)}
                hitSlop={8}
                style={{ marginLeft: 'auto', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="info" size={18} color={hint ? c.sky : c.muted} strokeWidth={2} />
              </Pressable>
            </View>
            {hint ? (
              <View style={{ gap: 6, marginTop: 4 }}>
                <Text style={{ color: c.muted, fontSize: 13, lineHeight: 19 }}>앱은 자동 로그인이에요. 앱을 닫아도 30일 동안 로그인이 유지돼요.</Text>
                <Text style={{ color: c.muted, fontSize: 13, lineHeight: 19 }}>아이디 기억하기: 다음에 올 때 이메일 칸을 채워 둬요. 비밀번호는 저장하지 않아요.</Text>
              </View>
            ) : null}
          </View>
          <Pressable accessibilityRole="button" onPress={forgotPassword} style={({ pressed }) => [st.text, { alignSelf: 'flex-start', paddingHorizontal: 0 }, pressed && { opacity: 0.6 }]}>
            <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>비밀번호를 잊었어요</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
          <Pressable accessibilityRole="link" onPress={() => router.push('/signup' as Href)} style={({ pressed }) => [st.text, pressed && { backgroundColor: c.line }]}>
            <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>계정 만들기</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => void submit()}
            disabled={busy}
            style={({ pressed }) => [st.primary, { backgroundColor: c.sky, opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}
          >
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{busy ? '로그인 중…' : '로그인'}</Text>
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
      <View style={[st.box, value ? { backgroundColor: c.sky, borderColor: c.sky } : { borderColor: c.muted }]}>
        {value ? <Icon name="check" size={13} color="#fff" strokeWidth={3} /> : null}
      </View>
      <Text style={{ color: c.muted, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  input: { fontSize: 17, paddingHorizontal: 14, minHeight: 52, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth * 2 },
  box: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  text: { minHeight: 48, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center' },
  primary: { minHeight: 48, paddingHorizontal: 28, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
