/**
 * 내 영상 '추가 · 덕아웃 공유'(2026-10-29) 셀프테스트 — npm run my-videos:test 가 같이 돈다.
 *
 * 앱 코드를 그대로 부른다: 기기 대기열 · 초안(native/src/videos/queue-core.ts — 폰 저장소 · 서버를 흉내), 공유 규칙(lib/video-share.ts).
 * 본다: 초안 → 대기열 → 서버 인계 차례, 폰에 못 적으면 저장 실패(초안 유지), 계정 · 번호(clientId), 신호 없음 · 응답 유실 · 서버 거절 · 한도 · 계정 바뀜,
 * 다시 켬, 옛 초안 옮김, 공개 payload(메모 · 다른 영상 안 감), 메모 복사(중복 · 길이), 꺼진 사이 단계 복구, 서버 중복 방지(소스 모양).
 * 운영 DB 는 읽지도 쓰지도 않는다.
 */
import { readFileSync } from 'node:fs';
import type { NewVideo } from '../lib/my-videos.ts';
import { POST_BODY_MAX } from '../lib/community.ts';
import {
  EMPTY_ATTEMPT,
  insertNote,
  newShareDraft,
  noteInBody,
  publicItems,
  restoreShareDraft,
  sharePayload,
  shareTextError,
} from '../lib/video-share.ts';
import {
  createDraftStore,
  createShareStore,
  createVideoQueue,
  FAIL_LIMIT,
  type KV,
  type SendResult,
} from '../native/src/videos/queue-core.ts';

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const tick = () => new Promise((r) => setTimeout(r, 0));

/* ── 폰 저장소 흉내 — 쓰기 실패를 켤 수 있다 ── */
function fakeKV() {
  const disk = new Map<string, string>();
  const ctl = { failWrites: false, writes: 0 };
  const kv: KV = {
    get: async (k) => disk.get(k) ?? null,
    set: async (k, v) => {
      if (ctl.failWrites) throw new Error('disk full');
      ctl.writes++;
      disk.set(k, v);
    },
    remove: async (k) => {
      if (ctl.failWrites) throw new Error('disk full');
      disk.delete(k);
    },
  };
  return { kv, disk, ctl };
}

/* ── 서버 흉내 — 실제 createMyVideo 처럼 같은 번호 · 같은 경로는 하나만 ── */
type Mode = 'ok' | 'offline' | 'server' | 'reject' | 'login' | 'lose-reply';
function fakeServer() {
  const rows = new Map<string, NewVideo>();
  const ctl = { mode: 'ok' as Mode, calls: 0, hold: null as null | Promise<void> };
  const send = async (v: NewVideo): Promise<SendResult> => {
    ctl.calls++;
    if (ctl.hold) await ctl.hold;
    if (ctl.mode === 'offline')
      throw Object.assign(new Error('offline'), { fault: 'offline' });
    if (ctl.mode === 'server')
      throw Object.assign(new Error('500'), { fault: 'server' });
    if (ctl.mode === 'reject')
      return { ok: false, error: '영상 경로가 올바르지 않아요.', retry: false };
    if (ctl.mode === 'login') return { ok: false, error: '로그인이 필요해요.' };
    const dup = [...rows.values()].some(
      (r) => r.clientId === v.clientId || r.path === v.path
    );
    if (!dup) rows.set(v.clientId, v);
    if (ctl.mode === 'lose-reply')
      throw Object.assign(new Error('lost'), { fault: 'offline' });
    return { ok: true };
  };
  return { rows, ctl, send };
}
const fault = (e: unknown) =>
  (e as { fault?: string }).fault === 'server'
    ? ('server' as const)
    : ('offline' as const);

let n = 0;
const video = (over: Partial<NewVideo> = {}): NewVideo => {
  n++;
  return {
    clientId: `client-${String(n).padStart(4, '0')}`,
    path: `user-a/local-${n}.mov`,
    sport: 'pitch',
    origin: 'album',
    capturedAt: null,
    capturedDate: null,
    capturedSource: 'unknown',
    feelNote: null,
    durationSec: 18,
    width: 1080,
    height: 1920,
    ...over,
  };
};

function makeQueue(
  kv: KV,
  server: ReturnType<typeof fakeServer>,
  owner: { id: string | null },
  onSent?: () => void
) {
  return createVideoQueue({
    kv,
    key: 'q',
    owner: () => owner.id,
    send: server.send,
    fault,
    onSent,
  });
}

console.log('[영상 추가 — 초안 · 대기열 인계]');
{
  const { kv, ctl } = fakeKV();
  const drafts = createDraftStore(kv, 'drafts');
  const server = fakeServer();
  const owner = { id: 'user-a' };
  let sentCount = 0;
  const q = makeQueue(kv, server, owner, () => sentCount++);
  const v = video({ feelNote: '하체로 밀었다' });

  /* 1) 초안 남김 → 다른 계정은 못 봄 */
  await drafts.save({ owner: 'user-a', input: v, fileName: 'IMG_1.MOV', updatedAt: 1 });
  check(
    '초안: 주인 계정이 읽는다',
    (await drafts.load('user-a'))?.input.clientId === v.clientId
  );
  check('초안: 다른 계정엔 안 보인다', (await drafts.load('user-b')) === null);
  await drafts.save({
    owner: 'user-b',
    input: video({ path: 'user-b/local-x.mov' }),
    fileName: null,
    updatedAt: 1,
  });

  /* 2) 폰 쓰기 실패 → enqueue 가 던지고 메모리도 그대로(저장된 것처럼 안 보임), 초안 유지 */
  ctl.failWrites = true;
  let threw = false;
  await q.enqueue('user-a', v).catch(() => (threw = true));
  ctl.failWrites = false;
  check('저장: 폰에 못 적으면 던진다', threw);
  check('저장: 못 적었으면 줄이 없다(성공처럼 안 보임)', q.rows().length === 0);
  check(
    '저장: 못 적었으면 초안 그대로',
    (await drafts.load('user-a'))?.input.feelNote === '하체로 밀었다'
  );

  /* 3) 정상 인계 — 줄 적기 → 초안 지우기(그 번호만) → 보내기 */
  await q.enqueue('user-a', v);
  check(
    '인계: 줄이 폰에 적혔다',
    q.rows().length === 1 && q.statusOf(v.clientId) === 'queued'
  );
  check(
    '인계: 다른 번호로는 초안을 안 지운다',
    (await drafts.clear('user-a', 'other-client')) === false &&
      (await drafts.load('user-a')) !== null
  );
  check(
    '인계: 그 번호면 지운다',
    (await drafts.clear('user-a', v.clientId)) === true &&
      (await drafts.load('user-a')) === null
  );
  check('인계: 다른 계정 초안은 그대로', (await drafts.load('user-b')) !== null);
  const s = await q.sendNow(v.clientId);
  check('보내기: 서버가 받으면 sent', s === 'sent', s);
  check(
    '보내기: 줄이 빠지고 서버에 하나',
    q.rows().length === 0 && server.rows.size === 1 && sentCount === 1
  );
  check(
    '보내기: 메모가 그대로 서버로',
    server.rows.get(v.clientId)?.feelNote === '하체로 밀었다'
  );
}

console.log('[동기화 대기 · 응답 유실 · 거절 · 한도]');
{
  const { kv } = fakeKV();
  const server = fakeServer();
  const owner = { id: 'user-a' };
  const q = makeQueue(kv, server, owner);
  const v = video();
  await q.enqueue('user-a', v);

  server.ctl.mode = 'offline';
  check('신호 없음: queued', (await q.sendNow(v.clientId)) === 'queued');
  check('신호 없음: 횟수 안 셈', q.rows()[0]?.fails === 0 && q.stopped() === 'offline');

  /* 응답만 잃음 — 서버엔 생겼는데 앱은 모름 → 다시 보내도 하나 */
  server.ctl.mode = 'lose-reply';
  check('응답 유실: 앱은 queued', (await q.sendNow(v.clientId)) === 'queued');
  server.ctl.mode = 'ok';
  check('응답 유실 뒤 다시: sent', (await q.sendNow(v.clientId)) === 'sent');
  check('응답 유실 뒤: 서버엔 하나뿐', server.rows.size === 1);

  /* 로그인 풀림 — 줄 유지, 까닭 login */
  const w = video();
  await q.enqueue('user-a', w);
  server.ctl.mode = 'login';
  check(
    '로그인 풀림: queued',
    (await q.sendNow(w.clientId)) === 'queued' && q.stopped() === 'login'
  );
  /* 서버 거절(retry:false) — 빼지 않고 저장 실패로 남김 */
  server.ctl.mode = 'reject';
  check('거절: failed', (await q.sendNow(w.clientId)) === 'failed');
  check(
    '거절: 줄 · 메모 · 까닭이 남는다',
    q.rows().length === 1 && q.rows()[0].state === 'failed' && !!q.rows()[0].error
  );
  /* 다시 보내기 — 같은 줄을 고침 */
  server.ctl.mode = 'ok';
  await q.retry(w.clientId);
  check(
    '다시 보내기: 같은 번호로 sent',
    q.statusOf(w.clientId) === 'sent' && server.rows.has(w.clientId)
  );

  /* 서버 오류는 세고, 한도에 닿으면 저장 실패(조용히 버리지 않음) */
  const x = video();
  await q.enqueue('user-a', x);
  server.ctl.mode = 'server';
  for (let i = 0; i < FAIL_LIMIT; i++) await q.sendNow(x.clientId);
  check(
    '한도: 줄이 남고 failed',
    q.statusOf(x.clientId) === 'failed' &&
      q.rows().some((r) => r.input.clientId === x.clientId)
  );
  const before = server.ctl.calls;
  await q.drain();
  check('한도: 실패 줄은 저절로 다시 안 보냄', server.ctl.calls === before);
  /* 지우기 — 그 줄만 */
  await q.remove(x.clientId);
  check('지우기: 그 줄만 빠짐', q.statusOf(x.clientId) === 'gone');
}

console.log('[같은 영상 다시 저장 · 새 영상 · 시간 넘김 · 동시]');
{
  const { kv } = fakeKV();
  const server = fakeServer();
  const owner = { id: 'user-a' };
  const q = makeQueue(kv, server, owner);
  const v = video();
  server.ctl.mode = 'offline';
  await q.enqueue('user-a', v);
  await q.sendNow(v.clientId);
  await q.enqueue('user-a', { ...v, feelNote: '고친 메모' });
  check(
    '다시 저장: 같은 번호는 한 줄(덮음)',
    q.rows().length === 1 && q.rows()[0].input.feelNote === '고친 메모'
  );
  const w = video();
  await q.enqueue('user-a', w);
  check('새 영상: 새 번호 · 두 줄', q.rows().length === 2 && w.clientId !== v.clientId);

  /* 시간 넘김 — 서버가 늦으면 queued 로 돌려주고 보내기는 뒤에서 이어감 */
  server.ctl.mode = 'ok';
  let release!: () => void;
  server.ctl.hold = new Promise<void>((r) => (release = r));
  const quick = await q.sendNow(v.clientId, 30);
  check('시간 넘김: queued(줄은 폰에)', quick === 'queued');
  release();
  server.ctl.hold = null;
  await q.drain();
  await tick();
  check(
    '시간 넘김 뒤: 뒤에서 끝나 sent',
    q.statusOf(v.clientId) === 'sent' && q.statusOf(w.clientId) === 'sent'
  );

  /* 동시에 두 번 보내기 — 하나의 보내기를 같이 기다림, 서버엔 하나 */
  const y = video();
  await q.enqueue('user-a', y);
  const [a, b] = await Promise.all([q.sendNow(y.clientId), q.sendNow(y.clientId)]);
  check(
    '두 번 누름: 둘 다 sent · 서버엔 하나',
    a === 'sent' &&
      b === 'sent' &&
      [...server.rows.values()].filter((r) => r.clientId === y.clientId).length === 1
  );
}

console.log('[계정 바뀜 · 다시 켬 · 옛 초안]');
{
  const { kv, disk } = fakeKV();
  const server = fakeServer();
  const owner = { id: 'user-a' as string | null };
  const q = makeQueue(kv, server, owner);
  const v = video();
  await q.enqueue('user-a', v);

  /* 보내는 사이 계정이 바뀌고 서버가 거절 — 그 답으로 실패를 정하지 않는다 */
  let release!: () => void;
  server.ctl.hold = new Promise<void>((r) => (release = r));
  server.ctl.mode = 'reject';
  const p = q.drain();
  await tick();
  owner.id = 'user-b';
  release();
  await p;
  server.ctl.hold = null;
  check('계정 바뀜: 거절 답으로 실패 표시 안 함', q.rows()[0]?.state === 'queued');
  server.ctl.mode = 'ok';
  const calls = server.ctl.calls;
  await q.drain();
  check(
    '계정 바뀜: 다른 계정 줄은 안 보냄',
    server.ctl.calls === calls && q.rows().length === 1
  );

  /* 다시 켬 — 폰에 적힌 줄이 돌아온다(실패 상태 포함) */
  const fail = video();
  await q.enqueue('user-a', fail);
  owner.id = 'user-a';
  server.ctl.mode = 'reject';
  await q.sendNow(fail.clientId);
  const q2 = makeQueue(kv, server, owner);
  await q2.ready;
  check(
    '다시 켬: 줄 · 실패 상태 복원',
    q2.rows().length === 2 &&
      q2.statusOf(fail.clientId) === 'failed' &&
      !!q2.rows().find((r) => r.input.clientId === fail.clientId)?.error
  );

  /* 옛 대기열(v1, state 없음) → 대기로 */
  disk.set('q', JSON.stringify([{ owner: 'user-a', input: video(), fails: 2 }]));
  const q3 = makeQueue(kv, server, owner);
  await q3.ready;
  check(
    '옛 줄: state 없으면 대기',
    q3.rows()[0]?.state === 'queued' && q3.rows()[0]?.fails === 2
  );

  /* 옛 초안(v1) — 저절로 등록하지 않고 새 초안으로 옮긴다 */
  const legacy = video({ feelNote: null });
  disk.set('draft-v1', JSON.stringify({ owner: 'user-a', input: legacy }));
  const d2 = createDraftStore(kv, 'drafts-v2', 'draft-v1');
  const moved = await d2.load('user-a');
  check('옛 초안: 새 초안으로 옮김', moved?.input.clientId === legacy.clientId);
  check('옛 초안: 옛 칸 지움', !disk.has('draft-v1'));
  check(
    '옛 초안: 대기열로 저절로 안 감',
    !q3.rows().some((r) => r.input.clientId === legacy.clientId)
  );
}

console.log('[덕아웃 공유 — 메모 복사 · 공개 payload · 복구]');
{
  const note = '마지막 5구는 힘을 빼니 릴리스가 편했음.';
  const r1 = insertNote('', note);
  check('메모: 빈 본문엔 메모만', r1.ok && r1.body === note);
  const r2 = insertNote('오늘 불펜 영상이에요.', note);
  check(
    '메모: 한 줄 띄고 붙임',
    r2.ok && r2.body === `오늘 불펜 영상이에요.\n\n${note}`
  );
  const r3 = insertNote(r2.ok ? r2.body : '', note);
  check('메모: 두 번 넣지 않음(dup)', !r3.ok && r3.reason === 'dup');
  check(
    '메모: 띄어쓰기 · 줄바꿈이 달라도 같은 메모로',
    noteInBody(`앞\n\n마지막 5구는   힘을 빼니\n릴리스가 편했음.`, note)
  );
  const full = 'ㄱ'.repeat(POST_BODY_MAX - 5);
  const r4 = insertNote(full, note);
  check('메모: 넘치면 잘라 넣지 않고 long', !r4.ok && r4.reason === 'long');
  check('메모: 없으면 empty', !insertNote('본문', '   ').ok);
  /* 복사한 뒤 본문은 일반 글 — 메모 원본과 따로(고쳐도 메모 쪽은 모름) */
  const edited = (r2.ok ? r2.body : '').replace('릴리스', '팔 스윙');
  check(
    '메모: 고친 본문은 더는 메모와 같지 않음(다시 넣을 수 있음)',
    !noteInBody(edited, note)
  );

  const payload = sharePayload({
    category: 'question',
    tag: 'form',
    title: '  앞발 착지 뒤 상체  ',
    body: ' 본문 ',
    copyPath: 'user-a/copy-1.mov',
    logId: null,
  });
  check(
    'payload: 기록 없으면 card 없음',
    !('card' in payload) && !('cardVideo' in payload)
  );
  check(
    'payload: 영상은 공유 사본 하나',
    payload.media.length === 1 && payload.media[0] === 'user-a/copy-1.mov'
  );
  check(
    'payload: 제목 · 본문 다듬음',
    payload.title === '앞발 착지 뒤 상체' && payload.body === '본문'
  );
  const withLog = sharePayload({
    category: 'free',
    tag: 'record',
    title: 't',
    body: 'b',
    copyPath: 'user-a/copy-2.mov',
    logId: 'log-9',
  });
  check(
    'payload: 기록은 ref 만 · 카드 영상 끔',
    'card' in withLog && withLog.card === 'pitch:log-9' && withLog.cardVideo === false
  );
  const keys = Object.keys(withLog).sort().join(',');
  check(
    'payload: 메모 · 원본 경로 · 컨디션 칸 없음',
    keys === 'body,card,cardVideo,category,media,tag,title',
    keys
  );
  check(
    '공개 항목: 기록 고르면만 투구 기록',
    publicItems(false).length === 3 &&
      publicItems(true).some((s) => s.startsWith('투구 기록'))
  );
  check(
    '글 검사: 빈칸',
    shareTextError(' ', 'x') !== null && shareTextError('x', 'y') === null
  );

  /* 꺼진 사이 단계 — 전송 중이면 전송 실패, 등록 중이면 결과 확인부터 */
  const base = {
    ...newShareDraft('user-a', 'user-a/local-1.mov', 'form'),
    title: '제목',
    body: '본문',
  };
  const up = restoreShareDraft(
    {
      ...base,
      attempt: {
        ...EMPTY_ATTEMPT,
        stage: 'upload',
        copyPath: 'user-a/c.mov',
        uploaded: false,
      },
    },
    'user-a',
    'user-a/local-1.mov'
  );
  check(
    '복구: 전송 중 → 전송 실패(내용 그대로)',
    up?.attempt.stage === 'failed' && up.title === '제목' && !!up.attempt.error
  );
  const reg = restoreShareDraft(
    {
      ...base,
      attempt: {
        ...EMPTY_ATTEMPT,
        stage: 'register',
        copyPath: 'user-a/c.mov',
        uploaded: true,
      },
    },
    'user-a',
    'user-a/local-1.mov'
  );
  check(
    '복구: 등록 중 → 결과 확인 필요(새로 안 만듦)',
    reg?.attempt.stage === 'uncertain' && reg.attempt.uploaded === true
  );
  check(
    '복구: 다른 계정 초안은 안 읽음',
    restoreShareDraft(base, 'user-b', 'user-a/local-1.mov') === null
  );
  check(
    '복구: 다른 영상 초안은 안 읽음',
    restoreShareDraft(base, 'user-a', 'user-a/local-2.mov') === null
  );
  check(
    '복구: 사본 경로 없으면 uploaded 아님',
    restoreShareDraft(
      { ...base, attempt: { ...EMPTY_ATTEMPT, uploaded: true } },
      'user-a',
      base.path
    )?.attempt.uploaded === false
  );
  check('복구: 허락 체크는 초안에 없다(늘 다시 확인)', !('ack' in (reg ?? {})));

  /* 공유 초안 저장소 — 계정 + 영상마다, 지우기는 그 칸만 */
  const { kv } = fakeKV();
  const store = createShareStore<typeof base>(kv, 'share');
  await store.save({ ...base, updatedAt: 1 });
  await store.save({ ...base, path: 'user-a/local-2.mov', updatedAt: 2 });
  await store.save({ ...base, owner: 'user-b', updatedAt: 3 });
  await store.clear('user-a', base.path);
  check(
    '공유 초안: 그 영상 것만 지움',
    (await store.load('user-a', base.path)) === null &&
      (await store.load('user-a', 'user-a/local-2.mov')) !== null
  );
  check(
    '공유 초안: 다른 계정 것은 그대로',
    (await store.load('user-b', base.path)) !== null
  );
}

console.log('[서버 — 게시 중복 방지 · 공개 범위(소스 모양)]');
{
  const src = readFileSync(
    new URL('../app/actions/community.ts', import.meta.url),
    'utf8'
  );
  const create = src.slice(
    src.indexOf('async function tryCreatePost'),
    src.indexOf('export async function updatePost')
  );
  const mediaAt = create.indexOf('media: { hasSome: d.media }');
  const minuteAt = create.indexOf('createdAt: { gte: new Date(Date.now() - 60_000) }');
  const fastAt = create.indexOf("tooFast('post'");
  check('같은 사본으로 만든 글이면 그 글(요청 단위)', mediaAt > 0);
  check(
    '그 확인이 1분 확인 · 도배 막기보다 먼저',
    mediaAt < minuteAt && minuteAt < fastAt
  );
  check(
    '1분 확인은 영상까지 같을 때만(다른 영상은 새 글)',
    /media: \{ equals: d\.media \}/.test(create)
  );
  check(
    '같은 파일 묶음은 잠금으로 한 줄씩',
    /pg_advisory_xact_lock\(hashtextextended\(\$\{`post-media:\$\{user\.id\}/.test(
      create
    )
  );
  check(
    '기록 카드 영상은 cardVideo=0 이면 안 실음',
    /video: field\(formData, 'cardVideo'\) !== '0'/.test(create) &&
      /fd\.set\('cardVideo', '0'\)/.test(src)
  );
  check(
    '게시 여부 확인은 본인 글 · 그 사본만',
    /export async function loadSharePost[\s\S]{0,600}userId: user\.id, media: \{ has: path \}/.test(
      src
    )
  );
  const cards = readFileSync(
    new URL('../lib/community-cards.ts', import.meta.url),
    'utf8'
  );
  check(
    '카드: video:false 면 영상 null',
    /video: video \? \(l\.videoPaths\.find/.test(cards) &&
      /opts\.video !== false/.test(cards)
  );
  const share = readFileSync(
    new URL('../native/src/app/my-videos/share.tsx', import.meta.url),
    'utf8'
  );
  check(
    '앱 공유는 sharePayload 로만 보낸다',
    /'community\.createAppPost',\s*sharePayload\(/.test(share)
  );
  check(
    '앱 공유: 등록 답이 없으면 결과 확인(새로 안 만듦)',
    /stage: 'uncertain'/.test(share) && /community\.loadSharePost/.test(share)
  );
  const add = readFileSync(
    new URL('../native/src/app/my-videos/new.tsx', import.meta.url),
    'utf8'
  );
  const enq = add.indexOf('void enqueueVideo(owner, input)');
  check(
    '추가: 줄 적기 → 초안 지우기 → 보내기 차례',
    enq > 0 &&
      add.indexOf('clearVideoDraft(owner, input.clientId)', enq) > enq &&
      add.indexOf('sendVideoNow(input.clientId)', enq) >
        add.indexOf('clearVideoDraft(owner, input.clientId)', enq)
  );
  check(
    '추가: 투구수 · 강도를 안 만든다(createMyVideo 만)',
    !/pitchCount|intensity|createLog/.test(add)
  );
}

console.log(`\n${failed ? '✗' : '✓'} ${passed} 통과 · ${failed} 실패`);
process.exit(failed === 0 ? 0 : 1);
