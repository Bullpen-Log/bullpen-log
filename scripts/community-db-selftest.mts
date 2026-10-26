/**
 * 커뮤니티 DB 시험 — 운영 DB 를 건드리지 않고, 메모리 안 PostgreSQL(PGlite)에 지금 스키마를 깔아 lib/community-ops.ts 를 돌린다.
 * `npm run community:db-test`
 *
 * 한계: PGlite 는 연결이 하나라 동시 신청이 실제로는 줄을 서서 하나씩 돈다 — 정원 · 다시 누름 · 알림 한 번은 확인하지만,
 * 운영 PostgreSQL 에서 두 연결이 같은 순간에 잠금(FOR UPDATE)을 다투는 모습은 여기서 재현되지 않는다.
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ROOM_PAGE,
  addRoomMessage,
  communityMetrics,
  joinPost,
  leavePost,
  loadRoomPage,
  maybeAutoHide,
  recentCount,
  refreshAnswerState,
  setTargetHidden,
} from '@/lib/community-ops';

let passed = 0;
const ok = (cond: unknown, label: string) => {
  assert.ok(cond, label);
  if (process.env.V) console.log("ok", label);
  passed++;
};

/* 지금 스키마 그대로(빈 DB → schema.prisma) — 운영 DB 에는 닿지 않는 diff */
const sql = execSync('npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script', {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const pg = await PGlite.create();
await pg.exec(sql);
const server = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
await server.start();
const addr = (server as unknown as { server: { address(): { port: number } } }).server.address();
/* 연결 하나 — PGlite 는 세션이 하나라 두 연결을 섞으면 트랜잭션이 엉킨다 */
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: `postgresql://postgres@127.0.0.1:${addr.port}/postgres?sslmode=disable`, max: 1 }),
});

const now = new Date();
const DAY = 86_400_000;
const old = new Date(now.getTime() - 30 * DAY);
const mkUser = (n: string, extra: Record<string, unknown> = {}) =>
  db.user.create({ data: { email: `${n}@t.test`, password: 'x', nickname: n, createdAt: old, ...extra } });
const [A, B, C, D, S] = await Promise.all([
  mkUser('author'),
  mkUser('bee'),
  mkUser('cee'),
  mkUser('dee'),
  mkUser('staff', { role: 'ADMIN' }),
]);
const adult = (u: { id: string }) => ({ id: u.id, age: 25 });

const meetup = (capacity: number, extra: Record<string, unknown> = {}) =>
  db.communityPost.create({
    data: {
      userId: A.id,
      category: 'meetup',
      title: '캐치볼',
      body: '같이 해요',
      region: '서울',
      meetAt: new Date(now.getTime() + DAY),
      form: { place: '한강', capacity, level: 'any', gear: '', cost: '', age: 'teen' },
      ...extra,
    },
  });

/* ── 마지막 한 자리에 둘이 동시에 ─────────────────────────────── */
{
  const p = await meetup(1);
  const [r1, r2] = await Promise.all([joinPost(db, p.id, adult(B), now), joinPost(db, p.id, adult(C), now)]);
  const joined = [r1, r2].filter((r) => 'joined' in r && r.joined).length;
  const refused = [r1, r2].filter((r) => 'error' in r).length;
  ok(joined === 1 && refused === 1, '정원 1명에 둘이 동시 신청 → 하나만 들어간다');
  ok((await db.communityJoin.count({ where: { postId: p.id } })) === 1, '참가 줄도 하나');

  /* 다시 누름 · 재시도 — 새로 안 넣고 joined:false(알림 한 번) */
  const winner = r1 && 'joined' in r1 && r1.joined ? B : C;
  const again = await joinPost(db, p.id, adult(winner), now);
  ok('joined' in again && again.joined === false, '이미 참가했으면 joined:false');
  const many = await Promise.all([1, 2, 3].map(() => joinPost(db, p.id, adult(winner), now)));
  ok(many.every((r) => 'joined' in r && !r.joined), '중복 클릭 셋도 새로 안 넣는다');

  /* 취소 → 자리 남 → 다른 사람 */
  const left = await leavePost(db, p.id, winner.id, now);
  ok('left' in left && left.left, '취소');
  const left2 = await leavePost(db, p.id, winner.id, now);
  ok('left' in left2 && !left2.left, '두 번 취소해도 조용');
  const d = await joinPost(db, p.id, adult(D), now);
  ok('joined' in d && d.joined, '빈 자리에 다른 사람');
}

/* ── 정원 3에 다섯이 동시에 ─────────────────────────────── */
{
  const p = await meetup(3);
  const extra = await Promise.all([4, 5].map((i) => mkUser(`extra${i}`)));
  const rs = await Promise.all([B, C, D, ...extra].map((u) => joinPost(db, p.id, adult(u), now)));
  ok(rs.filter((r) => 'joined' in r && r.joined).length === 3, '정원 3에 다섯 → 셋만');
}

/* ── 막는 까닭 ─────────────────────────────── */
{
  const adultOnly = await db.communityPost.create({
    data: {
      userId: A.id,
      category: 'meetup',
      title: '성인',
      body: '.',
      region: '서울',
      meetAt: new Date(now.getTime() + DAY),
      form: { place: 'x', capacity: 3, level: 'any', gear: '', cost: '', age: 'adult' },
    },
  });
  const teen = await joinPost(db, adultOnly.id, { id: B.id, age: 17 }, now);
  ok('error' in teen && /성인/.test(teen.error), '성인만 번개에 17세 → 막음');
  const kid = await joinPost(db, adultOnly.id, { id: C.id, age: 13 }, now);
  ok('error' in kid && /14세/.test(kid.error), '13세 → 막음');
  const noAge = await joinPost(db, adultOnly.id, { id: C.id, age: null }, now);
  ok('error' in noAge && /생년월일/.test(noAge.error), '나이 모름 → 막음');
  const mine = await joinPost(db, adultOnly.id, adult(A), now);
  ok('error' in mine, '내 글 → 막음');

  await db.communityBlock.create({ data: { blockerId: A.id, blockedId: D.id } });
  const blocked = await joinPost(db, adultOnly.id, adult(D), now);
  ok('error' in blocked && !/차단/.test(blocked.error), '글쓴이가 막은 사람 → 막되 차단은 드러내지 않는다');

  const past = await meetup(3, { meetAt: new Date(now.getTime() - 3_600_000) });
  const pr = await joinPost(db, past.id, adult(B), now);
  ok('error' in pr && /지난/.test(pr.error), '지난 번개 → 막음');
  const cancelled = await meetup(3, { outcome: 'cancelled' });
  const cr = await joinPost(db, cancelled.id, adult(B), now);
  ok('error' in cr && /취소/.test(cr.error), '취소된 모임 → 막음');
  const closed = await meetup(3, { closedAt: now });
  const clr = await joinPost(db, closed.id, adult(B), now);
  ok('error' in clr && /마감/.test(clr.error), '마감 → 막음');
  const hidden = await meetup(3, { hiddenAt: now });
  ok('error' in (await joinPost(db, hidden.id, adult(B), now)), '가린 글 → 막음');

  /* 진행 완료 신청은 못 뺀다 */
  const team = await db.communityPost.create({
    data: { userId: A.id, category: 'team', tag: 'recruit', title: '팀원', body: '.', region: '서울', form: {} },
  });
  const tj = await joinPost(db, team.id, adult(B), now);
  ok('joined' in tj && tj.joined, '팀 신청은 인원으로 막지 않는다');
  await db.communityJoin.update({ where: { postId_userId: { postId: team.id, userId: B.id } }, data: { status: 'done', statusAt: now } });
  const tl = await leavePost(db, team.id, B.id, now);
  ok('error' in tl, '진행 완료 신청은 취소 못 함');
}

/* ── 300개 넘는 대화 — 최신부터, 이전은 장마다 ─────────────────────────────── */
{
  const p = await meetup(5);
  const N = 320;
  await db.communityMessage.createMany({
    data: Array.from({ length: N }, (_, i) => ({
      postId: p.id,
      senderId: i % 2 ? A.id : B.id,
      body: `말 ${i + 1}`,
      createdAt: new Date(now.getTime() - (N - i) * 1000),
    })),
  });
  const first = await loadRoomPage(db, { postId: p.id, thread: null });
  ok(first.messages.length === ROOM_PAGE && first.hasOlder, '첫 장은 최근 50개 + 이전 있음');
  ok(first.messages.at(-1)?.body === `말 ${N}`, '맨 아래가 가장 최근 말');
  ok(first.messages[0].body === `말 ${N - ROOM_PAGE + 1}`, '첫 장 맨 위는 최근 50번째');
  const seen = [...first.messages];
  let page = first;
  while (page.hasOlder) {
    page = await loadRoomPage(db, { postId: p.id, thread: null, before: seen[0].id });
    seen.unshift(...page.messages);
  }
  ok(seen.length === N && new Set(seen.map((m) => m.id)).size === N, '이전 장을 다 읽으면 320개 · 겹침 없음');
  ok(seen.every((m, i) => m.body === `말 ${i + 1}`), '오래된 → 새 차례');

  /* 같은 시각에 들어온 말도 장 사이에서 빠지지 않는다 */
  const q = await meetup(5);
  const same = new Date(now.getTime() - 5000);
  await db.communityMessage.createMany({
    data: Array.from({ length: 120 }, (_, i) => ({ postId: q.id, senderId: A.id, body: `같은 ${i}`, createdAt: same })),
  });
  const all: string[] = [];
  let pg2 = await loadRoomPage(db, { postId: q.id, thread: null });
  all.unshift(...pg2.messages.map((m) => m.id));
  while (pg2.hasOlder) {
    pg2 = await loadRoomPage(db, { postId: q.id, thread: null, before: all[0] });
    all.unshift(...pg2.messages.map((m) => m.id));
  }
  ok(all.length === 120 && new Set(all).size === 120, '같은 시각 120개도 장 사이 겹침 · 빠짐 없음');

  /* 다시 보내기 — 같은 번호면 하나 */
  const m1 = await addRoomMessage(db, { postId: p.id, thread: null, senderId: B.id, body: '안녕', clientId: 'c-1' });
  const m2 = await addRoomMessage(db, { postId: p.id, thread: null, senderId: B.id, body: '안녕', clientId: 'c-1' });
  const both = await Promise.all([
    addRoomMessage(db, { postId: p.id, thread: null, senderId: B.id, body: '또', clientId: 'c-2' }),
    addRoomMessage(db, { postId: p.id, thread: null, senderId: B.id, body: '또', clientId: 'c-2' }),
  ]);
  ok(m1.created && !m2.created, '같은 번호 다시 보냄 → 하나');
  ok(both.filter((b) => b.created).length === 1, '동시에 두 번 보내도 하나');
  /* PGlite 소켓은 고유 위반(P2002) 뒤 연결을 끊는다(운영 PostgreSQL 은 안 끊는다) — 한 번 헛돌려 새 연결을 받는다 */
  await db.$queryRaw`SELECT 1`.catch(() => {});
  ok((await db.communityMessage.count({ where: { postId: p.id, clientId: { not: null } } })) === 2, '보낸 번호 둘 = 말 둘');
}

/* ── 질문의 답 상태 · 채택 ─────────────────────────────── */
{
  const q = await db.communityPost.create({ data: { userId: A.id, category: 'question', title: '질문', body: '?' } });
  await db.communityComment.create({ data: { postId: q.id, userId: A.id, body: '덧붙여요' } });
  await refreshAnswerState(db, q.id);
  ok((await db.communityPost.findUnique({ where: { id: q.id } }))!.firstAnswerAt === null, '글쓴이 댓글은 답이 아니다');
  const ans = await db.communityComment.create({ data: { postId: q.id, userId: B.id, body: '이렇게요' } });
  await refreshAnswerState(db, q.id);
  let row = await db.communityPost.findUnique({ where: { id: q.id } });
  ok(row!.firstAnswerAt?.getTime() === ans.createdAt.getTime(), '남의 댓글 → 첫 답 시각');
  await db.communityPost.update({ where: { id: q.id }, data: { acceptedCommentId: ans.id } });
  await setTargetHidden(db, { kind: 'comment', id: ans.id, hidden: true, reason: '욕설', actorId: S.id }, now);
  await refreshAnswerState(db, q.id);
  row = await db.communityPost.findUnique({ where: { id: q.id } });
  ok(row!.acceptedCommentId === null && row!.firstAnswerAt === null, '채택한 답을 가리면 채택 풀림 · 답 없음으로');
  await setTargetHidden(db, { kind: 'comment', id: ans.id, hidden: false, actorId: S.id }, now);
  await refreshAnswerState(db, q.id);
  row = await db.communityPost.findUnique({ where: { id: q.id } });
  ok(row!.firstAnswerAt !== null && row!.acceptedCommentId === null, '되살리면 답은 돌아오고 채택은 그대로 풀림');
  await db.communityPost.update({ where: { id: q.id }, data: { acceptedCommentId: ans.id } });
  await db.communityComment.delete({ where: { id: ans.id } });
  await refreshAnswerState(db, q.id);
  row = await db.communityPost.findUnique({ where: { id: q.id } });
  ok(row!.acceptedCommentId === null && row!.firstAnswerAt === null, '채택한 답을 지우면 채택 · 답 상태가 같이');
  const log = await db.communityModeration.findMany({ where: { targetId: ans.id }, orderBy: { createdAt: 'asc' } });
  ok(log.map((l) => l.action).join() === 'hide,unhide' && log[0].reason === '욕설' && log[0].actorId === S.id, '가리기 · 되살리기 기록(사유 · 누가)');
}

/* ── 자동 임시 가림 ─────────────────────────────── */
{
  const target = await db.communityPost.create({ data: { userId: A.id, category: 'free', title: '광고', body: '.' } });
  const fresh = await Promise.all([1, 2, 3].map((i) => mkUser(`new${i}`, { createdAt: now })));
  for (const u of fresh) await db.communityReport.create({ data: { reporterId: u.id, postId: target.id, reason: 'spam' } });
  ok(!(await maybeAutoHide(db, 'post', target.id, now)), '갓 만든 계정 셋의 신고 → 가리지 않는다');
  const veterans = await Promise.all([1, 2, 3].map((i) => mkUser(`vet${i}`)));
  await db.communityReport.create({ data: { reporterId: veterans[0].id, postId: target.id, reason: 'spam' } });
  await db.communityReport.create({ data: { reporterId: veterans[1].id, postId: target.id, reason: 'spam' } });
  ok(!(await maybeAutoHide(db, 'post', target.id, now)), '오래된 계정 둘 → 아직');
  await db.communityReport.create({ data: { reporterId: veterans[2].id, postId: target.id, reason: 'spam' } });
  ok(await maybeAutoHide(db, 'post', target.id, now), '오래된 계정 셋 → 잠시 가림');
  const log = await db.communityModeration.findFirst({ where: { targetId: target.id } });
  ok(log?.action === 'autohide' && log.actorId === null, '자동 가림 기록(누가 = 없음)');
  /* 운영자가 보고 되살리면 다시 저절로 안 가린다 */
  await setTargetHidden(db, { kind: 'post', id: target.id, hidden: false, actorId: S.id }, now);
  const more = await mkUser('vet4');
  await db.communityReport.create({ data: { reporterId: more.id, postId: target.id, reason: 'spam' } });
  ok(!(await maybeAutoHide(db, 'post', target.id, now)), '운영자가 되살린 글은 저절로 다시 안 가린다');

  /* 문제없는 신고를 되풀이한 사람은 세지 않는다 */
  const t2 = await db.communityPost.create({ data: { userId: B.id, category: 'free', title: '평범', body: '.' } });
  const abusers = await Promise.all([1, 2, 3].map((i) => mkUser(`abuse${i}`)));
  for (const u of abusers) {
    for (let i = 0; i < 3; i++) {
      const other = await db.communityPost.create({ data: { userId: C.id, category: 'free', title: `x${i}`, body: '.' } });
      await db.communityReport.create({
        data: { reporterId: u.id, postId: other.id, reason: 'spam', resolvedAt: now, outcome: 'dismissed' },
      });
    }
    await db.communityReport.create({ data: { reporterId: u.id, postId: t2.id, reason: 'abuse' } });
  }
  ok(!(await maybeAutoHide(db, 'post', t2.id, now)), '문제없음 신고를 되풀이한 셋 → 가리지 않는다');

  /* 운영자 글은 저절로 안 가린다 */
  const staffPost = await db.communityPost.create({ data: { userId: S.id, category: 'free', title: '공지', body: '.', byStaff: true } });
  for (const u of veterans) await db.communityReport.create({ data: { reporterId: u.id, postId: staffPost.id, reason: 'other' } });
  ok(!(await maybeAutoHide(db, 'post', staffPost.id, now)), '운영자 글 → 자동 가림 없음');
}

/* ── 빈도 · 지표 ─────────────────────────────── */
{
  const before = await recentCount(db, 'post', A.id, new Date());
  ok(before > 0, '최근 글 수를 센다');
  const m = await communityMetrics(db, new Date(now.getTime() + 60_000));
  ok(m.weeks[0].posts > 0 && m.weeks[0].writers >= 1, '이번 주 글 · 작성자(운영자 뺌)');
  ok(m.weeks[0].writers === new Set((await db.communityPost.findMany({ where: { byStaff: false, user: { role: 'USER' } }, select: { userId: true } })).map((r) => r.userId)).size, '작성자 수는 운영자 빼고');
  ok(m.questions.total >= 1 && m.unanswered >= 1, '질문 수 · 답 없는 질문');
  ok(m.retention.rate === null, '첫 참여가 7일 안 된 사람뿐 → 재참여율 집계 전(null)');
  ok(m.reports.open > 0, '처리 전 신고 수');
}

await db.$disconnect();
await server.stop();
await pg.close();
console.log(`community db selftest: ${passed} 통과`);
