import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AccountState } from '@/app/actions/auth';
import { accountForm, logoutNow, type AccountResult } from '~/account/session';
import { Bar } from '~/community/parts';
import { usePalette, type Palette } from '~/lib/ui';
import { leaveTo } from '~/shell/web-nav';

/**
 * 계정(앱 화면) — 웹 내 정보 창의 계정 줄 셋(app/(app)/profile/account-actions.tsx)을 옮겼다: 로그아웃 · 비밀번호 바꾸기 · 회원 탈퇴.
 * 서버는 같은 auth.logout · auth.changePassword · auth.deleteAccount(검사 · 잠금 그대로). 로그인 쿠키는 ~/account/session 이 웹뷰와 맞춘다.
 *
 * 로그아웃 · 탈퇴 뒤에는 웹을 '/login' 으로 — 웹이 실제로 로그인 주소에 가야 껍데기가 앞사람 기록을 지우고(index.tsx 의 로그인 주소 감지)
 * 사이트 로그인 자리가 앱 로그인 화면('/login?native=1')을 연다.
 */
const LOGGED_OUT = '/login';

export default function AccountScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [open, setOpen] = useState<'pw' | 'leave' | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const logout = async () => {
    if (leaving) return;
    setLeaving(true);
    setMsg(null);
    const r = await logoutNow();
    if ('moved' in r) return leaveTo(LOGGED_OUT);
    setLeaving(false);
    setMsg('error' in r ? r.error : '로그아웃하지 못했어요.');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="내 정보" title="계정" c={c} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: inset.bottom + 32 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={[st.group, { backgroundColor: c.card }]}>
          <ActionRow label={leaving ? '로그아웃하는 중…' : '로그아웃'} onPress={() => void logout()} disabled={leaving} c={c} />
          <ActionRow label="비밀번호 바꾸기" onPress={() => setOpen(open === 'pw' ? null : 'pw')} expanded={open === 'pw'} c={c} />
          <ActionRow label="회원 탈퇴" danger onPress={() => setOpen(open === 'leave' ? null : 'leave')} expanded={open === 'leave'} last c={c} />
        </View>
        {msg ? <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 15, fontWeight: '600', paddingHorizontal: 4 }}>{msg}</Text> : null}
        {open === 'pw' ? <PasswordForm onDone={() => setOpen(null)} c={c} /> : null}
        {open === 'leave' ? <LeaveForm c={c} /> : null}
      </ScrollView>
    </View>
  );
}

function ActionRow({ label, onPress, danger, expanded, disabled, last, c }: { label: string; onPress: () => void; danger?: boolean; expanded?: boolean; disabled?: boolean; last?: boolean; c: Palette }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [st.row, { opacity: disabled ? 0.6 : pressed ? 0.6 : 1 }, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}
    >
      <Text style={{ color: danger ? c.danger : c.ink, fontSize: 16, flex: 1 }}>{label}</Text>
      <Text style={{ color: c.muted, fontSize: 18 }}>{expanded ? '⌄' : '›'}</Text>
    </Pressable>
  );
}

/** 결과 → 화면 한 줄. moved 는 부르는 쪽이 먼저 처리한다 */
function messageOf(r: AccountResult<AccountState>): { ok: boolean; text: string } | null {
  if ('error' in r) return { ok: false, text: r.error };
  if ('state' in r && r.state?.error) return { ok: false, text: r.state.error };
  if ('state' in r && r.state?.success) return { ok: true, text: r.state.success };
  return null;
}

function PasswordForm({ onDone, c }: { onDone: () => void; c: Palette }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const r = await accountForm<AccountState>('auth.changePassword', { currentPassword: current, newPassword: next, newPasswordConfirm: confirm });
    setBusy(false);
    if ('moved' in r) return leaveTo(r.moved);
    const m = messageOf(r);
    setMsg(m);
    if (m?.ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCurrent('');
      setNext('');
      setConfirm('');
    }
  };

  return (
    <Section title="비밀번호 바꾸기" footer="지금 비밀번호를 먼저 확인해요. 바꾸면 다른 기기의 로그인은 풀려요." c={c}>
      <Field value={current} onChange={setCurrent} placeholder="지금 비밀번호" kind="current" c={c} />
      <Field value={next} onChange={setNext} placeholder="새 비밀번호(8자 이상)" kind="new" c={c} />
      <Field value={confirm} onChange={setConfirm} placeholder="새 비밀번호 한 번 더" kind="new" c={c} />
      <Result msg={msg} c={c} />
      {msg?.ok ? (
        <Button label="닫기" onPress={onDone} c={c} />
      ) : (
        <Button label={busy ? '바꾸는 중…' : '비밀번호 바꾸기'} onPress={() => void save()} disabled={busy} c={c} />
      )}
    </Section>
  );
}

function LeaveForm({ c }: { c: Palette }) {
  const [password, setPassword] = useState('');
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const leave = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const r = await accountForm<AccountState>('auth.deleteAccount', { password, confirmWord: word.trim() });
    if ('moved' in r) return leaveTo(LOGGED_OUT);
    setBusy(false);
    setMsg(messageOf(r) ?? { ok: false, text: '탈퇴하지 못했어요.' });
  };

  const ask = () =>
    Alert.alert('정말 탈퇴할까요?', '투구 기록 · 영상 · 체크인 · 운동 기록이 모두 지워지고 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      { text: '탈퇴', style: 'destructive', onPress: () => void leave() },
    ]);

  return (
    <Section title="회원 탈퇴" footer="지금까지 남긴 것이 전부 사라져요. 확인란에 탈퇴 두 글자를 그대로 적어 주세요." c={c}>
      <Field value={password} onChange={setPassword} placeholder="비밀번호" kind="current" c={c} />
      <Field value={word} onChange={setWord} placeholder="탈퇴" kind="text" c={c} />
      <Result msg={msg} c={c} />
      <Button label={busy ? '탈퇴하는 중…' : '탈퇴하기'} onPress={ask} disabled={busy || word.trim() !== '탈퇴' || !password} danger c={c} />
    </Section>
  );
}

function Section({ title, footer, children, c }: { title: string; footer: string; children: React.ReactNode; c: Palette }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: c.muted, fontSize: 13, fontWeight: '600', paddingHorizontal: 16 }}>{title}</Text>
      {children}
      <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18, paddingHorizontal: 16 }}>{footer}</Text>
    </View>
  );
}

function Field({ value, onChange, placeholder, kind, c }: { value: string; onChange: (t: string) => void; placeholder: string; kind: 'current' | 'new' | 'text'; c: Palette }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={c.muted}
      secureTextEntry={kind !== 'text'}
      textContentType={kind === 'current' ? 'password' : kind === 'new' ? 'newPassword' : 'none'}
      autoComplete={kind === 'current' ? 'current-password' : kind === 'new' ? 'new-password' : 'off'}
      autoCapitalize="none"
      autoCorrect={false}
      accessibilityLabel={placeholder}
      style={[st.input, { color: c.ink, backgroundColor: c.card }]}
    />
  );
}

function Result({ msg, c }: { msg: { ok: boolean; text: string } | null; c: Palette }) {
  if (!msg) return null;
  return (
    <Text accessibilityRole="alert" style={{ color: msg.ok ? c.ok : c.danger, fontSize: 15, fontWeight: '600', paddingHorizontal: 4 }}>
      {msg.text}
    </Text>
  );
}

function Button({ label, onPress, disabled, danger, c }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean; c: Palette }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [st.button, { backgroundColor: danger ? c.danger : c.sky, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }]}
    >
      <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  group: { borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 50 },
  input: { fontSize: 17, paddingHorizontal: 16, minHeight: 50, borderRadius: 12 },
  button: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
});
