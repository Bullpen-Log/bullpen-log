'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Download, Play, Trash2 } from '@/components/icon';
import { ConfirmDialog } from '@/components/confirm-delete';
import { ErrorLine } from '@/components/error-line';
import { Modal } from '@/components/modal';
import { toast } from '@/components/toast';
import { Button, Textarea } from '@/components/ui';
import { orOffline } from '@/lib/action-offline';
import {
  ASSET_STATUS_TEXT,
  HAND_TEXT,
  JOB_STATE_TEXT,
  REISSUE_WARNING_TEXT,
  REJECT_CODE_TEXT,
  RUN_STATUS_TEXT,
  VIEW_TEXT,
  jobStateTone,
  jobWaitNoteText,
  seoulDateText,
  seoulTimeText,
  textOf,
} from '@/lib/intake/admin-labels';
import type { IntakeAdminPerson, IntakeAssetDetail, IntakeDetail, IntakeJobIssue, OriginalLink } from '@/lib/intake/admin';
import type { AnalysisReadiness } from '@/lib/intake/analysis';
import { formatBytes } from '@/lib/intake/limits';
import { INTAKE_VIEWS } from '@/lib/intake/state';
import {
  addIntakeAdminNote,
  assignIntake,
  deleteIntakeAdminNote,
  getIntakeOriginalLink,
  getIntakePairLinks,
  getIntakeRunPreview,
  markIntakeSeen,
  markIntakeUnseen,
  publishIntakeRun,
  reissueIntakeInvitation,
  revokeIntakeInvitation,
  runIntakeAnalysis,
  setIntakeHand,
  unpublishIntake,
} from '@/app/actions/intake-admin';
import { IssuedLinkPanel, type ShownLink } from '../create-invitation';
import { acknowledgementForPublish, dropsAcknowledgement, originalWarning, runPreviewVisible } from './detail-rules';
import { RunReview } from './run-review';
import { useAction } from './use-action';

/**
 * 끝나지 못한 일감 하나의 모습 — 상태 글 · 시도 · 시각, 그리고 까닭.
 * 큰 파일이라 예산 때문에 기다리는 파일 확인(waiting)은 실패가 아니라 오류 색 없이 보이고, 시도 횟수도 안 쓰니 안 보인다.
 * JobIssuesPanel(detail-manage.tsx)의 상태 줄 · 오류 줄을 이것으로 바꿔 그린다.
 */
export function JobStateLine({ issue: j }: { issue: Pick<IntakeJobIssue, 'state' | 'attempts' | 'maxAttempts' | 'updatedAt' | 'lastError' | 'note'> }) {
  const waiting = jobStateTone(j.state) === 'neutral';
  const note = waiting ? jobWaitNoteText(j.note) : null;
  return (
    <>
      <p className="text-xs text-muted">
        {textOf(JOB_STATE_TEXT, j.state)}
        {waiting ? '' : ` · 시도 ${j.attempts}/${j.maxAttempts}`} · {seoulTimeText(j.updatedAt)}
      </p>
      {note && <p className="break-words text-xs text-muted">{note}</p>}
      {j.lastError && <p className={`break-words font-mono text-xs ${waiting ? 'text-muted' : 'text-danger'}`}>{j.lastError}</p>}
    </>
  );
}

/** 화면이 받는 실행 한 줄 — 저장 경로는 뺐다 */
export type RunRow = {
  id: string;
  revisionNumber: number;
  isCurrentRevision: boolean;
  engineKey: string;
  status: string;
  requestedAt: string;
  finishedAt: string | null;
  failureText: string | null;
  failureDetail: string | null;
  videoFault: boolean;
  hasResult: boolean;
  frames: number | null;
  published: boolean;
  hasPreviews: boolean;
  /** 영상 시간을 믿지 못해 시간 지표를 뺀 실행 */
  timingDropped: boolean;
  /** 걸기 답을 못 받아 결과를 기다리는 중 */
  startUnknown: boolean;
};

/** 화면이 붙은 뒤에 읽음을 남긴다 — 미리 받기가 읽음으로 만들지 않게. 이 관리자 것만 바뀐다 */
export function ReadMarker({ submissionId, unread }: { submissionId: string; unread: boolean }) {
  const done = useRef(false);
  const [left, setLeft] = useState(false);
  const { pending, run } = useAction();
  useEffect(() => {
    if (done.current || !unread) return;
    done.current = true;
    void orOffline(markIntakeSeen(submissionId), null);
  }, [submissionId, unread]);
  return (
    <div className="flex justify-end">
      <button
        type="button"
        disabled={pending || left}
        onClick={() => run(() => markIntakeUnseen(submissionId), () => setLeft(true))}
        className="min-h-10 px-1 text-xs text-muted underline-offset-2 hover:text-ink hover:underline disabled:no-underline"
      >
        {left ? '안 읽음으로 뒀어요' : '안 읽음으로 두기'}
      </button>
    </div>
  );
}

/** 담당자 — 알던 값을 같이 보낸다. 그사이 다른 관리자가 바꿨으면 막히고 최신 값을 다시 받는다 */
export function AssignBox({ submissionId, assigneeId, admins, me }: { submissionId: string; assigneeId: string | null; admins: IntakeAdminPerson[]; me: string }) {
  const { pending, error, run, refresh } = useAction();
  const change = (next: string | null) => run(() => assignIntake(submissionId, next, assigneeId), () => refresh());
  return (
    <div className="space-y-2">
      <select
        aria-label="담당자"
        value={assigneeId ?? ''}
        disabled={pending}
        onChange={(e) => change(e.target.value || null)}
        className="min-h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
      >
        <option value="">담당 없음</option>
        {admins.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {a.id === me ? '(나)' : ''}
          </option>
        ))}
      </select>
      {assigneeId !== me && (
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => change(me)} className="w-full">
          내가 맡기
        </Button>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}

const startDownload = (link: Pick<OriginalLink, 'url' | 'fileName'>) => {
  const a = document.createElement('a');
  a.href = link.url;
  a.download = link.fileName;
  a.rel = 'noreferrer';
  document.body.append(a);
  a.click();
  a.remove();
};

const seconds = (v: number | null) => (v == null ? '-' : `${v.toFixed(2)}초`);
const shortHash = (h: string | null) => (h ? `${h.slice(0, 12)}…` : '-');

const UNTRUSTED_FILE_TEXT = '보낸 분이 고른 파일이 그대로 내려받혀요. 내려받은 뒤 바로 열지 말고, 무엇인지 확인한 다음에 열어 주세요.';

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-ink">{children}</dd>
    </div>
  );
}

/**
 * 칸 하나의 영상 — 미리보기는 누를 때 받는다(몇 GB 파일을 화면을 열자마자 읽지 않게). 소리는 끈 채, 저절로 재생하지 않는다.
 * 영상이라고 확인되지 않은 파일은 내려받기 전에 먼저 묻는다 — 받는 사람이 고른 파일이 관리자 컴퓨터로 들어가는 일이라서.
 */
export function AssetCard({ submissionId, asset: a, locked, hasRunPreview = false }: { submissionId: string; asset: IntakeAssetDetail; locked: boolean; hasRunPreview?: boolean }) {
  const { pending, error, run } = useAction();
  const [preview, setPreview] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [ask, setAsk] = useState(false);
  const usable = a.available && !locked;
  const warning = originalWarning(a);

  const open = () => {
    setFailed(false);
    run(() => getIntakeOriginalLink(submissionId, a.id, 'preview'), (r) => setPreview(r.link.url));
  };
  const download = () =>
    run(
      () => getIntakeOriginalLink(submissionId, a.id, 'download'),
      (r) => {
        setAsk(false);
        startDownload(r.link);
      },
      () => setAsk(false),
    );
  const failedText = warning ? '재생할 수 없어요. 영상이 아닐 수 있어요.' : hasRunPreview ? '이 브라우저에서 재생할 수 없어요. 분석 칸의 미리보기 영상으로 볼 수 있어요.' : '이 브라우저에서 재생할 수 없어요. 원본을 내려받아 확인해 주세요.';

  return (
    <article className="min-w-0 space-y-3 rounded-xl border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">
          {VIEW_TEXT[a.view]} 영상{a.current ? '' : ` · ${a.revisions.join(', ')}판`}
        </h3>
        <span className="text-xs text-muted">{textOf(ASSET_STATUS_TEXT, a.status)}</span>
      </div>
      {preview && !failed ? (
        <video src={preview} controls muted playsInline preload="metadata" onError={() => setFailed(true)} className="aspect-video w-full rounded-lg bg-black" />
      ) : (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg bg-surface-2 p-3 text-center">
          {failed && <p className="text-xs text-muted">{failedText}</p>}
          {a.purgedAt && <p className="text-xs text-muted">지워짐 · {seoulDateText(a.purgedAt)}</p>}
          <Button type="button" variant="secondary" size="sm" disabled={!usable || pending} onClick={open}>
            <Play aria-hidden className="h-4 w-4" />
            {failed ? '다시 불러오기' : '미리보기'}
          </Button>
        </div>
      )}
      <dl className="space-y-1 text-xs">
        <FactRow label="파일">{a.fileName}</FactRow>
        {a.purgedAt && <FactRow label="저장소">{`지워짐 · ${seoulDateText(a.purgedAt)}`}</FactRow>}
        <FactRow label="크기">{formatBytes(a.storedBytes ?? a.declaredBytes)}</FactRow>
        {a.integrity && <FactRow label="전송">{a.integrity}</FactRow>}
        {a.rejectCode && <FactRow label="막힌 까닭">{textOf(REJECT_CODE_TEXT, a.rejectCode)}</FactRow>}
        {a.fps && <FactRow label="장면">{a.averageFps ? `${a.fps} · 평균 ${a.averageFps.toFixed(2)}` : a.fps}</FactRow>}
        {a.width != null && a.height != null && <FactRow label="화면">{`${a.width}×${a.height}${a.rotation ? ` · ${a.rotation}° 회전` : ''}`}</FactRow>}
        {a.codec && <FactRow label="코덱">{`${a.codec}${a.container ? ` · ${a.container}` : ''}`}</FactRow>}
        {a.sampleDurationSec != null && <FactRow label={a.durationLabel}>{seconds(a.sampleDurationSec)}</FactRow>}
        {a.playbackDurationSec != null && <FactRow label="재생 길이">{seconds(a.playbackDurationSec)}</FactRow>}
        {a.timing && <FactRow label="시간">{a.timing}</FactRow>}
        {(a.make || a.model) && <FactRow label="기기(파일에 적힌 값)">{[a.make, a.model].filter(Boolean).join(' ')}</FactRow>}
        {a.captureAt && <FactRow label="촬영일(파일에 적힌 값)">{`${seoulTimeText(a.captureAt)} · ${a.captureAtSource ?? '출처 모름'}`}</FactRow>}
        <FactRow label="SHA-256">
          <span className="font-mono" title={a.serverSha256 ?? a.clientSha256}>
            {shortHash(a.serverSha256 ?? a.clientSha256)}
            {a.hashMatched ? ' 일치' : ''}
          </span>
        </FactRow>
      </dl>
      {warning && usable && <p className="text-xs text-warn">{warning} 내려받기 전에 한 번 더 물어요.</p>}
      <Button type="button" variant="secondary" size="sm" disabled={!usable || pending} onClick={() => (warning ? setAsk(true) : download())} className="w-full">
        <Download aria-hidden className="h-4 w-4" />
        원본 내려받기
      </Button>
      {error && <ErrorLine>{error}</ErrorLine>}
      <ConfirmDialog
        open={ask}
        onClose={() => setAsk(false)}
        title="확인되지 않은 파일을 내려받을까요?"
        detail={`${warning ?? ''} ${UNTRUSTED_FILE_TEXT}`}
        confirmLabel="그래도 내려받기"
        pendingLabel="주소를 받는 중…"
        pending={pending}
        onConfirm={download}
      />
    </article>
  );
}

/**
 * 짝 내려받기 — 묶음 파일이 아니라 원본 둘의 5분짜리 주소다. 브라우저가 둘째를 막을 수 있어 주소도 눌러 받을 수 있게 남긴다.
 * 주소는 화면 상태에만 있고, 5분이 지나면 다시 눌러야 한다.
 */
export function PairDownload({ submissionId, warning = null }: { submissionId: string; warning?: string | null }) {
  const { pending, error, run } = useAction();
  const [links, setLinks] = useState<OriginalLink[]>();
  const [ask, setAsk] = useState(false);
  const get = () =>
    run(
      () => getIntakePairLinks(submissionId),
      (r) => {
        setAsk(false);
        setLinks(r.links);
        r.links.forEach((l, i) => window.setTimeout(() => startDownload(l), i * 600));
      },
      () => setAsk(false),
    );
  return (
    <div className="min-w-0 space-y-2 text-right">
      <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => (warning ? setAsk(true) : get())}>
        <Download aria-hidden className="h-4 w-4" />
        옆 · 뒤 원본 함께 받기
      </Button>
      {links && (
        <ul className="space-y-1 text-left text-xs">
          {links.map((l) => (
            <li key={l.assetId}>
              <a href={l.url} download={l.fileName} rel="noreferrer" className="break-all text-sky underline-offset-2 hover:underline">
                {l.fileName}
              </a>
            </li>
          ))}
          <li className="text-muted">하나만 받아졌다면 위 이름을 눌러 주세요. 주소는 5분 동안만 써요.</li>
        </ul>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
      <ConfirmDialog
        open={ask}
        onClose={() => setAsk(false)}
        title="확인되지 않은 파일이 있어요"
        detail={`${warning ?? ''} ${UNTRUSTED_FILE_TEXT}`}
        confirmLabel="그래도 내려받기"
        pendingLabel="주소를 받는 중…"
        pending={pending}
        onConfirm={get}
      />
    </div>
  );
}

export function NotesPanel({ submissionId, notes }: { submissionId: string; notes: IntakeDetail['notes'] }) {
  const { pending, error, run, refresh } = useAction();
  const [body, setBody] = useState('');
  const add = (e: FormEvent) => {
    e.preventDefault();
    run(() => addIntakeAdminNote(submissionId, body), () => {
      setBody('');
      refresh();
    });
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">공개 화면에는 나가지 않아요.</p>
      <form onSubmit={add} className="space-y-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000} aria-label="내부 메모" />
        <Button type="submit" variant="secondary" size="sm" disabled={pending || !body.trim()}>
          남기기
        </Button>
      </form>
      {error && <ErrorLine>{error}</ErrorLine>}
      <ul className="space-y-2">
        {notes.map((n) => (
          <li key={n.id} className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
            <p className="whitespace-pre-wrap break-words text-ink">{n.body}</p>
            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
              <span>
                {n.author} · {seoulTimeText(n.createdAt)}
              </span>
              {n.mine && (
                <button
                  type="button"
                  aria-label="메모 지우기"
                  disabled={pending}
                  onClick={() => run(() => deleteIntakeAdminNote(submissionId, n.id), () => refresh())}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted hover:text-danger"
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 새 링크 만들기 — 링크를 잃었거나 잘못 보냈을 때. 예전 링크는 바로 막히고 받은 영상 · 공개 결과는 새 링크로 이어진다.
 * 새 링크는 이 창에서 한 번만 보인다. 그릴 때 본 바꿈 횟수를 보내, 다른 관리자가 먼저 바꿨으면 막고 최신 내용을 다시 받는다.
 * 준비가 안 됐으면(ready false) 단추를 끄고 까닭을 말한다.
 */
export function ReissueButton({
  submissionId,
  reissueCount,
  ready,
  blockedText,
  devNote,
}: {
  submissionId: string;
  reissueCount: number;
  ready: boolean;
  blockedText: string | null;
  devNote: string | null;
}) {
  const { pending, error, run, refresh } = useAction();
  const [ask, setAsk] = useState(false);
  /* 묻는 창을 연 순간의 횟수를 쥔다 — 창 뒤에서 화면이 새로 그려져도 관리자가 본 것으로 맞춰 본다 */
  const [seen, setSeen] = useState(reissueCount);
  const [made, setMade] = useState<ShownLink>();
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={!ready}
        title={blockedText ?? undefined}
        onClick={() => {
          setSeen(reissueCount);
          setAsk(true);
        }}
        className="w-full"
      >
        새 링크 만들기
      </Button>
      {!ready && blockedText && <p className="text-xs text-warn">{blockedText}</p>}
      {error && <ErrorLine>{error}</ErrorLine>}
      <ConfirmDialog
        open={ask && !made}
        onClose={() => setAsk(false)}
        title="새 링크를 만들까요?"
        detail={`${REISSUE_WARNING_TEXT} 새 링크는 한 번만 보여요. 이미 내준 전송 토큰은 수명이 끝날 때까지 살아 있어요.`}
        confirmLabel="새 링크 만들기"
        pendingLabel="만드는 중…"
        pending={pending}
        onConfirm={() =>
          run(
            () => reissueIntakeInvitation(submissionId, seen),
            (r) => {
              setAsk(false);
              setMade({ link: r.link, external: r.external, expires: r.uploadExpiresAt });
            },
            () => setAsk(false),
          )
        }
      />
      <Modal
        open={made != null}
        onClose={() => {
          setMade(undefined);
          refresh();
        }}
        title={made?.external === false ? '개발용 새 링크예요' : '새 링크를 만들었어요'}
      >
        {made && (
          <IssuedLinkPanel
            made={made}
            devNote={devNote}
            onClose={() => {
              setMade(undefined);
              refresh();
            }}
          />
        )}
      </Modal>
    </>
  );
}

export function RevokeButton({ submissionId, retentionLine }: { submissionId: string; retentionLine: string }) {
  const { pending, error, run, refresh } = useAction();
  const [ask, setAsk] = useState(false);
  return (
    <>
      <Button type="button" variant="danger" size="sm" onClick={() => setAsk(true)} className="w-full">
        초대 폐기
      </Button>
      {error && <ErrorLine>{error}</ErrorLine>}
      <ConfirmDialog
        open={ask}
        onClose={() => setAsk(false)}
        title="초대를 폐기할까요?"
        detail={`새 전송과 접수 완료, 결과 보기, 새 분석이 막혀요. 되돌릴 수 없어요. 이미 내준 전송 토큰은 저장소에서 바로 거둘 수 없어 수명이 끝날 때까지 살아 있어요. ${retentionLine} 받는 분이 철회를 알렸다면 동의 칸에서 따로 기록해 주세요.`}
        confirmLabel="폐기"
        pendingLabel="폐기하는 중…"
        pending={pending}
        onConfirm={() =>
          run(() => revokeIntakeInvitation(submissionId), () => {
            setAsk(false);
            refresh();
          })
        }
      />
    </>
  );
}

/** 분석이 구운 가벼운 영상 — HEVC/MOV 를 못 푸는 브라우저에서 볼 길이다. 실패한 실행은 굽기 전에 끝났을 수 있어 없는 칸이 나올 수 있다 */
function PreviewPair({ submissionId, runId, partial }: { submissionId: string; runId: string; partial: boolean }) {
  const { pending, error, run } = useAction();
  const [url, setUrl] = useState<string>();
  return (
    <div className="space-y-2">
      {partial && <p className="text-xs text-muted">끝까지 돌지 못한 실행이라 영상이 없을 수 있어요.</p>}
      <div className="flex flex-wrap gap-2">
        {INTAKE_VIEWS.map((v) => (
          <Button key={v} type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => getIntakeRunPreview(submissionId, runId, v), (r) => setUrl(r.url))}>
            {VIEW_TEXT[v]} 미리보기 영상
          </Button>
        ))}
      </div>
      {url && <video src={url} controls muted playsInline preload="metadata" className="aspect-video w-full rounded-lg bg-black" />}
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}

/**
 * 실행 한 줄. 공개 · 내리기는 그릴 때 본 지금 공개(activePublicationId)를 같이 보낸다.
 * 그사이 다른 관리자가 바꿨으면 서버가 막고, 창을 닫은 뒤 까닭을 보이며 최신 내용을 다시 받는다(공개 결과가 말없이 바뀌지 않게).
 * 묻는 창을 띄운 뒤에는 그 순간의 값을 쥔다 — 창 뒤에서 화면이 새로 그려져도 관리자가 본 것을 기준으로 맞춰 본다.
 */
function RunItem({ submissionId, run: r, activePublicationId, disabled }: { submissionId: string; run: RunRow; activePublicationId: string | null; disabled: boolean }) {
  const { pending, error, run, refresh } = useAction();
  const [note, setNote] = useState('');
  const [ask, setAsk] = useState<'publish' | 'unpublish' | null>(null);
  const seenPublication = useRef(activePublicationId);
  const activeOther = activePublicationId != null && !r.published;
  const canPublish = r.status === 'succeeded' && r.hasResult && !r.published && r.isCurrentRevision && !disabled;
  /* 공개 전에 받는 사람이 볼 3D 를 연다 — 공개 중이거나 옛 판인 결과도 다시 볼 수 있다.
     공개 단추는 이 관리자의 검토 완료 번호가 있을 때만 켜진다. 서버가 그 번호를 잠금 안에서 다시 맞춰 보고, 낡았으면 막는다(INTAKE-MAIN/R01) */
  const reviewable = r.status === 'succeeded' && r.hasResult && !disabled;
  const [ack, setAck] = useState<{ id: string; publication: string | null } | null>(null);
  /* 그린 뒤 공개가 바뀌었으면(다른 관리자 · 내리기) 그 검토 완료는 서버가 받지 않는다 — 다시 검토하게 단추를 끈다 */
  const acknowledgementId = acknowledgementForPublish(ack, activePublicationId);
  const dropStaleAck = (f: { code: string }) => {
    if (dropsAcknowledgement(f.code)) setAck(null);
  };
  const askFirst = (what: 'publish' | 'unpublish') => {
    seenPublication.current = activePublicationId;
    setAsk(what);
  };
  const closeAsk = () => setAsk(null);
  const publish = (expected: string | null) =>
    run(
      () => publishIntakeRun(submissionId, r.id, note, expected, { acknowledgementId }),
      (res) => {
        setAsk(null);
        setAck(null);
        toast(res.replaced ? '공개 판을 이 결과로 바꿨어요' : '결과를 공개했어요');
        refresh();
      },
      (f) => {
        dropStaleAck(f);
        closeAsk();
      },
    );
  const unpublish = (expected: string | null) =>
    run(
      () => unpublishIntake(submissionId, expected),
      () => {
        setAsk(null);
        refresh();
      },
      closeAsk,
    );
  return (
    <li className="space-y-2 rounded-xl border border-line p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-ink">
          {r.revisionNumber}판 · {textOf(RUN_STATUS_TEXT, r.status)}
          {r.published ? ' · 공개 중' : ''}
          {r.isCurrentRevision ? '' : ' · 옛 판'}
        </span>
        <span className="text-xs text-muted">{seoulTimeText(r.finishedAt ?? r.requestedAt)}</span>
      </div>
      <p className="break-all font-mono text-xs text-muted">{r.engineKey}</p>
      {r.frames != null && <p className="text-xs text-muted">장면 {r.frames}개</p>}
      {r.timingDropped && <p className="text-xs text-warn">영상 시간을 실제 시간으로 믿을 수 없어 시간 지표를 뺀 실행이에요.</p>}
      {r.startUnknown && <p className="text-xs text-muted">분석 서버의 답을 못 받아 결과를 기다리고 있어요. 그동안 다시 분석은 막혀요.</p>}
      {r.failureText && (
        <p className="text-sm text-danger">
          {r.failureText}
          {r.videoFault ? ' 영상 탓이라 고침을 요청하는 편이 좋아요.' : ''}
          {r.failureDetail ? <span className="mt-0.5 block break-words text-xs text-muted">{r.failureDetail}</span> : null}
        </p>
      )}
      {runPreviewVisible(r, disabled) && <PreviewPair submissionId={submissionId} runId={r.id} partial={r.status !== 'succeeded'} />}
      {reviewable && (
        <RunReview
          submissionId={submissionId}
          runId={r.id}
          explanation={note}
          acknowledged={acknowledgementId != null}
          onAcknowledged={(id) => setAck({ id, publication: activePublicationId })}
        />
      )}
      {canPublish && (
        <div className="space-y-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="공개 화면에 보일 설명(선택)" aria-label="공개 설명" />
          {activeOther && <p className="text-xs text-warn">다른 결과가 공개 중이에요. 공개하면 이 결과로 바뀌어요.</p>}
          {acknowledgementId == null && <p className="text-xs text-muted">먼저 3D 결과를 열어 보고 ‘이 결과 검토 완료’를 누르면 공개할 수 있어요.</p>}
          <Button type="button" size="sm" disabled={pending || acknowledgementId == null} onClick={() => (activeOther ? askFirst('publish') : publish(activePublicationId))}>
            이 결과 공개
          </Button>
        </div>
      )}
      {r.published && (
        <Button type="button" variant="danger" size="sm" disabled={pending} onClick={() => askFirst('unpublish')}>
          공개 내리기
        </Button>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
      <ConfirmDialog
        open={ask === 'publish'}
        onClose={closeAsk}
        title="공개 중인 결과를 바꿀까요?"
        detail="받은 분의 링크에 이 결과가 대신 보여요."
        confirmLabel="바꾸기"
        pendingLabel="바꾸는 중…"
        pending={pending}
        onConfirm={() => publish(seenPublication.current)}
      />
      <ConfirmDialog
        open={ask === 'unpublish'}
        onClose={closeAsk}
        title="공개를 내릴까요?"
        detail="받은 분의 링크에서 결과가 사라져요. 분석 결과는 지워지지 않아요."
        confirmLabel="내리기"
        pendingLabel="내리는 중…"
        pending={pending}
        onConfirm={() => unpublish(seenPublication.current)}
      />
    </li>
  );
}

/** 분석은 눌러야만 돈다(유료 GPU). 막는 까닭은 서버가 말한 그대로 보인다 */
export function AnalysisPanel({
  submissionId,
  analysisStatus,
  readiness,
  runs,
  hand,
  withdrawn,
  activePublicationId,
}: {
  submissionId: string;
  analysisStatus: string;
  readiness: AnalysisReadiness;
  runs: RunRow[];
  hand: string | null;
  withdrawn: boolean;
  /** 그릴 때 본 지금 공개 — 공개 · 내리기가 같이 보낸다 */
  activePublicationId: string | null;
}) {
  const { pending, error, run, refresh } = useAction();
  const [confirmDraft, setConfirmDraft] = useState(false);
  const busy = analysisStatus === 'queued' || analysisStatus === 'running';
  /* 원본이 없으면 다른 까닭을 풀어도 돌릴 수 없다 — 손 고르기 · 분석 전 주의 · 국외 이전 확인을 묻지 않고 그 까닭만 보인다 */
  const purged = readiness.blockers.some((b) => b.code === 'original_purged');
  const blockers = readiness.blockers.filter((b) => (purged ? b.code === 'original_purged' : b.code !== 'analysis_confirm_required'));
  const askable = !withdrawn && !purged;
  const runnable = !busy && askable && blockers.length === 0 && (!readiness.needsDraftConfirm || confirmDraft);
  const notes = askable ? readiness.inputNotes : [];
  const start = () =>
    run(() => runIntakeAnalysis(submissionId, confirmDraft), (r) => {
      toast(r.created ? '분석을 걸었어요' : '같은 입력의 분석이 이미 있어요');
      refresh();
    });
  return (
    <div className="space-y-3">
      {!hand && readiness.hand == null && askable && (
        <div className="space-y-2">
          <p className="text-sm text-ink">분석하려면 던지는 손을 정해 주세요.</p>
          <div className="flex gap-2">
            {(['R', 'L'] as const).map((h) => (
              <Button key={h} type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run(() => setIntakeHand(submissionId, h), () => refresh())}>
                {textOf(HAND_TEXT, h)}
              </Button>
            ))}
          </div>
        </div>
      )}
      {blockers.length > 0 && (
        <ul className="space-y-1 text-sm text-muted">
          {blockers.map((b) => (
            <li key={b.code}>{b.text}</li>
          ))}
        </ul>
      )}
      {notes.length > 0 && (
        <div className="space-y-1 rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-sm text-warn">
          <p className="font-semibold">분석 전에 볼 것</p>
          <ul className="space-y-0.5">
            {notes.map((n) => (
              <li key={`${n.view}-${n.code}`}>{n.text}</li>
            ))}
          </ul>
          {notes.some((n) => n.dropsTiming) && <p className="text-xs">이대로 돌리면 착지에서 릴리스까지의 시간 지표는 빠져요. 막지는 않아요.</p>}
        </div>
      )}
      {readiness.needsDraftConfirm && askable && (
        <label className="flex min-h-10 cursor-pointer items-start gap-2 text-sm text-ink">
          <input type="checkbox" checked={confirmDraft} onChange={(e) => setConfirmDraft(e.target.checked)} className="mt-0.5 h-4 w-4 accent-(--color-sky)" />
          국외 이전 안내가 아직 확정 전인 것을 알고 실행해요.
        </label>
      )}
      <Button type="button" size="sm" disabled={pending || !runnable} onClick={start}>
        {busy ? '분석 진행 중' : pending ? '거는 중…' : runs.some((r) => r.isCurrentRevision && r.status === 'failed') ? '다시 분석' : '분석 실행'}
      </Button>
      {error && <ErrorLine>{error}</ErrorLine>}
      {runs.length > 0 && (
        <ul className="space-y-2">
          {runs.map((r) => (
            <RunItem key={r.id} submissionId={submissionId} run={r} activePublicationId={activePublicationId} disabled={withdrawn} />
          ))}
        </ul>
      )}
    </div>
  );
}
