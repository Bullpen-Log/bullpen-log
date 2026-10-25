import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AuthState } from '@/app/actions/auth';
import { toDateKey } from '@/lib/pitch-stats';
import { MAX_NICKNAME, SEX_OPTIONS } from '@/lib/profile';
import { ORG_NAME_MAX, ORG_NOTE_MAX, ORG_REGION_MAX } from '@/lib/org/rules';
import {
  EMPTY_SIGNUP,
  SIGNUP_KIND_OPTIONS,
  checkWebSignupStep,
  isMasterKind,
  signupFields,
  signupStepsOf,
  webStepOfField,
  type SignupAnswers,
  type SignupKind,
  type WebSignupStep,
} from '@/lib/signup-check';
import { fromWeight, round1 } from '@/lib/units';
import { accountForm } from '~/account/session';
import { rpc, RpcError } from '~/lib/rpc';
import { SITE_URL } from '~/lib/site';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { useKeyboardUp } from '~/lib/use-keyboard-up';
import { Icon, type IconName } from '~/shell/icon';
import { useWeightUnit } from '~/lib/weight-unit';
import { leaveTo } from '~/shell/web-nav';
import { READABLE } from '~/lib/layout';

/**
 * 가입(앱 화면) — 웹 가입(app/login/auth-form.tsx)을 옮겼다: 종류(선수 · 레슨장 · 팀) → 이름 · 이메일 · 비밀번호 → 선수는 생년월일 · 성별 → 키 · 몸무게,
 * 레슨장 · 팀은 조직 이름 · 지역(또는 코치 초대 코드) → 약관. 차례는 웹과 같은 signupStepsOf(2026-10-25 — 앱에서도 관리자 가입).
 * 덕아웃만 쓰는 회원(member)은 덕아웃 앱 · 웹에서 가입해 여기는 뺀다.
 * 화면별 검사는 웹과 같은 lib/signup-check.ts, 서버는 같은 auth.signup(같은 검사 · 같은 칸 이름). 서버가 막으면 그 칸이 있는 화면으로 돌아간다.
 * 이메일은 첫 화면을 넘길 때 auth.checkSignupEmail 로 미리 본다(이미 가입했으면 끝까지 적고서야 막히지 않게).
 * 성공하면 웹뷰 로그인을 맞춘 뒤(~/account/session) 웹을 /today 로. 몸무게는 설정의 무게 단위로 받고 kg 로 보낸다.
 */
/** 싱커 앱에서 고르는 종류 — 덕아웃 회원(member)은 덕아웃 쪽에서 가입한다 */
const KINDS = SIGNUP_KIND_OPTIONS.filter((o) => o.value !== 'member');
const orgWordOf = (kind: SignupKind | null) => (kind === 'team' ? '팀' : '레슨장');
const KIND_ICON: Record<SignupKind, IconName> = { player: 'pitcher', lesson: 'lesson', team: 'people', member: 'user-round' };

function titleOf(step: WebSignupStep, a: SignupAnswers): { title: string; desc: string } {
  switch (step) {
    case 'kind':
      return { title: '어떻게 쓰실 건가요?', desc: '선수는 내 기록을 남기고, 레슨장 · 팀은 선수들의 기록을 관리해요. 가입한 뒤에는 바꿀 수 없어요.' };
    case 'name':
      return {
        title: '계정 만들기',
        desc: isMasterKind(a.kind) ? '관리에 쓸 이름(대표 · 감독 · 코치) · 이메일 · 비밀번호를 적어 주세요.' : '이름 · 이메일 · 비밀번호를 적어 주세요.',
      };
    case 'org':
      return {
        title: `${orgWordOf(a.kind)} 이름`,
        desc: `${a.kind === 'team' ? '선수가' : '회원이'} 초대 코드로 들어올 때 보는 이름이에요. 지역 · 소개는 나중에 바꿀 수 있어요.`,
      };
    case 'birth':
      return { title: '생년월일 · 성별', desc: '안전한 투구수 한도와 영양 기준을 정할 때 써요.' };
    case 'body':
      return { title: '키 · 몸무게', desc: '영양 목표와 보폭을 견줄 때 써요.' };
    case 'terms':
      return { title: '약관 동의', desc: '마지막이에요. 읽고 동의해 주세요.' };
  }
}

export default function SignupScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const unit = useWeightUnit();
  const keyboardUp = useKeyboardUp();
  const [a, setA] = useState<SignupAnswers>(EMPTY_SIGNUP);
  const [step, setStep] = useState<WebSignupStep>('kind');
  const [problem, setProblem] = useState<{ error: string; field: string } | null>(null);
  const [busy, setBusy] = useState(false);
  /* 생년월일 · 몸무게는 적는 그대로 쥐고(칸마다 · 단위대로) 답에는 맞춘 값만 */
  const [birth, setBirth] = useState({ y: '', m: '', d: '' });
  const [weight, setWeight] = useState('');
  /* 조직 화면 — 새로 만들기 대신 이미 있는 곳에 코치로 들어가기(코치 초대 코드) */
  const [joining, setJoining] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);

  /* 차례는 고른 종류에 따라 — 선수 넷(계정 · 생년월일 · 몸 · 약관), 레슨장 · 팀 셋(계정 · 조직 · 약관). 종류 화면은 세지 않는다 */
  const steps = signupStepsOf(a);
  const index = Math.max(0, steps.indexOf(step));
  const total = steps.length - 1;
  const master = isMasterKind(a.kind);
  const set = (patch: Partial<SignupAnswers>) => {
    setA((now) => ({ ...now, ...patch }));
    setProblem(null);
  };
  const go = (s: WebSignupStep) => {
    setStep(s);
    setProblem(null);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const fail = (p: { error: string; field: string }) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setProblem(p);
  };

  const next = async () => {
    if (busy) return;
    const found = checkWebSignupStep(step, a, toDateKey(new Date()));
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
    if (step !== 'terms') return go(steps[index + 1]);
    setBusy(true);
    const r = await accountForm<AuthState>('auth.signup', signupFields(a));
    setBusy(false);
    if ('moved' in r) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return leaveTo(r.moved);
    }
    if ('error' in r) return fail({ error: r.error, field: 'form' });
    const field = r.state?.field ?? 'form';
    /* 그 칸이 있는 화면으로 먼저 옮기고 알린다 — go 가 알림을 지운다 */
    if (field !== 'form') go(webStepOfField(field));
    fail({ error: r.state?.error ?? '가입하지 못했어요.', field });
  };

  const back = () => (index === 0 ? router.back() : go(steps[index - 1]));
  /* 종류는 누르면 골라진 것을 잠깐 보이고 다음 화면으로 — 고르는 것 말고 할 일이 없는 화면이라 '다음' 단추를 두지 않는다 */
  const pickKind = (kind: SignupKind) => {
    void Haptics.selectionAsync();
    set({ kind });
    setTimeout(() => go('name'), 180);
  };
  const toggleJoining = (on: boolean) => {
    setJoining(on);
    if (!on) set({ staffCode: '' });
  };
  const bad = (field: string) => problem?.field === field;

  const setBirthPart = (part: 'y' | 'm' | 'd', text: string) => {
    const nextBirth = { ...birth, [part]: text.replace(/\D/g, '').slice(0, part === 'y' ? 4 : 2) };
    setBirth(nextBirth);
    const { y, m, d } = nextBirth;
    set({ birthDate: y.length === 4 && m && d ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : '' });
  };

  const head = step === 'org' && joining ? { title: '코치로 들어가기', desc: '대표에게 받은 코치 초대 코드 여섯 글자를 넣어 주세요.' } : titleOf(step, a);

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Stack.Screen options={{ gestureEnabled: index === 0 }} />
      <View style={[st.bar, { paddingTop: inset.top }]}>
        <Pressable accessibilityRole="button" onPress={back} hitSlop={10} style={({ pressed }) => [st.backRow, pressed && { opacity: 0.6 }]}>
          <Icon name="back" size={24} color={c.link} />
          <Text style={[TYPE.button, { color: c.link, fontWeight: '400' }]}>{index === 0 ? '로그인' : '이전'}</Text>
        </Pressable>
        <Text style={[TYPE.body, { color: c.muted }]}>{index > 0 ? `${index} / ${total}` : ''}</Text>
        <View style={{ minWidth: 80 }} />
      </View>
      <View style={[st.track, { backgroundColor: c.chip }]}>
        <View style={{ width: `${(index / total) * 100}%`, height: '100%', backgroundColor: c.action, borderRadius: 2 }} />
      </View>

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={[{ padding: 20, gap: 20, paddingBottom: 24 }, READABLE]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="header" style={[TYPE.hero, { color: c.ink }]}>
            {head.title}
          </Text>
          <Text style={[TYPE.body, { color: c.muted }]}>{head.desc}</Text>
        </View>

        {step === 'kind' ? (
          <View style={{ gap: 12 }}>
            {KINDS.map((o) => {
              const on = a.kind === o.value;
              return (
                <Pressable
                  key={o.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${o.label}, ${o.hint}`}
                  onPress={() => pickKind(o.value)}
                  style={({ pressed }) => [
                    st.kind,
                    { backgroundColor: c.card, boxShadow: c.float, borderColor: on ? c.sky : 'transparent' },
                    pressed && { transform: [{ scale: 0.985 }] },
                  ]}
                >
                  <View style={[st.kindIcon, { backgroundColor: c.skyTint }]}>
                    <Icon name={KIND_ICON[o.value]} size={22} color={c.sky} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[TYPE.card, { color: c.ink }]}>{o.label}</Text>
                    <Text style={[TYPE.sub, { color: c.muted }]}>{o.hint}</Text>
                  </View>
                  <Icon name={on ? 'check' : 'chevron-right'} size={20} color={on ? c.sky : c.muted} />
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {step === 'name' ? (
          <View style={[st.group, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Input
              value={a.nickname}
              onChange={(t) => set({ nickname: t })}
              placeholder={master ? '이름(대표 · 감독 · 코치)' : '이름(앱에서 부를 이름)'}
              bad={bad('nickname')}
              maxLength={MAX_NICKNAME}
              textContentType="nickname"
              c={c}
            />
            <Input value={a.email} onChange={(t) => set({ email: t })} placeholder="이메일" bad={bad('email')} keyboardType="email-address" textContentType="username" autoComplete="email" c={c} />
            <Input value={a.password} onChange={(t) => set({ password: t })} placeholder="비밀번호(8자 이상)" bad={bad('password')} secure c={c} />
            <Input value={a.passwordConfirm} onChange={(t) => set({ passwordConfirm: t })} placeholder="비밀번호 한 번 더" bad={bad('passwordConfirm')} secure last c={c} />
          </View>
        ) : null}

        {step === 'org' ? (
          <View style={{ gap: 12 }}>
            {joining ? (
              <View style={[st.group, { backgroundColor: c.card, boxShadow: c.float }]}>
                <FieldRow label="코치 코드" bad={bad('staffCode')} last c={c}>
                  <TextInput
                    value={a.staffCode}
                    onChangeText={(t) => set({ staffCode: t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) })}
                    placeholder="ABC234"
                    placeholderTextColor={c.muted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    autoFocus
                    maxLength={6}
                    accessibilityLabel="코치 초대 코드"
                    style={[st.fieldInput, TYPE.num, { color: c.ink, letterSpacing: 3 }]}
                  />
                </FieldRow>
              </View>
            ) : (
              <View style={[st.group, { backgroundColor: c.card, boxShadow: c.float }]}>
                <FieldRow label="이름" bad={bad('orgName')} c={c}>
                  <TextInput
                    value={a.orgName}
                    onChangeText={(t) => set({ orgName: t })}
                    placeholder={a.kind === 'team' ? '○○ 리틀 야구단' : '○○ 피칭 레슨'}
                    placeholderTextColor={c.muted}
                    maxLength={ORG_NAME_MAX}
                    accessibilityLabel={`${orgWordOf(a.kind)} 이름`}
                    style={[st.fieldInput, { color: bad('orgName') ? c.danger : c.ink }]}
                  />
                </FieldRow>
                <FieldRow label="지역" c={c}>
                  <TextInput
                    value={a.orgRegion}
                    onChangeText={(t) => set({ orgRegion: t })}
                    placeholder="서울 강남 (선택)"
                    placeholderTextColor={c.muted}
                    maxLength={ORG_REGION_MAX}
                    accessibilityLabel="지역"
                    style={[st.fieldInput, { color: c.ink }]}
                  />
                </FieldRow>
                <FieldRow label={a.kind === 'team' ? '리그' : '소개'} last c={c}>
                  <TextInput
                    value={a.orgNote}
                    onChangeText={(t) => set({ orgNote: t })}
                    placeholder={a.kind === 'team' ? '초등 · 주말 리그 (선택)' : '코치 2명 · 투수 전문 (선택)'}
                    placeholderTextColor={c.muted}
                    maxLength={ORG_NOTE_MAX}
                    accessibilityLabel={a.kind === 'team' ? '연령대 · 리그' : '코치 수 · 소개'}
                    style={[st.fieldInput, { color: c.ink }]}
                  />
                </FieldRow>
              </View>
            )}
            <Pressable accessibilityRole="button" onPress={() => toggleJoining(!joining)} hitSlop={6} style={({ pressed }) => [st.link, pressed && { opacity: 0.6 }]}>
              <Text style={[TYPE.body, { color: c.link }]}>
                {joining ? `새 ${orgWordOf(a.kind)} 만들기` : `이미 있는 ${orgWordOf(a.kind)}에 코치로 들어가나요?`}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {step === 'birth' ? (
          <View style={{ gap: 14 }}>
            <View style={[st.group, st.inline, { backgroundColor: c.card, boxShadow: c.float }, bad('birthDate') && { borderColor: c.danger, borderWidth: 1 }]}>
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
          <Text accessibilityRole="alert" style={[TYPE.body, { color: c.danger, fontWeight: '600', paddingHorizontal: 4 }]}>
            {problem.error}
          </Text>
        ) : null}
      </ScrollView>

      {/* 다음 · 가입 단추는 바닥에 붙인다(자판이 오르면 자판 위로) — 칸 수에 따라 화면 가운데를 떠다니지 않게 */}
      {step !== 'kind' ? (
        <View style={[st.footer, READABLE, { paddingBottom: keyboardUp ? 12 : inset.bottom + 12 }]}>
          <Pressable accessibilityRole="button" onPress={() => void next()} disabled={busy} style={({ pressed }) => [st.primary, { backgroundColor: c.action, opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}>
            <Text style={[TYPE.button, { color: '#fff' }]}>
              {busy ? (step === 'terms' ? '만드는 중…' : '확인 중…') : step === 'terms' ? '가입하고 시작하기' : '다음'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

/** 조직 화면 한 줄 — 왼쪽 이름표 · 오른쪽 입력(아이폰 설정 목록 꼴) */
function FieldRow({ label, bad, last, children, c }: { label: string; bad?: boolean; last?: boolean; children: React.ReactNode; c: Palette }) {
  return (
    <View style={[st.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
      <Text style={{ color: bad ? c.danger : c.ink, fontSize: 17, width: 76 }}>{label}</Text>
      {children}
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
          <Pressable accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(`${SITE_URL}/${doc}`).catch(() => undefined)} hitSlop={8}>
            <Text style={{ color: c.link, fontSize: 15 }}>읽어 보기 ›</Text>
          </Pressable>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, minHeight: 44 },
  backRow: { flexDirection: 'row', alignItems: 'center', minWidth: 80, marginLeft: -6 },
  track: { height: 4, marginHorizontal: 20, borderRadius: 2, overflow: 'hidden' },
  group: { borderRadius: 14, overflow: 'hidden' },
  inline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16 },
  input: { fontSize: 17, paddingHorizontal: 16, minHeight: 52 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 56 },
  chip: { flex: 1, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  primary: { minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16, borderWidth: 2 },
  kindIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fieldInput: { flex: 1, fontSize: 17, paddingVertical: 14 },
  link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  footer: { paddingHorizontal: 20, paddingTop: 8 },
});
