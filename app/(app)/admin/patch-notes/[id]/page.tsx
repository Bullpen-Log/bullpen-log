import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, GitCommitHorizontal } from 'lucide-react';
import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { Card } from '@/components/ui';
import { CommitBody } from './commit-body';
import { PatchNoteEditor } from './patch-note-editor';

type Commit = {
  sha: string;
  subject: string;
  body: string;
  files: number;
  insertions: number;
  deletions: number;
};

/**
 * 패치노트 한 장 — 한 사람의 하루.
 *
 * 그날 한 커밋을 순서대로 늘어놓는다. 위에 그날의 크기(커밋 수·고친 줄·자리)를
 * 두고, 그 밑에 사람이 덧붙이는 메모 칸을 둔다.
 *
 * 깃에서 온 것은 고칠 수 없다. 일어난 일의 기록이라 나중에 고쳐 쓸 것이
 * 아니고, 다시 맞출 때 어차피 덮어쓰인다.
 */
export default async function PatchNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (user.role !== 'ADMIN') redirect('/today');

  const { id } = await params;
  const note = await prisma.patchNote.findUnique({ where: { id } });
  if (!note) notFound();

  const commits = (Array.isArray(note.commits) ? note.commits : []) as unknown as Commit[];

  const stats = [
    { label: '커밋', value: `${note.commitCount}개` },
    { label: '파일', value: `${note.filesChanged}개` },
    { label: '더한 줄', value: `+${note.insertions}` },
    { label: '지운 줄', value: `−${note.deletions}` },
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/admin/patch-notes"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-sky"
      >
        <ArrowLeft className="h-4 w-4" />
        패치노트
      </Link>

      <div className="border-b border-line pb-6">
        <p className="text-xs font-medium tracking-normal text-sky">{note.authorName}</p>
        <h1 className="text-heading mt-1 text-2xl text-ink">{spokenDay(note.day)}</h1>
        {note.areas.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-1">
            {note.areas.map((a) => (
              <span
                key={a}
                className="rounded-md border border-line-strong px-1.5 py-0.5 text-[11px] text-muted"
              >
                {a}
              </span>
            ))}
          </p>
        )}
      </div>

      {/* ── 그날의 크기 ─────────────────────────────── */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface px-4 py-3">
            <p className="text-[11px] tracking-normal text-muted">{s.label}</p>
            <p className="text-display mt-1 text-xl text-ink">{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── 무엇을 했는가 ───────────────────────────── */}
      <Card className="space-y-3">
        <h2 className="text-sm font-bold text-ink">한 일</h2>
        {commits.length === 0 ? (
          <p className="text-sm text-muted">담긴 커밋이 없습니다.</p>
        ) : (
          <ol className="space-y-2">
            {commits.map((c, i) => (
              <li
                key={c.sha}
                className="motion-safe:animate-row-in rounded-lg bg-surface-2 px-3 py-2.5"
                style={{ '--row': i } as React.CSSProperties}
              >
                <p className="flex items-start gap-2 text-sm break-keep text-ink">
                  <GitCommitHorizontal
                    aria-hidden
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted"
                  />
                  <span className="font-medium">{c.subject}</span>
                </p>

                {/* 커밋 본문은 '왜'가 적히는 자리라 지우지 않는다. 길면 접어 둔다. */}
                {c.body && <CommitBody text={c.body} />}

                <p className="mt-1.5 ml-6 font-mono text-[10px] text-muted/70">
                  {c.sha} · 파일 {c.files}개 ·{' '}
                  <span className="text-sky">+{c.insertions}</span>{' '}
                  <span className="text-danger">−{c.deletions}</span>
                </p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* ── 사람이 덧붙이는 글 ──────────────────────── */}
      <Card className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-ink">메모</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            같이 하는 사람이 알아야 할 것을 적어두세요. 받은 뒤에 할 일이나, 커밋
            제목이 못 담은 까닭 같은 것들입니다. 위 내용은 깃에서 오는 것이라 고칠
            수 없습니다.
          </p>
        </div>

        <PatchNoteEditor id={note.id} note={note.note ?? ''} />

        {note.editedAt && note.editedBy && (
          <p className="text-[11px] text-muted/70">
            {note.editedBy} 님이 {spokenTime(note.editedAt)}에 메모를 고쳤습니다.
          </p>
        )}
      </Card>
    </div>
  );
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** '2026년 9월 24일 (수)' */
function spokenDay(day: string) {
  const d = new Date(`${day}T00:00:00.000Z`);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}

/** '9월 24일 오후 3:14' */
function spokenTime(date: Date) {
  return date.toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
