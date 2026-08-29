'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { login, signup, type AuthState } from '@/app/actions/auth';
import { Button, Field, FormError, Input } from '@/components/ui';
import { kept } from '@/lib/form-values';
import { MAX_HEIGHT_CM, MIN_HEIGHT_CM } from '@/lib/profile';
import {
  BASELINE_FREQ_NAMES,
  BASELINE_INTENSITY_NAMES,
  BASELINE_VOLUME_NAMES,
  BASELINE_WORKOUT_FREQ_NAMES,
  COMPETITION_LEVELS,
  THROWING_HANDS,
} from '@/lib/baseline';

/** 가입 문진용 한 줄 칩 라디오 */
function ChipRow({
  label,
  name,
  options,
  /** 가입에 실패해 되돌아왔을 때 다시 골라둘 값 */
  selected,
}: {
  label: string;
  name: string;
  options: readonly string[];
  selected?: string;
}) {
  return (
    <fieldset>
      <legend className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <label key={option} className="inline-flex">
            <input
              type="radio"
              name={name}
              value={option}
              required
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

  return (
    <div className="w-full max-w-md">
      {/* 로그인 / 회원가입 전환 탭 */}
      <div className="mb-8 grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-1">
        {(['login', 'signup'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              mode === m ? 'bg-sky text-white' : 'text-muted hover:text-ink'
            }`}
          >
            {m === 'login' ? '로그인' : '회원가입'}
          </button>
        ))}
      </div>

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
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={kept(before, 'email')}
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
              생년월일은 나이에 맞는 안전한 투구수를 계산하는 데 쓰입니다.
              키는 나중에 입력해도 됩니다.
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
            */}
            <div className="space-y-4 border-t border-line pt-5">
              <p className="text-sm font-semibold text-ink">
                평소 웨이트는 얼마나 하시나요?
                <span className="mt-1 block text-xs font-normal text-muted">
                  운동 부하도 첫날부터 보여드리기 위한 1문항입니다.
                </span>
              </p>
              <ChipRow
                label="웨이트 횟수"
                name="baselineWorkoutFreq"
                options={BASELINE_WORKOUT_FREQ_NAMES}
                selected={kept(before, 'baselineWorkoutFreq')}
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
                options={COMPETITION_LEVELS}
                selected={kept(before, 'competitionLevel')}
              />
              <p className="text-xs leading-relaxed text-muted/70">
                안 고르셔도 됩니다. 훈련 내용을 바꾸는 값이 아니라, 나중에 비슷한
                또래와 견줘 보여드리려고 여쭙습니다.
              </p>
            </div>
          </>
        )}

        <Field label="비밀번호" hint={mode === 'signup' ? '8자 이상 입력해주세요.' : undefined}>
          <Input
            name="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="••••••••"
            required
          />
        </Field>

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
