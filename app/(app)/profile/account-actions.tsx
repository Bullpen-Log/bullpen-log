'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ChevronRight, KeyRound, LogOut, UserMinus, type LucideIcon } from '@/components/icon';
import { IconCircle, type CircleTone } from '@/components/icon-circle';
import {
  changePassword,
  deleteAccount,
  logout,
  type AccountState,
} from '@/app/actions/auth';
import { guardFormAction } from '@/lib/action-offline';
import { Button, Field, FormError, Input } from '@/components/ui';
import { Modal } from '@/components/modal';

/**
 * 계정을 다루는 세 가지 — 로그아웃, 비밀번호 바꾸기, 탈퇴.
 *
 * 비밀번호를 바꾸거나 그만두는 것은 아는 사람만 쓰는 동안에는 티가 안 났지만,
 * 모르는 사람을 받는 순간 없으면 안 되는 것들이다.
 *
 * 로그아웃도 여기 둔다. 예전에는 '더보기' 화면(/more) 맨 아래에만 있었는데,
 * 하단 '더보기'가 그 화면 대신 사이드바를 열게 되면서 앱 안에서 그 화면으로 가는
 * 길이 없어졌다 — 한동안 어디서도 로그아웃할 수 없었다. '내 정보'는 휴대폰 상단
 * 사진과 PC 오른쪽 위 사진 어디서든 열리므로 여기면 늘 닿는다.
 *
 * 비밀번호·탈퇴는 창으로 연다. 매일 쓰는 것이 아닌데 폼을 펴 두면 '내 정보'가
 * 계정 설정 화면처럼 보인다. 여기서 매일 볼 것은 키와 목표 구속이지 비밀번호가
 * 아니다. 로그아웃은 되돌릴 것이 없어 바로 한다.
 */

/**
 * 줄 하나 — 아이폰 설정 목록처럼 왼쪽 색 원 + 이름 + › (2026-10-14 아이콘 체계, components/icon-circle.tsx).
 * 예전엔 테두리 단추 셋이 쌓여 있었다.
 */
function ActionRow({
  Icon,
  tone = 'sky',
  children,
  ...rest
}: {
  Icon: LucideIcon;
  tone?: CircleTone;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`flex min-h-14 w-full items-center gap-3 px-3 text-left text-sm transition-colors active:bg-ink/6 disabled:opacity-60 ${
        tone === 'danger' ? 'text-danger' : 'text-ink'
      }`}
    >
      <IconCircle Icon={Icon} tone={tone} />
      <span className="flex-1">{children}</span>
      <ChevronRight aria-hidden className="h-4 w-4 text-muted/70" />
    </button>
  );
}

/** 누른 뒤 서버가 로그인 화면으로 보낼 때까지 한 번 더 못 누르게 한다 */
function LogoutButton() {
  const { pending } = useFormStatus();
  return (
    <ActionRow type="submit" disabled={pending} Icon={LogOut}>
      {pending ? '로그아웃하는 중…' : '로그아웃'}
    </ActionRow>
  );
}

export function AccountActions() {
  const [pwOpen, setPwOpen] = useState(false);
  const [outOpen, setOutOpen] = useState(false);
  /*
   * 창을 닫았다 열면 폼을 새로 만든다(key 를 바꾼다). 그러지 않으면 지난번
   * "지금 비밀번호가 맞지 않습니다"가 그대로 남아 있다.
   */
  const [formSeq, setFormSeq] = useState(0);

  return (
    <div className="border-t border-line pt-4">
      <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface-2">
        <form action={logout}>
          <LogoutButton />
        </form>

        <ActionRow
          type="button"
          Icon={KeyRound}
          onClick={() => {
            setFormSeq((n) => n + 1);
            setPwOpen(true);
          }}
        >
          비밀번호 바꾸기
        </ActionRow>

        <ActionRow
          type="button"
          Icon={UserMinus}
          tone="danger"
          onClick={() => {
            setFormSeq((n) => n + 1);
            setOutOpen(true);
          }}
        >
          회원 탈퇴
        </ActionRow>
      </div>

      <Modal
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        title="비밀번호 바꾸기"
        description="지금 비밀번호를 먼저 확인해요."
      >
        <PasswordForm key={`pw-${formSeq}`} onDone={() => setPwOpen(false)} />
      </Modal>

      <Modal
        open={outOpen}
        onClose={() => setOutOpen(false)}
        title="회원 탈퇴"
        description="지금까지 남긴 것이 전부 사라져요."
      >
        <LeaveForm key={`out-${formSeq}`} />
      </Modal>
    </div>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [state, formAction, pending] = useActionState<AccountState, FormData>(
    /* 신호가 끊겨도 오류 화면으로 넘어가지 않고 한 줄로 알린다(lib/action-offline.ts) */
    guardFormAction(changePassword),
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
    /* 신호가 끊겨도 오류 화면으로 넘어가지 않고 한 줄로 알린다(lib/action-offline.ts) */
    guardFormAction(deleteAccount),
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
        <p className="font-bold">되돌릴 수 없어요.</p>
        <p>
          투구 기록과 올려둔 영상, 컨디션 체크인, 운동 기록, 남긴 글이 모두 지워져요.
          같은 이메일로 다시 가입해도 예전 기록은 돌아오지 않아요.
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
