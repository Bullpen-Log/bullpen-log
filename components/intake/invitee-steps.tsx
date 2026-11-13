'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui';
import { FieldError, HelpButton, NoteBox, PrimaryButton, Screen } from '@/components/intake/shell';
import { INTAKE_ERROR_TEXT } from '@/lib/intake/errors';

/**
 * 이름 · PIN 관문(R03) — 초대 하나에 한 사람. 처음 연 사람이 이름과 숫자 네 자리 PIN 을 정하고, 다음에는 같은 이름 · PIN 으로 들어온다.
 *
 * PIN 은 이 화면의 상태에만 잠깐 둔다. 주소 · 기기 저장소 · 콘솔 · 앞뒤 기록(history state)에 남기지 않고, 보낸 뒤에는 칸을 비운다.
 * 입력칸에 name 을 달지 않는다 — 스크립트가 붙기 전에 폼이 저절로 나가도 PIN 이 주소에 실리지 않게.
 * PIN 은 글자 그대로다(앞의 0 을 지키려고 숫자로 바꾸지 않는다).
 */

export const PIN_LENGTH = 4;
const NAME_MAX = 40;

/** 숫자만 남기고 네 자리까지 — 다른 글자는 들어오는 대로 버린다 */
export const pinDigits = (raw: string) => raw.replace(/[^0-9]/g, '').slice(0, PIN_LENGTH);

/** 칸마다의 오류 — 서버 코드를 그 칸으로 보낸다(flow 가 채운다) */
export type InviteeErrors = { name?: string; pin?: string; pinConfirm?: string; form?: string };

/** 서버 오류를 칸으로 — 이름이 틀렸는지 PIN 이 틀렸는지는 서버가 일부러 안 가른다(invitee_credentials_wrong) */
export function inviteeErrorsOf(code: string, message: string, retryAfterSec: number | null): InviteeErrors {
  if (code === 'pin_invalid') return { pin: message };
  if (code === 'pin_mismatch') return { pinConfirm: message };
  if (code === 'invitee_name_invalid' || code === 'athlete_name_chars') return { name: message };
  if (code === 'rate_limited') return { form: retryAfterSec != null ? `시도가 너무 많습니다. ${waitText(retryAfterSec)} 뒤 다시 시도하십시오.` : INTAKE_ERROR_TEXT.rate_limited };
  return { form: message };
}

const waitText = (sec: number) => (sec >= 60 ? `${Math.ceil(sec / 60)}분` : `${Math.max(1, Math.ceil(sec))}초`);

function localName(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed || [...trimmed].length > NAME_MAX) return INTAKE_ERROR_TEXT.invitee_name_invalid;
  return undefined;
}

function PinField({
  id,
  label,
  value,
  onChange,
  error,
  autoComplete,
  show,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete: string;
  show: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-bold text-ink">
        {label}
      </label>
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={PIN_LENGTH}
        autoComplete={autoComplete}
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="next"
        value={value}
        onChange={(e) => onChange(pinDigits(e.currentTarget.value))}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : `${id}-hint`}
        className="py-3.5 text-center text-subhead tracking-[0.5em] aria-invalid:border-danger"
      />
      {error ? (
        <FieldError id={`${id}-error`}>{error}</FieldError>
      ) : (
        <p id={`${id}-hint`} className="sr-only">
          숫자 네 자리
        </p>
      )}
    </div>
  );
}

function NameField({ id, value, onChange, error, label }: { id: string; value: string; onChange: (v: string) => void; error?: string; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus({ preventScroll: true }), []);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-bold text-ink">
        {label}
      </label>
      <Input
        ref={input}
        id={id}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        autoComplete="off"
        autoCapitalize="words"
        enterKeyHint="next"
        maxLength={80}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="py-3.5 text-subhead aria-invalid:border-danger"
      />
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}

/** PIN 보기 · 숨기기 — 손이 떨려 잘못 누른 것을 직접 확인할 수 있게 */
function ShowPin({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <HelpButton onClick={onToggle} aria-pressed={show}>
      {show ? 'PIN 숨기기' : 'PIN 보기'}
    </HelpButton>
  );
}

/* ── 처음 연 사람: 이름 · PIN 정하기 ── */
export function EnrollStep({
  busy,
  errors,
  onSubmit,
}: {
  busy: boolean;
  errors: InviteeErrors;
  onSubmit: (input: { name: string; pin: string; pinConfirm: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [local, setLocal] = useState<InviteeErrors>({});
  const [seen, setSeen] = useState(errors);
  if (seen !== errors) {
    setSeen(errors);
    setLocal({});
  }
  const shown = { ...errors, ...local };

  const submit = async () => {
    const next: InviteeErrors = {};
    const n = localName(name);
    if (n) next.name = n;
    if (pin.length !== PIN_LENGTH) next.pin = INTAKE_ERROR_TEXT.pin_invalid;
    else if (pinConfirm !== pin) next.pinConfirm = INTAKE_ERROR_TEXT.pin_mismatch;
    if (Object.keys(next).length) {
      setLocal(next);
      if (next.pinConfirm && !next.pin) setPinConfirm('');
      document.getElementById(next.name ? 'invitee-name' : next.pin ? 'invitee-pin' : 'invitee-pin-confirm')?.focus();
      return;
    }
    setLocal({});
    const sent = { name: name.trim(), pin, pinConfirm };
    /* 보낸 뒤에는 PIN 을 화면에 들고 있지 않는다 — 실패해도 다시 입력받는다 */
    setPin('');
    setPinConfirm('');
    await onSubmit(sent);
  };

  return (
    <form
      noValidate
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Screen
        screenKey="invitee-enroll"
        title="이 링크에 쓸 이름과 PIN 은 무엇인가요?"
        desc={'이 이름과 PIN 은 이 링크에 다시 들어올 때 본인 확인에 쓰입니다. 다음에 이 링크를 열 때 같은 이름과 PIN 을 입력합니다.\nPIN 은 직접 정하는 숫자 네 자리입니다.'}
        focusTitle={false}
        actions={
          <>
            {shown.form && <FieldError>{shown.form}</FieldError>}
            <PrimaryButton type="submit" busy={busy}>
              정하고 시작하기
            </PrimaryButton>
          </>
        }
      >
        <NameField id="invitee-name" label="보내는 분의 이름" value={name} onChange={setName} error={shown.name} />
        <PinField id="invitee-pin" label="PIN 숫자 네 자리" value={pin} onChange={setPin} error={shown.pin} autoComplete="new-password" show={show} />
        <PinField id="invitee-pin-confirm" label="PIN 한 번 더" value={pinConfirm} onChange={setPinConfirm} error={shown.pinConfirm} autoComplete="new-password" show={show} />
        <ShowPin show={show} onToggle={() => setShow((v) => !v)} />
        <NoteBox>PIN 은 다른 사람에게 알리지 마십시오. 잊으면 링크를 보내 준 담당자에게 문의하십시오.</NoteBox>
      </Screen>
    </form>
  );
}

/** 다시 들어오는 까닭 — 처음 화면 · 세션이 끝남 · 이 기기에서 나감 · 다른 기기가 먼저 정함 */
export type UnlockReason = 'session_required' | 'session_expired' | 'ended' | 'enrolled_elsewhere';

const UNLOCK_DESC: Record<UnlockReason, string> = {
  session_required: '처음에 정한 이름과 PIN 을 입력하면 이어서 볼 수 있습니다.',
  session_expired: INTAKE_ERROR_TEXT.session_expired,
  ended: '이 기기에서 나갔습니다. 다시 보려면 이름과 PIN 을 입력하십시오.',
  enrolled_elsewhere: '방금 다른 곳에서 이름과 PIN 을 먼저 정했습니다. 정한 이름과 PIN 을 입력하십시오.',
};

/* ── 다시 들어오기 ── */
export function UnlockStep({
  reason,
  busy,
  errors,
  onSubmit,
}: {
  reason: UnlockReason;
  busy: boolean;
  errors: InviteeErrors;
  onSubmit: (input: { name: string; pin: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [show, setShow] = useState(false);
  const [local, setLocal] = useState<InviteeErrors>({});
  const [seen, setSeen] = useState(errors);
  if (seen !== errors) {
    setSeen(errors);
    setLocal({});
  }
  const shown = { ...errors, ...local };

  const submit = async () => {
    const next: InviteeErrors = {};
    const n = localName(name);
    if (n) next.name = n;
    if (pin.length !== PIN_LENGTH) next.pin = INTAKE_ERROR_TEXT.pin_invalid;
    if (Object.keys(next).length) {
      setLocal(next);
      document.getElementById(next.name ? 'unlock-name' : 'unlock-pin')?.focus();
      return;
    }
    setLocal({});
    const sent = { name: name.trim(), pin };
    setPin('');
    await onSubmit(sent);
  };

  return (
    <form
      noValidate
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Screen
        screenKey={`invitee-unlock-${reason}`}
        title="처음에 정한 이름과 PIN 은 무엇인가요?"
        desc={UNLOCK_DESC[reason]}
        focusTitle={false}
        actions={
          <>
            {shown.form && <FieldError>{shown.form}</FieldError>}
            <PrimaryButton type="submit" busy={busy}>
              확인
            </PrimaryButton>
          </>
        }
      >
        <NameField id="unlock-name" label="이름" value={name} onChange={setName} error={shown.name} />
        <PinField id="unlock-pin" label="PIN 숫자 네 자리" value={pin} onChange={setPin} error={shown.pin} autoComplete="off" show={show} />
        <ShowPin show={show} onToggle={() => setShow((v) => !v)} />
        <NoteBox>선택한 영상과 보내던 내용은 그대로 있습니다. PIN 을 잊었으면 링크를 보내 준 담당자에게 문의하십시오.</NoteBox>
      </Screen>
    </form>
  );
}

/**
 * 이 기기에서 나가기 — 같은 링크를 다른 사람이 볼 수 있는 기기(가족 폰 · 공용 컴퓨터)에서 쓴다. 눈에 덜 띄게 글 단추로 둔다.
 * 나간 뒤에는 이름 · PIN 을 다시 묻는다(flow 가 화면을 옮긴다).
 */
export function LeaveDevice({ onLeave }: { onLeave: () => Promise<void> }) {
  const [phase, setPhase] = useState<'idle' | 'busy' | 'failed'>('idle');
  return (
    <div className="space-y-1">
      <HelpButton
        disabled={phase === 'busy'}
        onClick={async () => {
          setPhase('busy');
          await onLeave().then(
            () => setPhase('idle'),
            () => setPhase('failed'),
          );
        }}
      >
        {phase === 'busy' ? '나가는 중' : '이 기기에서 나가기'}
      </HelpButton>
      {phase === 'failed' && <FieldError>나가지 못했습니다. 신호를 확인한 뒤 다시 시도하십시오.</FieldError>}
    </div>
  );
}
