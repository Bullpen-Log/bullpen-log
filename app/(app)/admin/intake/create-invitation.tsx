'use client';

import { useRef, useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
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
  maxFileBytes: `파일 한도는 1MB에서 ${INTAKE_BUCKET_MAX_BYTES / MIB}MB 사이로 적어 주세요.`,
  maxTotalBytes: '합계 한도는 파일 한도보다 크게, 2GB 안으로 적어 주세요.',
};

/** 빈칸이면 null, 숫자가 아니면 NaN — 서버가 범위를 본다 */
const numberOf = (v: string) => (v.trim() === '' ? null : Number(v));
const bytesOf = (mb: number | null) => (mb == null ? null : Math.round(mb * MIB));

/**
 * 이 키로는 더 이을 수 없다는 답 — 다음 만들기는 새 키로 새 초대가 되게 한다.
 * 폼 칸이 틀린 것(invalid_input 의 다른 칸) · 준비 안 됨은 초대가 안 생겼을 수도, 앞서 생겼을 수도 있어 키를 그대로 둔다.
 */
const DEAD_KEY_CODES = new Set(['invitation_retry_used', 'invitation_retry_changed', 'invitation_revoked', 'stale_reissue', 'submission_not_found']);

/** 만들기 요청 키 — 열린 창 하나에 하나. 답을 못 받고 다시 눌러도 같은 키라 서버가 초대를 더 만들지 않는다 */
function newRequestKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  /* randomUUID 가 없는 오래된 웹뷰 — 같은 모양(v4)으로 만든다 */
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** 서버가 만들어 준 링크 — 한 번만 보인다 */
export type ShownLink = { link: string; external: boolean; expires: string; coded?: boolean; note?: string | null };

/**
 * 링크를 한 번 보여 준다 — 초대 만들기 · 새 링크 만들기가 같이 쓴다.
 * 정식 주소가 아니면(개발 서버 등) '개발용 주소라 보내면 안 돼요'를 붙이고 '링크 복사' 단추를 주지 않는다 — 칸을 눌러 시험용으로만 고를 수 있다.
 */
export function IssuedLinkPanel({ made, devNote, onClose }: { made: ShownLink; devNote: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(made.link);
      setCopied(true);
      toast('링크를 복사했어요');
    } catch {
      setError('복사하지 못했어요. 칸을 눌러 직접 복사해 주세요.');
    }
  };
  return (
    <div className="space-y-4">
      {made.external ? (
        <p role="status" className="rounded-lg border border-warn-line bg-warn-bg px-4 py-3 text-sm text-warn">
          이 링크는 지금만 볼 수 있어요. 창을 닫으면 다시 볼 수 없으니 먼저 복사해 주세요.
        </p>
      ) : (
        <p role="alert" className="rounded-lg border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">
          {devNote ?? '개발용 주소라 받는 사람에게 보내면 안 돼요.'}
        </p>
      )}
      {made.note && <p className="text-sm text-ink">{made.note}</p>}
      <Field
        label={made.external ? '초대 링크' : '개발용 링크(보내지 마세요)'}
        hint={`${seoulDateText(made.expires)}까지 영상을 보낼 수 있어요. 처음 연 사람이 이름과 PIN 을 정하고, 그 뒤에는 그 이름과 PIN 으로만 열려요.`}
      >
        <Input readOnly value={made.link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
      </Field>
      {made.coded && <p className="text-sm text-muted">결과를 볼 때 접근 코드가 필요해요. 링크와 다른 길로 전해 주세요.</p>}
      {error && <ErrorLine>{error}</ErrorLine>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          닫기
        </Button>
        {made.external && (
          <Button type="button" onClick={copy}>
            {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
            {copied ? '복사했어요' : '링크 복사'}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * 초대 만들기 — 링크는 토큰 원문이 담겨 있어 이 창에서 한 번만 보인다. DB 에는 해시만 있어 다시 볼 수 없다. 창을 닫으면 화면에서도 지운다.
 * 링크는 서버가 설정의 정식 주소로 만든다(lib/intake/link-origin.ts) — 지금 관리 화면의 주소(localhost · 미리보기 · 앱 웹뷰)를 쓰지 않는다.
 * 만들기 요청 키는 만들기에 성공할 때까지 같은 값을 쓴다. 답을 잃고 다시 눌러도 초대가 하나만 생기고, 링크만 새로 바뀐다.
 * 준비가 안 됐으면(표 · 정식 주소) 단추를 끄고 까닭은 화면 위 안내가 말한다(ready · blockedText).
 */
export function CreateInvitation({ ready, blockedText, devNote }: { ready: boolean; blockedText: string | null; devNote: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [made, setMade] = useState<ShownLink>();
  /** 앞서 만든 초대 — 다시 누름이 막혔을 때 그 접수로 가는 길을 준다 */
  const [earlier, setEarlier] = useState<string>();
  const requestKey = useRef<string | null>(null);

  /* 창을 닫으면 키도 버린다 — 다시 열어 다른 사람의 초대를 적을 때 앞 창의 초대를 돌려받지 않게. 답을 잃은 앞 초대는 목록에 '아직 열지 않았어요'로 남는다 */
  const close = () => {
    setOpen(false);
    setMade(undefined);
    setError(undefined);
    setEarlier(undefined);
    requestKey.current = null;
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (k: string) => String(form.get(k) ?? '');
    setError(undefined);
    setEarlier(undefined);
    requestKey.current ??= newRequestKey();
    const createRequestKey = requestKey.current;
    start(async () => {
      const r = await orOffline(
        createIntakeInvitation({
          createRequestKey,
          note: text('note').trim() || null,
          uploadDays: numberOf(text('uploadDays')),
          resultDays: numberOf(text('resultDays')),
          /* 접근 코드는 R03 부터 받지 않는다 — 받는 분이 처음 열 때 이름과 PIN 을 정한다. 서버는 예전 초대를 위해 칸을 아직 받는다 */
          maxFileBytes: bytesOf(numberOf(text('maxFileMb'))),
          maxTotalBytes: bytesOf(numberOf(text('maxTotalMb'))),
        }),
        null,
      );
      /* 답을 못 받았다 — 키를 그대로 두어 다시 눌러도 초대가 더 생기지 않는다 */
      if (!r) return setError(OFFLINE_MESSAGE);
      if (!r.ok) {
        const field = typeof r.detail?.field === 'string' ? FIELD_TEXT[r.detail.field] : undefined;
        /* 이 키로는 더 못 잇는다(시작한 초대 · 새 링크로 바뀜 · 내용이 다름 · 폐기 · 키가 틀림) — 다음 만들기는 새 초대가 되게 키를 바꾼다 */
        if (DEAD_KEY_CODES.has(r.code) || (r.code === 'invalid_input' && r.detail?.field === 'createRequestKey')) requestKey.current = null;
        if (r.code === 'intake_not_ready') quietRefresh(router);
        if (typeof r.detail?.submissionId === 'string') setEarlier(r.detail.submissionId);
        return setError(field ?? r.message);
      }
      /* 받았다 — 다음 만들기는 새 초대다 */
      requestKey.current = null;
      setMade({
        link: r.link,
        external: r.external,
        expires: r.uploadExpiresAt,
        /* 저장된 초대의 값이다 — 지금 폼 값이 아니다 */
        coded: r.coded,
        note: r.reissued ? '앞서 누른 만들기가 이미 저장돼 있었어요. 그 초대의 링크를 새로 바꿨어요. 그 전에 받은 링크가 있다면 이제 쓸 수 없어요.' : null,
      });
      quietRefresh(router);
    });
  };

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)} disabled={!ready} aria-describedby={ready ? undefined : 'intake-readiness'} title={blockedText ?? undefined}>
        <Plus aria-hidden className="h-4 w-4" />
        초대 만들기
      </Button>
      <Modal open={open} onClose={close} title={made ? (made.external ? '초대 링크를 만들었어요' : '개발용 초대 링크예요') : '초대 만들기'}>
        {made ? (
          <IssuedLinkPanel made={made} devNote={devNote} onClose={close} />
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
            <p className="text-sm text-muted">받는 분이 처음 열 때 이름과 숫자 네 자리 PIN 을 정해요. 한 사람에게 링크 하나를 보내 주세요.</p>
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
            {earlier && (
              <Link href={`/admin/intake/${earlier}`} onClick={close} className="inline-flex min-h-10 items-center text-sm text-sky underline underline-offset-2">
                앞서 만든 초대 열기
              </Link>
            )}
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
