'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { login, signup, type AuthState } from '@/app/actions/auth';
import { Button, Field, FormError, Input } from '@/components/ui';
import { Segmented } from '@/components/segmented';
import { RadioGroup } from '@/components/choice-inputs';
import { kept } from '@/lib/form-values';
import { readLoginPrefs, saveLoginPrefs } from '@/lib/login-prefs';
import { MAX_HEIGHT_CM, MIN_HEIGHT_CM } from '@/lib/profile';
import {
  BASELINE_FREQ_NAMES,
  BASELINE_INTENSITY_NAMES,
  BASELINE_VOLUME_NAMES,
  BASELINE_WORKOUT_FREQ_NAMES,
  COMPETITION_LEVELS,
  THROWING_HANDS,
} from '@/lib/baseline';
import { TRAINING_LEVELS } from '@/lib/report/personalize';

const AUTH_MODES = [
  { value: 'login', label: '로그인' },
  { value: 'signup', label: '회원가입' },
] as const;

/** 가입 문진용 한 줄 칩 라디오 */
function ChipRow({
  label,
  name,
  options,
  /** 가입에 실패해 되돌아왔을 때 다시 골라둘 값 */
  selected,
  /**
   * 안 골라도 넘어갈 수 있는 줄인가.
   *
   * 예전에는 모든 줄이 필수였다. 그래서 '어디서 야구를 하시나요'는 바로 아래에
   * "안 고르셔도 됩니다"라고 적어두고도, 안 고르면 브라우저가 가입을 막았다.
   * 처음 보는 화면에서 글과 동작이 어긋나면 앱을 못 믿게 된다.
   */
  optional = false,
}: {
  label: string;
  name: string;
  options: readonly string[];
  selected?: string;
  optional?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-2 block text-xs font-medium tracking-normal text-muted">
        {label}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <label key={option} className="inline-flex">
            <input
              type="radio"
              name={name}
              value={option}
              required={!optional}
              defaultChecked={selected === option}
              className="peer sr-only"
            />
            <span className="cursor-pointer select-none rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted transition-colors hover:border-sky-soft hover:text-ink peer-checked:border-sky peer-checked:bg-sky/10 peer-checked:font-medium peer-checked:text-sky peer-focus-visible:ring-1 peer-focus-visible:ring-sky">
              {option}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? '처리 중…' : label}
    </Button>
  );
}

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
      <span className="text-xs text-muted select-none">{label}</span>
    </label>
  );
}

/** today는 생년월일에서 미래 날짜를 못 고르게 막는 데 쓴다. */
export function AuthForm({ today }: { today: string }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const action = mode === 'login' ? login : signup;
  const [state, formAction] = useActionState<AuthState, FormData>(action, undefined);

  /*
   * 실패해서 되돌아왔을 때 채워뒀던 값을 그대로 되살린다.
   * 이메일 하나 겹쳤다고 문진까지 다시 고르게 할 수는 없다.
   * 비밀번호는 서버가 돌려주지 않으므로 다시 입력해야 한다.
   */
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
   */
  const emailRef = useRef<HTMLInputElement>(null);
  const rememberRef = useRef<HTMLInputElement>(null);
  const stayRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = readLoginPrefs();
    if (stayRef.current) stayRef.current.checked = saved.stayLoggedIn;
    if (rememberRef.current) rememberRef.current.checked = saved.email != null;
    /* 실패해서 되돌아온 값이 있으면 그쪽이 먼저다 — 방금 친 것이 더 맞다 */
    if (saved.email && emailRef.current && !emailRef.current.value) {
      emailRef.current.value = saved.email;
    }
  }, []);

  /** 기억해 두기로 했으면 지금 칸에 있는 값을 저장한다. */
  function rememberNow(on: boolean) {
    saveLoginPrefs({ email: on ? (emailRef.current?.value ?? '') : null });
  }

  return (
    <div className="w-full max-w-md">
      {/* 로그인 / 회원가입 전환 탭 — 고른 쪽 밑의 알약이 미끄러진다(앱 안의 고르개들과 같은 것) */}
      <Segmented
        role="tablist"
        label="로그인 또는 회원가입"
        value={mode}
        onChange={setMode}
        options={AUTH_MODES}
        size="md"
        tone="raised"
        className="mb-8"
        itemClassName="px-4 py-2.5"
      />

      <form
        key={mode}
        action={formAction}
        className="space-y-5 rounded-2xl border border-line bg-surface p-8"
      >
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {mode === 'login' ? '다시 오신 걸 환영합니다' : '계정 만들기'}
          </h1>
          <p className="text-sm text-muted">
            {mode === 'login'
              ? '기록을 이어서 관리하려면 로그인하세요.'
              : '가입하면 투구 기록과 트레이닝을 관리할 수 있습니다.'}
          </p>
        </div>

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
          />
        </Field>

        {mode === 'signup' && (
          <>
            <Field label="닉네임">
              <Input
                name="nickname"
                type="text"
                autoComplete="nickname"
                defaultValue={kept(before, 'nickname')}
                placeholder="불펜지기"
                required
              />
            </Field>

            {/* 나이는 안전한 투구수 한도를 정하는 기준이라 가입할 때 받는다. */}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="생년월일">
                <Input
                  name="birthDate"
                  type="date"
                  defaultValue={kept(before, 'birthDate')}
                  max={today}
                  required
                />
              </Field>

              <Field label="키 (cm)">
                <Input
                  name="heightCm"
                  type="number"
                  inputMode="numeric"
                  defaultValue={kept(before, 'heightCm')}
                  min={MIN_HEIGHT_CM}
                  max={MAX_HEIGHT_CM}
                  step={1}
                  placeholder="선택"
                />
              </Field>
            </div>

            <p className="text-xs leading-relaxed text-muted/70">
              생년월일은 나이에 맞는 안전한 투구수를 계산하는 데 쓰입니다. 키는 나중에
              입력해도 됩니다.
            </p>

            <ChipRow
              label="던지는 손"
              name="throwingHand"
              options={THROWING_HANDS}
              selected={kept(before, 'throwingHand')}
            />

            {/* 평소 투구량 문진 — 이 답으로 부하 지수를 첫날부터 계산한다. */}
            <div className="space-y-4 border-t border-line pt-5">
              <p className="text-sm font-semibold text-ink">
                평소 얼마나 던지시나요?
                <span className="mt-1 block text-xs font-normal text-muted">
                  부하 지수를 첫날부터 보여드리기 위한 3문항입니다.
                </span>
              </p>
              <ChipRow
                label="던지는 횟수"
                name="baselineFreq"
                options={BASELINE_FREQ_NAMES}
                selected={kept(before, 'baselineFreq')}
              />
              <ChipRow
                label="한 번에 던지는 양"
                name="baselineVolume"
                options={BASELINE_VOLUME_NAMES}
                selected={kept(before, 'baselineVolume')}
              />
              <ChipRow
                label="평소 강도"
                name="baselineIntensity"
                options={BASELINE_INTENSITY_NAMES}
                selected={kept(before, 'baselineIntensity')}
              />
            </div>

            {/*
              웨이트 빈도. 투구와 같은 이유로 받는다 — 이게 없으면 운동 부하
              지수만 28일을 기다려야 해서 앞뒤가 안 맞는다.

              웨이트 경력. 트레이닝이 경력에 비해 이른 운동을 빼는 기준이다
              (lib/report/personalize.ts). 예전에는 가입한 뒤 트레이닝 설정에서
              따로 골라야 했는데, 안 고른 사람은 아무것도 빼지 않아서 웨이트를
              처음 하는 사람도 첫날부터 상급 운동을 받았다. 트레이닝 설정의
              경력 칸과 같은 값·같은 설명이라, 가입하고 나면 거기에 그대로 보인다.
            */}
            <div className="space-y-4 border-t border-line pt-5">
              <p className="text-sm font-semibold text-ink">
                평소 웨이트는 얼마나 하시나요?
                <span className="mt-1 block text-xs font-normal break-keep text-muted">
                  운동 부하도 첫날부터 보여드리고, 경력에 맞는 운동을 골라드리기 위한
                  2문항입니다.
                </span>
              </p>
              <ChipRow
                label="웨이트 횟수"
                name="baselineWorkoutFreq"
                options={BASELINE_WORKOUT_FREQ_NAMES}
                selected={kept(before, 'baselineWorkoutFreq')}
              />
              <RadioGroup
                label="웨이트 트레이닝 경력"
                hint="가입한 뒤에도 트레이닝 설정에서 바꿀 수 있습니다."
                name="trainingLevel"
                options={TRAINING_LEVELS}
                required
                compact
                selected={kept(before, 'trainingLevel')}
              />
            </div>

            {/*
              수준. 지금은 아무 계산에도 안 쓴다 — 나이는 생년월일로 이미 알고
              안전 한도도 거기서 나온다. 나중에 또래와 견주려고 모으는 값이라,
              안 골라도 가입이 된다.
            */}
            <div className="space-y-4 border-t border-line pt-5">
              <ChipRow
                label="어디서 야구를 하시나요"
                name="competitionLevel"
                optional
                options={COMPETITION_LEVELS}
                selected={kept(before, 'competitionLevel')}
              />
              <p className="text-xs leading-relaxed text-muted/70">
                안 고르셔도 됩니다. 훈련 내용을 바꾸는 값이 아니라, 나중에 비슷한 또래와
                견줘 보여드리려고 여쭙습니다.
              </p>
            </div>
          </>
        )}

        <Field
          label="비밀번호"
          hint={mode === 'signup' ? '8자 이상 입력해주세요.' : undefined}
        >
          <Input
            name="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="••••••••"
            required
          />
        </Field>

        {/*
          로그인에만 둔다.

          가입은 방금 계정을 만든 자리라 어차피 로그인 상태로 시작하고,
          아이디도 방금 친 것을 그대로 기억한다. 물어볼 것이 없다.
        */}
        {mode === 'login' && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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
        )}

        {mode === 'signup' && (
          <Field label="비밀번호 확인">
            <Input
              name="passwordConfirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              required
            />
          </Field>
        )}

        {/*
          동의 두 가지.
          받는 정보를 보면 그냥 넘어갈 수준이 아니다 — 생년월일, 키, 통증 부위,
          투구 기록, 영상. 통증 기록은 건강에 관한 정보라 따로 동의를 받는다.
          미리 체크해 두지 않는다. 눌러서 동의한 것과 켜져 있어서 넘어간 것은 다르다.
        */}
        {mode === 'signup' && (
          <div className="space-y-2.5 rounded-xl border border-line bg-surface-2 px-4 py-3.5">
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                name="agreeTerms"
                required
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#0ea5e9]"
              />
              <span className="leading-relaxed">
                <Link
                  href="/terms"
                  target="_blank"
                  className="font-medium text-sky underline"
                >
                  이용약관
                </Link>
                에 동의합니다. <span className="text-muted">(필수)</span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                name="agreePrivacy"
                required
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#0ea5e9]"
              />
              <span className="leading-relaxed">
                <Link
                  href="/privacy"
                  target="_blank"
                  className="font-medium text-sky underline"
                >
                  개인정보 처리방침
                </Link>
                에 동의합니다. 여기에는 어깨·팔꿈치 통증 같은{' '}
                <strong>건강에 관한 정보</strong>가 들어갑니다.{' '}
                <span className="text-muted">(필수)</span>
              </span>
            </label>
          </div>
        )}

        <SubmitButton label={mode === 'login' ? '로그인' : '가입하고 시작하기'} />
      </form>
    </div>
  );
}
