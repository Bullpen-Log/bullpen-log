'use client';

import { useState, type FormEvent } from 'react';
import { RefreshCw, RotateCcw, Send } from '@/components/icon';
import { ConfirmDialog } from '@/components/confirm-delete';
import { ErrorLine } from '@/components/error-line';
import { toast } from '@/components/toast';
import { Button, Textarea } from '@/components/ui';
import { CORRECTION_FIELD_TEXT, JOB_KIND_TEXT, VIEW_TEXT, seoulDateText, seoulTimeText, textOf } from '@/lib/intake/admin-labels';
import type { IntakeJobIssue } from '@/lib/intake/admin';
import { CORRECTABLE_FIELDS, INTAKE_VIEWS, type CorrectionRequest, type IntakeView } from '@/lib/intake/state';
import {
  cancelIntakeCorrection,
  extendIntakeUploadWindow,
  requestIntakeCorrection,
  requeueIntakeVerification,
  resetIntakeAccessCodeLock,
  withdrawIntakeConsent,
  withdrawIntakeModelConsent,
} from '@/app/actions/intake-admin';
import { JobStateLine } from './detail-client';
import { correctionText, goneViewsText } from './detail-rules';
import { useAction } from './use-action';

const selectClass = 'min-h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink';

function DaysOptions({ choices }: { choices: readonly number[] }) {
  return choices.map((d) => (
    <option key={d} value={d}>
      오늘부터 {d}일
    </option>
  ));
}

/** 끝나지 못한 일감 — 파일 확인이 멈추면 접수가 '확인 중'에 머문다. 까닭을 보이고, 시도를 다 쓴 일감은 다시 건다 */
export function JobIssuesPanel({ submissionId, issues, locked }: { submissionId: string; issues: IntakeJobIssue[]; locked: boolean }) {
  const { pending, error, run, refresh } = useAction();
  const requeue = () =>
    run(
      () => requeueIntakeVerification(submissionId),
      (r) => {
        toast(r.requeued > 0 ? '다시 확인을 걸었어요' : '다시 걸 일감이 없어요');
        refresh();
      },
    );
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {issues.map((j) => (
          <li key={j.id} className="space-y-0.5 rounded-xl border border-line px-3 py-2 text-sm">
            <p className="font-semibold text-ink">
              {textOf(JOB_KIND_TEXT, j.kind)}
              {j.view ? ` · ${VIEW_TEXT[j.view]} 영상` : ''}
              {j.revisionNumber != null ? ` · ${j.revisionNumber}판` : ''}
            </p>
            {/* 큰 파일 검증 대기는 시도 횟수를 안 쓰고 중립색으로 — 한 곳(JobStateLine)에서 그린다 */}
            <JobStateLine issue={j} />
          </li>
        ))}
      </ul>
      {locked ? null : issues.some((j) => j.canRequeue) ? (
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={requeue}>
          <RefreshCw aria-hidden className="h-4 w-4" />
          {pending ? '거는 중…' : '다시 확인'}
        </Button>
      ) : (
        <p className="text-xs text-muted">일꾼이 다시 돌면 저절로 이어져요. 오래 그대로면 크론이 도는지 확인해 주세요.</p>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}

/** 고침 요청 쓰기 · 바꾸기 — 고른 칸만 받는 사람에게 다시 열린다. 접수 version 을 같이 보내 그사이 바뀌었으면 막는다 */
function CorrectionForm({
  submissionId,
  version,
  uploadExpired,
  extendChoices,
  initial,
  editing,
  onDone,
  onCancel,
}: {
  submissionId: string;
  version: number;
  uploadExpired: boolean;
  extendChoices: readonly number[];
  initial: Pick<CorrectionRequest, 'fields' | 'views'> & { message?: string | null };
  editing: boolean;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const { pending, error, setError, run } = useAction();
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const days = String(form.get('extendDays') ?? '');
    const fields = form.getAll('fields').map(String);
    const views = form.getAll('views').map(String);
    if (!fields.length && !views.length) return setError('다시 받을 칸을 하나 이상 골라 주세요.');
    run(
      () =>
        requestIntakeCorrection({
          submissionId,
          expectedVersion: version,
          fields,
          views,
          message: String(form.get('message') ?? '').trim() || null,
          extendDays: days ? Number(days) : null,
        }),
      () => {
        toast(editing ? '고침 요청을 바꿨어요' : '고침을 요청했어요');
        onDone();
      },
    );
  };
  const box = 'flex min-h-10 cursor-pointer items-center gap-2 text-sm text-ink';
  return (
    <form onSubmit={submit} className="space-y-3">
      <fieldset className="grid grid-cols-2 gap-x-3">
        <legend className="mb-1 text-xs text-muted">다시 받을 칸</legend>
        {INTAKE_VIEWS.map((v) => (
          <label key={v} className={box}>
            <input type="checkbox" name="views" value={v} defaultChecked={initial.views.includes(v)} className="h-4 w-4 accent-(--color-sky)" />
            {VIEW_TEXT[v]} 영상
          </label>
        ))}
        {CORRECTABLE_FIELDS.map((f) => (
          <label key={f} className={box}>
            <input type="checkbox" name="fields" value={f} defaultChecked={initial.fields.includes(f)} className="h-4 w-4 accent-(--color-sky)" />
            {textOf(CORRECTION_FIELD_TEXT, f)}
          </label>
        ))}
      </fieldset>
      {editing && <p className="text-xs text-muted">빼는 칸은 접수 때 값으로 돌아가요. 받는 분이 그 칸에서 그사이 고친 내용은 내려가요.</p>}
      <Textarea name="message" rows={2} maxLength={500} defaultValue={initial.message ?? ''} placeholder="받는 분에게 보일 말(선택)" aria-label="받는 분에게 보일 말" />
      {extendChoices.length > 0 && (
        <label className="block space-y-1">
          <span className="block text-xs text-muted">{uploadExpired ? '올리기 기간이 끝났어요. 늘려야 고칠 수 있어요.' : '올리기 기간 늘리기(선택)'}</span>
          <select name="extendDays" defaultValue={uploadExpired ? String(extendChoices.find((d) => d >= 7) ?? extendChoices[0]) : ''} required={uploadExpired} className={selectClass}>
            {!uploadExpired && <option value="">그대로</option>}
            <DaysOptions choices={extendChoices} />
          </select>
        </label>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          <Send aria-hidden className="h-4 w-4" />
          {pending ? '보내는 중…' : editing ? '요청 바꾸기' : '고침 요청'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
            그대로 두기
          </Button>
        )}
      </div>
    </form>
  );
}

/** 고침 칸 — 새로 요청하고, 연 요청은 내용을 바꾸거나 거둔다. 잘못 누른 요청이나 빠진 칸 때문에 접수가 멈추지 않게 */
export function CorrectionPanel({
  submissionId,
  version,
  requested,
  correction,
  requestedAt,
  uploadExpired,
  editable,
  extendChoices,
  suggestViews,
  goneViews = [],
  deletingViews = [],
  cancelDetail,
}: {
  submissionId: string;
  version: number;
  /** 고침을 기다리는 중인가 */
  requested: boolean;
  correction: CorrectionRequest | null;
  requestedAt: string | null;
  uploadExpired: boolean;
  /** 초대가 살아 있어 요청을 쓰거나 바꿀 수 있나 — 아니면 초대를 폐기한 것이다. 받는 분이 고칠 수 없고 기간도 못 늘린다 */
  editable: boolean;
  extendChoices: readonly number[];
  suggestViews: readonly IntakeView[];
  /** suggestViews 가운데 원본이 없는 칸(지웠거나 지우는 중) — 접수는 끝났을 수 있어 '받아야 끝낼 수 있다'고 말하지 않는다 */
  goneViews?: readonly IntakeView[];
  /** goneViews 가운데 아직 지우고 있는 칸 — 지웠다고 말하지 않는다 */
  deletingViews?: readonly IntakeView[];
  /** 거두기 확인창 글 — 원본을 지웠으면 그대로라고 말하면 안 된다 */
  cancelDetail: string;
}) {
  const { pending, error, run, refresh } = useAction();
  const [editing, setEditing] = useState(false);
  const [ask, setAsk] = useState(false);
  const cancel = () =>
    run(
      () => cancelIntakeCorrection(submissionId, version),
      () => {
        setAsk(false);
        toast('고침 요청을 거뒀어요');
        refresh();
      },
      () => setAsk(false),
    );

  if (!requested) {
    const blocked = suggestViews.filter((v) => !goneViews.includes(v));
    const goneLine = goneViewsText(suggestViews.filter((v) => goneViews.includes(v)), deletingViews);
    const names = (views: readonly IntakeView[]) => views.map((v) => `${VIEW_TEXT[v]} 영상`).join(' · ');
    return (
      <div className="space-y-3">
        {blocked.length > 0 && <p className="text-xs text-warn">{names(blocked)}을 다시 받아야 접수를 끝낼 수 있어요.</p>}
        {goneLine && <p className="text-xs text-muted">{goneLine}</p>}
        <CorrectionForm
          key={version}
          submissionId={submissionId}
          version={version}
          uploadExpired={uploadExpired}
          extendChoices={extendChoices}
          initial={{ fields: [], views: [...suggestViews] }}
          editing={false}
          onDone={refresh}
        />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="space-y-1 text-sm text-ink">
        <p>요청한 내용: {correction ? correctionText(correction) : '읽지 못했어요'}</p>
        {correction?.message && <p className="whitespace-pre-wrap break-words text-muted">{correction.message}</p>}
        {requestedAt && <p className="text-xs text-muted">{seoulTimeText(requestedAt)} 요청</p>}
        {/* 폐기한 초대는 기간을 늘릴 수 없다(extendUploadWindow 'invitation_revoked') — 할 수 있는 일만 말한다 */}
        {!editable ? (
          <p className="text-xs text-warn">초대를 폐기해 받는 분이 고칠 수 없어요. 고침 요청을 거둘 수 있어요.</p>
        ) : (
          uploadExpired && <p className="text-xs text-warn">올리기 기간이 끝나 받는 분이 고칠 수 없어요. 기간을 늘려 주세요.</p>
        )}
      </div>
      {editing ? (
        <CorrectionForm
          key={version}
          submissionId={submissionId}
          version={version}
          uploadExpired={uploadExpired}
          extendChoices={extendChoices}
          initial={correction ?? { fields: [], views: [...suggestViews] }}
          editing
          onDone={() => {
            setEditing(false);
            refresh();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {editable && (
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => setEditing(true)}>
              요청 바꾸기
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setAsk(true)}>
            <RotateCcw aria-hidden className="h-4 w-4" />
            고침 요청 거두기
          </Button>
        </div>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
      <ConfirmDialog
        open={ask}
        onClose={() => setAsk(false)}
        title="고침 요청을 거둘까요?"
        detail={cancelDetail}
        confirmLabel="거두기"
        pendingLabel="거두는 중…"
        pending={pending}
        onConfirm={cancel}
      />
    </div>
  );
}

/** 올리기 기간 늘리기 — 초안과 고침 중에만 보인다. 끝난 전송이 기간을 넘겨 접수를 못 끝낸 사람도 이 길로 이어 간다 */
export function UploadWindowBox({ submissionId, expired, choices }: { submissionId: string; expired: boolean; choices: readonly number[] }) {
  const { pending, error, run, refresh } = useAction();
  const [days, setDays] = useState(String(choices.find((d) => d >= 7) ?? choices[0] ?? ''));
  if (choices.length === 0) return null;
  const extend = () =>
    run(
      () => extendIntakeUploadWindow(submissionId, Number(days)),
      (r) => {
        toast(`올리기 기간을 ${seoulDateText(r.uploadExpiresAt)}까지 늘렸어요`);
        refresh();
      },
    );
  return (
    <div className="space-y-2">
      {expired && <p className="text-xs text-warn">올리기 기간이 끝났어요. 늘리면 받는 분이 같은 링크로 이어서 끝낼 수 있어요.</p>}
      <select aria-label="올리기 기간" value={days} disabled={pending} onChange={(e) => setDays(e.target.value)} className={selectClass}>
        <DaysOptions choices={choices} />
      </select>
      <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={extend} className="w-full">
        {pending ? '늘리는 중…' : '올리기 기간 늘리기'}
      </Button>
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}

/** 접근 코드 막힘 풀기 — 코드는 그대로고 틀린 횟수만 지운다. 풀면 다시 시도할 수 있으니 받는 분이 맞는지 본 뒤에 푼다 */
export function AccessCodeLockBox({ submissionId, failures }: { submissionId: string; failures: number }) {
  const { pending, error, run, refresh } = useAction();
  const [ask, setAsk] = useState(false);
  const reset = () =>
    run(
      () => resetIntakeAccessCodeLock(submissionId),
      () => {
        setAsk(false);
        toast('결과 보기 잠금을 풀었어요');
        refresh();
      },
      () => setAsk(false),
    );
  return (
    <div className="space-y-2">
      <p className="text-xs text-warn">접근 코드를 {failures}번 틀려 결과 보기가 잠겼어요.</p>
      <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => setAsk(true)} className="w-full">
        결과 보기 잠금 풀기
      </Button>
      {error && <ErrorLine>{error}</ErrorLine>}
      <ConfirmDialog
        open={ask}
        onClose={() => setAsk(false)}
        title="결과 보기 잠금을 풀까요?"
        detail="틀린 횟수를 지우고 다시 코드를 받아요. 코드는 그대로예요. 링크를 가진 사람이 코드를 맞혀 보던 것일 수 있으니, 받는 분이 직접 틀렸는지 확인한 뒤에 풀어 주세요."
        confirmLabel="풀기"
        pendingLabel="푸는 중…"
        pending={pending}
        onConfirm={reset}
      />
    </div>
  );
}

/** 받는 분이 알린 모델 개발 동의 철회를 남긴다 — 접수 · 분석 · 공개는 그대로다. 링크가 폐기된 분은 화면이 없어 이 길뿐이다 */
export function WithdrawModelConsentButton({ submissionId }: { submissionId: string }) {
  const { pending, error, run, refresh } = useAction();
  const [ask, setAsk] = useState(false);
  const [note, setNote] = useState('');
  const withdraw = () =>
    run(
      () => withdrawIntakeModelConsent(submissionId, note.trim() || null),
      (r) => {
        setAsk(false);
        toast(r.withdrawn ? '모델 개발 동의 철회를 기록했어요' : '거둘 동의가 없어요');
        refresh();
      },
      () => setAsk(false),
    );
  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setAsk(true)} className="w-full">
        모델 개발 동의 철회 기록
      </Button>
      {error && <ErrorLine>{error}</ErrorLine>}
      <ConfirmDialog
        open={ask}
        onClose={() => setAsk(false)}
        title="모델 개발 동의 철회를 기록할까요?"
        detail={
          <div className="space-y-3">
            <p>받는 분이 철회를 알렸을 때만 남겨 주세요. 접수와 분석, 공개는 그대로예요.</p>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="누가 언제 어떻게 알렸는지(선택)" aria-label="모델 동의 철회를 알린 내용" />
          </div>
        }
        confirmLabel="철회 기록"
        pendingLabel="기록하는 중…"
        pending={pending}
        onConfirm={withdraw}
      />
    </>
  );
}

/**
 * 받는 분이 알린 필수 동의 철회를 남긴다 — 동의 글이 약속한 길이다. 되돌릴 수 없어 먼저 묻고, 누가 언제 알렸는지 같이 적는다.
 * 원본 줄은 지금 보유 상태를 아는 규칙(withdrawConsentRetentionText)이 준다 — 이미 지운 원본을 앞으로 지운다고 말하지 않게.
 */
export function WithdrawConsentButton({ submissionId, retentionLine }: { submissionId: string; retentionLine: string }) {
  const { pending, error, run, refresh } = useAction();
  const [ask, setAsk] = useState(false);
  const [note, setNote] = useState('');
  const withdraw = () =>
    run(
      () => withdrawIntakeConsent(submissionId, note.trim() || null),
      (r) => {
        setAsk(false);
        toast(r.unpublished ? '철회를 기록하고 공개를 내렸어요' : '철회를 기록했어요');
        refresh();
      },
      () => setAsk(false),
    );
  return (
    <>
      <Button type="button" variant="danger" size="sm" onClick={() => setAsk(true)} className="w-full">
        필수 동의 철회 기록
      </Button>
      {error && <ErrorLine>{error}</ErrorLine>}
      <ConfirmDialog
        open={ask}
        onClose={() => setAsk(false)}
        title="필수 동의 철회를 기록할까요?"
        detail={
          <div className="space-y-3">
            <p>받는 분이 철회를 알렸을 때만 남겨 주세요. 되돌릴 수 없어요.</p>
            <p>공개 중인 결과는 바로 내려가고, 새 분석과 원본 열기가 막혀요. 이미 돌던 분석은 멈출 수 없어서 결과를 받지 않고 닫아요.</p>
            <p>{retentionLine}</p>
            <p>모델 개발 동의는 이 기록으로 거둬지지 않고 따로 남아요. 받는 분이 그 동의도 거두길 원하면 모델 개발 동의 철회를 따로 기록해 주세요.</p>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="누가 언제 어떻게 알렸는지(선택)" aria-label="철회를 알린 내용" />
          </div>
        }
        confirmLabel="철회 기록"
        pendingLabel="기록하는 중…"
        pending={pending}
        onConfirm={withdraw}
      />
    </>
  );
}
