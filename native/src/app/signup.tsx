import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
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
import { consentAgeBlock, type AnalysisConsentDoc } from '@/lib/analysis-consent';

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
      return { title: '어떤 자리에서 시작하나요?', desc: '선수는 내 기록을, 레슨장·팀은 선수단을 관리해요. 가입 후에는 바꿀 수 없어요.' };
    case 'name':
      return {
        title: '계정 만들기',
        desc: isMasterKind(a.kind) ? '관리자 계정에 사용할 정보를 적어 주세요.' : '내 기록을 이어 볼 계정을 만들어요.',
      };
    case 'org':
      return {
        title: `${orgWordOf(a.kind)} 이름`,
        desc: `${a.kind === 'team' ? '선수가' : '회원이'} 초대 코드로 들어올 때 보는 이름이에요. 지역 · 소개는 나중에 바꿀 수 있어요.`,
      };
    case 'birth':
      return { title: '안전한 투구 기준을 맞춰요', desc: '생년월일은 나이에 맞는 투구 한도와 이용 기준에 써요.' };
    case 'body':
      return { title: '키 · 몸무게', desc: '동작 분석과 훈련에 필요한 신체 정보를 적어 주세요.' };
    case 'terms':
      return { title: '약관 동의', desc: `필수 항목을 읽고 동의하면 ${isMasterKind(a.kind) ? '관리 화면' : '싱커 홈'}으로 들어가요.` };
  }
}

export default function SignupScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const unit = useWeightUnit();
  const keyboardUp = useKeyboardUp();
  const [a, setA] = useState<SignupAnswers>(EMPTY_SIGNUP);
  /*
   * [선택] 3D 분석 국외 이전 동의(2026-10-29) — 서버가 문서를 확정했다고 할 때만 줄을 그린다(못 받으면 안 그림 · 가입은 그대로).
   * 필수 '모두 동의'에 묶지 않고 기본 꺼짐. 켜면 본 문서 판을 같이 보내고, 서버가 계정과 같은 트랜잭션에 남긴다(app/actions/auth.ts).
   */
  const [analysisDoc, setAnalysisDoc] = useState<AnalysisConsentDoc | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    rpc<{ ok: true; ready: boolean; doc: AnalysisConsentDoc }>('analysis-consent.loadAnalysisConsentDoc').then(
      (r) => alive && r.ready && setAnalysisDoc(r.doc),
      () => undefined
    );
    return () => {
      alive = false;
    };
  }, []);
  const [step, setStep] = useState<WebSignupStep>('kind');
  const [problem, setProblem] = useState<{ error: string; field: string } | null>(null);
  const [busy, setBusy] = useState(false);
  /* 생년월일 · 몸무게는 적는 그대로 쥐고(칸마다 · 단위대로) 답에는 맞춘 값만 */
  const [birth, setBirth] = useState({ y: '', m: '', d: '' });
  const [weight, setWeight] = useState('');
  /* 조직 화면 — 새로 만들기 대신 이미 있는 곳에 코치로 들어가기(코치 초대 코드) */
  const [joining, setJoining] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);

  /* 고른 종류에 따라 차례가 다르며, 역할 선택부터 진행 단계에 포함한다. */
  const steps = signupStepsOf(a);
  const index = Math.max(0, steps.indexOf(step));
  const total = steps.length;
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
  const pickKind = (kind: SignupKind) => {
    void Haptics.selectionAsync();
    set({ kind });
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
        <Text style={[TYPE.body, { color: c.muted }]}>{index + 1} / {total}</Text>
        <View style={{ minWidth: 80 }} />
      </View>
      <View style={[st.track, { backgroundColor: c.chip }]}>
        <View style={{ width: `${((index + 1) / total) * 100}%`, height: '100%', backgroundColor: c.action, borderRadius: 2 }} />
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
          <View style={{ gap: 14 }}>
            <Input
              label="이름"
              value={a.nickname}
              onChange={(t) => set({ nickname: t })}
              placeholder={master ? '대표 · 감독 · 코치 이름' : '앱에서 부를 이름'}
              bad={bad('nickname')}
              maxLength={MAX_NICKNAME}
              textContentType="nickname"
              c={c}
            />
            <Input label="이메일" value={a.email} onChange={(t) => set({ email: t })} placeholder="pitcher@example.com" bad={bad('email')} keyboardType="email-address" textContentType="username" autoComplete="email" c={c} />
            <Input label="비밀번호" value={a.password} onChange={(t) => set({ password: t })} placeholder="8자 이상" bad={bad('password')} secure c={c} />
            <Input label="비밀번호 확인" value={a.passwordConfirm} onChange={(t) => set({ passwordConfirm: t })} placeholder="같은 비밀번호를 입력" bad={bad('passwordConfirm')} secure c={c} />
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
            <AgreeRow label="필수 항목 모두 동의" value={a.agreeTerms && a.agreePrivacy} onChange={(v) => set({ agreeTerms: v, agreePrivacy: v })} strong c={c} />
            <AgreeRow label="이용약관 동의(필수)" doc="terms" value={a.agreeTerms} onChange={(v) => set({ agreeTerms: v })} bad={bad('agreeTerms')} c={c} />
            <AgreeRow label="개인정보 처리방침 동의(필수)" doc="privacy" value={a.agreePrivacy} onChange={(v) => set({ agreePrivacy: v })} bad={bad('agreePrivacy')} last c={c} />
          </View>
        ) : null}
        {step === 'terms' && analysisDoc && (!a.kind || a.kind === 'player') && !(a.birthDate && consentAgeBlock(new Date(a.birthDate), new Date())) ? (
          <View style={{ gap: 6 }}>
            <View style={[st.group, { backgroundColor: c.card, boxShadow: c.float }]}>
              <View style={[st.row, { alignItems: 'flex-start', paddingVertical: 12 }]}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: c.sky, fontSize: 13, fontWeight: '700' }}>선택</Text>
                  <Text style={{ color: c.ink, fontSize: 17 }}>{analysisDoc.title}</Text>
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: analysisOpen }} onPress={() => setAnalysisOpen((v) => !v)} hitSlop={8}>
                    <Text style={{ color: c.link, fontSize: 15 }}>{analysisOpen ? '내용 접기' : '내용 보기 ›'}</Text>
                  </Pressable>
                </View>
                <Switch
                  value={a.analysisConsentVersion === analysisDoc.version}
                  onValueChange={(v) => set({ analysisConsentVersion: v ? analysisDoc.version : null })}
                  accessibilityLabel={`${analysisDoc.title}(선택)`}
                />
              </View>
              {analysisOpen ? (
                <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 6 }}>
                  {(
                    [
                      ['이전 항목', analysisDoc.items],
                      ['이전 국가', analysisDoc.country],
                      ['받는 곳', [analysisDoc.recipient, analysisDoc.contact].filter(Boolean).join(' · ')],
                      ['시기 · 방법', analysisDoc.when],
                      ['이용 목적', analysisDoc.purpose],
                      ['보유 · 이용 기간', analysisDoc.retention ?? ''],
                    ] as const
                  ).map(([k, v]) => (
                    <Text key={k} style={[TYPE.sub, { color: c.ink }]}>
                      <Text style={{ color: c.muted }}>{k} </Text>
                      {v}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
            <Text style={[TYPE.sub, { color: c.muted, paddingHorizontal: 4 }]}>
              선택 항목에 동의하지 않아도 가입할 수 있어요. 동의하지 않으면 첫 3D 분석 때 한 번 더 물어봐요.
            </Text>
          </View>
        ) : null}

        {problem ? (
          <Text accessibilityRole="alert" style={[TYPE.body, { color: c.danger, fontWeight: '600', paddingHorizontal: 4 }]}>
            {problem.error}
          </Text>
        ) : null}
      </ScrollView>

      {/* 다음 · 가입 단추는 바닥에 붙인다(자판이 오르면 자판 위로) — 칸 수에 따라 화면 가운데를 떠다니지 않게 */}
      <View style={[st.footer, READABLE, { paddingBottom: keyboardUp ? 12 : inset.bottom + 12 }]}>
        <Pressable accessibilityRole="button" onPress={() => void next()} disabled={busy} style={({ pressed }) => [st.primary, { backgroundColor: c.action, opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}>
          <Text style={[TYPE.button, { color: '#fff' }]}>
            {busy ? (step === 'terms' ? '만드는 중…' : '확인 중…') : step === 'terms' ? '가입하고 시작하기' : step === 'kind' ? '계속' : '다음'}
          </Text>
        </Pressable>
      </View>
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

function Input({ label, value, onChange, placeholder, bad, secure, maxLength, keyboardType, textContentType, autoComplete, c }: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  placeholder: string;
  bad: boolean;
  secure?: boolean;
  maxLength?: number;
  keyboardType?: 'email-address';
  textContentType?: 'nickname' | 'username';
  autoComplete?: 'email';
  c: Palette;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ color: bad ? c.danger : c.muted, fontSize: 13 }}>{label}</Text>
      <View style={[st.accountRow, { backgroundColor: c.card, borderColor: bad ? c.danger : c.line }]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={c.muted}
          secureTextEntry={secure && !visible}
          textContentType={secure ? 'newPassword' : textContentType}
          autoComplete={secure ? 'new-password' : autoComplete}
          keyboardType={keyboardType}
          maxLength={maxLength}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={label}
          style={[st.accountInput, { color: bad ? c.danger : c.ink }]}
        />
        {secure ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${visible ? '숨기기' : '보기'}`} onPress={() => setVisible((v) => !v)} hitSlop={8} style={st.passwordToggle}>
            <Text style={{ color: c.link, fontSize: 14, fontWeight: '600' }}>{visible ? '숨기기' : '보기'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
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
  accountRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth * 2 },
  accountInput: { flex: 1, fontSize: 17, paddingHorizontal: 14, minHeight: 52 },
  passwordToggle: { minHeight: 44, minWidth: 62, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 56 },
  chip: { flex: 1, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  primary: { minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16, borderWidth: 2 },
  kindIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fieldInput: { flex: 1, fontSize: 17, paddingVertical: 14 },
  link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  footer: { paddingHorizontal: 20, paddingTop: 8 },
});
