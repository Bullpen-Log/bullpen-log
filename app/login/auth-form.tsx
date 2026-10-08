'use client';

import {
  useActionState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal, useFormStatus } from 'react-dom';
import { CalendarDays, Info } from 'lucide-react';
import { MiniCalendar } from '@/components/mini-calendar';
import { useModalState } from '@/components/modal';
import { LegalSheet, wantsNewTab, type LegalDoc } from '@/components/legal-sheet';
import { checkSignupEmail, login, signup, type AuthState } from '@/app/actions/auth';
import { guardFormAction } from '@/lib/action-offline';
import { Button, Field, FormError, Input } from '@/components/ui';
import { kept } from '@/lib/form-values';
import { readLoginPrefs, saveLoginPrefs } from '@/lib/login-prefs';
import {
  INPUT_LARGE,
  ProblemLine,
  StepCard,
  TextButton,
  invalidProps,
} from '@/components/onboarding/step-card';
import { Chips, OptionCards } from '@/components/onboarding/choices';
import { CountUp } from '@/components/onboarding/count-up';
import { BurnInsert, PitchCapInsert } from '@/components/onboarding/insert-cards';
import { NumberUnitField } from '@/components/onboarding/number-unit-field';
import { MacroBar } from '@/components/onboarding/plan-stats';
import { useWeightUnit } from '@/components/use-units';
import {
  NutritionStepPanel,
  answerLines,
  nutritionStepTitle,
  type StepCtx,
} from '@/components/onboarding/nutrition-steps';
import {
  MAX_AGE,
  MAX_HEIGHT_CM,
  MAX_WEIGHT_KG,
  MIN_AGE,
  MIN_HEIGHT_CM,
  MIN_WEIGHT_KG,
  SEX_OPTIONS,
  ageFromBirthDate,
  parseBirthDate,
  type Sex,
} from '@/lib/profile';
import {
  BASELINE_FREQ_NAMES,
  BASELINE_INTENSITY_NAMES,
  BASELINE_VOLUME_NAMES,
  BASELINE_WORKOUT_FREQ_NAMES,
  COMPETITION_LEVELS,
  COMPETITION_LEVEL_LABELS,
  THROWING_HANDS,
  estimateDailyLoad,
  gradeText,
  levelFit,
  type CompetitionLevel,
} from '@/lib/baseline';
import { TRAINING_LEVELS } from '@/lib/report/personalize';
import {
  EMPTY_ANSWERS,
  checkNutritionStep,
  nutritionStepOfField,
  preview,
  toFormFields,
  visibleNutritionSteps,
  type NutritionAnswers,
  type NutritionStepKey,
  type OnboardingBody,
} from '@/lib/nutrition/onboarding-answers';
import { GOAL_KINDS, kcalText } from '@/lib/nutrition/meta';
import { ageOn } from '@/lib/nutrition/targets';

/**
 * 로그인 · 회원가입.
 *
 * 구글 로그인처럼 넓은 카드 한 장을 쓴다(components/onboarding/step-card.tsx). 넓은 화면에서는 왼쪽에 제목,
 * 오른쪽에 칸, 오른쪽 아래에 단추가 선다. 휴대폰에서는 카드 테두리를 걷고 화면 전체를 쓴다.
 *
 * 가입은 한 화면에 한 질문이다(인아웃식 온보딩, 2026-10-08 — docs/designs/inout-onboarding.md ④). 이름 → 생년월일 →
 * 던지는 손 → 소속 → 투구 · 웨이트 → 키 · 체중 → 영양 질문(목표 카드 · 목표 체중 · 속도 · 평소 움직임 · 시즌 · 탄단지 ·
 * 식사 · 못 먹는 것 → 추천 계획) → 계정(이메일 · 비밀번호 · 약관) → 요약. 질문 사이에 앱이 답으로 셈한 숫자를 보이는
 * 끼움 화면이 셋 있다(투구 한도 · 운동 소모 · 추천 계획). 질문마다 답이 설정 · 계산 · 추천을 바꾼다 — 바꾸지 않는
 * 질문은 넣지 않았다.
 *
 * 답은 모두 상태(answers)로 쥐고 숨은 칸으로 서버에 보낸다. 그래서 서버가 막고 돌아와 폼이 되돌려져도 적은 것이
 * 그대로고, "목표 체중 화면은 증량 · 감량일 때만"처럼 답에 따라 차례가 바뀐다.
 */

const inputLarge = INPUT_LARGE;

/*
 * 이메일 · 비밀번호 칸은 아이폰이 손대지 않게 한다(2026-10-03). '비밀번호 표시'를 켜면 칸이 type="text" 가 되는데,
 * 그러면 아이폰이 첫 글자를 대문자로 바꾸고 맞춤법 고치기까지 해 — 친 것과 다른 비밀번호로 가입됐다.
 */
const noAutoFix = {
  autoCapitalize: 'none',
  autoCorrect: 'off',
  spellCheck: false,
} as const;

function SubmitButton({
  label,
  pendingLabel,
  onClick,
}: {
  label: string;
  pendingLabel: string;
  /** 보내기 전에 막을 기회 — e.preventDefault() 면 보내지 않는다 */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} onClick={onClick} className="min-w-28">
      {pending ? pendingLabel : label}
    </Button>
  );
}

/* ─────────────────────────── 로그인 ─────────────────────────── */

/**
 * 체크박스 한 줄.
 *
 * name 을 준 것만 서버로 간다 — '아이디 기억하기'는 이 기기에서만 쓰는 값이라
 * 서버가 알 필요가 없고, 보내봐야 쓰이지 않는다.
 *
 * 처음 값은 화면에 붙은 뒤 바깥에서 ref 로 채운다. defaultChecked 로 켜 두면
 * 저장된 값이 꺼짐일 때 잠깐 켜진 채로 보였다가 꺼진다.
 */
function CheckLine({
  ref,
  name,
  label,
  title,
  onChange,
}: {
  ref: React.RefObject<HTMLInputElement | null>;
  name?: string;
  label: string;
  title: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    /* 휴대폰은 누르는 줄을 44px 로 — 글자 높이(20px)뿐이라 잘 안 눌렸다(2026-10-03) */
    <label
      className="inline-flex min-h-11 cursor-pointer items-center gap-2 desk:min-h-0"
      title={title}
    >
      <input
        ref={ref}
        type="checkbox"
        name={name}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 cursor-pointer accent-sky"
      />
      <span className="text-sm text-muted select-none">{label}</span>
    </label>
  );
}

const STAY_HINT =
  '브라우저를 닫아도 30일 동안 로그인이 유지돼요. 공용 컴퓨터에서는 꺼주세요.';
const REMEMBER_HINT = '다음에 올 때 이메일 칸을 채워 둬요. 비밀번호는 저장하지 않아요.';

function LoginForm({
  onSignup,
  focusHeading,
}: {
  onSignup: () => void;
  focusHeading: boolean;
}) {
  /* 신호가 끊겨도 로그인 밖 오류 화면으로 넘어가지 않고 한 줄로 알린다(lib/action-offline.ts) */
  const [state, formAction] = useActionState<AuthState, FormData>(
    guardFormAction(login),
    undefined
  );
  const before = state?.values;

  /*
   * 아이디 기억하기 · 자동 로그인.
   *
   * 둘 다 이 기기에만 두는 값이라 localStorage 에 담는다(lib/login-prefs.ts).
   * 서버에 저장하면 로그인하기 전에는 읽을 수가 없는데, 정작 필요한 순간이
   * 바로 그때다.
   *
   * 값을 상태로 들고 있지 않고 화면에 붙은 뒤 칸에 직접 써넣는다. 서버는
   * 저장된 값을 모르므로 처음부터 채워 그리면 서버가 그린 것과 달라졌다는
   * 경고가 나고, 상태로 옮기면 그리자마자 다시 그리게 된다.
   *
   * 처음 붙을 때만이 아니라 로그인이 막혀 돌아올 때마다 다시 써넣는다(state). React 는
   * 폼 액션이 끝나면 폼을 처음 값으로 되돌려서, 비밀번호를 한 번 틀리면 두 체크박스가
   * 꺼진 채로 남았다 — 다음 로그인이 '자동 로그인' 없이 조용히 넘어갔다. 되돌린 직후
   * (같은 그림 안) 저장해 둔 값으로 다시 켠다.
   */
  const emailRef = useRef<HTMLInputElement>(null);
  const [showHints, setShowHints] = useState(false);
  const rememberRef = useRef<HTMLInputElement>(null);
  const stayRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const saved = readLoginPrefs();
    if (stayRef.current) stayRef.current.checked = saved.stayLoggedIn;
    if (rememberRef.current) rememberRef.current.checked = saved.email != null;
    /* 실패해서 되돌아온 값이 있으면 그쪽이 먼저다 — 방금 친 것이 더 맞다 */
    if (saved.email && emailRef.current && !emailRef.current.value) {
      emailRef.current.value = saved.email;
    }
  }, [state]);

  /** 기억해 두기로 했으면 지금 칸에 있는 값을 저장한다. */
  function rememberNow(on: boolean) {
    saveLoginPrefs({ email: on ? (emailRef.current?.value ?? '') : null });
  }

  return (
    <form action={formAction} className="flex flex-1 flex-col">
      <StepCard
        titleKey="login"
        title="로그인"
        desc="다시 오신 걸 환영해요. 기록을 이어서 관리하려면 로그인하세요."
        focusHeading={focusHeading}
        footer={
          <>
            <TextButton onClick={onSignup}>계정 만들기</TextButton>
            <SubmitButton label="로그인" pendingLabel="로그인 중…" />
          </>
        }
      >
        <div className="space-y-5">
          <FormError>{state?.error}</FormError>

          <Field label="이메일">
            <Input
              ref={emailRef}
              name="email"
              type="email"
              autoComplete="email"
              {...noAutoFix}
              defaultValue={kept(before, 'email')}
              onBlur={() => {
                if (rememberRef.current?.checked) rememberNow(true);
              }}
              placeholder="pitcher@example.com"
              required
              className={inputLarge}
            />
          </Field>

          <Field label="비밀번호">
            <Input
              name="password"
              type="password"
              autoComplete="current-password"
              {...noAutoFix}
              placeholder="••••••••"
              required
              className={inputLarge}
            />
          </Field>

          <div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-0 pt-1 desk:gap-y-2">
              <CheckLine
                ref={stayRef}
                name="stayLoggedIn"
                label="자동 로그인"
                title={STAY_HINT}
                onChange={(on) => saveLoginPrefs({ stayLoggedIn: on })}
              />
              <CheckLine
                ref={rememberRef}
                label="아이디 기억하기"
                title={REMEMBER_HINT}
                onChange={rememberNow}
              />
              {/*
                두 체크박스의 설명 — 예전에는 title(마우스를 올려야 뜨는 말풍선)에만 있어 아이폰에서는 볼 길이
                없었다(2026-10-03). 늘 펴 두면 로그인 화면이 어수선해서, 누르면 밑에 두 줄로 편다.
              */}
              <button
                type="button"
                onClick={() => setShowHints((v) => !v)}
                aria-expanded={showHints}
                aria-controls="login-pref-hints"
                aria-label="자동 로그인 · 아이디 기억하기 설명"
                className="-ml-3 grid h-11 w-11 place-items-center rounded-full text-muted transition-colors hover:text-sky desk:h-7 desk:w-7"
              >
                <Info aria-hidden className="h-4 w-4" />
              </button>
            </div>
            {showHints && (
              <ul
                id="login-pref-hints"
                className="motion-safe:animate-fade-in mt-1 space-y-1 text-xs leading-relaxed break-keep text-muted"
              >
                <li>
                  <span className="font-semibold text-ink">자동 로그인</span> ·{' '}
                  {STAY_HINT}
                </li>
                <li>
                  <span className="font-semibold text-ink">아이디 기억하기</span> ·{' '}
                  {REMEMBER_HINT}
                </li>
              </ul>
            )}
          </div>
        </div>
      </StepCard>
    </form>
  );
}

/* ─────────────────────────── 회원가입 — 답 · 차례 ─────────────────────────── */

type SignupAnswers = {
  nickname: string;
  /** 'YYYY-MM-DD' */
  birthDate: string;
  sex: Sex | null;
  throwingHand: string | null;
  /** 고른 소속 — 보이는 값은 생년월일에 맞춰 다시 본다(levelValue) */
  competitionLevel: CompetitionLevel | null;
  baselineFreq: string | null;
  baselineVolume: string | null;
  baselineIntensity: string | null;
  baselineWorkoutFreq: string | null;
  trainingLevel: string | null;
  heightCm: number | null;
  weightKg: number | null;
  nutrition: NutritionAnswers;
  email: string;
  password: string;
  passwordConfirm: string;
  agreeTerms: boolean;
  agreePrivacy: boolean;
  /** '던지는 날 앞뒤로 끼니를 거르지 않기로 약속해요' — 보내지 않는다 */
  promise: boolean;
};

const EMPTY: SignupAnswers = {
  nickname: '',
  birthDate: '',
  sex: null,
  throwingHand: null,
  competitionLevel: null,
  baselineFreq: null,
  baselineVolume: null,
  baselineIntensity: null,
  baselineWorkoutFreq: null,
  trainingLevel: null,
  heightCm: null,
  weightKg: null,
  nutrition: EMPTY_ANSWERS,
  email: '',
  password: '',
  passwordConfirm: '',
  agreeTerms: false,
  agreePrivacy: false,
  promise: false,
};

/** 화면 열쇠 — 영양 화면은 'n:' 뒤에 lib/nutrition/onboarding-answers.ts 의 열쇠 */
type StepKey =
  | 'name'
  | 'birth'
  | 'capCard'
  | 'hand'
  | 'level'
  | 'pitching'
  | 'weights'
  | 'height'
  | 'weight'
  | 'burnCard'
  | `n:${NutritionStepKey}`
  | 'email'
  | 'password'
  | 'terms'
  | 'summary';

/** 막힌 칸이 있는 화면 — 서버가 어느 칸을 막았는지(AuthState.field) 알려 주면 그 화면으로 돌아간다 */
const FIELD_STEP: Record<string, StepKey> = {
  nickname: 'name',
  birthDate: 'birth',
  sex: 'birth',
  throwingHand: 'hand',
  competitionLevel: 'level',
  baselineFreq: 'pitching',
  baselineVolume: 'pitching',
  baselineIntensity: 'pitching',
  baselineWorkoutFreq: 'weights',
  trainingLevel: 'weights',
  heightCm: 'height',
  weightKg: 'weight',
  email: 'email',
  password: 'password',
  passwordConfirm: 'password',
  agreeTerms: 'terms',
  agreePrivacy: 'terms',
  promise: 'summary',
};

function stepOfField(field: string | undefined): StepKey {
  if (!field) return 'summary';
  const own = FIELD_STEP[field];
  if (own) return own;
  const n = nutritionStepOfField(field);
  return n ? `n:${n}` : 'summary';
}

/** 숫자 몸 — 영양 질문이 계산에 쓴다 */
function bodyOf(
  a: SignupAnswers,
  level: CompetitionLevel | null,
  today: string
): OnboardingBody {
  return {
    age: ageOn(parseBirthDate(a.birthDate), today),
    sex: a.sex,
    heightCm: a.heightCm,
    weightKg: a.weightKg,
    level,
  };
}

/** 지금 답으로 보일 화면 차례 — 목표 체중 · 속도는 답에 따라 있고 없다 */
function visibleSteps(a: SignupAnswers, body: OnboardingBody): StepKey[] {
  return [
    'name',
    'birth',
    'capCard',
    'hand',
    'level',
    'pitching',
    'weights',
    'height',
    'weight',
    'burnCard',
    ...visibleNutritionSteps(a.nutrition, body).map((k): StepKey => `n:${k}`),
    'email',
    'password',
    'terms',
    'summary',
  ];
}

type Problem = { error: string; field: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 한 화면을 넘어가도 되는가 — 서버(app/actions/auth.ts · lib/profile.ts · lib/baseline.ts ·
 * lib/nutrition/profile-save.ts)와 같은 기준을 먼저 본다. 여기서 놓치면 스물다섯 화면을 다 지나 마지막에야 막힌다.
 *
 * 브라우저의 기본 검사는 쓰지 않는다(폼이 noValidate). 모든 화면이 한 폼 안에 있어서, 기본 검사를 켜 두면 아직
 * 안 보인 화면의 빈칸 때문에 '다음'이 막힌다.
 */
function checkStep(
  key: StepKey,
  a: SignupAnswers,
  body: OnboardingBody,
  today: string
): Problem | null {
  switch (key) {
    case 'name': {
      const nickname = a.nickname.trim();
      if (!nickname) return { error: '뭐라고 부를지 적어 주세요.', field: 'nickname' };
      if (nickname.length < 2)
        return { error: '이름은 2자 이상이어야 해요.', field: 'nickname' };
      return null;
    }
    case 'birth': {
      if (!a.birthDate) return { error: '생년월일을 골라 주세요.', field: 'birthDate' };
      const parsed = parseBirthDate(a.birthDate);
      if (!parsed)
        return { error: '생년월일을 올바르게 골라 주세요.', field: 'birthDate' };
      const age = ageFromBirthDate(parsed);
      if (a.birthDate > today || age < MIN_AGE || age > MAX_AGE) {
        return { error: '생년월일을 다시 확인해 주세요.', field: 'birthDate' };
      }
      if (!a.sex) return { error: '성별을 골라 주세요.', field: 'sex' };
      return null;
    }
    case 'hand':
      if (!a.throwingHand)
        return { error: '던지는 손을 골라 주세요.', field: 'throwingHand' };
      return null;
    case 'level':
      if (!body.level)
        return {
          error: '어디서 야구를 하시는지 골라 주세요.',
          field: 'competitionLevel',
        };
      return null;
    case 'pitching':
      if (!a.baselineFreq)
        return { error: '던지는 횟수를 골라 주세요.', field: 'baselineFreq' };
      if (!a.baselineVolume)
        return { error: '한 번에 던지는 양을 골라 주세요.', field: 'baselineVolume' };
      if (!a.baselineIntensity)
        return { error: '평소 강도를 골라 주세요.', field: 'baselineIntensity' };
      return null;
    case 'weights':
      if (!a.baselineWorkoutFreq)
        return { error: '웨이트 횟수를 골라 주세요.', field: 'baselineWorkoutFreq' };
      if (!a.trainingLevel)
        return { error: '웨이트 트레이닝 경력을 골라 주세요.', field: 'trainingLevel' };
      return null;
    case 'height':
      if (a.heightCm === null) return { error: '키를 적어 주세요.', field: 'heightCm' };
      if (
        !Number.isInteger(a.heightCm) ||
        a.heightCm < MIN_HEIGHT_CM ||
        a.heightCm > MAX_HEIGHT_CM
      ) {
        return {
          error: `키는 ${MIN_HEIGHT_CM}~${MAX_HEIGHT_CM}cm 사이로 적어 주세요.`,
          field: 'heightCm',
        };
      }
      return null;
    case 'weight':
      if (a.weightKg === null)
        return { error: '지금 체중을 적어 주세요.', field: 'weightKg' };
      if (a.weightKg < MIN_WEIGHT_KG || a.weightKg > MAX_WEIGHT_KG) {
        return {
          error: `체중은 ${MIN_WEIGHT_KG}~${MAX_WEIGHT_KG}kg 사이로 적어 주세요.`,
          field: 'weightKg',
        };
      }
      return null;
    case 'email': {
      const email = a.email.trim();
      if (!email) return { error: '이메일을 입력해주세요.', field: 'email' };
      if (!EMAIL_RE.test(email))
        return { error: '올바른 이메일 형식이 아니에요.', field: 'email' };
      return null;
    }
    case 'password':
      if (a.password.length < 8)
        return { error: '비밀번호는 8자 이상이어야 해요.', field: 'password' };
      if (!a.passwordConfirm)
        return { error: '비밀번호를 한 번 더 입력해주세요.', field: 'passwordConfirm' };
      if (a.password !== a.passwordConfirm)
        return { error: '비밀번호가 일치하지 않아요.', field: 'passwordConfirm' };
      return null;
    case 'terms':
      if (!a.agreeTerms)
        return { error: '이용약관에 동의해주세요.', field: 'agreeTerms' };
      if (!a.agreePrivacy)
        return { error: '개인정보 처리방침에 동의해주세요.', field: 'agreePrivacy' };
      return null;
    case 'summary':
      if (!a.promise)
        return {
          error: '약속에 체크해 주세요 — 던지는 날 끼니를 거르지 않기.',
          field: 'promise',
        };
      return null;
    case 'capCard':
    case 'burnCard':
      return null;
    default:
      return checkNutritionStep(key.slice(2) as NutritionStepKey, a.nutrition, body);
  }
}

/* ─────────────────────────── 회원가입 — 부품 ─────────────────────────── */

/** 동의 줄 안의 글 이름 링크 — 누르면 창으로 연다. 주소는 그대로 둬 길게 눌러 복사 · 새 탭도 된다 */
function LegalLink({
  doc,
  onOpen,
  children,
}: {
  doc: LegalDoc;
  onOpen: (doc: LegalDoc, e: React.MouseEvent<HTMLAnchorElement>) => void;
  children: ReactNode;
}) {
  return (
    <a
      href={`/${doc}`}
      onClick={(e) => {
        if (wantsNewTab(e)) return;
        e.preventDefault();
        onOpen(doc, e);
      }}
      className="font-medium text-sky-strong underline"
    >
      {children}
    </a>
  );
}

/** 동의 한 줄 — 켜고 끄는 것은 부모가 쥔다(모두 동의와 함께 움직인다). name 이 있으면 서버로 간다 */
function AgreeLine({
  name,
  checked,
  onChange,
  invalid,
  children,
}: {
  name?: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  invalid: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl px-1 py-2 text-sm text-ink">
      <input
        type="checkbox"
        name={name}
        id={name ? `${name}-field` : undefined}
        checked={checked}
        required={!!name}
        data-sync={checked ? 'on' : 'off'}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-sky"
        {...invalidProps(invalid)}
      />
      <span className="leading-relaxed break-keep">{children}</span>
    </label>
  );
}

/**
 * 생년월일 칸 — 앱의 작은 달력(components/mini-calendar.tsx)으로 고른다.
 *
 * 예전에는 브라우저의 날짜 칸이었다. 기기마다 모양이 달랐고(아이폰은 굴리는 바퀴, 크롬은
 * 회색 표) 앱의 다른 달력과 따로 놀았다. 이제 영양 탭의 날짜 고르개와 같은 달력이 칸
 * 바로 밑(자리가 모자라면 위)에 뜬다. 몇십 년 전으로 가야 해서 연 · 월은 곧장 고른다.
 * 고를 수 있는 날은 서버와 같은 선이다 — 만 5세 ~ 100세(lib/profile.ts).
 *
 * 달력은 카드 밖(body)에 띄운다. 카드가 둥근 모서리를 지키려고 넘치는 것을 자르고 있어서,
 * 카드 안에 두면 달력 아래쪽이 잘렸다.
 *
 * 값은 숨은 칸(name="birthDate")에 들어가 다른 칸과 함께 보내진다.
 */
function BirthDateField({
  value,
  onChange,
  today,
  invalid,
}: {
  value: string;
  onChange: (next: string) => void;
  today: string;
  invalid: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const year = Number(today.slice(0, 4));
  const monthDay = today.slice(4);
  const min = `${year - MAX_AGE}${monthDay}`;
  const max = `${year - MIN_AGE}${monthDay}`;

  /* 칸 바로 밑에 — 밑에 자리가 모자라고 위가 더 넓으면 위에. 화면 밖으로는 안 나가게. */
  const place = useCallback(() => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 296;
    /* 달력의 높이(여섯 줄 + 머리) — 재 보니 335px 안팎이다 */
    const height = 340;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const vh = window.innerHeight;
    if (vh - r.bottom >= height + 8) {
      setStyle({ left, width, top: r.bottom + 6 });
    } else if (r.top >= height + 8) {
      setStyle({ left, width, bottom: vh - r.top + 6 });
    } else {
      /* 위아래 어느 쪽에도 다 안 들어가는 작은 화면 — 칸을 덮더라도 화면 안에 다 보이게 */
      setStyle({ left, width, top: Math.max(8, vh - height - 8) });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  const [y, m, d] = value ? value.split('-').map(Number) : [];

  return (
    <>
      <input type="hidden" name="birthDate" value={value} />
      <button
        ref={buttonRef}
        id="birthDate-field"
        type="button"
        onClick={() => {
          if (!open) place();
          setOpen((o) => !o);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        {...invalidProps(invalid)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-surface-2 px-4 py-3.5 text-left text-[15px] transition-colors focus:border-sky focus:outline-none ${
          invalid ? 'border-danger' : open ? 'border-sky' : 'border-line'
        }`}
      >
        <span className={value ? 'text-ink' : 'text-muted/60'}>
          {value ? `${y}년 ${m}월 ${d}일` : '날짜 고르기'}
        </span>
        <CalendarDays aria-hidden className="h-4 w-4 shrink-0 text-muted" />
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label="생년월일 고르기"
            style={style}
            className="motion-safe:animate-fade-in fixed z-50 rounded-2xl border border-line bg-surface p-3 shadow-2xl"
          >
            <MiniCalendar
              value={value}
              today={today}
              min={min}
              max={max}
              viewFrom={`${year - 15}-01-01`}
              pickYear
              marked={() => false}
              onPick={(key) => {
                onChange(key);
                setOpen(false);
                buttonRef.current?.focus();
              }}
            />
          </div>,
          document.body
        )}
    </>
  );
}

/** 이 칸에서 Enter 를 누르면 '다음 칸'으로 가는가 — 글을 치는 칸만 */
function isTextLike(el: Element): el is HTMLInputElement {
  return (
    el instanceof HTMLInputElement &&
    ['text', 'email', 'password', 'date', 'number'].includes(el.type)
  );
}

/** 요약 카드의 한 줄 */
function SummaryRow({
  label,
  value,
  row,
}: {
  label: string;
  value: ReactNode;
  row: number;
}) {
  return (
    <div
      style={{ '--row': row } as React.CSSProperties}
      className="motion-safe:animate-row-in flex items-baseline justify-between gap-3 py-2 text-sm"
    >
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-right font-medium break-keep text-ink">{value}</dd>
    </div>
  );
}

/* ─────────────────────────── 회원가입 — 마법사 ─────────────────────────── */

function SignupWizard({
  today,
  onLogin,
  focusHeading,
}: {
  today: string;
  onLogin: () => void;
  focusHeading: boolean;
}) {
  /*
   * 신호가 끊겨 가입이 던지면 — 예전에는 로그인 밖 오류 화면으로 넘어가 '다시 시도'가 로그인 칸으로 돌아가며 답이
   * 통째로 사라졌다. 이제 누른 자리(요약 화면)에 한 줄로 알리고 적은 것은 그대로다(lib/action-offline.ts).
   */
  const [state, formAction] = useActionState<AuthState, FormData>(
    guardFormAction(signup, { field: 'promise' }),
    undefined
  );
  const formRef = useRef<HTMLFormElement>(null);

  const [answers, setAnswers] = useState<SignupAnswers>(EMPTY);
  const [step, setStep] = useState<StepKey>('name');
  const [dir, setDir] = useState<'next' | 'back'>('next');
  const [checking, setChecking] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  /* 지금 보여 줄 문제 — 같은 문제가 다시 나도 다시 읽히고 초점이 가도록 번호(seq)를 붙인다 */
  const [problem, setProblem] = useState<(Problem & { seq: number }) | null>(null);
  /* 화면을 옮긴 것이 사람의 손(다음 · 이전 · 되돌림)인가 — 그때만 새 화면으로 초점을 옮긴다 */
  const moved = useRef(false);
  /* 약관 · 개인정보 창(LegalSheet) */
  const legal = useModalState<LegalDoc>();

  /* ── 답에서 셈하는 것 ── */
  const fit = levelFit(answers.birthDate || null, today);
  const levelValue =
    answers.competitionLevel && fit.allowed.includes(answers.competitionLevel)
      ? answers.competitionLevel
      : fit.suggested;
  const body = bodyOf(answers, levelValue, today);
  const visible = visibleSteps(answers, body);
  const index = Math.max(0, visible.indexOf(step));
  const current = visible[index];
  const last = visible.length - 1;
  const p = preview(answers.nutrition, body);
  const name = answers.nickname.trim();
  const unit = useWeightUnit();
  const who = name ? `${name} 님, ` : '';

  function set(patch: Partial<SignupAnswers>) {
    setAnswers((prev) => ({ ...prev, ...patch }));
    /* 고치기 시작하면 막힌 까닭을 걷는다 — 다시 '다음'을 누르면 그때 다시 본다 */
    if (problem) setProblem(null);
  }
  function setNutrition(patch: Partial<NutritionAnswers>) {
    setAnswers((prev) => ({ ...prev, nutrition: { ...prev.nutrition, ...patch } }));
    if (problem) setProblem(null);
  }
  function show(found: Problem) {
    setProblem((prev) => ({ ...found, seq: (prev?.seq ?? 0) + 1 }));
  }
  const invalid = (field: string) => problem?.field === field;

  /* 서버가 막고 돌아오면 그 칸이 있는 화면으로 (그리는 도중 상태 보정) */
  const [seenState, setSeenState] = useState<AuthState>(undefined);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.error) {
      const at = stepOfField(state.field);
      setDir(visible.indexOf(at) < index ? 'back' : 'next');
      setStep(at);
      show({ error: state.error, field: state.field ?? 'promise' });
    }
  }

  /*
   * 서버가 막고 돌아오면 React 가 폼을 처음 값으로 되돌린다(form.reset). 손에 쥔 체크박스(동의 · 비밀번호 표시 ·
   * 약속 · 보충식품)는 그때 화면만 꺼지고 상태는 켜진 채로 남는다. 되돌린 직후(같은 그림 안) 상태대로 다시 칠한다 —
   * data-sync 가 그 체크박스의 지금 상태다. 글 칸 · 숨은 칸은 React 가 value 속성까지 맞춰 둬서 되돌려도 그대로다.
   */
  useLayoutEffect(() => {
    formRef.current
      ?.querySelectorAll<HTMLInputElement>('input[data-sync]')
      .forEach((el) => {
        el.checked = el.dataset.sync === 'on';
      });
  }, [state]);

  /** 칸(id "{name}-field")으로 초점 — 고르는 묶음이면 고른 단추(없으면 첫 단추)로 */
  function focusField(field: string) {
    const target = document.getElementById(`${field}-field`);
    if (target) {
      if (target.dataset.field !== undefined) {
        const picked =
          target.querySelector<HTMLElement>('[aria-checked="true"]:not(:disabled)') ??
          target.querySelector<HTMLElement>('button:not(:disabled)');
        picked?.focus({ preventScroll: true });
      } else {
        target.focus({ preventScroll: true });
      }
      return;
    }
    const el = formRef.current?.elements.namedItem(field);
    if (
      el instanceof HTMLElement &&
      !(el instanceof HTMLInputElement && el.type === 'hidden')
    ) {
      el.focus({ preventScroll: true });
    }
  }

  /*
   * 화면이 바뀌면 새 화면의 첫 칸(고른 것이 있으면 그것)으로 초점을 옮긴다 — 키보드로 쓰는 사람이 이전 화면의
   * 숨은 단추에 남지 않게. 처음 뜰 때(로그인에서 넘어온 순간)는 옮기지 않는다 — 그때는 제목이 초점을 받는다(StepCard).
   * 긴 화면(목표 카드 다섯)에서 다음을 누른 뒤에는 위로 돌아간다.
   */
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    if (window.scrollY > 0) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    }
    const panel = formRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    const first = panel?.querySelector<HTMLElement>(
      '[data-field], input:not([type=hidden]), button[role=radio], textarea'
    );
    if (!first) return;
    if (first.dataset.field !== undefined) return focusField(first.dataset.field);
    first.focus({ preventScroll: true });
  }, [step]);

  /*
   * 문제가 난 칸으로 초점을 옮긴다. 위(화면의 첫 칸)보다 뒤에 둔다 — 서버가 막아 화면을 되돌릴 때는 둘이 한꺼번에
   * 도는데, 첫 칸이 아니라 문제의 칸에 가 있어야 한다.
   */
  useEffect(() => {
    if (!problem) return;
    focusField(problem.field);
  }, [problem]);

  function goTo(key: StepKey, direction: 'next' | 'back') {
    moved.current = true;
    setDir(direction);
    setStep(key);
  }

  async function next() {
    if (checking || index >= last) return;
    const found = checkStep(current, answers, body, today);
    if (found) return show(found);

    /* 이메일 화면에서 이미 가입된 것인지 미리 본다 — 끝까지 가서 막히지 않게 */
    if (current === 'email') {
      setChecking(true);
      try {
        const res = await checkSignupEmail(answers.email.trim());
        if (res.error) return show({ error: res.error, field: 'email' });
      } catch {
        /* 확인을 못 했으면 그냥 넘어간다 — 마지막에 서버가 다시 본다 */
      } finally {
        setChecking(false);
      }
    }
    setProblem(null);
    goTo(visible[index + 1], 'next');
  }

  function back() {
    setProblem(null);
    /* 끼움 · '계획 만드는 중'은 건너 뛴다 — 되돌아가서 볼 것이 아니다 */
    let i = index - 1;
    while (i > 0 && visible[i] === 'n:building') i--;
    goTo(visible[Math.max(0, i)], 'back');
  }

  /** 마지막 화면에서 보내기 전에 모든 화면을 한 번 더 본다 */
  function allGood(): boolean {
    for (const key of visible) {
      const found = checkStep(key, answers, body, today);
      if (found) {
        if (key !== current) goTo(key, visible.indexOf(key) < index ? 'back' : 'next');
        show(found);
        return false;
      }
    }
    return true;
  }

  /*
   * 칸에서 Enter — 이 화면에 다음 칸이 남아 있으면 그리로, 마지막 칸이면 '다음'.
   * 비밀번호 칸에서 Enter 를 눌렀는데 확인 칸이 비었다고 '일치하지 않습니다'가 뜨지 않게.
   */
  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    const target = e.target as Element;
    if (!isTextLike(target)) return;
    e.preventDefault();
    const panel = target.closest('[data-step]');
    const fields = Array.from(panel?.querySelectorAll('input') ?? []).filter(
      isTextLike
    );
    const after = fields[fields.indexOf(target) + 1];
    if (after) return after.focus();
    if (index < last) void next();
    else if (allGood()) formRef.current?.requestSubmit();
  }

  /* ── 제목 ── */
  const ctx: StepCtx = {
    a: answers.nutrition,
    set: setNutrition,
    body,
    p,
    today,
    name,
    invalid,
    unit,
    active: false,
  };
  function titleOf(key: StepKey): { title: string; desc?: string } {
    switch (key) {
      case 'name':
        return {
          title: '반가워요. 뭐라고 부를까요?',
          desc: '앱에서 부를 이름이에요. 2자 이상이면 돼요. 나중에 바꿀 수 있어요.',
        };
      case 'birth':
        return {
          title: `${who}언제 태어나셨어요?`,
          desc: '나이에 맞는 하루 투구 한도와 영양 기준을 정해요. 성별은 기초대사량 계산에 써요.',
        };
      case 'capCard':
        return {
          title: '첫 숫자가 나왔어요',
          desc: '생년월일 하나로 이만큼이 정해져요.',
        };
      case 'hand':
        return {
          title: '어느 손으로 던지세요?',
          desc: '폼 분석에서 어느 팔을 볼지, 암케어가 어느 쪽을 돌볼지 정해요.',
        };
      case 'level':
        return {
          title: '어디서 야구를 하세요?',
          desc: '생년월일에 맞는 소속만 고를 수 있어요. 평소 움직임을 미리 골라 두는 데도 써요.',
        };
      case 'pitching':
        return {
          title: '평소 얼마나 던지세요?',
          desc: '셋을 고르면 첫날부터 투구 부하 지수를 낼 수 있어요. 기록이 쌓이면 이 답은 자리를 비켜요.',
        };
      case 'weights':
        return {
          title: '웨이트는 얼마나 하세요?',
          desc: '운동 부하 지수의 시작점과, 경력에 맞는 운동을 고르는 데 써요.',
        };
      case 'height':
        return {
          title: '키는 얼마예요?',
          desc: '기초대사량과 목표 체중의 바닥(BMI 20), 영상에서 잰 길이를 몸 크기로 나눌 때 써요.',
        };
      case 'weight':
        return {
          title: '지금 체중은요?',
          desc: '오늘 첫 체중 기록이 돼요. 목표 칼로리와 단백질을 체중으로 셈해요.',
        };
      case 'burnCard':
        return {
          title: '먹는 것과 쓰는 것',
          desc: '이 앱의 영양은 운동 · 투구 기록과 이어져 있어요.',
        };
      case 'email':
        return {
          title: '로그인에 쓸 이메일이에요',
          desc: '여기까지 답한 것을 이 계정에 담아요.',
        };
      case 'password':
        return {
          title: '비밀번호를 만들어요',
          desc: '8자 이상이면 돼요. 다른 곳에서 쓰지 않는 것으로 정해 주세요.',
        };
      case 'terms':
        return {
          title: '약관 동의',
          desc: '두 가지 모두 동의해야 가입할 수 있어요. 눌러서 내용을 볼 수 있어요.',
        };
      case 'summary':
        return {
          title: `${name ? `${name} 님의 ` : ''}목표예요`,
          desc: '가입하면 오늘 화면으로 가요. 모두 나중에 영양 탭 · 내 정보에서 바꿀 수 있어요.',
        };
      default:
        return nutritionStepTitle(key.slice(2) as NutritionStepKey, ctx);
    }
  }
  const heading = titleOf(current);

  const enter =
    dir === 'next' ? 'motion-safe:animate-step-next' : 'motion-safe:animate-step-back';

  /* 화면 한 칸 — 지금 것만 보인다. 숨었다 보이는 순간 들어오는 움직임이 다시 돈다. */
  const panel = (key: StepKey, children: ReactNode) => (
    <div
      key={key}
      data-step={key}
      hidden={key !== current}
      className={key === current ? enter : undefined}
    >
      {children}
    </div>
  );

  const load = estimateDailyLoad({
    baselineFreq: answers.baselineFreq,
    baselineVolume: answers.baselineVolume,
    baselineIntensity: answers.baselineIntensity,
  });
  const building = current === 'n:building';
  const goalLabel =
    GOAL_KINDS.find((g) => g.key === answers.nutrition.goalKind)?.label ?? null;

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      onKeyDown={onKeyDown}
      className="flex flex-1 flex-col"
    >
      <StepCard
        titleKey={current}
        title={heading.title}
        desc={heading.desc}
        progress={(index + 1) / visible.length}
        counter={`${index + 1} / ${visible.length}`}
        focusHeading={focusHeading}
        footer={
          <>
            {index === 0 ? (
              <TextButton onClick={onLogin}>로그인하기</TextButton>
            ) : (
              <TextButton onClick={back} disabled={building}>
                이전
              </TextButton>
            )}
            {index < last ? (
              <Button
                type="button"
                onClick={() => void next()}
                disabled={checking || building}
                className="min-w-28"
              >
                {checking ? '확인 중…' : building ? '잠시만요…' : '다음'}
              </Button>
            ) : (
              <SubmitButton
                label="가입하고 시작하기"
                pendingLabel="가입하는 중…"
                onClick={(e) => {
                  /* 보내기 전에 모든 화면을 다시 본다 — 막히면 그 화면으로 */
                  if (!allGood()) e.preventDefault();
                }}
              />
            )}
          </>
        }
      >
        {/* 화면 낭독기에 화면이 넘어간 것을 알린다 */}
        <p className="sr-only" aria-live="polite">
          {`${visible.length}단계 중 ${index + 1}단계, ${heading.title}`}
        </p>

        {/*
          서버로 가는 숨은 칸 — 단추로 고른 답(상태)을 폼에 싣는다. 글 칸(이름 · 이메일 · 비밀번호)과 생년월일 ·
          키 · 체중 · 동의는 제 화면 안의 칸이 보낸다.
        */}
        <input type="hidden" name="sex" value={answers.sex ?? ''} />
        <input type="hidden" name="throwingHand" value={answers.throwingHand ?? ''} />
        <input type="hidden" name="competitionLevel" value={levelValue ?? ''} />
        <input type="hidden" name="baselineFreq" value={answers.baselineFreq ?? ''} />
        <input
          type="hidden"
          name="baselineVolume"
          value={answers.baselineVolume ?? ''}
        />
        <input
          type="hidden"
          name="baselineIntensity"
          value={answers.baselineIntensity ?? ''}
        />
        <input
          type="hidden"
          name="baselineWorkoutFreq"
          value={answers.baselineWorkoutFreq ?? ''}
        />
        <input type="hidden" name="trainingLevel" value={answers.trainingLevel ?? ''} />
        {toFormFields(answers.nutrition).map(([k, v], i) => (
          <input key={`${k}:${i}`} type="hidden" name={k} value={v} />
        ))}

        {/* ── 1 이름 ── */}
        {panel(
          'name',
          <Field label="이름 · 별명">
            <Input
              name="nickname"
              type="text"
              autoComplete="nickname"
              required
              value={answers.nickname}
              onChange={(e) => set({ nickname: e.target.value })}
              placeholder="불펜지기"
              maxLength={20}
              className={inputLarge}
              {...invalidProps(invalid('nickname'))}
            />
          </Field>
        )}

        {/* ── 2 생년월일 · 성별 ── */}
        {panel(
          'birth',
          <div className="space-y-5">
            <Field label="생년월일">
              <BirthDateField
                value={answers.birthDate}
                onChange={(birthDate) => set({ birthDate })}
                today={today}
                invalid={invalid('birthDate')}
              />
            </Field>
            {/* 성별 — 영양 목표(기초대사량)를 계산하는 기준이라 가입할 때 받는다. 몸에 대한 사실이라 계정에 두고, 바꾸는 것도 내 정보 한 곳에서만 한다 */}
            <Chips
              name="sex"
              legend="성별"
              options={SEX_OPTIONS.map((o) => ({
                value: o.value as Sex,
                label: o.name,
              }))}
              value={answers.sex}
              onChange={(sex) => set({ sex })}
              invalid={invalid('sex')}
            />
          </div>
        )}

        {/* ── 끼움: 하루 투구 한도 ── */}
        {panel(
          'capCard',
          <PitchCapInsert age={body.age} active={current === 'capCard'} />
        )}

        {/* ── 3 던지는 손 ── */}
        {panel(
          'hand',
          <Chips
            name="throwingHand"
            label="던지는 손"
            options={THROWING_HANDS.map((h) => ({ value: h, label: h }))}
            value={answers.throwingHand}
            onChange={(throwingHand) => set({ throwingHand })}
            invalid={invalid('throwingHand')}
            hint="양투는 둘 다 던지는 선수예요. 폼 분석은 영상마다 어느 팔인지 따로 정해요."
          />
        )}

        {/* ── 4 소속 — 생년월일과 이어져 있다(lib/baseline.ts levelFit) ── */}
        {panel(
          'level',
          <Chips
            name="competitionLevel"
            label="소속"
            options={COMPETITION_LEVELS.map((level) => ({
              value: level,
              label: COMPETITION_LEVEL_LABELS[level],
              disabled: !fit.allowed.includes(level),
            }))}
            value={levelValue}
            onChange={(competitionLevel) => set({ competitionLevel })}
            invalid={invalid('competitionLevel')}
            hint={
              fit.grade === null
                ? '생년월일을 넣으면 나이에 맞는 소속을 먼저 골라 드려요.'
                : `생년월일로 보면 ${gradeText(fit.grade)} 나이예요. 나이에 맞는 소속만 고를 수 있어요.`
            }
          />
        )}

        {/* ── 5 평소 투구량 — 이 답으로 부하 지수를 첫날부터 계산한다 ── */}
        {panel(
          'pitching',
          <div className="space-y-5">
            <Chips
              name="baselineFreq"
              legend="던지는 횟수"
              options={BASELINE_FREQ_NAMES.map((n) => ({ value: n, label: n }))}
              value={answers.baselineFreq}
              onChange={(baselineFreq) => set({ baselineFreq })}
              invalid={invalid('baselineFreq')}
            />
            <Chips
              name="baselineVolume"
              legend="한 번에 던지는 양"
              options={BASELINE_VOLUME_NAMES.map((n) => ({ value: n, label: n }))}
              value={answers.baselineVolume}
              onChange={(baselineVolume) => set({ baselineVolume })}
              invalid={invalid('baselineVolume')}
            />
            <Chips
              name="baselineIntensity"
              legend="평소 강도"
              options={BASELINE_INTENSITY_NAMES.map((n) => ({ value: n, label: n }))}
              value={answers.baselineIntensity}
              onChange={(baselineIntensity) => set({ baselineIntensity })}
              invalid={invalid('baselineIntensity')}
            />
            {load !== null && (
              <div className="rise-in rounded-2xl border border-sky/25 bg-sky/5 px-4 py-3">
                <p className="text-xs font-medium text-sky-strong">평소 하루 부하</p>
                <p className="text-heading mt-1 text-2xl text-ink">
                  <CountUp value={load} active={current === 'pitching'} />
                  <span className="ml-1.5 text-xs font-normal text-muted">
                    횟수 × 구수 × 강도 ÷ 7
                  </span>
                </p>
                <p className="mt-1 text-xs leading-relaxed break-keep text-muted">
                  첫날부터 이 값에서 투구 부하 지수를 시작해요. 기록이 쌓일수록 이
                  짐작은 자리를 비켜요.
                </p>
              </div>
            )}
          </div>
        )}

        {/*
          6 웨이트 빈도 — 투구와 같은 이유로 받는다. 이게 없으면 운동 부하 지수만 28일을 기다려야 한다.
          웨이트 경력 — 트레이닝이 경력에 비해 이른 운동을 빼는 기준이다(lib/report/personalize.ts).
        */}
        {panel(
          'weights',
          <div className="space-y-5">
            <Chips
              name="baselineWorkoutFreq"
              legend="웨이트 횟수"
              options={BASELINE_WORKOUT_FREQ_NAMES.map((n) => ({ value: n, label: n }))}
              value={answers.baselineWorkoutFreq}
              onChange={(baselineWorkoutFreq) => set({ baselineWorkoutFreq })}
              invalid={invalid('baselineWorkoutFreq')}
            />
            <div>
              <p className="mb-2 text-xs font-medium text-muted">
                웨이트 트레이닝 경력
              </p>
              <OptionCards
                name="trainingLevel"
                label="웨이트 트레이닝 경력"
                options={TRAINING_LEVELS.map((l) => ({
                  value: l.name,
                  label: l.name,
                  hint: l.desc,
                }))}
                value={answers.trainingLevel}
                onChange={(trainingLevel) => set({ trainingLevel })}
                columns={2}
                invalid={invalid('trainingLevel')}
              />
            </div>
          </div>
        )}

        {/* ── 7 키 · 8 체중 — 단위는 cm｜in · kg｜lb, 저장은 cm · kg ── */}
        {panel(
          'height',
          <NumberUnitField
            name="heightCm"
            kind="length"
            label="키"
            value={answers.heightCm}
            onChange={(heightCm) => set({ heightCm })}
            min={MIN_HEIGHT_CM}
            max={MAX_HEIGHT_CM}
            placeholder={175}
            invalid={invalid('heightCm')}
          />
        )}
        {panel(
          'weight',
          <NumberUnitField
            name="weightKg"
            kind="weight"
            label="지금 체중"
            value={answers.weightKg}
            onChange={(weightKg) => set({ weightKg })}
            min={MIN_WEIGHT_KG}
            max={MAX_WEIGHT_KG}
            placeholder={72}
            invalid={invalid('weightKg')}
            hint="아침에 화장실 다녀온 뒤 잰 값이 가장 고르게 나와요. 0.1kg 까지."
          />
        )}

        {/* ── 끼움: 운동 소모 ── */}
        {panel(
          'burnCard',
          <BurnInsert weightKg={answers.weightKg} active={current === 'burnCard'} />
        )}

        {/* ── 9~16 영양 질문 + 끼움(계획 만드는 중 · 추천 계획 · 탄단지 g) ── */}
        {visible
          .filter((k) => k.startsWith('n:'))
          .map((k) =>
            panel(
              k,
              <NutritionStepPanel
                step={k.slice(2) as NutritionStepKey}
                ctx={{ ...ctx, active: current === k }}
                onBuilt={() => {
                  if (current === 'n:building' && index < last)
                    goTo(visible[index + 1], 'next');
                }}
              />
            )
          )}

        {/* ── 17 이메일 ── */}
        {panel(
          'email',
          <Field label="이메일">
            <Input
              name="email"
              type="email"
              autoComplete="email"
              {...noAutoFix}
              required
              /* 이미 가입된 이메일인지 보는 동안에는 고칠 수 없게 — 본 것과 넘어간 것이 같게 */
              readOnly={checking}
              value={answers.email}
              onChange={(e) => set({ email: e.target.value })}
              placeholder="pitcher@example.com"
              className={inputLarge}
              {...invalidProps(invalid('email'))}
            />
          </Field>
        )}

        {/*
          키체인에게 알려 주는 계정 이름(이메일) — 보이지 않고, 누르거나 초점이 갈 일도 없고, 서버로도 안 간다(name 없음).
          아이폰 키체인은 새 비밀번호를 저장할 때 같은 폼의 username 칸을 계정 이름으로 쓴다. display:none 으로 숨기면
          키체인이 못 본다고 해서 sr-only 로 둔다. 화면 칸(data-step) 밖이라 화면의 첫 칸이 되지 않는다.
        */}
        <input
          type="text"
          autoComplete="username"
          value={answers.email}
          readOnly
          tabIndex={-1}
          aria-hidden
          className="sr-only"
        />

        {/* ── 18 비밀번호 ── */}
        {panel(
          'password',
          <div className="space-y-4 md:space-y-5">
            <Field label="비밀번호" hint="8자 이상">
              <Input
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                {...noAutoFix}
                required
                minLength={8}
                value={answers.password}
                onChange={(e) => set({ password: e.target.value })}
                placeholder="••••••••"
                className={inputLarge}
                {...invalidProps(invalid('password'))}
              />
            </Field>
            <Field label="비밀번호 확인">
              <Input
                name="passwordConfirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                {...noAutoFix}
                required
                value={answers.passwordConfirm}
                onChange={(e) => set({ passwordConfirm: e.target.value })}
                placeholder="••••••••"
                className={inputLarge}
                {...invalidProps(invalid('passwordConfirm'))}
              />
            </Field>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 pt-1 desk:min-h-0">
              <input
                type="checkbox"
                checked={showPassword}
                data-sync={showPassword ? 'on' : 'off'}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-sky"
              />
              <span className="text-sm text-muted select-none">비밀번호 표시</span>
            </label>
          </div>
        )}

        {/*
          19 동의 두 가지. 받는 정보를 보면 그냥 넘어갈 수준이 아니다 — 생년월일, 키, 체중, 통증 부위, 투구 기록, 영상.
          통증 기록은 건강에 관한 정보라 따로 동의를 받는다. 미리 체크해 두지 않는다. '모두 동의'는 둘을 한 번에
          켜고 끄는 편의일 뿐, 따로 보내는 값이 없다.
        */}
        {panel(
          'terms',
          <div className="rounded-2xl border border-line bg-surface-2/60 p-3">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl px-1 py-2 text-[15px] font-semibold text-ink">
              <input
                type="checkbox"
                checked={answers.agreeTerms && answers.agreePrivacy}
                data-sync={answers.agreeTerms && answers.agreePrivacy ? 'on' : 'off'}
                onChange={(e) =>
                  set({ agreeTerms: e.target.checked, agreePrivacy: e.target.checked })
                }
                className="h-5 w-5 shrink-0 cursor-pointer accent-sky"
              />
              모두 동의합니다
            </label>
            <div className="my-2 border-t border-line" />
            <AgreeLine
              name="agreeTerms"
              checked={answers.agreeTerms}
              onChange={(agreeTerms) => set({ agreeTerms })}
              invalid={invalid('agreeTerms')}
            >
              <LegalLink doc="terms" onOpen={legal.show}>
                이용약관
              </LegalLink>
              에 동의합니다. <span className="text-muted">(필수)</span>
            </AgreeLine>
            <AgreeLine
              name="agreePrivacy"
              checked={answers.agreePrivacy}
              onChange={(agreePrivacy) => set({ agreePrivacy })}
              invalid={invalid('agreePrivacy')}
            >
              <LegalLink doc="privacy" onOpen={legal.show}>
                개인정보 처리방침
              </LegalLink>
              에 동의합니다. 여기에는 어깨·팔꿈치 통증 같은{' '}
              <strong>건강에 관한 정보</strong>가 들어가요.{' '}
              <span className="text-muted">(필수)</span>
            </AgreeLine>
          </div>
        )}

        {/* ── 20 요약 · 약속 ── */}
        {panel(
          'summary',
          <div className="space-y-4">
            <div className="rounded-2xl border border-sky/30 bg-sky/5 px-4 py-3">
              <p className="text-xs font-medium text-sky-strong">
                {goalLabel ?? '목표'} · 운동 없는 날
              </p>
              <p className="text-heading mt-1 text-3xl text-ink">
                {kcalText(p.targets.base)}
                <span className="ml-1 text-sm font-normal text-muted">kcal</span>
              </p>
              <div className="mt-3">
                <MacroBar
                  carbs={p.targets.carbs}
                  protein={p.targets.protein}
                  fat={p.targets.fat}
                  compact
                />
              </div>
            </div>
            <dl className="divide-y divide-line rounded-2xl border border-line bg-surface-2/60 px-4">
              {answerLines(ctx).map((l, i) => (
                <SummaryRow key={l.label} label={l.label} value={l.value} row={i} />
              ))}
              <SummaryRow
                label="야구"
                value={[
                  answers.throwingHand,
                  levelValue ? COMPETITION_LEVEL_LABELS[levelValue] : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                row={9}
              />
              <SummaryRow label="계정" value={answers.email.trim() || '—'} row={10} />
            </dl>
            <AgreeLine
              checked={answers.promise}
              onChange={(promise) => set({ promise })}
              invalid={invalid('promise')}
            >
              <span id="promise-field" tabIndex={-1} className="outline-none">
                던지는 날 앞뒤로 끼니를 거르지 않기로 약속해요.
              </span>{' '}
              <span className="text-muted">영양 탭이 그날 가이드를 드릴게요.</span>
            </AgreeLine>
          </div>
        )}

        {problem && <ProblemLine seq={problem.seq}>{problem.error}</ProblemLine>}
      </StepCard>
      {/* 약관 · 개인정보 창 — 안에 칸이 없어 폼의 Enter 처리와 엮이지 않는다 */}
      <LegalSheet
        doc={legal.content}
        open={legal.open}
        origin={legal.origin}
        onClose={legal.close}
        onSwitch={legal.setContent}
      />
    </form>
  );
}

/* ─────────────────────────── 둘을 잇는 것 ─────────────────────────── */

/** today 는 생년월일에서 미래 날짜를 못 고르게 막는 데 쓴다. */
export function AuthForm({ today }: { today: string }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  /* 로그인 ↔ 가입을 바꾼 뒤인가 — 처음 들어왔을 때는 초점을 옮기지 않는다 */
  const [switched, setSwitched] = useState(false);
  const switchTo = (next: 'login' | 'signup') => {
    setSwitched(true);
    setMode(next);
  };
  return (
    <div
      key={mode}
      className="flex w-full max-w-[64rem] flex-col motion-safe:animate-fade-in max-md:flex-1"
    >
      {mode === 'login' ? (
        <LoginForm onSignup={() => switchTo('signup')} focusHeading={switched} />
      ) : (
        <SignupWizard
          today={today}
          onLogin={() => switchTo('login')}
          focusHeading={switched}
        />
      )}
    </div>
  );
}
