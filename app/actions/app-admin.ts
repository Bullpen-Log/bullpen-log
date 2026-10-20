'use server';

import { prisma } from '@/lib/prisma';
import { can, isOwner, type Permission } from '@/lib/permissions';
import { getCurrentUser } from '@/lib/dal';
import { ageFromBirthDate } from '@/lib/profile';
import { INQUIRY_STATUS, type InquiryStatusKey } from '@/lib/support';
import { reportReasonLabel } from '@/lib/community';
import { formatSupportDate } from '@/components/support/support-format';
import { formatDateTime } from '@/components/community/community-format';
import { deleteUser, toggleUserRole } from '@/app/actions/admin';
import { resolveReport } from '@/app/actions/community';
import { updatePatchNote } from '@/app/actions/patch-note';
import { loadVelocityAdminDay, loadVelocityAdminOverview } from '@/lib/velocity-admin-load';
import { countSessionRecordings, countVelocityRecordings } from '@/lib/velocity-recording-load';
import { pitchTypeLabel } from '@/lib/velocity-meta';
import { videoLimitOf } from '@/lib/storage';

/**
 * 아이폰 앱의 관리자 화면(native/src/app/admin/*) — 웹 app/(app)/admin/* 과 같은 자료 · 같은 쓰기. 쓰기는 웹 폼 동작(FormData)을 그대로 부른다
 * (관리자인지는 그 동작이 다시 본다). 관리자가 아니면 { ok:false, to:'/today' }.
 * /api/rpc/app-admin.<함수> 로 부른다.
 */
const NOT_ADMIN = { ok: false, to: '/today' } as const;
const TO_LOGIN = { ok: false, to: '/login' } as const;

/** 이 기능을 쓸 수 있는 관리자(대표 · 준, lib/permissions.ts)면 그 사용자 */
async function staff(perm: Permission) {
  const user = await getCurrentUser();
  if (!user) return TO_LOGIN;
  if (!can(user.role, perm)) return NOT_ADMIN;
  return user;
}

/** 대표관리자면 그 사용자, 아니면 화면을 닫고 보낼 곳({ ok:false, to }) */
async function admin() {
  const user = await getCurrentUser();
  if (!user) return TO_LOGIN;
  if (user.role !== 'ADMIN') return NOT_ADMIN;
  return user;
}

const ymd = (d: Date) =>
  new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: '2-digit', month: '2-digit', day: '2-digit' }).format(d);

/** 관리자 첫 화면 — 웹 app/(app)/admin/page.tsx 와 같은 요약 · 회원 목록 · 콘텐츠 수 */
export async function loadAppAdmin() {
  /* 준관리자(2026-10-20)는 연 기능 칸만 — 숫자 · 회원 목록 · 소통 · 패치노트는 대표만(lib/permissions.ts) */
  const a = await staff('adminHome');
  if ('ok' in a) return a;
  const perms = { owner: isOwner(a.role), velocityAdmin: can(a.role, 'velocityAdmin'), shoot: can(a.role, 'shoot') };
  if (!perms.owner)
    return { ok: true as const, meId: a.id, perms, stats: [], content: { videos: 0, articles: 0, logs: 0 }, openInquiries: 0, openReports: 0, users: [] };
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [users, recent, logs, articles, videos, openInquiries, openReports] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,
        createdAt: true,
        birthDate: true,
        heightCm: true,
        _count: { select: { pitchLogs: true, articles: true } },
        pitchLogs: { orderBy: { date: 'desc' }, take: 1, select: { date: true } },
      },
    }),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.pitchLog.count(),
    prisma.article.count(),
    prisma.exerciseVideo.count(),
    prisma.supportInquiry.count({ where: { status: 'OPEN' } }),
    prisma.communityReport.count({ where: { resolvedAt: null } }),
  ]);
  return {
    ok: true as const,
    meId: a.id,
    perms,
    stats: [
      { label: '전체 회원', value: users.length, unit: '명' },
      { label: '최근 7일 신규', value: recent, unit: '명' },
      { label: '활동 회원', value: users.filter((u) => u._count.pitchLogs > 0 || u._count.articles > 0).length, unit: '명' },
      { label: '누적 투구 기록', value: logs, unit: '건' },
    ],
    content: { videos, articles, logs },
    openInquiries,
    openReports,
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      nickname: u.nickname,
      admin: u.role === 'ADMIN',
      role: u.role,
      age: u.birthDate ? ageFromBirthDate(u.birthDate) : null,
      heightCm: u.heightCm,
      joined: ymd(u.createdAt),
      logs: u._count.pitchLogs,
      articles: u._count.articles,
      lastLog: u.pitchLogs[0] ? ymd(u.pitchLogs[0].date) : null,
    })),
  };
}

type AdminState = { error?: string; success?: string } | undefined;
const done = (r: AdminState) => (r?.error ? { ok: false as const, error: r.error } : { ok: true as const, message: r?.success ?? '' });

/** 역할 정하기(일반 · 준관리자 · 대표관리자) — role 이 없으면 옛 앱처럼 대표관리자 ↔ 일반. 본인은 못 바꾼다(toggleUserRole 이 본다) */
export async function setAppUserRole(userId: unknown, role?: unknown) {
  const fd = new FormData();
  fd.set('userId', String(userId ?? ''));
  if (role != null) fd.set('role', String(role));
  return done(await toggleUserRole(undefined, fd));
}

/** 회원 지우기 — 그 회원의 기록 · 글 · 저장소 파일까지(deleteUser → lib/delete-user.ts). 앱은 한 번 더 묻고 부른다 */
export async function deleteAppUser(userId: unknown) {
  const fd = new FormData();
  fd.set('userId', String(userId ?? ''));
  return done(await deleteUser(undefined, fd));
}

const FILTERS = ['OPEN', 'ANSWERED', 'CLOSED', 'all'] as const;
type Filter = (typeof FILTERS)[number];

/** 소통 관리 — 웹 app/(app)/admin/support/page.tsx: 상태별 1:1 문의(100건) · 상태별 수 · 공지 */
export async function loadAppAdminSupport(filter: unknown) {
  const a = await admin();
  if ('ok' in a) return a;
  const f: Filter = FILTERS.includes(filter as Filter) ? (filter as Filter) : 'OPEN';
  const [inquiries, counts, notices] = await Promise.all([
    prisma.supportInquiry.findMany({
      where: f === 'all' ? undefined : { status: f },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        createdAt: true,
        user: { select: { nickname: true } },
        _count: { select: { replies: true } },
      },
    }),
    prisma.supportInquiry.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.supportNotice.findMany({
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, title: true, pinned: true, createdAt: true },
    }),
  ]);
  const countOf = (k: Filter) =>
    k === 'all' ? counts.reduce((n, c) => n + c._count._all, 0) : (counts.find((c) => c.status === k)?._count._all ?? 0);
  return {
    ok: true as const,
    filter: f,
    filters: FILTERS.map((k) => ({ key: k, label: k === 'all' ? '전체' : INQUIRY_STATUS[k as InquiryStatusKey].label, count: countOf(k) })),
    capped: countOf(f) > inquiries.length,
    inquiries: inquiries.map((q) => ({
      id: q.id,
      title: q.title,
      /** 종류 열쇠 — 앱이 inquiryCategoryLabel 로 배지(웹 문의 줄과 같게) */
      category: q.category,
      status: INQUIRY_STATUS[q.status as InquiryStatusKey]?.label ?? q.status,
      open: q.status === 'OPEN',
      nickname: q.user.nickname,
      replies: q._count.replies,
      date: formatSupportDate(q.createdAt),
    })),
    notices: notices.map((n) => ({ id: n.id, title: n.title, pinned: n.pinned, date: formatSupportDate(n.createdAt) })),
  };
}

/** 커뮤니티 신고 — 웹 app/(app)/admin/community/page.tsx: 처리 전이 먼저(all 이면 처리한 것까지, 200건) */
export async function loadAppCommunityReports(all: unknown) {
  const a = await admin();
  if ('ok' in a) return a;
  const every = all === true || all === 1;
  const [reports, openCount] = await Promise.all([
    prisma.communityReport.findMany({
      where: every ? {} : { resolvedAt: null },
      orderBy: [{ resolvedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
      take: 200,
      include: {
        reporter: { select: { nickname: true } },
        post: { select: { id: true, title: true, hiddenAt: true, user: { select: { nickname: true } } } },
        comment: { select: { id: true, body: true, hiddenAt: true, postId: true, user: { select: { nickname: true } } } },
      },
    }),
    prisma.communityReport.count({ where: { resolvedAt: null } }),
  ]);
  return {
    ok: true as const,
    all: every,
    openCount,
    reports: reports.map((r) => {
      const target = r.comment ?? r.post;
      const body = r.comment ? r.comment.body : (r.post?.title ?? '');
      return {
        id: r.id,
        kind: r.comment ? ('comment' as const) : r.post ? ('post' as const) : null,
        targetId: target?.id ?? null,
        postId: r.comment?.postId ?? r.post?.id ?? null,
        preview: body.length > 80 ? `${body.slice(0, 80)}…` : body,
        author: target?.user.nickname ?? null,
        hidden: target?.hiddenAt != null,
        reason: reportReasonLabel(r.reason),
        detail: r.detail,
        reporter: r.reporter.nickname,
        at: formatDateTime(r.createdAt),
        resolvedAt: r.resolvedAt ? formatDateTime(r.resolvedAt) : null,
      };
    }),
  };
}

/** 신고 처리 완료(가리기 · 되살리기는 community.setAppHidden) */
export async function resolveAppReport(id: unknown) {
  const a = await admin();
  if ('ok' in a) return { ok: false as const, error: '관리자만 할 수 있어요.' };
  const fd = new FormData();
  fd.set('id', String(id ?? ''));
  await resolveReport(fd);
  return { ok: true as const };
}

type Commit = { sha: string; subject: string; body: string; files: number; insertions: number; deletions: number };
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const spokenDay = (day: string) => {
  const d = new Date(`${day}T00:00:00.000Z`);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
};

/** 패치노트 목록 — 웹 app/(app)/admin/patch-notes/page.tsx(한 줄 = 한 사람의 하루, 첫 커밋 제목만) */
export async function loadAppPatchNotes() {
  const a = await admin();
  if ('ok' in a) return a;
  const notes = await prisma.patchNote.findMany({
    orderBy: [{ day: 'desc' }, { authorName: 'asc' }],
    select: { id: true, day: true, authorName: true, commitCount: true, insertions: true, deletions: true, areas: true, commits: true, note: true },
  });
  return {
    ok: true as const,
    notes: notes.map((n) => ({
      id: n.id,
      day: spokenDay(n.day),
      /* 'YYYY-MM-DD' — 앱이 순서 · 달 묶음 · 찾기에 쓴다(웹 patch-note-list 와 같은 거르기) */
      dayKey: n.day,
      author: n.authorName,
      commits: n.commitCount,
      insertions: n.insertions,
      deletions: n.deletions,
      areas: n.areas,
      headline: Array.isArray(n.commits) && n.commits.length > 0 ? String((n.commits[0] as { subject?: string }).subject ?? '') : '',
      hasNote: Boolean(n.note?.trim()),
    })),
  };
}

/** 패치노트 한 장 — 커밋들 · 메모(사람이 적는 칸) */
export async function loadAppPatchNote(id: unknown) {
  const a = await admin();
  if ('ok' in a) return a;
  const n = await prisma.patchNote.findUnique({ where: { id: String(id ?? '') } });
  if (!n) return { ok: true as const, note: null };
  return {
    ok: true as const,
    note: {
      id: n.id,
      day: spokenDay(n.day),
      author: n.authorName,
      areas: n.areas,
      stats: { commits: n.commitCount, files: n.filesChanged, insertions: n.insertions, deletions: n.deletions },
      commits: ((Array.isArray(n.commits) ? n.commits : []) as unknown as Commit[]).map((c) => ({ sha: c.sha, subject: c.subject, body: c.body })),
      memo: n.note ?? '',
      editedBy: n.editedBy,
    },
  };
}

/** 패치노트 메모 저장 — 웹 updatePatchNote 그대로(2000자, 같은 글이면 안 씀) */
export async function saveAppPatchNote(id: unknown, memo: unknown) {
  const fd = new FormData();
  fd.set('id', String(id ?? ''));
  fd.set('note', String(memo ?? ''));
  const r = await updatePatchNote(undefined, fd);
  return r?.error ? { ok: false as const, error: r.error } : { ok: true as const };
}

/**
 * 구속 측정 관리자(앱) 첫 화면 — 웹 app/(app)/admin/velocity/mobile-admin.tsx 의 휴대폰 화면과 같은 자료(숫자 셋 · 지난 영상 날짜 40개 · 녹화 수).
 * 탐색기 · 보정 · 다시 재기는 브라우저 영상 엔진이라 PC 웹에 둔다.
 */
export async function loadAppVelocityAdmin() {
  const a = await staff('velocityAdmin');
  if ('ok' in a) return a;
  const [data, recordings, sessionRecordings] = await Promise.all([
    loadVelocityAdminOverview(),
    countVelocityRecordings(),
    countSessionRecordings(),
  ]);
  return {
    ok: true as const,
    totals: { pitches: data.totals.pitches, pairs: data.totals.pairs },
    biasKmh: data.overall.biasKmh,
    /* 엔진 개발용 녹화 수 · 세션 녹화 수(따로 단추, 2026-10-18) */
    recordings: recordings - sessionRecordings,
    sessionRecordings,
    days: data.days.slice(0, 40).map((d) => ({ date: d.date, pitches: d.pitches, clips: d.clips, pairs: d.pairs, maxKmh: d.maxKmh })),
    /* 이 사람이 올릴 수 있는 영상 크기 — 앱이 저장 전에 큰 파일을 막는다(서버 서명 주소와 같은 값) */
    maxBytes: videoLimitOf(a.role),
  };
}

/** 그날 공 — 최근부터(웹 MobileDay 와 같은 줄). 영상은 서명 재생 주소(누를 때 받는다) */
export async function loadAppVelocityDay(date: unknown) {
  const a = await staff('velocityAdmin');
  if ('ok' in a) return a;
  const d = String(date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: true as const, day: null };
  const day = await loadVelocityAdminDay(d);
  const rows = day.sessions
    .flatMap((s) => s.pitches.map((p) => ({ s, p })))
    .sort((x, y) => y.p.createdAt.localeCompare(x.p.createdAt))
    .map(({ s, p }) => ({
      id: p.id,
      manual: p.manual,
      kmh: p.kmh,
      gunKmh: p.gunKmh,
      /* 카메라 값(릴리스 추정이 있으면 그것) − 건 — 수기 · 짝 없음은 null */
      diff: !p.manual && p.gunKmh != null ? (p.releaseKmh ?? p.rawKmh) - p.gunKmh : null,
      who: s.nickname,
      pitchType: p.pitchType ? pitchTypeLabel(p.pitchType) : null,
      source: s.source === 'file' ? '영상 파일' : '카메라',
      clipUrl: p.clipUrl,
      wideClipUrl: p.wideClipUrl,
    }));
  return {
    ok: true as const,
    day: { date: day.date, pitches: day.stat.pitches, clips: day.stat.clips, pairs: day.stat.pairs, biasKmh: day.stat.biasKmh, rows },
  };
}

