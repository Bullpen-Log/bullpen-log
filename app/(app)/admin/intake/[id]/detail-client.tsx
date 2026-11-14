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
import type {
  IntakeAdminPerson,
  IntakeAssetDetail,
  IntakeDetail,
  IntakeJobIssue,
  OriginalLink,
} from '@/lib/intake/admin';
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
  importIntakeManualResult,
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
import { acknowledgementForPublish, dropsAcknowledgement, manualFileProblem, originalWarning, runPreviewVisible } from './detail-rules';
import { RunReview } from './run-review';
import { useAction } from './use-action';

/**
 * 끝나지 못한 일감 하나의 모습 — 상태 글 · 시도 · 시각, 그리고 까닭.
 * 큰 파일이라 예산 때문에 기다리는 파일 확인(waiting)은 실패가 아니라 오류 색 없이 보이고, 시도 횟수도 안 쓰니 안 보인다.
 * JobIssuesPanel(detail-manage.tsx)의 상태 줄 · 오류 줄을 이것으로 바꿔 그린다.
 */
export function JobStateLine({
  issue: j,
}: {
  issue: Pick<
    IntakeJobIssue,
    'state' | 'attempts' | 'maxAttempts' | 'updatedAt' | 'lastError' | 'note'
  >;
}) {
  const waiting = jobStateTone(j.state) === 'neutral';
  const note = waiting ? jobWaitNoteText(j.note) : null;
  return (
    <>
      <p className="text-[13px] leading-5 text-muted">
        {textOf(JOB_STATE_TEXT, j.state)}
        {waiting ? '' : ` · 시도 ${j.attempts}/${j.maxAttempts}`} ·{' '}
        {seoulTimeText(j.updatedAt)}
      </p>
      {note && <p className="break-words text-[13px] leading-5 text-muted">{note}</p>}
      {j.lastError && (
        <p
          className={`break-words font-mono text-xs ${waiting ? 'text-muted' : 'text-danger'}`}
        >
          {j.lastError}
        </p>
      )}
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
  /** 결과가 어디서 왔나 — 'manual' 은 관리자가 가져온 결과(R03) */
  source: 'gpu' | 'manual';
  /** 가져온 파일 그대로의 해시(manual 일 때만) */
  manualSourceSha256: string | null;
};

/** 화면이 붙은 뒤에 읽음을 남긴다 — 미리 받기가 읽음으로 만들지 않게. 이 관리자 것만 바뀐다 */
export function ReadMarker({
  submissionId,
  unread,
}: {
  submissionId: string;
  unread: boolean;
}) {
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
        onClick={() =>
          run(
            () => markIntakeUnseen(submissionId),
            () => setLeft(true)
          )
        }
        className="min-h-10 px-1 text-[13px] leading-5 text-muted underline-offset-2 hover:text-ink hover:underline disabled:no-underline"
      >
        {left ? '안 읽음으로 표시했습니다' : '안 읽음으로 두기'}
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

const UNTRUSTED_FILE_TEXT =
  '제출한 파일을 그대로 다운로드합니다. 파일 유형을 확인한 뒤 엽니다.';

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
export function AssetCard({
  submissionId,
  asset: a,
  locked,
  hasRunPreview = false,
}: {
  submissionId: string;
  asset: IntakeAssetDetail;
  locked: boolean;
  hasRunPreview?: boolean;
}) {
  const { pending, error, run } = useAction();
  const [preview, setPreview] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [ask, setAsk] = useState(false);
  const usable = a.available && !locked;
  const warning = originalWarning(a);

  const open = () => {
    setFailed(false);
    run(
      () => getIntakeOriginalLink(submissionId, a.id, 'preview'),
      (r) => setPreview(r.link.url)
    );
  };
  const download = () =>
    run(
      () => getIntakeOriginalLink(submissionId, a.id, 'download'),
      (r) => {
        setAsk(false);
        startDownload(r.link);
      },
      () => setAsk(false)
    );
  const failedText = warning
    ? '재생할 수 없습니다. 영상이 아닐 수 있습니다.'
    : hasRunPreview
      ? '이 브라우저에서 재생할 수 없습니다. 결과의 미리보기 영상에서 확인할 수 있습니다.'
      : '이 브라우저에서 재생할 수 없습니다. 원본을 다운로드해 확인합니다.';

  return (
    <article className="min-w-0 space-y-3 rounded-xl border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">
          {VIEW_TEXT[a.view]} 영상{a.current ? '' : ` · ${a.revisions.join(', ')}판`}
        </h3>
        <span className="text-[13px] leading-5 text-muted">
          {textOf(ASSET_STATUS_TEXT, a.status)}
        </span>
      </div>
      {preview && !failed ? (
        <video
          src={preview}
          controls
          muted
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
          className="aspect-video w-full rounded-lg bg-black"
        />
      ) : (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg bg-surface-2 p-3 text-center">
          {failed && <p className="text-[13px] leading-5 text-muted">{failedText}</p>}
          {a.purgedAt && (
            <p className="text-[13px] leading-5 text-muted">
              지워짐 · {seoulDateText(a.purgedAt)}
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!usable || pending}
            onClick={open}
          >
            <Play aria-hidden className="h-4 w-4" />
            {failed ? '다시 불러오기' : '미리보기'}
          </Button>
        </div>
      )}
      <dl className="space-y-1 text-xs">
        <FactRow label="파일">{a.fileName}</FactRow>
        {a.purgedAt && (
          <FactRow label="저장소">{`지워짐 · ${seoulDateText(a.purgedAt)}`}</FactRow>
        )}
        <FactRow label="크기">{formatBytes(a.storedBytes ?? a.declaredBytes)}</FactRow>
        {a.integrity && <FactRow label="전송">{a.integrity}</FactRow>}
        {a.rejectCode && (
          <FactRow label="막힌 까닭">{textOf(REJECT_CODE_TEXT, a.rejectCode)}</FactRow>
        )}
        {a.fps && (
          <FactRow label="프레임 수">
            {a.averageFps ? `${a.fps} · 평균 ${a.averageFps.toFixed(2)}` : a.fps}
          </FactRow>
        )}
      </dl>
      <details className="text-[13px] leading-5 text-muted">
        <summary className="min-h-11 cursor-pointer py-3 font-medium">
          상세 파일 정보·검증
        </summary>
        <dl className="space-y-2 pb-2">
          {a.width != null && a.height != null && (
            <FactRow label="화면">{`${a.width}×${a.height}${a.rotation ? ` · ${a.rotation}° 회전` : ''}`}</FactRow>
          )}
          {a.codec && (
            <FactRow label="코덱">{`${a.codec}${a.container ? ` · ${a.container}` : ''}`}</FactRow>
          )}
          {a.sampleDurationSec != null && (
            <FactRow label={a.durationLabel}>{seconds(a.sampleDurationSec)}</FactRow>
          )}
          {a.playbackDurationSec != null && (
            <FactRow label="재생 길이">{seconds(a.playbackDurationSec)}</FactRow>
          )}
          {a.timing && <FactRow label="시간">{a.timing}</FactRow>}
          {(a.make || a.model) && (
            <FactRow label="기기(파일에 적힌 값)">
              {[a.make, a.model].filter(Boolean).join(' ')}
            </FactRow>
          )}
          {a.captureAt && (
            <FactRow label="촬영일(파일에 적힌 값)">{`${seoulTimeText(a.captureAt)} · ${a.captureAtSource ?? '출처 모름'}`}</FactRow>
          )}
          <FactRow label="SHA-256">
            <span className="font-mono" title={a.serverSha256 ?? a.clientSha256}>
              {shortHash(a.serverSha256 ?? a.clientSha256)}
              {a.hashMatched ? ' 일치' : ''}
            </span>
          </FactRow>
        </dl>
      </details>
      {warning && usable && (
        <p className="text-xs text-warn">{warning} 다운로드 전에 확인이 필요합니다.</p>
      )}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={!usable || pending}
        onClick={() => (warning ? setAsk(true) : download())}
        className="w-full"
      >
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
export function PairDownload({
  submissionId,
  warning = null,
}: {
  submissionId: string;
  warning?: string | null;
}) {
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
      () => setAsk(false)
    );
  return (
    <div className="min-w-0 space-y-2 text-right">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => (warning ? setAsk(true) : get())}
      >
        <Download aria-hidden className="h-4 w-4" />옆 · 뒤 원본 함께 받기
      </Button>
      {links && (
        <ul className="space-y-1 text-left text-xs">
          {links.map((l) => (
            <li key={l.assetId}>
              <a
                href={l.url}
                download={l.fileName}
                rel="noreferrer"
                className="break-all text-sky underline-offset-2 hover:underline"
              >
                {l.fileName}
              </a>
            </li>
          ))}
          <li className="text-muted">
            하나만 다운로드된 경우 해당 파일 이름을 누릅니다. 다운로드 주소는 5분간
            유효합니다.
          </li>
        </ul>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
      <ConfirmDialog
        open={ask}
        onClose={() => setAsk(false)}
        title="확인되지 않은 파일이 있습니다"
        detail={`${warning ?? ''} ${UNTRUSTED_FILE_TEXT}`}
        confirmLabel="그래도 내려받기"
        pendingLabel="주소를 받는 중…"
        pending={pending}
        onConfirm={get}
      />
    </div>
  );
}

export function NotesPanel({
  submissionId,
  notes,
}: {
  submissionId: string;
  notes: IntakeDetail['notes'];
}) {
  const { pending, error, run, refresh } = useAction();
  const [body, setBody] = useState('');
  const add = (e: FormEvent) => {
    e.preventDefault();
    run(
      () => addIntakeAdminNote(submissionId, body),
      () => {
        setBody('');
        refresh();
      }
    );
  };
  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-5 text-muted">외부에 공개되지 않습니다.</p>
      <form onSubmit={add} className="space-y-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={2000}
          aria-label="내부 메모"
        />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={pending || !body.trim()}
        >
          남기기
        </Button>
      </form>
      {error && <ErrorLine>{error}</ErrorLine>}
      <ul className="space-y-2">
        {notes.map((n) => (
          <li key={n.id} className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
            <p className="whitespace-pre-wrap break-words text-ink">{n.body}</p>
            <div className="mt-1 flex items-center justify-between gap-2 text-[13px] leading-5 text-muted">
              <span>
                {n.author} · {seoulTimeText(n.createdAt)}
              </span>
              {n.mine && (
                <button
                  type="button"
                  aria-label="메모 지우기"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => deleteIntakeAdminNote(submissionId, n.id),
                      () => refresh()
                    )
                  }
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
        detail={`${REISSUE_WARNING_TEXT} 새 링크는 한 번만 표시됩니다. 이미 내준 전송 토큰은 유효기간이 끝날 때까지 사용할 수 있습니다.`}
        confirmLabel="새 링크 만들기"
        pendingLabel="만드는 중…"
        pending={pending}
        onConfirm={() =>
          run(
            () => reissueIntakeInvitation(submissionId, seen),
            (r) => {
              setAsk(false);
              setMade({
                link: r.link,
                external: r.external,
                expires: r.uploadExpiresAt,
              });
            },
            () => setAsk(false)
          )
        }
      />
      <Modal
        open={made != null}
        onClose={() => {
          setMade(undefined);
          refresh();
        }}
        title={made?.external === false ? '개발용 새 링크' : '새 링크를 만들었습니다'}
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

export function RevokeButton({
  submissionId,
  retentionLine,
}: {
  submissionId: string;
  retentionLine: string;
}) {
  const { pending, error, run, refresh } = useAction();
  const [ask, setAsk] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="danger"
        size="sm"
        onClick={() => setAsk(true)}
        className="w-full"
      >
        초대 폐기
      </Button>
      {error && <ErrorLine>{error}</ErrorLine>}
      <ConfirmDialog
        open={ask}
        onClose={() => setAsk(false)}
        title="초대를 폐기할까요?"
        detail={`새 전송과 접수 완료, 결과 보기, 새 분석이 차단됩니다. 되돌릴 수 없습니다. 이미 내준 전송 토큰은 저장소에서 바로 거둘 수 없어 유효기간이 끝날 때까지 사용할 수 있습니다. ${retentionLine} 받는 분이 철회를 알렸다면 동의 칸에서 별도로 기록합니다.`}
        confirmLabel="폐기"
        pendingLabel="폐기하는 중…"
        pending={pending}
        onConfirm={() =>
          run(
            () => revokeIntakeInvitation(submissionId),
            () => {
              setAsk(false);
              refresh();
            }
          )
        }
      />
    </>
  );
}

/** 분석이 구운 가벼운 영상 — HEVC/MOV 를 못 푸는 브라우저에서 볼 길이다. 실패한 실행은 굽기 전에 끝났을 수 있어 없는 칸이 나올 수 있다 */
function PreviewPair({
  submissionId,
  runId,
  partial,
}: {
  submissionId: string;
  runId: string;
  partial: boolean;
}) {
  const { pending, error, run } = useAction();
  const [url, setUrl] = useState<string>();
  return (
    <div className="space-y-2">
      {partial && (
        <p className="text-[13px] leading-5 text-muted">
          끝까지 돌지 못한 실행이라 영상이 없을 수 있습니다.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {INTAKE_VIEWS.map((v) => (
          <Button
            key={v}
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                () => getIntakeRunPreview(submissionId, runId, v),
                (r) => setUrl(r.url)
              )
            }
          >
            {VIEW_TEXT[v]} 미리보기 영상
          </Button>
        ))}
      </div>
      {url && (
        <video
          src={url}
          controls
          muted
          playsInline
          preload="metadata"
          className="aspect-video w-full rounded-lg bg-black"
        />
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}

/**
 * 실행 한 줄. 공개 · 내리기는 그릴 때 본 지금 공개(activePublicationId)를 같이 보낸다.
 * 그사이 다른 관리자가 바꿨으면 서버가 막고, 창을 닫은 뒤 까닭을 보이며 최신 내용을 다시 받는다(공개 결과가 말없이 바뀌지 않게).
 * 묻는 창을 띄운 뒤에는 그 순간의 값을 쥔다 — 창 뒤에서 화면이 새로 그려져도 관리자가 본 것을 기준으로 맞춰 본다.
 */
function RunItem({
  submissionId,
  run: r,
  activePublicationId,
  disabled,
}: {
  submissionId: string;
  run: RunRow;
  activePublicationId: string | null;
  disabled: boolean;
}) {
  const { pending, error, run, refresh } = useAction();
  const [note, setNote] = useState('');
  const [ask, setAsk] = useState<'publish' | 'unpublish' | null>(null);
  const seenPublication = useRef(activePublicationId);
  const activeOther = activePublicationId != null && !r.published;
  const canPublish =
    r.status === 'succeeded' &&
    r.hasResult &&
    !r.published &&
    r.isCurrentRevision &&
    !disabled;
  /* 공개 전에 받는 사람이 볼 3D 를 연다 — 공개 중이거나 옛 판인 결과도 다시 볼 수 있다.
     공개 단추는 이 관리자의 검토 완료 번호가 있을 때만 켜진다. 서버가 그 번호를 잠금 안에서 다시 맞춰 보고, 낡았으면 막는다(INTAKE-MAIN/R01) */
  const reviewable = r.status === 'succeeded' && r.hasResult && !disabled;
  const [ack, setAck] = useState<{ id: string; publication: string | null } | null>(
    null
  );
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
        toast(
          res.replaced ? '공개 판을 이 결과로 변경했습니다' : '결과를 공개했습니다'
        );
        refresh();
      },
      (f) => {
        dropStaleAck(f);
        closeAsk();
      }
    );
  const unpublish = (expected: string | null) =>
    run(
      () => unpublishIntake(submissionId, expected),
      () => {
        setAsk(null);
        refresh();
      },
      closeAsk
    );
  return (
    <li className="space-y-2 rounded-xl border border-line p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-ink">
          {r.revisionNumber}판 · {textOf(RUN_STATUS_TEXT, r.status)}
          {r.published ? ' · 공개 중' : ''}
          {r.isCurrentRevision ? '' : ' · 옛 판'}
        </span>
        <span className="text-[13px] leading-5 text-muted">
          {seoulTimeText(r.finishedAt ?? r.requestedAt)}
        </span>
      </div>
      {r.source === 'manual' ? (
        <p className="text-[13px] leading-5 text-muted">
          수동 가져오기
          {r.manualSourceSha256 ? (
            <span className="font-mono" title={r.manualSourceSha256}>
              {' '}
              · 파일 {shortHash(r.manualSourceSha256)}
            </span>
          ) : null}
        </p>
      ) : (
        <p className="break-all font-mono text-[13px] leading-5 text-muted">
          {r.engineKey}
        </p>
      )}
      {r.frames != null && (
        <p className="text-[13px] leading-5 text-muted">장면 {r.frames}개</p>
      )}
      {r.timingDropped && (
        <p className="text-xs text-warn">
          영상 시간을 실제 시간으로 믿을 수 없어 시간 지표를 제외한 실행입니다.
        </p>
      )}
      {r.startUnknown && (
        <p className="text-[13px] leading-5 text-muted">
          분석 서버의 답을 못 받아 결과를 기다리고 있습니다. 그동안 다시 분석은
          차단됩니다.
        </p>
      )}
      {r.failureText && (
        <p className="text-sm text-danger">
          {r.failureText}
          {r.videoFault ? ' 영상 탓이라 고침을 요청하는 편이 좋습니다.' : ''}
          {r.failureDetail ? (
            <span className="mt-0.5 block break-words text-[13px] leading-5 text-muted">
              {r.failureDetail}
            </span>
          ) : null}
        </p>
      )}
      {runPreviewVisible(r, disabled) && (
        <PreviewPair
          submissionId={submissionId}
          runId={r.id}
          partial={r.status !== 'succeeded'}
        />
      )}
      {reviewable && (
        <RunReview
          submissionId={submissionId}
          runId={r.id}
          explanation={note}
          canAcknowledge={canPublish}
          acknowledged={acknowledgementId != null}
          onAcknowledged={(id) => setAck({ id, publication: activePublicationId })}
        />
      )}
      {canPublish && (
        <div className="space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="공개 화면에 보일 설명(선택)"
            aria-label="공개 설명"
          />
          {activeOther && (
            <p className="text-xs text-warn">
              다른 결과가 공개 중입니다. 공개하면 이 결과로 변경됩니다.
            </p>
          )}
          {acknowledgementId == null && (
            <p id={`publish-hint-${r.id}`} className="text-[13px] leading-5 text-muted">
              3D 결과를 열어 검토한 뒤 ‘이 결과 검토 완료’를 누르면 공개할 수 있습니다.
            </p>
          )}
          <Button
            type="button"
            size="sm"
            disabled={pending || acknowledgementId == null}
            aria-describedby={
              acknowledgementId == null ? `publish-hint-${r.id}` : undefined
            }
            onClick={() =>
              activeOther ? askFirst('publish') : publish(activePublicationId)
            }
          >
            이 결과 공개
          </Button>
        </div>
      )}
      {r.published && (
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={pending}
          onClick={() => askFirst('unpublish')}
        >
          공개 내리기
        </Button>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
      <ConfirmDialog
        open={ask === 'publish'}
        onClose={closeAsk}
        title="공개 중인 결과를 바꿀까요?"
        detail="받은 분의 링크에 이 결과가 대신 표시됩니다."
        confirmLabel="바꾸기"
        pendingLabel="바꾸는 중…"
        pending={pending}
        onConfirm={() => publish(seenPublication.current)}
      />
      <ConfirmDialog
        open={ask === 'unpublish'}
        onClose={closeAsk}
        title="공개를 내릴까요?"
        detail="받은 분의 링크에서 결과가 표시되지 않습니다. 분석 결과는 삭제되지 않습니다."
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
  const blockers = readiness.blockers.filter((b) =>
    purged ? b.code === 'original_purged' : b.code !== 'analysis_confirm_required'
  );
  const askable = !withdrawn && !purged;
  const runnable =
    !busy &&
    askable &&
    blockers.length === 0 &&
    (!readiness.needsDraftConfirm || confirmDraft);
  const notes = askable ? readiness.inputNotes : [];
  const start = () =>
    run(
      () => runIntakeAnalysis(submissionId, confirmDraft),
      (r) => {
        toast(r.created ? '분석을 요청했습니다' : '같은 입력의 분석이 이미 있습니다');
        refresh();
      }
    );
  return (
    <div className="space-y-3">
      <details className="rounded-xl border border-line px-4 py-1">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-ink">
          자동 분석 설정·실행
        </summary>
        <div className="space-y-3 pb-3">
          {!hand && readiness.hand == null && askable && (
            <div className="space-y-2">
              <p className="text-sm text-ink">
                자동 분석을 실행하려면 던지는 손을 선택합니다.
              </p>
              <div className="flex gap-2">
                {(['R', 'L'] as const).map((h) => (
                  <Button
                    key={h}
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => setIntakeHand(submissionId, h),
                        () => refresh()
                      )
                    }
                  >
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
              {notes.some((n) => n.dropsTiming) && (
                <p className="text-xs">
                  이대로 돌리면 착지에서 릴리스까지의 시간 지표는 제외됩니다. 실행은
                  가능합니다.
                </p>
              )}
            </div>
          )}
          {readiness.needsDraftConfirm && askable && (
            <label className="flex min-h-10 cursor-pointer items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={confirmDraft}
                onChange={(e) => setConfirmDraft(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-(--color-sky)"
              />
              국외 이전 안내가 아직 확정 전인 것을 알고 실행합니다.
            </label>
          )}
          <Button
            type="button"
            size="sm"
            disabled={pending || !runnable}
            onClick={start}
          >
            {busy
              ? '분석 진행 중'
              : pending
                ? '거는 중…'
                : runs.some((r) => r.isCurrentRevision && r.status === 'failed')
                  ? '다시 분석'
                  : '분석 실행'}
          </Button>
          {error && <ErrorLine>{error}</ErrorLine>}
        </div>
      </details>
      {runs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-ink">결과 검토·공개</h3>
          <ul className="space-y-3">
            {runs.map((r) => (
              <RunItem
                key={r.id}
                submissionId={submissionId}
                run={r}
                activePublicationId={activePublicationId}
                disabled={withdrawn}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * 3D 결과 가져오기(R03) — 팀이 원본을 내려받아 밖에서 만든 결과 묶음(intake-manual-result/1)을 이 접수의 지금 판에 들인다.
 * GPU · 분석 서버 준비와 상관없다. 가져온 결과는 비공개 초안이고, 공개는 아래 실행 목록에서 검토 완료를 누른 뒤에 한다.
 * 화면이 보던 판 번호를 같이 보내 그사이 판이 바뀌었으면 서버가 막는다('manual_result_stale' → 최신 내용을 다시 받는다).
 */
export function ManualImportBox({
  submissionId,
  revision,
  sideSha256,
  rearSha256,
  blocked,
}: {
  submissionId: string;
  revision: { id: string; number: number } | null;
  sideSha256: string | null;
  rearSha256: string | null;
  /** 가져올 수 없는 까닭 — 없으면 null */
  blocked: string | null;
}) {
  const { pending, error, setError, run, refresh } = useAction();
  const [done, setDone] = useState<{
    revisionNumber: number;
    frames: number;
    hand: 'R' | 'L';
    handSet: boolean;
  }>();
  const [reading, setReading] = useState(false);
  const off = blocked != null || revision == null;
  const pick = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    /* 같은 파일을 다시 골라도 다시 읽게 칸을 비운다 */
    input.value = '';
    if (!file || !revision) return;
    setDone(undefined);
    const problem = manualFileProblem(file.size);
    if (problem) return setError(problem);
    setError(undefined);
    setReading(true);
    file.text().then(
      (text) => {
        setReading(false);
        run(
          () => importIntakeManualResult(submissionId, revision.id, text),
          (r) => {
            setDone({
              revisionNumber: r.revisionNumber,
              frames: r.frames,
              hand: r.hand,
              handSet: r.handSet,
            });
            toast('3D 결과를 가져왔습니다');
            refresh();
          }
        );
      },
      () => {
        setReading(false);
        setError('파일을 읽지 못했습니다. 다시 선택합니다.');
      }
    );
  };
  return (
    <div
      className="space-y-2 rounded-xl border border-line px-4 py-3"
      data-manual-import=""
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">3D 결과 가져오기</h3>
        {/* 이 접수 하나의 매니페스트 — 지금 판 해시를 채운 결과 묶음 틀(manualTemplate)이 그 안에 든다 */}
        <a
          href={`/admin/intake/manifest?submission=${submissionId}`}
          download
          className="inline-flex min-h-10 items-center text-sm text-sky underline-offset-2 hover:underline"
        >
          결과 JSON 양식 받기
        </a>
      </div>
      <p className="text-[13px] leading-5 text-muted">
        원본 영상으로 제작한 3D 결과 묶음(JSON)을 가져옵니다. 가져온 결과는 비공개
        초안으로 저장됩니다.
      </p>
      {revision && (
        <details className="text-[13px] leading-5 text-muted">
          <summary className="min-h-11 cursor-pointer py-3">
            결과를 연결할 원본·판 정보
          </summary>
          <dl className="space-y-2 pb-2">
            <FactRow label="지금 판">{`${revision.number}판`}</FactRow>
            <FactRow label="옆 SHA-256">
              <span className="font-mono" title={sideSha256 ?? undefined}>
                {shortHash(sideSha256)}
              </span>
            </FactRow>
            <FactRow label="뒤 SHA-256">
              <span className="font-mono" title={rearSha256 ?? undefined}>
                {shortHash(rearSha256)}
              </span>
            </FactRow>
          </dl>
        </details>
      )}
      {blocked && <p className="text-[13px] leading-5 text-muted">{blocked}</p>}
      <label className="block space-y-1">
        <span className="block text-[13px] leading-5 text-muted">
          결과 묶음 파일(.json)
        </span>
        <input
          type="file"
          accept=".json,application/json"
          disabled={off || pending || reading}
          onChange={(e) => pick(e.currentTarget)}
          aria-label="3D 결과 묶음 파일"
          className="block w-full text-sm text-ink file:mr-3 file:min-h-10 file:rounded-full file:border file:border-line file:bg-surface file:px-4 file:text-sm file:text-ink disabled:opacity-50"
        />
      </label>
      {(pending || reading) && (
        <p className="text-[13px] leading-5 text-muted">가져오는 중…</p>
      )}
      {done && (
        <p role="status" className="text-sm text-ink">
          {done.revisionNumber}판에 장면 {done.frames}개 ·{' '}
          {textOf(HAND_TEXT, done.hand)} 결과를 가져왔습니다.
          {done.handSet ? ' 던지는 손도 이 결과로 설정했습니다.' : ''} 아래 목록에서 3D
          결과를 열어 검토 완료를 누른 뒤 공개합니다.
        </p>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}
