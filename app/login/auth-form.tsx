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
  useSyncExternalStore,
} from 'react';
import { createPortal, useFormStatus } from 'react-dom';
import { CalendarDays, Info } from '@/components/icon';
import { useTodayKey } from '@/components/use-today-key';
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
import { NumberUnitField } from '@/components/onboarding/number-unit-field';
import { RevealField } from '@/components/onboarding/reveal-field';
import { useStepWizard } from '@/components/onboarding/use-step-wizard';
import {
  MAX_AGE,
  MAX_HEIGHT_CM,
  MAX_WEIGHT_KG,
  MIN_AGE,
  MIN_HEIGHT_CM,
  MIN_WEIGHT_KG,
  SEX_OPTIONS,
} from '@/lib/profile';
import {
  EMAIL_RE,
  EMPTY_SIGNUP as EMPTY,
  SIGNUP_KIND_OPTIONS,
  checkWebSignupStep as checkStep,
  heightOk,
  isMasterKind,
  orgKindOf,
  signupStepsOf,
  webStepOfField as stepOfField,
  type SignupAnswers,
  type WebSignupStep as StepKey,
} from '@/lib/signup-check';
import {
  ORG_NAME_MAX,
  ORG_NOTE_MAX,
  ORG_REGION_MAX,
  normalizeInviteCode,
  orgNameOk,
} from '@/lib/org/rules';

/**
 * 로그인 · 회원가입.
 *
 * 구글 로그인처럼 넓은 카드 한 장을 쓴다(components/onboarding/step-card.tsx). 넓은 화면에서는 왼쪽에 제목,
 * 오른쪽에 칸, 오른쪽 아래에 단추가 선다. 휴대폰에서는 카드 테두리를 걷고 화면 전체를 쓴다.
 *
 * 가입은 여섯 화면이다(2026-10-09 재설계 — 투구 · 웨이트 · 영양 질문은 가입에서 빠져 각 탭의 첫 설정이 됐다,
 * lib/feature-locks.ts). 이름 · 이메일 → 생년월일 · 성별 → 키 · 몸무게 → 비밀번호 · 확인 → 소속 → 약관.
 * 두 칸이 한 화면에 있는 네 화면은 위 칸을 채우면 아래 칸이 펴진다(components/onboarding/reveal-field.tsx) —
 * 처음에는 한 칸만 보여 묻는 것이 적어 보이고, 펴진 칸은 다시 접히지 않는다.
 *
 * 답은 모두 상태(answers)로 쥐고(components/onboarding/use-step-wizard.ts) 숨은 칸으로 서버에 보낸다. 그래서
 * 서버가 막고 돌아와 폼이 되돌려져도 적은 것이 그대로고, 막힌 칸이 있는 화면으로 돌아갈 수 있다.
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
  '브라우저를 닫아도 30일 동안 로그인이 유지돼요. 공용 컴퓨터에서는 꺼 주세요.';
const REMEMBER_HINT = '다음에 올 때 이메일 칸을 채워 둬요. 비밀번호는 저장하지 않아요.';

/**
 * 주소의 칸 하나(?next= · ?signup=) — 이 화면은 미리 만들어져 서버는 모른다. useSyncExternalStore 로 붙은 뒤에만 읽어 수화가 어긋나지 않는다
 * (useTodayKey 와 같은 꼴). 2026-10-20 덕아웃: '로그인하고 채팅하기' 가 돌아올 곳을 들고 온다.
 */
function useQueryParam(name: string): string | null {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('popstate', cb);
      return () => window.removeEventListener('popstate', cb);
    },
    () => new URLSearchParams(window.location.search).get(name),
    () => null
  );
}

function LoginForm({
  onSignup,
  focusHeading,
}: {
  onSignup: () => void;
  focusHeading: boolean;
}) {
  const next = useQueryParam('next');
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
        desc="기록을 이어서 보려면 로그인해 주세요."
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

          {next && <input type="hidden" name="next" value={next} />}
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

/** 어느 칸의 문제도 아닌 것(신호 끊김) — 빨갛게 칠할 칸은 없고, 마지막 화면의 보내기 단추 곁에 까닭만 보인다 */
const WHOLE_FORM = 'form';

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
        id={`${name}-field`}
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
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-surface-2 px-4 py-3.5 text-left text-subhead transition-colors focus:border-sky focus:outline-none ${
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
   * 통째로 사라졌다. 이제 누른 자리(약관 화면)에 한 줄로 알리고 적은 것은 그대로다(lib/action-offline.ts).
   */
  const [state, formAction] = useActionState<AuthState, FormData>(
    guardFormAction(signup, { field: WHOLE_FORM }),
    undefined
  );
  const formRef = useRef<HTMLFormElement>(null);

  /* 차례는 종류에 따라 다르다(lib/signup-check.ts signupStepsOf) — 선수 다섯, 레슨장 · 팀 넷(2026-10-20) */
  const w = useStepWizard<StepKey, SignupAnswers>({
    initial: EMPTY,
    steps: (a) => signupStepsOf(a),
    check: (key, a) => checkStep(key, a, today),
    stepOfField,
  });
  const { answers, step, focusField } = w;
  const [checking, setChecking] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  /* 약관 · 개인정보 창(LegalSheet) */
  const legal = useModalState<LegalDoc>();

  /* ── 답에서 셈하는 것 ── */
  const name = answers.nickname.trim();
  const who = name ? `${name} 님, ` : '';
  /* 레슨장 · 팀(마스터) 가입인가 — 조직 화면의 말과 마지막 단추가 다르다 */
  const master = isMasterKind(answers.kind);
  const orgWord = answers.kind === 'team' ? '팀' : '레슨장';
  /* 코치로 합류(스태프 코드) — 코드가 맞는 꼴이면 조직 이름 칸은 선택이 된다 */
  const joiningAsStaff = normalizeInviteCode(answers.staffCode) != null;
  const last = w.total - 1;
  const invalid = (field: string) => w.problem?.field === field;

  /* 서버가 막고 돌아오면 그 칸이 있는 화면으로 (그리는 도중 상태 보정) */
  const [seenState, setSeenState] = useState<AuthState>(undefined);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.error) {
      w.setProblem({ error: state.error, field: state.field ?? WHOLE_FORM });
    }
  }

  /*
   * 서버가 막고 돌아오면 React 가 폼을 처음 값으로 되돌린다(form.reset). 손에 쥔 체크박스(동의 · 비밀번호 표시)는
   * 그때 화면만 꺼지고 상태는 켜진 채로 남는다. 되돌린 직후(같은 그림 안) 상태대로 다시 칠한다 — data-sync 가 그
   * 체크박스의 지금 상태다. 글 칸 · 숨은 칸은 React 가 value 속성까지 맞춰 둬서 되돌려도 그대로다.
   */
  useLayoutEffect(() => {
    formRef.current
      ?.querySelectorAll<HTMLInputElement>('input[data-sync]')
      .forEach((el) => {
        el.checked = el.dataset.sync === 'on';
      });
  }, [state]);

  /*
   * 화면이 바뀌면 새 화면의 첫 칸(고른 것이 있으면 그것)으로 초점을 옮긴다 — 키보드로 쓰는 사람이 이전 화면의
   * 숨은 단추에 남지 않게. 처음 뜰 때(로그인에서 넘어온 순간)는 옮기지 않는다 — 그때는 제목이 초점을 받는다(StepCard).
   * 서버가 막아 다른 화면으로 돌아온 때는 훅이 한 그림 뒤에 문제의 칸으로 다시 옮긴다(use-step-wizard.ts).
   * 긴 화면에서 다음을 누른 뒤에는 위로 돌아간다.
   *
   * 첫 칸은 글 칸 · 고르는 묶음(data-field) · 달력 단추(aria-haspopup)만 본다. 단위 고르개(components/segmented.tsx,
   * button[role=radio])는 안 본다 — 키 · 몸무게 화면에서 cm｜in 고르개가 키 칸보다 DOM 에서 앞이라, 넣어 두면 초점이
   * 키 칸이 아니라 단위 단추에 앉고 화살표를 누르면 단위가 바뀌었다. 고르는 묶음의 단추는 묶음(data-field)이 받는다.
   */
  const shown = useRef(step);
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    if (window.scrollY > 0) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    }
    const panel = formRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    const first = panel?.querySelector<HTMLElement>(
      '[data-field], input:not([type=hidden]), button[aria-haspopup], textarea'
    );
    if (!first) return;
    if (first.dataset.field !== undefined) return focusField(first.dataset.field);
    first.focus({ preventScroll: true });
  }, [step, focusField]);

  /*
   * 다음 화면으로. 첫 화면에서는 이미 가입된 이메일인지 미리 본다(checkSignupEmail) — 끝까지 가서 막히지 않게.
   * 훅의 next 가 보는 검사를 여기서 먼저 돌린다: 형식이 틀린 이메일로 서버를 부르지 않게.
   */
  async function next() {
    if (checking || w.index >= last) return;
    if (step === 'name') {
      const found = checkStep('name', answers, today);
      if (found) return w.setProblem(found);
      setChecking(true);
      try {
        const res = await checkSignupEmail(answers.email.trim());
        if (res.error) return w.setProblem({ error: res.error, field: 'email' });
      } catch {
        /* 확인을 못 했으면 그냥 넘어간다 — 마지막에 서버가 다시 본다 */
      } finally {
        setChecking(false);
      }
    }
    w.next();
  }

  /** 마지막 화면에서 보내기 전에 모든 화면을 한 번 더 본다 — 막히면 그 화면으로 */
  function allGood(): boolean {
    for (const key of w.visible) {
      const found = checkStep(key, answers, today);
      if (found) {
        w.setProblem(found);
        return false;
      }
    }
    return true;
  }

  /*
   * 칸에서 Enter — 이 화면에 다음 칸이 남아 있으면 그리로, 마지막 칸이면 '다음'.
   * 아직 안 펴진 칸은 그려져 있지 않아 다음 칸으로 치지 않는다 — 비밀번호 칸에서 Enter 를 눌렀는데 확인 칸이
   * 비었다고 '일치하지 않아요'가 뜨지 않고, 8자 이상이어야 한다고 짚는다.
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
    if (w.index < last) void next();
    else if (allGood()) formRef.current?.requestSubmit();
  }

  /* ── 제목 ── */
  function titleOf(key: StepKey): { title: string; desc: string } {
    switch (key) {
      case 'kind':
        return {
          title: '불펜로그를 어떻게 쓰실 건가요?',
          desc: '선수는 내 기록을 남기고, 레슨장 · 팀은 선수들의 기록을 관리해요. 가입한 뒤에는 바꿀 수 없어요.',
        };
      case 'name':
        return {
          title: '계정을 만들어요',
          desc: master
            ? '관리에 쓸 이름(대표 · 감독 · 코치), 로그인에 쓸 이메일과 비밀번호를 정해 주세요.'
            : '앱에서 부를 이름, 로그인에 쓸 이메일과 비밀번호를 정해 주세요.',
        };
      case 'org':
        return {
          title: `${orgWord} 이름을 알려 주세요`,
          desc: `${answers.kind === 'team' ? '선수가' : '회원이'} 초대 코드로 참여할 때 보는 이름이에요. 지역과 소개는 나중에 설정에서 바꿀 수 있어요.`,
        };
      case 'birth':
        return {
          title: `${who}언제 태어나셨어요?`,
          desc: '나이에 맞는 하루 투구 한도를 정해요. 성별은 영양 계산에 써요.',
        };
      case 'body':
        return {
          title: '키와 몸무게를 알려 주세요',
          desc: '몸무게는 오늘 첫 체중 기록이 돼요. 둘 다 내 정보에서 바꿀 수 있어요.',
        };
      case 'terms':
        return {
          title: '약관을 확인해 주세요',
          desc: '둘 다 동의하면 시작해요. 누르면 내용을 볼 수 있어요.',
        };
    }
  }
  const heading = titleOf(step);

  const enter =
    w.dir === 'next'
      ? 'motion-safe:animate-step-next'
      : 'motion-safe:animate-step-back';

  /* 화면 한 칸 — 지금 것만 보인다. 숨었다 보이는 순간 들어오는 움직임이 다시 돈다. */
  const panel = (key: StepKey, children: ReactNode) => (
    <div
      key={key}
      data-step={key}
      hidden={key !== step}
      className={key === step ? enter : undefined}
    >
      {children}
    </div>
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      onKeyDown={onKeyDown}
      className="flex flex-1 flex-col"
    >
      <StepCard
        titleKey={step}
        title={heading.title}
        desc={heading.desc}
        progress={(w.index + 1) / w.total}
        counter={`${w.index + 1} / ${w.total}`}
        focusHeading={focusHeading}
        footer={
          <>
            {w.index === 0 ? (
              <TextButton onClick={onLogin}>로그인하기</TextButton>
            ) : (
              <TextButton onClick={w.back}>이전</TextButton>
            )}
            {w.index < last ? (
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
                label={master ? '가입하고 관리 시작하기' : '가입하고 시작하기'}
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
          {`${w.total}단계 중 ${w.index + 1}단계, ${heading.title}`}
        </p>

        {/*
          서버로 가는 숨은 칸 — 단추로 고른 답(상태)을 폼에 싣는다. 글 칸(이름 · 이메일 · 비밀번호)과 생년월일 ·
          키 · 몸무게 · 동의는 제 화면 안의 칸이 보낸다.
        */}
        <input type="hidden" name="sex" value={answers.sex ?? ''} />
        {/* 계정 종류 — 레슨장 · 팀이면 'MASTER'(서버가 조직을 함께 만든다, app/actions/auth.ts trySignupMaster). 선수는 빈 값 */}
        <input type="hidden" name="accountType" value={master ? 'MASTER' : ''} />
        <input type="hidden" name="orgKind" value={orgKindOf(answers.kind) ?? ''} />

        {/* ── 0 계정 종류 — 선수 · 레슨장 · 팀(2026-10-20). 레슨장 · 팀은 선수 칸(생년월일 · 키 · 몸무게) 대신 조직 화면으로 ── */}
        {panel(
          'kind',
          <OptionCards
            name="kind"
            label="계정 종류"
            options={SIGNUP_KIND_OPTIONS}
            value={answers.kind}
            onChange={(kind) => w.patch({ kind })}
            columns={1}
            invalid={invalid('kind')}
            foot="레슨장 · 팀 계정에는 선수 기능이 없어요. 선수로도 쓰려면 선수 계정을 따로 만들어 주세요."
          />
        )}

        {/* ── 1 이름 · 이메일 · 비밀번호 — 위 칸이 맞으면 아래 칸이 펴진다 ── */}
        {panel(
          'name',
          <div>
            <Field label="이름 · 별명">
              <Input
                name="nickname"
                type="text"
                autoComplete="nickname"
                required
                /*
                 * 이미 가입된 이메일인지 보는 동안(checking)에는 이 화면의 두 칸 다 고칠 수 없게 — next 는 기다린 뒤
                 * 누른 순간의 답으로 넘어가서, 기다리는 사이 이름을 지우면 빈 이름으로 다음 화면에 갔다.
                 */
                readOnly={checking}
                value={answers.nickname}
                onChange={(e) => w.patch({ nickname: e.target.value })}
                placeholder="불펜지기"
                maxLength={20}
                className={inputLarge}
                {...invalidProps(invalid('nickname'))}
              />
            </Field>
            <RevealField open={name.length >= 2}>
              <div className="pt-5">
                <Field label="이메일">
                  <Input
                    name="email"
                    type="email"
                    autoComplete="email"
                    {...noAutoFix}
                    required
                    /* 보는 동안에는 고칠 수 없게 — 서버가 본 이메일과 넘어간 이메일이 같게(이름 칸과 같은 까닭) */
                    readOnly={checking}
                    value={answers.email}
                    onChange={(e) => w.patch({ email: e.target.value })}
                    placeholder="pitcher@example.com"
                    className={inputLarge}
                    {...invalidProps(invalid('email'))}
                  />
                </Field>
              </div>
            </RevealField>
            {/* 이메일이 맞는 꼴이면 비밀번호가 펴진다 · 8자가 되면 확인 칸이 펴진다 */}
            <RevealField open={EMAIL_RE.test(answers.email.trim())}>
              <div className="pt-5">
                <Field label="비밀번호" hint="8자 이상">
                  <Input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    {...noAutoFix}
                    required
                    minLength={8}
                    value={answers.password}
                    onChange={(e) => w.patch({ password: e.target.value })}
                    placeholder="••••••••"
                    className={inputLarge}
                    {...invalidProps(invalid('password'))}
                  />
                </Field>
                <RevealField open={answers.password.length >= 8}>
                  <div className="pt-4 md:pt-5">
                    <Field label="비밀번호 확인">
                      <Input
                        name="passwordConfirm"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        {...noAutoFix}
                        required
                        value={answers.passwordConfirm}
                        onChange={(e) => w.patch({ passwordConfirm: e.target.value })}
                        placeholder="••••••••"
                        className={inputLarge}
                        {...invalidProps(invalid('passwordConfirm'))}
                      />
                    </Field>
                  </div>
                </RevealField>
                <div className="mt-4 md:mt-5">
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 pt-1 desk:min-h-0">
                    <input
                      type="checkbox"
                      checked={showPassword}
                      data-sync={showPassword ? 'on' : 'off'}
                      onChange={(e) => setShowPassword(e.target.checked)}
                      className="h-4 w-4 cursor-pointer accent-sky"
                    />
                    <span className="text-sm text-muted select-none">
                      비밀번호 표시
                    </span>
                  </label>
                </div>
              </div>
            </RevealField>
          </div>
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

        {/* ── 1-2 레슨장 · 팀 이름 · 지역 · 소개 — 레슨장 · 팀 가입만. 이름이 맞으면 나머지가 펴진다 ── */}
        {panel(
          'org',
          <div>
            <Field
              label={`${orgWord} 이름`}
              hint={joiningAsStaff ? '코치로 합류하면 비워도 돼요' : undefined}
            >
              <Input
                name="orgName"
                type="text"
                autoComplete="organization"
                value={answers.orgName}
                onChange={(e) => w.patch({ orgName: e.target.value })}
                placeholder={
                  answers.kind === 'team' ? '○○ 리틀 야구단' : '○○ 피칭 레슨'
                }
                maxLength={ORG_NAME_MAX}
                className={inputLarge}
                {...invalidProps(invalid('orgName'))}
              />
            </Field>
            <RevealField open={orgNameOk(answers.orgName) && !joiningAsStaff}>
              <div>
                <div className="pt-5">
                  <Field label="지역" hint="선택">
                    <Input
                      name="orgRegion"
                      type="text"
                      value={answers.orgRegion}
                      onChange={(e) => w.patch({ orgRegion: e.target.value })}
                      placeholder="서울 강남"
                      maxLength={ORG_REGION_MAX}
                      className={inputLarge}
                    />
                  </Field>
                </div>
                <div className="pt-5">
                  <Field
                    label={answers.kind === 'team' ? '연령대 · 리그' : '코치 수 · 소개'}
                    hint="선택"
                  >
                    <Input
                      name="orgNote"
                      type="text"
                      value={answers.orgNote}
                      onChange={(e) => w.patch({ orgNote: e.target.value })}
                      placeholder={
                        answers.kind === 'team'
                          ? '초등 · 주말 리그'
                          : '코치 2명 · 투수 전문'
                      }
                      maxLength={ORG_NOTE_MAX}
                      className={inputLarge}
                    />
                  </Field>
                </div>
              </div>
            </RevealField>
            {/* 이미 있는 레슨장 · 팀의 코치로 — 마스터가 설정에서 만든 스태프 초대 코드(한 번 쓰는 코드). 조직은 새로 안 만든다 */}
            <div className="mt-6 border-t border-line pt-5">
              <Field
                label={`이미 있는 ${orgWord}에 코치로 들어가요`}
                hint="마스터가 준 여섯 글자 초대 코드 — 없으면 비워 두세요"
              >
                <Input
                  name="staffCode"
                  type="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={8}
                  value={answers.staffCode}
                  onChange={(e) => w.patch({ staffCode: e.target.value })}
                  placeholder="ABC234"
                  className={`${inputLarge} font-mono tracking-[0.2em] uppercase`}
                  {...invalidProps(invalid('staffCode'))}
                />
              </Field>
            </div>
          </div>
        )}

        {/* ── 2 생년월일 · 성별 — 날짜를 고르면 성별이 펴진다 ── */}
        {panel(
          'birth',
          <div>
            <Field label="생년월일">
              <BirthDateField
                value={answers.birthDate}
                onChange={(birthDate) => w.patch({ birthDate })}
                today={today}
                invalid={invalid('birthDate')}
              />
            </Field>
            {/* 성별 — 영양 목표(기초대사량)를 계산하는 기준이라 가입할 때 받는다. 몸에 대한 사실이라 계정에 두고, 바꾸는 것도 내 정보 한 곳에서만 한다 */}
            <RevealField open={answers.birthDate !== ''}>
              <div className="pt-5">
                <Chips
                  name="sex"
                  legend="성별"
                  options={SEX_OPTIONS.map((o) => ({ value: o.value, label: o.name }))}
                  value={answers.sex}
                  onChange={(sex) => w.patch({ sex })}
                  invalid={invalid('sex')}
                />
              </div>
            </RevealField>
          </div>
        )}

        {/* ── 3 키 · 몸무게 — 키가 범위 안이면 몸무게가 펴진다. 단위는 cm｜in · kg｜lb, 저장은 cm · kg ── */}
        {panel(
          'body',
          <div>
            <NumberUnitField
              name="heightCm"
              kind="length"
              label="키"
              value={answers.heightCm}
              onChange={(heightCm) => w.patch({ heightCm })}
              min={MIN_HEIGHT_CM}
              max={MAX_HEIGHT_CM}
              placeholder={175}
              invalid={invalid('heightCm')}
            />
            <RevealField open={heightOk(answers.heightCm)}>
              <div className="pt-5">
                <NumberUnitField
                  name="weightKg"
                  kind="weight"
                  label="지금 몸무게"
                  value={answers.weightKg}
                  onChange={(weightKg) => w.patch({ weightKg })}
                  min={MIN_WEIGHT_KG}
                  max={MAX_WEIGHT_KG}
                  placeholder={72}
                  invalid={invalid('weightKg')}
                  hint="아침에 화장실 다녀온 뒤 잰 값이 가장 고르게 나와요. 0.1kg 까지."
                />
              </div>
            </RevealField>
          </div>
        )}

        {/*
          5 동의 두 가지. 받는 정보를 보면 그냥 넘어갈 수준이 아니다 — 생년월일, 키, 몸무게, 통증 부위, 투구 기록, 영상.
          통증 기록은 건강에 관한 정보라 따로 동의를 받는다. 미리 체크해 두지 않는다. '모두 동의'는 둘을 한 번에
          켜고 끄는 편의일 뿐, 따로 보내는 값이 없다.
        */}
        {panel(
          'terms',
          <div className="rounded-2xl border border-line bg-surface-2/60 p-3">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl px-1 py-2 text-subhead font-semibold text-ink">
              <input
                type="checkbox"
                checked={answers.agreeTerms && answers.agreePrivacy}
                data-sync={answers.agreeTerms && answers.agreePrivacy ? 'on' : 'off'}
                onChange={(e) =>
                  w.patch({
                    agreeTerms: e.target.checked,
                    agreePrivacy: e.target.checked,
                  })
                }
                className="h-5 w-5 shrink-0 cursor-pointer accent-sky"
              />
              모두 동의합니다
            </label>
            <div className="my-2 border-t border-line" />
            <AgreeLine
              name="agreeTerms"
              checked={answers.agreeTerms}
              onChange={(agreeTerms) => w.patch({ agreeTerms })}
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
              onChange={(agreePrivacy) => w.patch({ agreePrivacy })}
              invalid={invalid('agreePrivacy')}
            >
              <LegalLink doc="privacy" onOpen={legal.show}>
                개인정보 처리방침
              </LegalLink>
              에 동의합니다. 여기에는 어깨·팔꿈치 통증 같은 건강에 관한 정보가 들어가요.{' '}
              <span className="text-muted">(필수)</span>
            </AgreeLine>
          </div>
        )}

        {w.problem && <ProblemLine seq={w.seq}>{w.problem.error}</ProblemLine>}
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
export function AuthForm({ today: serverToday }: { today: string }) {
  /*
   * 이 화면은 빌드 때 미리 만들어진다(app/login/page.tsx) — 서버가 준 날짜는 배포 날짜라, 가입 마법사의 생년월일 한계 · '앞으로 올 날'
   * 검사가 며칠 지나면 어긋났다(2026-10-17). 붙은 뒤에는 브라우저 날짜로(useSyncExternalStore — 수화 어긋남 없음).
   */
  const today = useTodayKey(serverToday);
  /* 덕아웃의 '시작하기'(?signup=1)는 가입부터 — 손으로 바꾼 뒤에는 그 값 */
  const wantSignup = useQueryParam('signup') === '1';
  const [picked, setMode] = useState<'login' | 'signup' | null>(null);
  const mode = picked ?? (wantSignup ? 'signup' : 'login');
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
