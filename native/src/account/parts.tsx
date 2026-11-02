import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AccountState } from '@/app/actions/auth';
import type { AccountResult } from '~/account/session';
import { CONTROL, RADIUS, TYPE, usePalette } from '~/lib/ui';

export function accountMessage(result: AccountResult<AccountState>): { ok: boolean; text: string } | null {
  if ('error' in result) return { ok: false, text: result.error };
  if ('state' in result && result.state?.error) return { ok: false, text: result.state.error };
  if ('state' in result && result.state?.success) return { ok: true, text: result.state.success };
  return null;
}

export function AccountField({
  label, value, onChange, kind, placeholder, hint, error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  kind: 'current' | 'new' | 'text';
  placeholder: string;
  hint?: string;
  error?: string | null;
}) {
  const c = usePalette();
  const [visible, setVisible] = useState(false);
  const secure = kind !== 'text';
  return (
    <View style={s.field}>
      <Text style={[TYPE.sub, s.label, { color: c.ink }]}>{label}</Text>
      <View style={[s.inputWrap, { backgroundColor: c.card, borderColor: error ? c.danger : c.line }]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={c.muted}
          secureTextEntry={secure && !visible}
          textContentType={kind === 'current' ? 'password' : kind === 'new' ? 'newPassword' : 'none'}
          autoComplete={kind === 'current' ? 'current-password' : kind === 'new' ? 'new-password' : 'off'}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={label}
          style={[s.input, { color: c.ink }]}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label} ${visible ? '숨기기' : '보기'}`}
            onPress={() => setVisible((was) => !was)}
            hitSlop={6}
            style={s.reveal}
          >
            <Text style={[TYPE.sub, { color: c.link }]}>{visible ? '숨기기' : '보기'}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text accessibilityRole="alert" style={[TYPE.sub, { color: c.danger }]}>{error}</Text> : hint ? <Text style={[TYPE.sub, { color: c.muted }]}>{hint}</Text> : null}
    </View>
  );
}

export function AccountButton({ label, onPress, danger = false, disabled = false }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.button, { backgroundColor: danger ? c.danger : c.action, opacity: disabled ? 0.5 : pressed ? 0.83 : 1 }]}
    >
      <Text style={[TYPE.button, { color: danger ? c.page : c.onAction, textAlign: 'center' }]}>{label}</Text>
    </Pressable>
  );
}

export function AccountFeedback({ text, ok = false }: { text: string | null; ok?: boolean }) {
  const c = usePalette();
  if (!text) return null;
  return <Text accessibilityRole={ok ? 'text' : 'alert'} style={[TYPE.body, { color: ok ? c.ok : c.danger }]}>{text}</Text>;
}

const s = StyleSheet.create({
  field: { gap: 7 },
  label: { fontWeight: '600' },
  inputWrap: { minHeight: CONTROL.height, flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.control },
  input: { flex: 1, minWidth: 0, minHeight: CONTROL.height, paddingHorizontal: 14, fontSize: 17 },
  reveal: { minHeight: CONTROL.height, minWidth: 58, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: CONTROL.height, paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
});
