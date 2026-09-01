'use client';

import { useActionState, useState } from 'react';
import { KeyRound, UserMinus } from 'lucide-react';
import { changePassword, deleteAccount, type AccountState } from '@/app/actions/auth';
import { Button, Field, FormError, Input } from '@/components/ui';
import { Modal } from '@/components/modal';

/**
 * 계정을 다루는 두 가지 — 비밀번호 바꾸기와 탈퇴.
 *
 * 지금까지 계정에 할 수 있는 일은 로그아웃뿐이었다. 비밀번호를 바꿀 수도,
 * 그만둘 수도 없었다. 아는 사람만 쓰는 동안에는 티가 안 났지만, 모르는 사람을
 * 받는 순간 둘 다 없으면 안 되는 것들이다.
 *
 * 창으로 연다. 매일 쓰는 것이 아닌데 폼을 펴 두면 '내 정보'가 계정 설정 화면처럼
 * 보인다. 여기서 매일 볼 것은 키와 목표 구속이지 비밀번호가 아니다.
 */

export function AccountActions() {
  const [pwOpen, setPwOpen] = useState(false);
  const [outOpen, setOutOpen] = useState(false);
  /*
   * 창을 닫았다 열면 폼을 새로 만든다(key 를 바꾼다). 그러지 않으면 지난번
   * "지금 비밀번호가 맞지 않습니다"가 그대로 남아 있다.
   */
  const [formSeq, setFormSeq] = useState(0);

  return (
    <div className="space-y-2 border-t border-line pt-4">
      <button
        type="button"
        onClick={() => {
          setFormSeq((n) => n + 1);
          setPwOpen(true);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm text-muted transition-colors hover:border-sky hover:text-sky"
      >
        <KeyRound className="h-4 w-4" />
        비밀번호 바꾸기
      </button>

      <button
        type="button"
        onClick={() => {
          setFormSeq((n) => n + 1);
          setOutOpen(true);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm text-muted transition-colors hover:border-danger-line hover:text-danger"
      >
        <UserMinus className="h-4 w-4" />
        회원 탈퇴
      </button>

      <Modal
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        title="비밀번호 바꾸기"
        description="지금 비밀번호를 먼저 확인합니다."
      >
        <PasswordForm key={`pw-${formSeq}`} onDone={() => setPwOpen(false)} />
      </Modal>

      <Modal
        open={outOpen}
        onClose={() => setOutOpen(false)}
        title="회원 탈퇴"
        description="지금까지 남긴 것이 전부 사라집니다."
      >
        <LeaveForm key={`out-${formSeq}`} />
      </Modal>
    </div>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [state, formAction, pending] = useActionState<AccountState, FormData>(
    changePassword,
    undefined
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormError>{state?.error}</FormError>

      {state?.success ? (
        <div className="space-y-4">
          <p className="rounded-lg border border-sky-soft/60 bg-sky/10 px-4 py-3 text-sm text-sky">
            {state.success}
          </p>
          <Button type="button" onClick={onDone} className="w-full">
            닫기
          </Button>
        </div>
      ) : (
        <>
          <Field label="지금 비밀번호">
            <Input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="새 비밀번호" hint="8자 이상 입력해주세요.">
            <Input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <Field label="새 비밀번호 확인">
            <Input
              name="newPasswordConfirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? '바꾸는 중…' : '비밀번호 바꾸기'}
          </Button>
        </>
      )}
    </form>
  );
}

function LeaveForm() {
  const [state, formAction, pending] = useActionState<AccountState, FormData>(
    deleteAccount,
    undefined
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormError>{state?.error}</FormError>

      {/*
        무엇이 사라지는지 세어서 적지 않고 종류만 적는다. 숫자를 세려면 조회가
        한 번 더 필요한데, 여기서 중요한 것은 "몇 건인가"가 아니라 "전부"다.
      */}
      <div className="space-y-2 rounded-xl border border-danger-line bg-danger-bg px-4 py-3.5 text-sm leading-relaxed text-danger">
        <p className="font-bold">되돌릴 수 없습니다.</p>
        <p>
          투구 기록과 올려둔 영상, 컨디션 체크인, 운동 기록, 남긴 글이 모두 지워집니다.
          같은 이메일로 다시 가입해도 예전 기록은 돌아오지 않습니다.
        </p>
      </div>

      <Field label="비밀번호">
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <Field label="확인" hint="아래 칸에 탈퇴 두 글자를 그대로 적어주세요.">
        <Input name="confirmWord" type="text" placeholder="탈퇴" required />
      </Field>

      <Button type="submit" variant="danger" disabled={pending} className="w-full">
        {pending ? '처리 중…' : '탈퇴하고 모든 기록 지우기'}
      </Button>
    </form>
  );
}
