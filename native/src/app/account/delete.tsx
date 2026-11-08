import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AccountState } from '@/app/actions/auth';
import { AccountButton, AccountFeedback, AccountField, accountMessage } from '~/account/parts';
import { accountForm } from '~/account/session';
import { Bar } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { rpc } from '~/lib/rpc';
import { RADIUS, TYPE, usePalette } from '~/lib/ui';
import { leaveTo } from '~/shell/web-nav';

type FieldErrors = { password?: string; word?: string };

export default function DeleteAccountScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [word, setWord] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [messageOk, setMessageOk] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [checking, setChecking] = useState(false);
  const working = useRef(false);

  const ask = () => {
    if (working.current || uncertain) return;
    const found: FieldErrors = {};
    if (!password) found.password = '비밀번호를 입력해 주세요.';
    if (word.trim() !== '탈퇴') found.word = '확인란에 탈퇴 두 글자를 그대로 적어 주세요.';
    setErrors(found);
    setMessage(null);
    setMessageOk(false);
    if (Object.keys(found).length) return;
    setConfirmOpen(true);
  };

  const leave = async () => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setConfirmOpen(false);
    const result = await accountForm<AccountState>('auth.deleteAccount', { password, confirmWord: word.trim() });
    working.current = false;
    setBusy(false);
    if ('moved' in result) return leaveTo('/login');
    if ('error' in result && result.error !== '앱을 업데이트해 주세요.') {
      setUncertain(true);
      setMessage('요청 결과를 확인하지 못했어요. 계정 상태를 확인한 뒤 다시 진행해 주세요.');
      setMessageOk(false);
      return;
    }
    const response = accountMessage(result);
    if (!response) {
      setUncertain(true);
      setMessage('요청 결과를 확인하지 못했어요. 계정 상태를 확인한 뒤 다시 진행해 주세요.');
      setMessageOk(false);
      return;
    }
    const text = response.text;
    if (text.includes('비밀번호가 맞지')) setErrors({ password: text });
    else if (text.includes('탈퇴 두 글자')) setErrors({ word: text });
    else { setMessage(text); setMessageOk(false); }
  };

  const verify = async () => {
    if (working.current) return;
    working.current = true;
    setChecking(true);
    try {
      const result = await rpc<{ ok: true } | { ok: false; error: string }>('app.loadAppMe');
      if (!result.ok) {
        setPassword('');
        setWord('');
        return leaveTo('/login');
      }
      setUncertain(false);
      setMessage('계정이 남아 있어요. 내용을 확인하고 다시 시도할 수 있어요.');
      setMessageOk(true);
    } catch {
      setMessage('아직 계정 상태를 확인하지 못했어요. 연결을 확인하고 다시 눌러 주세요.');
      setMessageOk(false);
    } finally {
      working.current = false;
      setChecking(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="계정" title="회원 탈퇴" c={c} onBack={() => { if (!busy && !checking) router.back(); }} />
      <ScrollView contentContainerStyle={[s.body, READABLE, { paddingBottom: inset.bottom + 32 }]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={s.intro}>
          <Text accessibilityRole="header" style={[TYPE.section, { color: c.ink }]}>회원 탈퇴</Text>
          <Text style={[TYPE.sub, { color: c.muted }]}>내용을 확인한 뒤 진행해 주세요.</Text>
        </View>

        <View style={[s.warning, { backgroundColor: c.dangerBg }]}>
          <Text style={[TYPE.card, { color: c.danger }]}>탈퇴하면 되돌릴 수 없어요.</Text>
          <Text style={[TYPE.body, { color: c.danger }]}>투구 기록, 올려둔 영상, 컨디션 체크인, 운동 기록, 남긴 글이 모두 지워져요. 같은 이메일로 다시 가입해도 돌아오지 않아요.</Text>
        </View>

        <AccountField label="비밀번호" value={password} onChange={(value) => { setPassword(value); setErrors((e) => ({ ...e, password: undefined })); if (!uncertain) setMessage(null); }} kind="current" placeholder="지금 비밀번호" error={errors.password} />
        <AccountField label="확인" value={word} onChange={(value) => { setWord(value); setErrors((e) => ({ ...e, word: undefined })); if (!uncertain) setMessage(null); }} kind="text" placeholder="탈퇴 입력" hint="‘탈퇴’ 두 글자를 그대로 적어 주세요." error={errors.word} />
        <AccountFeedback text={message} ok={messageOk} />
        {uncertain ? (
          <AccountButton label={checking ? '확인하는 중…' : '로그인 상태 확인'} onPress={() => void verify()} disabled={checking} />
        ) : (
          <AccountButton label={busy ? '처리 중…' : '탈퇴하고 모든 기록 지우기'} onPress={ask} disabled={busy} danger />
        )}
      </ScrollView>

      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => { if (!busy) setConfirmOpen(false); }}>
        <View style={s.overlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="탈퇴 취소" onPress={() => setConfirmOpen(false)} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={[s.sheet, { backgroundColor: c.card, paddingBottom: inset.bottom + 18 }]}>
            <Text accessibilityRole="header" style={[TYPE.section, { color: c.ink }]}>정말 탈퇴할까요?</Text>
            <Text style={[TYPE.body, { color: c.muted }]}>계정과 남긴 기록이 모두 삭제돼요. 같은 이메일로 다시 가입해도 복구할 수 없어요.</Text>
            <AccountButton label="탈퇴하기" onPress={() => void leave()} disabled={busy} danger />
            <Pressable accessibilityRole="button" onPress={() => setConfirmOpen(false)} style={[s.cancel, { backgroundColor: c.chip }]}>
              <Text style={[TYPE.button, { color: c.ink }]}>취소</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 20, gap: 19 },
  intro: { gap: 5 },
  warning: { paddingHorizontal: 15, paddingVertical: 15, borderRadius: RADIUS.control, gap: 7 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(5, 12, 25, 0.5)' },
  sheet: { borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, paddingHorizontal: 18, paddingTop: 22, gap: 15 },
  cancel: { minHeight: 48, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
});
