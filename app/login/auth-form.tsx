'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { login, signup, type AuthState } from '@/app/actions/auth';
import { Button, Field, FormError, Input } from '@/components/ui';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? '처리 중…' : label}
    </Button>
  );
}

export function AuthForm() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const action = mode === 'login' ? login : signup;
  const [state, formAction] = useActionState<AuthState, FormData>(action, undefined);

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
              mode === m ? 'bg-gold text-ink' : 'text-muted hover:text-cream'
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
          <h1 className="text-2xl font-bold tracking-tight text-cream">
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
            placeholder="pitcher@example.com"
            required
          />
        </Field>

        {mode === 'signup' && (
          <Field label="닉네임">
            <Input
              name="nickname"
              type="text"
              autoComplete="nickname"
              placeholder="불펜지기"
              required
            />
          </Field>
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

        <SubmitButton label={mode === 'login' ? '로그인' : '가입하고 시작하기'} />
      </form>
    </div>
  );
}
