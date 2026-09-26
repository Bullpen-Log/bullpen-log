'use client';

import Link from 'next/link';
import {
  useActionState,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useFormStatus } from 'react-dom';
import { CircleAlert } from 'lucide-react';
import { checkSignupEmail, login, signup, type AuthState } from '@/app/actions/auth';
import { Button, Field, FormError, Input } from '@/components/ui';
import { BaseballMark } from '@/components/logo';
import { kept } from '@/lib/form-values';
import { readLoginPrefs, saveLoginPrefs } from '@/lib/login-prefs';
import {
  MAX_AGE,
  MAX_HEIGHT_CM,
  MIN_AGE,
  MIN_HEIGHT_CM,
  SEX_OPTIONS,
  ageFromBirthDate,
  parseBirthDate,
} from '@/lib/profile';
import {
  BASELINE_FREQ_NAMES,
  BASELINE_INTENSITY_NAMES,
  BASELINE_VOLUME_NAMES,
  BASELINE_WORKOUT_FREQ_NAMES,
  COMPETITION_LEVELS,
  THROWING_HANDS,
} from '@/lib/baseline';
import { TRAINING_LEVELS } from '@/lib/report/personalize';

/**
 * 로그인 · 회원가입.
 *
 * 구글 로그인처럼 넓은 카드 한 장을 쓴다. 넓은 화면에서는 왼쪽에 제목, 오른쪽에 칸, 오른쪽
 * 아래에 단추가 선다. 휴대폰에서는 카드 테두리를 걷고 화면 전체를 쓴다 — 제목은 위에,
 * 단추는 아래에 붙어서 단계를 넘겨도 제자리다. 어느 쪽이든 한 화면 안에 들어와 굴릴 일이
 * 없다(360×640 ~ 1920×1080 에서 모든 단계를 재어 봤다).
 *
 * 예전에는 좁은 카드(28rem) 하나에 가입 칸 열세 개와 동의를 다 늘어놓아 한참 굴려야 했다.
 * 이제 가입은 단계로 나뉜다 — 기본 정보 → 비밀번호 → 약관 → 이 앱에 필요한 질문 넷.
 */

const inputLarge = 'py-3.5 text-[15px] aria-invalid:border-danger';

/* ─────────────────────────── 공통 틀 ─────────────────────────── */

/**
 * 카드 한 장 — 왼쪽 제목, 오른쪽 칸, 오른쪽 아래 단추.
 *
 * titleKey 가 바뀌면 제목이 새로 떠오른다(단계가 넘어갈 때). progress 는 0~1, 주면 카드
 * 맨 위에 가는 막대로 얼마나 왔는지 보인다. counter('3 / 7')는 단추 줄 왼쪽에 흐리게.
 *
 * focusHeading — 로그인 ↔ 가입을 바꿔 이 카드가 새로 뜬 경우 제목에 초점을 둔다. 누른
 * 단추가 사라져 초점이 문서 밖으로 떨어지지 않게, 화면 낭독기가 '어느 화면인지'를 읽게.
 * 칸이 아니라 제목이라 휴대폰 자판이 튀어나오지 않는다.
 */
function AuthCard({
  title,
  desc,
  titleKey,
  progress,
  counter,
  focusHeading = false,
  children,
  footer,
}: {
  title: string;
  desc?: string;
  titleKey: string;
  progress?: number;
  counter?: string;
  focusHeading?: boolean;
  children: ReactNode;
  footer: ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusHeading) headingRef.current?.focus({ preventScroll: true });
    // 처음 뜰 때 한 번만 — 단계가 넘어갈 때는 칸으로 간다(SignupWizard)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    /*
     * 휴대폰(카드 테두리 없음)에서는 화면 높이를 다 쓰는 세로 줄이다. 가운데 맞춤을 하면
     * 단계마다 높이가 달라 로고 · 막대 · 단추가 매번 위아래로 튀었다. 이제 제목 묶음은 위에,
     * 단추 줄은 아래에 붙는다(칸 묶음이 남는 높이를 가진다).
     */
    <section className="relative flex flex-col max-md:min-h-full max-md:flex-1 md:overflow-hidden md:rounded-[28px] md:border md:border-line md:bg-surface md:shadow-[0_1px_2px_rgb(15_23_42/0.04),0_18px_48px_-24px_rgb(15_23_42/0.18)]">
      {progress != null && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1 overflow-hidden bg-line/50 max-md:rounded-full"
        >
          <div
            className="h-full rounded-r-full bg-sky transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-6 pt-5 short:gap-4 short:pt-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:gap-14 md:p-12 md:short:p-8 lg:gap-20 lg:p-14 lg:short:p-9">
        <header className="min-w-0">
          <Link
            href="/"
            className="group inline-flex items-center gap-2.5 rounded-lg"
            aria-label="Bullpen Log 첫 화면"
          >
            <BaseballMark className="h-8 w-8 md:h-9 md:w-9" />
            <span className="text-display text-xl leading-none text-ink transition-colors group-hover:text-sky md:text-2xl">
              BULLPEN LOG
            </span>
          </Link>

          <div key={titleKey} className="motion-safe:animate-fade-in">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-heading mt-6 text-[1.75rem] leading-[1.2] text-ink outline-none short:mt-4 short:text-2xl md:mt-10 md:text-[2.25rem] md:short:mt-6 md:short:text-[1.875rem]"
            >
              {title}
            </h1>
            {desc && (
              <p className="mt-2.5 max-w-md text-sm leading-relaxed break-keep text-muted md:mt-4 md:text-[15px] md:short:mt-2.5">
                {desc}
              </p>
            )}
          </div>
        </header>

        <div className="flex min-w-0 flex-1 flex-col md:min-h-[23.75rem] md:pt-2 md:short:min-h-[20.5rem]">
          <div className="flex-1">{children}</div>
          <div className="mt-6 flex items-center gap-2 short:mt-4 md:mt-10 md:short:mt-6">
            {counter && (
              <span className="text-xs tabular-nums text-muted" aria-hidden>
                {counter}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">{footer}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** 글자만 있는 단추 — 구글의 '계정 만들기'처럼 주 단추 옆에 가볍게 선다 */
function TextButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      /* sky 는 흰 바탕에서 글자로는 옅다(2.8:1) — 글자에는 한 단계 짙은 sky-strong */
      className="rounded-xl px-4 py-3 text-sm font-semibold text-sky-strong transition-colors hover:bg-sky/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-strong"
    >
      {children}
    </button>
  );
}

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
    <label className="inline-flex cursor-pointer items-center gap-2" title={title}>
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

function LoginForm({
  onSignup,
  focusHeading,
}: {
  onSignup: () => void;
  focusHeading: boolean;
}) {
  const [state, formAction] = useActionState<AuthState, FormData>(login, undefined);
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
      <AuthCard
        titleKey="login"
        title="로그인"
        desc="다시 오신 걸 환영합니다. 기록을 이어서 관리하려면 로그인하세요."
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
              placeholder="••••••••"
              required
              className={inputLarge}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
            <CheckLine
              ref={stayRef}
              name="stayLoggedIn"
              label="자동 로그인"
              title="브라우저를 닫아도 30일 동안 로그인이 유지됩니다. 공용 컴퓨터에서는 꺼주세요."
              onChange={(on) => saveLoginPrefs({ stayLoggedIn: on })}
            />
            <CheckLine
              ref={rememberRef}
              label="아이디 기억하기"
              title="다음에 올 때 이메일 칸을 채워 둡니다. 비밀번호는 저장하지 않습니다."
              onChange={rememberNow}
            />
          </div>
        </div>
      </AuthCard>
    </form>
  );
}

/* ─────────────────────────── 회원가입 ─────────────────────────── */

/**
 * 가입 단계. fields 는 그 단계에 있는 칸의 name — 서버가 마지막에 어느 칸을 막았는지
 * 알려 주면(AuthState.field) 그 칸이 있는 단계로 돌아간다.
 */
const STEPS = [
  {
    key: 'basic',
    title: '계정 만들기',
    desc: '생년월일은 나이에 맞는 안전한 투구수를, 성별은 영양 목표를 계산하는 데 씁니다.',
    fields: ['email', 'nickname', 'birthDate', 'sex'],
  },
  {
    key: 'password',
    title: '비밀번호 만들기',
    desc: '8자 이상이면 됩니다. 다른 곳에서 쓰지 않는 것으로 정해 주세요.',
    fields: ['password', 'passwordConfirm'],
  },
  {
    key: 'terms',
    title: '약관 동의',
    desc: '두 가지 모두 동의해야 가입할 수 있어요. 눌러서 내용을 볼 수 있습니다.',
    fields: ['agreeTerms', 'agreePrivacy'],
  },
  {
    key: 'body',
    title: '어느 손으로 던지세요?',
    desc: '이제 이 앱에 필요한 것을 몇 가지 여쭙니다. 모두 가입한 뒤 내 정보에서 바꿀 수 있어요.',
    fields: ['throwingHand', 'heightCm'],
  },
  {
    key: 'pitching',
    title: '평소 얼마나 던지시나요?',
    desc: '부하 지수를 첫날부터 보여드리기 위한 3문항입니다.',
    fields: ['baselineFreq', 'baselineVolume', 'baselineIntensity'],
  },
  {
    key: 'weight',
    title: '웨이트는 얼마나 하시나요?',
    desc: '운동 부하를 첫날부터 보여드리고 경력에 맞는 운동을 고르기 위한 2문항입니다.',
    fields: ['baselineWorkoutFreq', 'trainingLevel'],
  },
  {
    key: 'league',
    title: '어디서 야구를 하시나요?',
    desc: '안 고르셔도 됩니다. 훈련 내용을 바꾸는 값이 아니라, 나중에 비슷한 또래와 견줘 보여드리려고 여쭙습니다.',
    fields: ['competitionLevel'],
  },
] as const;

type StepKey = (typeof STEPS)[number]['key'];
const LAST = STEPS.length - 1;

/** 막힌 까닭을 적는 줄의 id — 문제의 칸이 aria-describedby 로 가리킨다 */
const PROBLEM_ID = 'signup-problem';

function stepOfField(field: string | undefined): number {
  const i = STEPS.findIndex((s) =>
    (s.fields as readonly string[]).includes(field ?? '')
  );
  return i === -1 ? 0 : i;
}

type Problem = { error: string; field: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 한 단계를 넘어가도 되는가 — 서버(app/actions/auth.ts · lib/profile.ts · lib/baseline.ts)와
 * 같은 기준을 먼저 본다. 여기서 놓치면 일곱 단계를 다 지나 마지막에야 막힌다.
 *
 * 브라우저의 기본 검사는 쓰지 않는다(폼이 noValidate). 모든 단계가 한 폼 안에 있어서,
 * 기본 검사를 켜 두면 아직 안 보인 단계의 빈칸 때문에 '다음'이 막힌다. required 는 화면
 * 낭독기에 '꼭 적을 칸'임을 알리려고 그대로 붙여 둔다.
 */
function checkStep(key: StepKey, form: HTMLFormElement, today: string): Problem | null {
  const fd = new FormData(form);
  const get = (name: string) => String(fd.get(name) ?? '').trim();
  switch (key) {
    case 'basic': {
      const email = get('email');
      if (!email) return { error: '이메일을 입력해주세요.', field: 'email' };
      if (!EMAIL_RE.test(email)) {
        return { error: '올바른 이메일 형식이 아닙니다.', field: 'email' };
      }
      const nickname = get('nickname');
      if (!nickname) return { error: '닉네임을 입력해주세요.', field: 'nickname' };
      if (nickname.length < 2) {
        return { error: '닉네임은 2자 이상이어야 합니다.', field: 'nickname' };
      }
      const birth = get('birthDate');
      if (!birth) return { error: '생년월일을 입력해주세요.', field: 'birthDate' };
      const parsed = parseBirthDate(birth);
      if (!parsed) {
        return { error: '생년월일을 올바르게 입력해주세요.', field: 'birthDate' };
      }
      const age = ageFromBirthDate(parsed);
      if (birth > today || age < MIN_AGE || age > MAX_AGE) {
        return { error: '생년월일을 다시 확인해주세요.', field: 'birthDate' };
      }
      if (!get('sex')) return { error: '성별을 선택해주세요.', field: 'sex' };
      return null;
    }
    case 'password': {
      const password = String(fd.get('password') ?? '');
      const confirm = String(fd.get('passwordConfirm') ?? '');
      if (password.length < 8) {
        return { error: '비밀번호는 8자 이상이어야 합니다.', field: 'password' };
      }
      if (!confirm) {
        return { error: '비밀번호를 한 번 더 입력해주세요.', field: 'passwordConfirm' };
      }
      if (password !== confirm) {
        return { error: '비밀번호가 일치하지 않습니다.', field: 'passwordConfirm' };
      }
      return null;
    }
    case 'terms':
      if (fd.get('agreeTerms') !== 'on') {
        return { error: '이용약관에 동의해주세요.', field: 'agreeTerms' };
      }
      if (fd.get('agreePrivacy') !== 'on') {
        return { error: '개인정보 처리방침에 동의해주세요.', field: 'agreePrivacy' };
      }
      return null;
    case 'body': {
      if (!get('throwingHand')) {
        return { error: '던지는 손을 선택해주세요.', field: 'throwingHand' };
      }
      /*
       * 숫자 칸에 숫자가 아닌 것을 치면 값이 빈 문자열로 읽혀 '안 적음'처럼 조용히
       * 버려진다(noValidate 라 브라우저도 안 막는다). badInput 으로 따로 본다.
       */
      const heightInput = form.elements.namedItem('heightCm');
      if (heightInput instanceof HTMLInputElement && heightInput.validity.badInput) {
        return { error: '키는 숫자로 입력해주세요.', field: 'heightCm' };
      }
      const height = get('heightCm');
      if (height) {
        const n = Number(height);
        if (!Number.isInteger(n) || n < MIN_HEIGHT_CM || n > MAX_HEIGHT_CM) {
          return {
            error: `키는 ${MIN_HEIGHT_CM}~${MAX_HEIGHT_CM}cm 사이의 정수로 입력해주세요.`,
            field: 'heightCm',
          };
        }
      }
      return null;
    }
    case 'pitching':
      if (!get('baselineFreq')) {
        return { error: '던지는 횟수를 선택해주세요.', field: 'baselineFreq' };
      }
      if (!get('baselineVolume')) {
        return { error: '한 번에 던지는 양을 선택해주세요.', field: 'baselineVolume' };
      }
      if (!get('baselineIntensity')) {
        return { error: '평소 강도를 선택해주세요.', field: 'baselineIntensity' };
      }
      return null;
    case 'weight':
      if (!get('baselineWorkoutFreq')) {
        return { error: '웨이트 횟수를 선택해주세요.', field: 'baselineWorkoutFreq' };
      }
      if (!get('trainingLevel')) {
        return {
          error: '웨이트 트레이닝 경력을 선택해주세요.',
          field: 'trainingLevel',
        };
      }
      return null;
    case 'league':
      return null;
  }
}

/** 문제의 칸에 붙이는 속성 — 빨간 테두리(aria-invalid)와 까닭을 적은 줄로의 연결 */
function invalidProps(invalid: boolean) {
  return invalid
    ? { 'aria-invalid': true as const, 'aria-describedby': PROBLEM_ID }
    : {};
}

/**
 * 고르는 단추 묶음 — 가입 문진용.
 *
 * 앱 안의 칩보다 크게 둔다. 넓은 카드에 몇 개 없는 선택지라 누르기 쉬운 것이 먼저다.
 * 묶음 이름은 칸 이름(Field)과 같은 모양이다 — 한 단계에 둘이 섞여 있다.
 * list 는 설명이 붙는 항목(웨이트 경력)을 두 줄 카드로 늘어놓는다.
 */
function Choices({
  legend,
  name,
  options,
  selected,
  list = false,
  required = false,
  invalid = false,
}: {
  legend: string;
  name: string;
  options: readonly (string | { name: string; value?: string; desc?: string })[];
  selected?: string;
  list?: boolean;
  required?: boolean;
  invalid?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-2 block text-xs font-medium text-muted">{legend}</legend>
      {/* list 도 휴대폰에서 두 줄 — 한 줄에 하나면 작은 폰에서 화면을 넘겨 굴려야 했다 */}
      <div className={list ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}>
        {options.map((raw) => {
          const option = typeof raw === 'string' ? { name: raw } : raw;
          const value = option.value ?? option.name;
          return (
            <label key={value} className={list ? 'block' : 'inline-flex'}>
              <input
                type="radio"
                name={name}
                value={value}
                required={required}
                defaultChecked={selected === value}
                className="peer sr-only"
                {...invalidProps(invalid)}
              />
              <span
                className={`block cursor-pointer rounded-xl border bg-surface-2 text-sm text-muted transition-colors select-none hover:border-sky-soft hover:text-ink peer-checked:border-sky peer-checked:bg-sky/10 peer-checked:text-sky-strong peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-strong ${
                  invalid ? 'border-danger/60' : 'border-line'
                } ${
                  list
                    ? 'h-full px-3.5 py-2.5 sm:px-4'
                    : 'px-4 py-2.5 peer-checked:font-semibold'
                }`}
              >
                <span className={list ? 'block font-semibold' : undefined}>
                  {option.name}
                </span>
                {option.desc && (
                  <span className="mt-0.5 block text-xs leading-snug opacity-75">
                    {option.desc}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** 약관 동의 한 줄 — 켜고 끄는 것은 부모가 쥔다(모두 동의와 함께 움직인다) */
function AgreeLine({
  name,
  checked,
  onChange,
  invalid,
  children,
}: {
  name: string;
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
        checked={checked}
        required
        data-sync={checked ? 'on' : 'off'}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-sky"
        {...invalidProps(invalid)}
      />
      <span className="leading-relaxed break-keep">{children}</span>
    </label>
  );
}

/** 이 칸에서 Enter 를 누르면 '다음 칸'으로 가는가 — 글을 치는 칸만 */
function isTextLike(el: Element): el is HTMLInputElement {
  return (
    el instanceof HTMLInputElement &&
    ['text', 'email', 'password', 'date', 'number'].includes(el.type)
  );
}

function SignupWizard({
  today,
  onLogin,
  focusHeading,
}: {
  today: string;
  onLogin: () => void;
  focusHeading: boolean;
}) {
  const [state, formAction] = useActionState<AuthState, FormData>(signup, undefined);
  const before = state?.values;
  const formRef = useRef<HTMLFormElement>(null);

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<'next' | 'back'>('next');
  const [checking, setChecking] = useState(false);
  /* 지금 보여 줄 문제 — 같은 문제가 다시 나도 다시 읽히고 초점이 가도록 번호(seq)를 붙인다 */
  const [problem, setProblem] = useState<(Problem & { seq: number }) | null>(null);
  /* 단계를 옮긴 것이 사람의 손(다음 · 이전 · 되돌림)인가 — 그때만 새 단계로 초점을 옮긴다 */
  const moved = useRef(false);

  /*
   * 비밀번호와 동의는 상태로 쥔다.
   *
   * 가입이 서버에서 막혀 돌아오면 React 가 폼을 처음 값으로 되돌린다. 다른 칸은 서버가
   * 돌려준 값(before)으로 다시 채워지지만 비밀번호는 돌려받지 않는다(lib/form-values.ts).
   * 단계로 나뉜 뒤로는 그러면 이메일 하나 고치러 첫 단계로 갔다가 비밀번호 단계에서 다시
   * 막힌다. 상태로 쥐고 있으면 되돌려도 그대로다. 동의 둘은 '모두 동의'와 같이 움직여야 해서.
   */
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);

  function show(p: Problem) {
    setProblem((prev) => ({ ...p, seq: (prev?.seq ?? 0) + 1 }));
  }
  const invalid = (name: string) => problem?.field === name;

  /* 서버가 막고 돌아오면 그 칸이 있는 단계로 (그리는 도중 상태 보정) */
  const [seenState, setSeenState] = useState<AuthState>(undefined);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.error) {
      const at = stepOfField(state.field);
      setDir(at < step ? 'back' : 'next');
      setStep(at);
      show({ error: state.error, field: state.field ?? STEPS[at].fields[0] });
    }
  }

  /*
   * 서버가 막고 돌아오면 React 가 폼을 처음 값으로 되돌린다(form.reset). 손에 쥔
   * 체크박스(동의 셋 · 비밀번호 표시)는 그때 화면만 꺼지고 상태는 켜진 채로 남아, '모두
   * 동의'는 켜져 있는데 아래 둘은 꺼져 보였다. 되돌린 직후(같은 그림 안) 상태대로 다시
   * 칠한다 — data-sync 가 그 체크박스의 지금 상태다.
   */
  useLayoutEffect(() => {
    formRef.current
      ?.querySelectorAll<HTMLInputElement>('input[data-sync]')
      .forEach((el) => {
        el.checked = el.dataset.sync === 'on';
      });
  }, [state]);

  /** 묶음(라디오)이면 고른 것에, 아니면 그 칸에 */
  function focusField(target: RadioNodeList | Element | null | undefined) {
    const el =
      target instanceof RadioNodeList
        ? (Array.from(target).find((r) => (r as HTMLInputElement).checked) ?? target[0])
        : target;
    if (el instanceof HTMLElement) el.focus({ preventScroll: true });
  }

  /*
   * 단계가 바뀌면 새 단계의 첫 칸(고른 것이 있으면 그것)으로 초점을 옮긴다 — 키보드로 쓰는
   * 사람이 이전 단계의 숨은 단추에 남지 않게. 처음 뜰 때(로그인에서 넘어온 순간)는 옮기지
   * 않는다 — 그때는 제목이 초점을 받는다(AuthCard).
   */
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    const panel = formRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    const first = panel?.querySelector<HTMLInputElement>('input:not([type=hidden])');
    if (first?.type === 'radio') {
      focusField(formRef.current?.elements.namedItem(first.name));
    } else {
      first?.focus({ preventScroll: true });
    }
  }, [step]);

  /*
   * 문제가 난 칸으로 초점을 옮긴다. 위(단계의 첫 칸)보다 뒤에 둔다 — 서버가 막아 단계를
   * 되돌릴 때는 둘이 한꺼번에 도는데, 첫 칸이 아니라 문제의 칸에 가 있어야 한다.
   */
  useEffect(() => {
    if (!problem) return;
    focusField(formRef.current?.elements.namedItem(problem.field));
  }, [problem]);

  function goTo(i: number, direction: 'next' | 'back') {
    moved.current = true;
    setDir(direction);
    setStep(i);
  }

  async function next() {
    const form = formRef.current;
    if (!form || checking) return;
    const found = checkStep(STEPS[step].key, form, today);
    if (found) return show(found);

    /* 첫 단계에서 이메일이 이미 가입된 것인지 미리 본다 — 끝까지 가서 막히지 않게 */
    if (STEPS[step].key === 'basic') {
      const email = String(new FormData(form).get('email') ?? '').trim();
      setChecking(true);
      try {
        const res = await checkSignupEmail(email);
        if (res.error) return show({ error: res.error, field: 'email' });
      } catch {
        /* 확인을 못 했으면 그냥 넘어간다 — 마지막에 서버가 다시 본다 */
      } finally {
        setChecking(false);
      }
    }
    setProblem(null);
    goTo(Math.min(LAST, step + 1), 'next');
  }

  function back() {
    setProblem(null);
    goTo(Math.max(0, step - 1), 'back');
  }

  /** 마지막 단계에서 보내기 전에 모든 단계를 한 번 더 본다 */
  function allGood(): boolean {
    const form = formRef.current;
    if (!form) return false;
    for (let i = 0; i < STEPS.length; i++) {
      const found = checkStep(STEPS[i].key, form, today);
      if (found) {
        if (i !== step) goTo(i, i < step ? 'back' : 'next');
        show(found);
        return false;
      }
    }
    return true;
  }

  /*
   * 칸에서 Enter — 이 단계에 다음 칸이 남아 있으면 그리로, 마지막 칸이면 '다음'.
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
    if (step < LAST) void next();
    else if (allGood()) formRef.current?.requestSubmit();
  }

  const current = STEPS[step];
  const enter =
    dir === 'next' ? 'motion-safe:animate-step-next' : 'motion-safe:animate-step-back';

  /* 단계 한 칸 — 지금 것만 보인다. 숨었다 보이는 순간 들어오는 움직임이 다시 돈다. */
  const panel = (i: number, children: ReactNode) => (
    <div data-step={i} hidden={i !== step} className={i === step ? enter : undefined}>
      {children}
    </div>
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      onKeyDown={onKeyDown}
      /* 고치기 시작하면 막힌 까닭을 걷는다 — 다시 '다음'을 누르면 그때 다시 본다 */
      onChange={() => {
        if (problem) setProblem(null);
      }}
      className="flex flex-1 flex-col"
    >
      <AuthCard
        titleKey={current.key}
        title={current.title}
        desc={current.desc}
        progress={(step + 1) / STEPS.length}
        counter={`${step + 1} / ${STEPS.length}`}
        focusHeading={focusHeading}
        footer={
          <>
            {step === 0 ? (
              <TextButton onClick={onLogin}>로그인하기</TextButton>
            ) : (
              <TextButton onClick={back}>이전</TextButton>
            )}
            {step < LAST ? (
              <Button
                type="button"
                onClick={() => void next()}
                disabled={checking}
                className="min-w-28"
              >
                {checking ? '확인 중…' : '다음'}
              </Button>
            ) : (
              <SubmitButton
                label="가입하고 시작하기"
                pendingLabel="가입하는 중…"
                onClick={(e) => {
                  /* 보내기 전에 모든 단계를 다시 본다 — 막히면 그 단계로 */
                  if (!allGood()) e.preventDefault();
                }}
              />
            )}
          </>
        }
      >
        {/* 화면 낭독기에 단계가 넘어간 것을 알린다 */}
        <p className="sr-only" aria-live="polite">
          {`${STEPS.length}단계 중 ${step + 1}단계, ${current.title}`}
        </p>

        {panel(
          0,
          <div className="space-y-4 md:space-y-5">
            <Field label="이메일">
              <Input
                name="email"
                type="email"
                autoComplete="email"
                required
                /* 이미 가입된 이메일인지 보는 동안에는 고칠 수 없게 — 본 것과 넘어간 것이 같게 */
                readOnly={checking}
                defaultValue={kept(before, 'email')}
                placeholder="pitcher@example.com"
                className={inputLarge}
                {...invalidProps(invalid('email'))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="닉네임">
                <Input
                  name="nickname"
                  type="text"
                  autoComplete="nickname"
                  required
                  defaultValue={kept(before, 'nickname')}
                  placeholder="불펜지기"
                  className={inputLarge}
                  {...invalidProps(invalid('nickname'))}
                />
              </Field>
              {/* 나이는 안전한 투구수 한도를 정하는 기준이라 가입할 때 받는다 */}
              <Field label="생년월일">
                <Input
                  name="birthDate"
                  type="date"
                  required
                  defaultValue={kept(before, 'birthDate')}
                  max={today}
                  className={inputLarge}
                  {...invalidProps(invalid('birthDate'))}
                />
              </Field>
            </div>
            {/*
              성별 — 영양 목표(기초대사량)를 계산하는 기준이라 가입할 때 받는다.
              몸에 대한 사실이라 계정에 두고, 바꾸는 것도 내 정보 한 곳에서만 한다.
            */}
            <Choices
              legend="성별"
              name="sex"
              options={SEX_OPTIONS}
              selected={kept(before, 'sex')}
              required
              invalid={invalid('sex')}
            />
          </div>
        )}

        {panel(
          1,
          <div className="space-y-4 md:space-y-5">
            <Field label="비밀번호" hint="8자 이상">
              <Input
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
                required
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="••••••••"
                className={inputLarge}
                {...invalidProps(invalid('passwordConfirm'))}
              />
            </Field>
            <label className="inline-flex cursor-pointer items-center gap-2 pt-1">
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
          동의 두 가지.
          받는 정보를 보면 그냥 넘어갈 수준이 아니다 — 생년월일, 키, 통증 부위,
          투구 기록, 영상. 통증 기록은 건강에 관한 정보라 따로 동의를 받는다.
          미리 체크해 두지 않는다. 눌러서 동의한 것과 켜져 있어서 넘어간 것은 다르다.
          '모두 동의'는 둘을 한 번에 켜고 끄는 편의일 뿐, 따로 보내는 값이 없다.
        */}
        {panel(
          2,
          <div className="rounded-2xl border border-line bg-surface-2/60 p-3">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl px-1 py-2 text-[15px] font-semibold text-ink">
              <input
                type="checkbox"
                checked={agreeTerms && agreePrivacy}
                data-sync={agreeTerms && agreePrivacy ? 'on' : 'off'}
                onChange={(e) => {
                  setAgreeTerms(e.target.checked);
                  setAgreePrivacy(e.target.checked);
                }}
                className="h-5 w-5 shrink-0 cursor-pointer accent-sky"
              />
              모두 동의합니다
            </label>
            <div className="my-2 border-t border-line" />
            <AgreeLine
              name="agreeTerms"
              checked={agreeTerms}
              onChange={setAgreeTerms}
              invalid={invalid('agreeTerms')}
            >
              <Link
                href="/terms"
                target="_blank"
                className="font-medium text-sky-strong underline"
              >
                이용약관
              </Link>
              에 동의합니다. <span className="text-muted">(필수)</span>
            </AgreeLine>
            <AgreeLine
              name="agreePrivacy"
              checked={agreePrivacy}
              onChange={setAgreePrivacy}
              invalid={invalid('agreePrivacy')}
            >
              <Link
                href="/privacy"
                target="_blank"
                className="font-medium text-sky-strong underline"
              >
                개인정보 처리방침
              </Link>
              에 동의합니다. 여기에는 어깨·팔꿈치 통증 같은{' '}
              <strong>건강에 관한 정보</strong>가 들어갑니다.{' '}
              <span className="text-muted">(필수)</span>
            </AgreeLine>
          </div>
        )}

        {panel(
          3,
          <div className="space-y-4 md:space-y-5">
            <Choices
              legend="던지는 손"
              name="throwingHand"
              options={THROWING_HANDS}
              selected={kept(before, 'throwingHand')}
              required
              invalid={invalid('throwingHand')}
            />
            <Field label="키 (cm)" hint="선택 — 나중에 적어도 됩니다.">
              <Input
                name="heightCm"
                type="number"
                inputMode="numeric"
                defaultValue={kept(before, 'heightCm')}
                min={MIN_HEIGHT_CM}
                max={MAX_HEIGHT_CM}
                step={1}
                placeholder="예: 178"
                className={`${inputLarge} max-w-40`}
                {...invalidProps(invalid('heightCm'))}
              />
            </Field>
          </div>
        )}

        {/* 평소 투구량 — 이 답으로 부하 지수를 첫날부터 계산한다 */}
        {panel(
          4,
          <div className="space-y-4 md:space-y-5">
            <Choices
              legend="던지는 횟수"
              name="baselineFreq"
              options={BASELINE_FREQ_NAMES}
              selected={kept(before, 'baselineFreq')}
              required
              invalid={invalid('baselineFreq')}
            />
            <Choices
              legend="한 번에 던지는 양"
              name="baselineVolume"
              options={BASELINE_VOLUME_NAMES}
              selected={kept(before, 'baselineVolume')}
              required
              invalid={invalid('baselineVolume')}
            />
            <Choices
              legend="평소 강도"
              name="baselineIntensity"
              options={BASELINE_INTENSITY_NAMES}
              selected={kept(before, 'baselineIntensity')}
              required
              invalid={invalid('baselineIntensity')}
            />
          </div>
        )}

        {/*
          웨이트 빈도 — 투구와 같은 이유로 받는다. 이게 없으면 운동 부하 지수만
          28일을 기다려야 한다.
          웨이트 경력 — 트레이닝이 경력에 비해 이른 운동을 빼는 기준이다
          (lib/report/personalize.ts). 트레이닝 설정의 경력 칸과 같은 값이라, 가입하고
          나면 거기에 그대로 보인다.
        */}
        {panel(
          5,
          <div className="space-y-4 md:space-y-5">
            <Choices
              legend="웨이트 횟수"
              name="baselineWorkoutFreq"
              options={BASELINE_WORKOUT_FREQ_NAMES}
              selected={kept(before, 'baselineWorkoutFreq')}
              required
              invalid={invalid('baselineWorkoutFreq')}
            />
            <Choices
              legend="웨이트 트레이닝 경력"
              name="trainingLevel"
              options={TRAINING_LEVELS}
              selected={kept(before, 'trainingLevel')}
              list
              required
              invalid={invalid('trainingLevel')}
            />
          </div>
        )}

        {/*
          수준. 지금은 아무 계산에도 안 쓴다 — 나이는 생년월일로 이미 알고 안전 한도도
          거기서 나온다. 나중에 또래와 견주려고 모으는 값이라 안 골라도 가입이 된다.
        */}
        {panel(
          6,
          <Choices
            legend="소속"
            name="competitionLevel"
            options={COMPETITION_LEVELS}
            selected={kept(before, 'competitionLevel')}
            invalid={invalid('competitionLevel')}
          />
        )}

        {/*
          막힌 까닭 — 칸들 밑, 단추 바로 위에 한 줄로. 방금 누른 단추 곁이라 눈이 바로 가고,
          문제의 칸은 초점과 빨간 테두리(aria-invalid)로 따로 짚는다. 예전처럼 맨 위에 상자로
          띄우면 작은 화면에서는 그 높이만큼 화면을 넘겨 굴려야 했다. key 로 새로 그려, 같은
          문제가 다시 나도 화면 낭독기가 다시 읽는다.
        */}
        {problem && (
          <p
            key={problem.seq}
            id={PROBLEM_ID}
            role="alert"
            className="mt-4 flex items-start gap-1.5 text-[13px] leading-5 text-danger md:text-sm"
          >
            <CircleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            {problem.error}
          </p>
        )}
      </AuthCard>
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
