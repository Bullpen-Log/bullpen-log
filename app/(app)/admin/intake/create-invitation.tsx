'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Plus } from '@/components/icon';
import { ErrorLine } from '@/components/error-line';
import { Modal } from '@/components/modal';
import { toast } from '@/components/toast';
import { Button, Field, Input, Textarea } from '@/components/ui';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { seoulDateText } from '@/lib/intake/admin-labels';
import { DEFAULT_UPLOAD_DAYS, GIB, INTAKE_BUCKET_MAX_BYTES } from '@/lib/intake/limits';
import { quietRefresh } from '@/lib/quiet-refresh';
import { createIntakeInvitation } from '@/app/actions/intake-admin';

const MIB = 1024 * 1024;
const FIELD_TEXT: Record<string, string> = {
  uploadDays: '올리기 기간은 1일에서 60일 사이로 적어 주세요.',
  resultDays: '결과 보기 기간은 올리기 기간보다 길게, 365일 안으로 적어 주세요.',
  accessCode: '접근 코드는 6자에서 32자 사이로 적어 주세요.',
  maxFileBytes: `파일 한도는 1MB에서 ${INTAKE_BUCKET_MAX_BYTES / MIB}MB 사이로 적어 주세요.`,
  maxTotalBytes: '합계 한도는 파일 한도보다 크게, 2GB 안으로 적어 주세요.',
};

/** 빈칸이면 null, 숫자가 아니면 NaN — 서버가 범위를 본다 */
const numberOf = (v: string) => (v.trim() === '' ? null : Number(v));
const bytesOf = (mb: number | null) => (mb == null ? null : Math.round(mb * MIB));

/**
 * 초대 만들기 — 링크는 토큰 원문이 담겨 있어 이 창에서 한 번만 보인다. DB 에는 해시만 있어 다시 볼 수 없다. 창을 닫으면 화면에서도 지운다.
 * 링크는 주소 조각(#)에 토큰을 싣는다(서버 · 로그 · 미리보기로 안 간다). 앞쪽 주소는 지금 관리 화면의 주소다.
 */
export function CreateInvitation() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [made, setMade] = useState<{ link: string; expires: string; coded: boolean }>();
  const [copied, setCopied] = useState(false);

  const close = () => {
    setOpen(false);
    setMade(undefined);
    setError(undefined);
    setCopied(false);
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (k: string) => String(form.get(k) ?? '');
    const accessCode = text('accessCode').trim();
    setError(undefined);
    start(async () => {
      const r = await orOffline(
        createIntakeInvitation({
          note: text('note').trim() || null,
          uploadDays: numberOf(text('uploadDays')),
          resultDays: numberOf(text('resultDays')),
          accessCode: accessCode || null,
          maxFileBytes: bytesOf(numberOf(text('maxFileMb'))),
          maxTotalBytes: bytesOf(numberOf(text('maxTotalMb'))),
        }),
        null,
      );
      if (!r) return setError(OFFLINE_MESSAGE);
      if (!r.ok) {
        const field = typeof r.detail?.field === 'string' ? FIELD_TEXT[r.detail.field] : undefined;
        return setError(field ?? r.message);
      }
      setMade({ link: `${window.location.origin}/submit#${r.token}`, expires: r.uploadExpiresAt, coded: accessCode !== '' });
      quietRefresh(router);
    });
  };

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast('링크를 복사했어요');
    } catch {
      setError('복사하지 못했어요. 칸을 눌러 직접 복사해 주세요.');
    }
  };

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden className="h-4 w-4" />
        초대 만들기
      </Button>
      <Modal open={open} onClose={close} title={made ? '초대 링크를 만들었어요' : '초대 만들기'}>
        {made ? (
          <div className="space-y-4">
            <p role="status" className="rounded-lg border border-warn-line bg-warn-bg px-4 py-3 text-sm text-warn">
              이 링크는 지금만 볼 수 있어요. 창을 닫으면 다시 볼 수 없으니 먼저 복사해 주세요.
            </p>
            <Field label="초대 링크" hint={`${seoulDateText(made.expires)}까지 영상을 보낼 수 있어요. 링크를 가진 사람은 누구나 열 수 있어요.`}>
              <Input readOnly value={made.link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            </Field>
            {made.coded && <p className="text-sm text-muted">결과를 볼 때 접근 코드가 필요해요. 링크와 다른 길로 전해 주세요.</p>}
            {error && <ErrorLine>{error}</ErrorLine>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close}>
                닫기
              </Button>
              <Button type="button" onClick={() => copy(made.link)}>
                {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
                {copied ? '복사했어요' : '링크 복사'}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="메모(선택)" hint="받는 분을 알아보려고 적어요. 공개 화면에는 안 나가요.">
              <Textarea name="note" rows={2} maxLength={200} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="올리기 기간(일)">
                <Input name="uploadDays" type="number" inputMode="numeric" min={1} max={60} defaultValue={DEFAULT_UPLOAD_DAYS} required />
              </Field>
              <Field label="결과 보기 기간(일)" hint="비우면 만료가 없어요.">
                <Input name="resultDays" type="number" inputMode="numeric" min={1} max={365} />
              </Field>
            </div>
            <Field label="결과 접근 코드(선택)" hint="6자에서 32자예요. 숫자만 쓰지 말고 글자를 섞어 주세요. 저장하면 다시 볼 수 없어요.">
              <Input name="accessCode" autoComplete="off" minLength={6} maxLength={32} />
            </Field>
            <details className="rounded-xl border border-line px-4 py-3">
              <summary className="cursor-pointer text-sm text-ink">파일 크기 한도 바꾸기</summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="파일 하나(MB)" hint={`기본 ${INTAKE_BUCKET_MAX_BYTES / MIB}MB`}>
                  <Input name="maxFileMb" type="number" inputMode="numeric" min={1} max={INTAKE_BUCKET_MAX_BYTES / MIB} />
                </Field>
                <Field label="두 파일 합계(MB)" hint={`기본 ${(2 * GIB) / MIB}MB`}>
                  <Input name="maxTotalMb" type="number" inputMode="numeric" min={1} max={(2 * GIB) / MIB} />
                </Field>
              </div>
            </details>
            {error && <ErrorLine>{error}</ErrorLine>}
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? '만드는 중…' : '링크 만들기'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
