import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, type TextInputInstance, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AuthState } from '@/app/actions/auth';
import { accountForm } from '~/account/session';
import { READABLE } from '~/lib/layout';
import { usePalette, type Palette } from '~/lib/ui';
import { leaveTo } from '~/shell/web-nav';
import { DUGOUT_GREEN, DugoutMark } from '~/dugout/mark';

/**
 * 덕아웃 앱 로그인(앱 화면) — 싱커 로그인(src/app/login.tsx)과 같은 서버 auth.login · 같은 쿠키 다루기(~/account/session).
 * 사이트가 /login 으로 보내면 껍데기(index.tsx)가 이 창을 띄운다(next = 로그인 뒤 갈 곳). 성공하면 웹을 next 로 새로 불러온다 —
 * 서버가 보내려던 곳(선수 '/today' · 마스터 '/master')은 싱커 주소라 따르지 않는다. 가입은 아직 웹(/login?signup=1).
 * 앱은 늘 자동 로그인(30일 — 싱커와 같다). 비밀번호는 담지 않는다 — iOS 암호 자동 채우기가 맡는다.
 */
const CONTACT = 'bullpenlog.com@gmail.com';

/** 사이트 안 주소만 — '//다른곳' 으로 밖에 보내지 않게 */
const safeNext = (n?: string) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/');

function forgotPassword() {
  Alert.alert('비밀번호를 잊었어요', `가입한 이메일을 적어 운영팀(${CONTACT})에 보내 주세요. 임시 비밀번호를 만들어 드려요.`, [
    { text: '닫기', style: 'cancel' },
    { text: '메일 쓰기', onPress: () => void Linking.openURL(`mailto:${CONTACT}?subject=${encodeURIComponent('덕아웃 비밀번호 찾기')}`).catch(() => undefined) },
  ]);
}

export default function DugoutLogin() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const submit = async () => {
    if (busy) return;
    if (!email.trim() || !password) return setError('이메일과 비밀번호를 입력해 주세요.');
    setBusy(true);
    setError(null);
    const r = await accountForm<AuthState>('auth.login', { email: email.trim(), password, stayLoggedIn: 'on' });
    setBusy(false);
    if ('moved' in r) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return leaveTo(safeNext(next));
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setError('error' in r ? r.error : (r.state?.error ?? '로그인하지 못했어요.'));
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <ScrollView
        contentContainerStyle={[{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 28, paddingBottom: inset.bottom + 20 }, READABLE]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <DugoutMark size={44} color={DUGOUT_GREEN} />
        <Text style={{ color: c.ink, fontSize: 28, fontWeight: '800', marginTop: 16 }}>로그인</Text>
        <Text style={{ color: c.muted, fontSize: 15, lineHeight: 22, marginTop: 10 }}>채팅 · 글쓰기 · 레슨 예약은 로그인하고 써요.</Text>

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
              placeholder="name@example.com"
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
          <Pressable accessibilityRole="button" onPress={forgotPassword} style={({ pressed }) => [st.text, { alignSelf: 'flex-start', paddingHorizontal: 0 }, pressed && { opacity: 0.6 }]}>
            <Text style={{ color: DUGOUT_GREEN, fontSize: 15, fontWeight: '600' }}>비밀번호를 잊었어요</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
          {/* 가입은 웹 폼(?web=1 — 껍데기가 앱 로그인으로 다시 가로채지 않게) */}
          <Pressable accessibilityRole="link" onPress={() => leaveTo('/login?signup=1&web=1')} style={({ pressed }) => [st.text, pressed && { backgroundColor: c.line }]}>
            <Text style={{ color: DUGOUT_GREEN, fontSize: 15, fontWeight: '600' }}>계정 만들기</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => void submit()}
            disabled={busy}
            style={({ pressed }) => [st.primary, { backgroundColor: DUGOUT_GREEN, opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}
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
      <Text style={{ color: c.muted, fontSize: 13 }}>{label}</Text>
      {children}
    </View>
  );
}

const st = StyleSheet.create({
  input: { fontSize: 17, paddingHorizontal: 14, minHeight: 52, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth * 2 },
  text: { minHeight: 48, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center' },
  primary: { minHeight: 48, paddingHorizontal: 28, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
