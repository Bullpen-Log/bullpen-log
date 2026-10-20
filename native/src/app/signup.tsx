import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AuthState } from '@/app/actions/auth';
import { toDateKey } from '@/lib/pitch-stats';
import { MAX_NICKNAME, SEX_OPTIONS } from '@/lib/profile';
import {
  EMPTY_SIGNUP,
  SIGNUP_STEPS,
  checkSignupStep,
  signupFields,
  stepOfField,
  type SignupAnswers,
  type SignupStep,
} from '@/lib/signup-check';
import { fromWeight, round1 } from '@/lib/units';
import { accountForm } from '~/account/session';
import { rpc, RpcError } from '~/lib/rpc';
import { SITE_URL } from '~/lib/site';
import { usePalette, type Palette } from '~/lib/ui';
import { useWeightUnit } from '~/lib/weight-unit';
import { leaveTo } from '~/shell/web-nav';
import { READABLE } from '~/lib/layout';

/**
 * 가입(앱 화면) — 웹 가입 네 화면(app/login/auth-form.tsx)을 옮겼다: 이름 · 이메일 · 비밀번호 → 생년월일 · 성별 → 키 · 몸무게 → 약관.
 * 화면별 검사는 웹과 같은 lib/signup-check.ts, 서버는 같은 auth.signup(같은 검사 · 같은 칸 이름). 서버가 막으면 그 칸이 있는 화면으로 돌아간다.
 * 이메일은 첫 화면을 넘길 때 auth.checkSignupEmail 로 미리 본다(이미 가입했으면 끝까지 적고서야 막히지 않게).
 * 성공하면 웹뷰 로그인을 맞춘 뒤(~/account/session) 웹을 /today 로. 몸무게는 설정의 무게 단위로 받고 kg 로 보낸다.
 */
const TITLES: Record<SignupStep, { title: string; desc: string }> = {
  name: { title: '계정 만들기', desc: '이름 · 이메일 · 비밀번호를 적어 주세요.' },
  birth: { title: '생년월일 · 성별', desc: '안전한 투구수 한도와 영양 기준을 정할 때 써요.' },
  body: { title: '키 · 몸무게', desc: '영양 목표와 보폭을 견줄 때 써요.' },
  terms: { title: '약관 동의', desc: '마지막이에요. 읽고 동의해 주세요.' },
};

export default function SignupScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const unit = useWeightUnit();
  const [a, setA] = useState<SignupAnswers>(EMPTY_SIGNUP);
  const [step, setStep] = useState<SignupStep>('name');
  const [problem, setProblem] = useState<{ error: string; field: string } | null>(null);
  const [busy, setBusy] = useState(false);
  /* 생년월일 · 몸무게는 적는 그대로 쥐고(칸마다 · 단위대로) 답에는 맞춘 값만 */
  const [birth, setBirth] = useState({ y: '', m: '', d: '' });
  const [weight, setWeight] = useState('');
  const scroll = useRef<ScrollViewInstance>(null);

  const index = SIGNUP_STEPS.indexOf(step);
  const set = (patch: Partial<SignupAnswers>) => {
    setA((now) => ({ ...now, ...patch }));
    setProblem(null);
  };
  const go = (s: SignupStep) => {
    setStep(s);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const fail = (p: { error: string; field: string }) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setProblem(p);
  };

  const next = async () => {
    if (busy) return;
    const found = checkSignupStep(step, a, toDateKey(new Date()));
    if (found) return fail(found);
    if (step === 'name') {
      setBusy(true);
      try {
        const r = await rpc<{ error?: string }>('auth.checkSignupEmail', a.email);
        if (r.error) return fail({ error: r.error, field: 'email' });
      } catch (e) {
        /* 미리 보기는 편의 — 못 닿으면 넘어가고 마지막에 서버가 다시 본다 */
        if (!(e instanceof RpcError)) throw e;
      } finally {
        setBusy(false);
      }
    }
    if (step !== 'terms') return go(SIGNUP_STEPS[index + 1]);
    setBusy(true);
    const r = await accountForm<AuthState>('auth.signup', signupFields(a));
    setBusy(false);
    if ('moved' in r) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return leaveTo(r.moved);
    }
    if ('error' in r) return fail({ error: r.error, field: 'form' });
    const field = r.state?.field ?? 'form';
    fail({ error: r.state?.error ?? '가입하지 못했어요.', field });
    if (field !== 'form') go(stepOfField(field));
  };

  const back = () => (index === 0 ? router.back() : go(SIGNUP_STEPS[index - 1]));
  const bad = (field: string) => problem?.field === field;

  const setBirthPart = (part: 'y' | 'm' | 'd', text: string) => {
    const nextBirth = { ...birth, [part]: text.replace(/\D/g, '').slice(0, part === 'y' ? 4 : 2) };
    setBirth(nextBirth);
    const { y, m, d } = nextBirth;
    set({ birthDate: y.length === 4 && m && d ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : '' });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Stack.Screen options={{ gestureEnabled: index === 0 }} />
      <View style={[st.bar, { paddingTop: inset.top }]}>
        <Pressable accessibilityRole="button" onPress={back} hitSlop={10} style={{ minWidth: 72 }}>
          <Text style={{ color: c.sky, fontSize: 17 }}>‹ {index === 0 ? '로그인' : '이전'}</Text>
        </Pressable>
        <Text style={{ color: c.muted, fontSize: 15, fontWeight: '400' }}>
          {index + 1} / {SIGNUP_STEPS.length}
        </Text>
        <View style={{ minWidth: 72 }} />
      </View>
      <View style={[st.track, { backgroundColor: c.chip }]}>
        <View style={{ width: `${((index + 1) / SIGNUP_STEPS.length) * 100}%`, height: '100%', backgroundColor: c.sky, borderRadius: 2 }} />
      </View>

      <ScrollView ref={scroll} contentContainerStyle={[{ padding: 20, gap: 20, paddingBottom: inset.bottom + 32 }, READABLE]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={{ gap: 6 }}>
          <Text style={{ color: c.ink, fontSize: 30, fontWeight: '800' }}>{TITLES[step].title}</Text>
          <Text style={{ color: c.muted, fontSize: 17 }}>{TITLES[step].desc}</Text>
        </View>

        {step === 'name' ? (
          <View style={[st.group, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Input value={a.nickname} onChange={(t) => set({ nickname: t })} placeholder="이름(앱에서 부를 이름)" bad={bad('nickname')} maxLength={MAX_NICKNAME} textContentType="nickname" c={c} />
            <Input value={a.email} onChange={(t) => set({ email: t })} placeholder="이메일" bad={bad('email')} keyboardType="email-address" textContentType="username" autoComplete="email" c={c} />
            <Input value={a.password} onChange={(t) => set({ password: t })} placeholder="비밀번호(8자 이상)" bad={bad('password')} secure c={c} />
            <Input value={a.passwordConfirm} onChange={(t) => set({ passwordConfirm: t })} placeholder="비밀번호 한 번 더" bad={bad('passwordConfirm')} secure last c={c} />
          </View>
        ) : null}

        {step === 'birth' ? (
          <View style={{ gap: 14 }}>
            <View style={[st.group, st.inline, { backgroundColor: c.card }, bad('birthDate') && { borderColor: c.danger, borderWidth: 1 }]}>
              <Num value={birth.y} onChange={(t) => setBirthPart('y', t)} placeholder="2008" width={64} label="태어난 해" c={c} />
              <Text style={{ color: c.muted, fontSize: 17 }}>년</Text>
              <Num value={birth.m} onChange={(t) => setBirthPart('m', t)} placeholder="3" width={36} label="태어난 달" c={c} />
              <Text style={{ color: c.muted, fontSize: 17 }}>월</Text>
              <Num value={birth.d} onChange={(t) => setBirthPart('d', t)} placeholder="1" width={36} label="태어난 날" c={c} />
              <Text style={{ color: c.muted, fontSize: 17 }}>일</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {SEX_OPTIONS.map((o) => {
                const on = a.sex === o.value;
                return (
                  <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => set({ sex: o.value })} style={[st.chip, { backgroundColor: on ? c.sky : c.card }, bad('sex') && !on && { borderColor: c.danger, borderWidth: 1 }]}>
                    <Text style={{ color: on ? '#fff' : c.ink, fontSize: 17, fontWeight: '600' }}>{o.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {step === 'body' ? (
          <View style={[st.group, { backgroundColor: c.card, boxShadow: c.float }]}>
            <UnitRow label="키" unit="cm" bad={bad('heightCm')} c={c}>
              <Num value={a.heightCm == null ? '' : String(a.heightCm)} onChange={(t) => { const v = t.replace(/\D/g, '').slice(0, 3); set({ heightCm: v ? Number(v) : null }); }} placeholder="175" width={72} label="키" c={c} />
            </UnitRow>
            <UnitRow label="몸무게" unit={unit} bad={bad('weightKg')} last c={c}>
              <Num
                value={weight}
                onChange={(t) => {
                  const v = t.replace(/[^\d.]/g, '');
                  setWeight(v);
                  set({ weightKg: v && Number.isFinite(Number(v)) ? round1(fromWeight(Number(v), unit)) : null });
                }}
                placeholder="70"
                width={72}
                label="몸무게"
                decimal
                c={c}
              />
            </UnitRow>
          </View>
        ) : null}

        {step === 'terms' ? (
          <View style={[st.group, { backgroundColor: c.card, boxShadow: c.float }]}>
            <AgreeRow label="모두 동의" value={a.agreeTerms && a.agreePrivacy} onChange={(v) => set({ agreeTerms: v, agreePrivacy: v })} strong c={c} />
            <AgreeRow label="이용약관 동의(필수)" doc="terms" value={a.agreeTerms} onChange={(v) => set({ agreeTerms: v })} bad={bad('agreeTerms')} c={c} />
            <AgreeRow label="개인정보 처리방침 동의(필수)" doc="privacy" value={a.agreePrivacy} onChange={(v) => set({ agreePrivacy: v })} bad={bad('agreePrivacy')} last c={c} />
          </View>
        ) : null}

        {problem ? (
          <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 15, fontWeight: '600', paddingHorizontal: 4 }}>
            {problem.error}
          </Text>
        ) : null}

        <Pressable accessibilityRole="button" onPress={() => void next()} disabled={busy} style={({ pressed }) => [st.primary, { backgroundColor: c.sky, opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>
            {busy ? (step === 'terms' ? '만드는 중…' : '확인 중…') : step === 'terms' ? '가입하고 시작하기' : '다음'}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Input({ value, onChange, placeholder, bad, secure, last, maxLength, keyboardType, textContentType, autoComplete, c }: {
  value: string;
  onChange: (t: string) => void;
  placeholder: string;
  bad: boolean;
  secure?: boolean;
  last?: boolean;
  maxLength?: number;
  keyboardType?: 'email-address';
  textContentType?: 'nickname' | 'username';
  autoComplete?: 'email';
  c: Palette;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={c.muted}
      secureTextEntry={secure}
      textContentType={secure ? 'newPassword' : textContentType}
      autoComplete={secure ? 'new-password' : autoComplete}
      keyboardType={keyboardType}
      maxLength={maxLength}
      autoCapitalize="none"
      autoCorrect={false}
      accessibilityLabel={placeholder}
      style={[st.input, { color: bad ? c.danger : c.ink }, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: bad ? c.danger : c.line }]}
    />
  );
}

function Num({ value, onChange, placeholder, width, label, decimal, c }: { value: string; onChange: (t: string) => void; placeholder: string; width: number; label: string; decimal?: boolean; c: Palette }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={c.muted}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      accessibilityLabel={label}
      style={{ color: c.ink, fontSize: 17, textAlign: 'right', paddingVertical: 12, width }}
    />
  );
}

function UnitRow({ label, unit, bad, last, children, c }: { label: string; unit: string; bad: boolean; last?: boolean; children: React.ReactNode; c: Palette }) {
  return (
    <View style={[st.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
      <Text style={{ color: bad ? c.danger : c.ink, fontSize: 17, flex: 1 }}>{label}</Text>
      {children}
      <Text style={{ color: c.muted, fontSize: 17, width: 28 }}>{unit}</Text>
    </View>
  );
}

function AgreeRow({ label, value, onChange, doc, strong, bad, last, c }: { label: string; value: boolean; onChange: (v: boolean) => void; doc?: 'terms' | 'privacy'; strong?: boolean; bad?: boolean; last?: boolean; c: Palette }) {
  return (
    <View style={[st.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: bad ? c.danger : c.ink, fontSize: 17, fontWeight: strong ? '700' : '400' }}>{label}</Text>
        {doc ? (
          <Pressable accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(`${SITE_URL}/${doc}`)} hitSlop={8}>
            <Text style={{ color: c.sky, fontSize: 15 }}>읽어 보기 ›</Text>
          </Pressable>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, minHeight: 44 },
  track: { height: 4, marginHorizontal: 20, borderRadius: 2, overflow: 'hidden' },
  group: { borderRadius: 14, overflow: 'hidden' },
  inline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16 },
  input: { fontSize: 17, paddingHorizontal: 16, minHeight: 52 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 56 },
  chip: { flex: 1, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  primary: { minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
});
