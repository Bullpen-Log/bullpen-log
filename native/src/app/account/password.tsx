import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AccountState } from '@/app/actions/auth';
import { AccountButton, AccountFeedback, AccountField, accountMessage } from '~/account/parts';
import { accountForm } from '~/account/session';
import { Bar } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { RADIUS, TYPE, usePalette } from '~/lib/ui';
import { leaveTo } from '~/shell/web-nav';

type FieldErrors = { current?: string; next?: string; confirm?: string };

export default function PasswordScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const saving = useRef(false);

  const save = async () => {
    if (saving.current || done) return;
    const found: FieldErrors = {};
    if (!current) found.current = '지금 비밀번호를 입력해 주세요.';
    if (!next) found.next = '새 비밀번호를 입력해 주세요.';
    else if (next.length < 8) found.next = '새 비밀번호는 8자 이상이어야 해요.';
    else if (next === current) found.next = '지금 비밀번호와 다른 것으로 정해 주세요.';
    if (!confirm) found.confirm = '새 비밀번호를 한 번 더 입력해 주세요.';
    else if (next !== confirm) found.confirm = '새 비밀번호가 서로 달라요.';
    setErrors(found);
    setMessage(null);
    if (Object.keys(found).length) return;

    saving.current = true;
    setBusy(true);
    const result = await accountForm<AccountState>('auth.changePassword', { currentPassword: current, newPassword: next, newPasswordConfirm: confirm });
    saving.current = false;
    setBusy(false);
    if ('moved' in result) return leaveTo(result.moved);
    const response = accountMessage(result);
    if (response?.ok) {
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
    const text = response?.text ?? '비밀번호를 바꾸지 못했어요. 다시 시도해 주세요.';
    if (text.includes('지금 비밀번호가 맞지')) setErrors({ current: text });
    else if (text.includes('서로 달라')) setErrors({ confirm: text });
    else if (text.includes('새 비밀번호')) setErrors({ next: text });
    else setMessage(text);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="계정" title="비밀번호 변경" c={c} />
      <ScrollView contentContainerStyle={[s.body, READABLE, { paddingBottom: inset.bottom + 32 }]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {done ? (
          <View style={s.complete}>
            <SymbolView name="checkmark.circle.fill" size={48} tintColor={c.ok} />
            <Text accessibilityRole="header" style={[TYPE.section, { color: c.ink }]}>비밀번호를 바꿨어요</Text>
            <Text style={[TYPE.body, s.center, { color: c.muted }]}>다른 기기의 로그인은 풀려요. 이 기기는 계속 사용할 수 있어요.</Text>
            <View style={s.fullWidth}><AccountButton label="계정으로 돌아가기" onPress={() => router.back()} /></View>
          </View>
        ) : (
          <View style={s.form}>
            <View style={s.intro}>
              <Text accessibilityRole="header" style={[TYPE.section, { color: c.ink }]}>비밀번호 변경</Text>
              <Text style={[TYPE.sub, { color: c.muted }]}>지금 비밀번호를 확인하고 새 비밀번호로 바꿔요.</Text>
            </View>
            <AccountField label="지금 비밀번호" value={current} onChange={(value) => { setCurrent(value); setErrors((e) => ({ ...e, current: undefined })); setMessage(null); }} kind="current" placeholder="지금 비밀번호" error={errors.current} />
            <AccountField label="새 비밀번호" value={next} onChange={(value) => { setNext(value); setErrors((e) => ({ ...e, next: undefined })); setMessage(null); }} kind="new" placeholder="새 비밀번호" hint="8자 이상, 지금 비밀번호와 다르게" error={errors.next} />
            <AccountField label="새 비밀번호 확인" value={confirm} onChange={(value) => { setConfirm(value); setErrors((e) => ({ ...e, confirm: undefined })); setMessage(null); }} kind="new" placeholder="새 비밀번호 한 번 더" error={errors.confirm} />
            <View style={[s.note, { backgroundColor: c.skyTint }]}>
              <Text style={[TYPE.sub, { color: c.ink }]}>바꾸면 이 기기는 그대로 로그인되고, 다른 기기의 로그인은 풀려요.</Text>
            </View>
            <AccountFeedback text={message} />
            <AccountButton label={busy ? '바꾸는 중…' : '비밀번호 바꾸기'} onPress={() => void save()} disabled={busy} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 20 },
  form: { gap: 19 },
  intro: { gap: 5, marginBottom: 2 },
  note: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: RADIUS.control },
  complete: { paddingTop: 68, alignItems: 'center', gap: 14 },
  center: { textAlign: 'center' },
  fullWidth: { alignSelf: 'stretch', marginTop: 9 },
});
