/**
 * 내 영상 → 덕아웃에 올리기의 규칙(순수 — 앱 · 서버 · 셀프테스트 공용, 2026-10-29 확정 시안 02-share).
 *
 * - 초안(ShareDraft)은 계정 + 영상 경로마다. 글 · 고른 기록 · 이번 게시 시도(attempt)를 같이 둔다 — 화면을 나갔다 와도 이어진다.
 * - 게시 시도의 열쇠는 **공유 사본 경로**(copyPath). 사본은 올릴 때마다 새 경로라, 같은 사본으로 다시 보내면 = 같은 시도(서버가 이미 만든 글을 돌려준다),
 *   같은 글이라도 다른 영상(다른 사본)이면 새 글이다. 사본이 이미 올라갔으면 다시 올리지 않는다(attempt.uploaded).
 * - 앱이 꺼진 사이 전송 중이었으면 → 전송 실패(내용 · 선택 그대로), 등록 중이었으면 → 결과 확인 필요(먼저 서버에 묻는다 — 새로 만들지 않는다).
 * - 영상 메모는 자동으로 안 붙는다. '본문에 넣기'로 복사한 글만 본문 — 그 뒤엔 일반 본문(메모와 따로).
 * - 투구 기록은 기본 안 붙음. 붙이면 종류 · 공 수 · 날짜만(카드의 영상 칸은 이 흐름에서 비운다 — 서버 cardVideo:false).
 *
 * 시험: npm run my-videos:test(scripts/my-videos-flow-selftest.mts)
 */
import { POST_BODY_MAX, POST_TITLE_MAX } from '@/lib/community';
import { cleanFeelNote } from '@/lib/my-videos';

export type ShareStage =
  | 'idle'
  | 'upload'
  | 'register'
  | 'failed'
  | 'rejected'
  | 'uncertain'
  | 'notPosted'
  | 'done';

export type ShareAttempt = {
  stage: ShareStage;
  /** 올린(또는 올리던) 공유 사본 — 같은 시도의 열쇠 */
  copyPath: string | null;
  /** 사본이 다 올라갔나(서버 복사 포함) — true 면 다시 안 올린다 */
  uploaded: boolean;
  /** 올리다 만 사본들 — 정리할 것(어디에도 안 붙었을 때만 지워진다) */
  stale: string[];
  postId: string | null;
  /** 서버가 정한 나라(완료 뒤) */
  country: string | null;
  error: string | null;
};
export type ShareDraft = {
  owner: string;
  path: string;
  kindKey: string;
  title: string;
  body: string;
  /** 붙일 투구 기록 — 기본 null(안 붙임) */
  logId: string | null;
  attempt: ShareAttempt;
  updatedAt: number;
};

export const EMPTY_ATTEMPT: ShareAttempt = {
  stage: 'idle',
  copyPath: null,
  uploaded: false,
  stale: [],
  postId: null,
  country: null,
  error: null,
};

export function newShareDraft(
  owner: string,
  path: string,
  kindKey: string
): ShareDraft {
  return {
    owner,
    path,
    kindKey,
    title: '',
    body: '',
    logId: null,
    attempt: EMPTY_ATTEMPT,
    updatedAt: 0,
  };
}

/**
 * 폰에서 읽은 초안 — 모양을 다듬고, 꺼지기 전 단계를 이어갈 단계로. 주인 · 경로가 다르면 null(다른 계정 · 다른 영상 것을 안 보인다).
 * 동의(다른 사람 허락)는 초안에 두지 않는다 — 돌아오면 늘 다시 확인한다.
 */
export function restoreShareDraft(
  raw: unknown,
  owner: string,
  path: string
): ShareDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<ShareDraft>;
  if (d.owner !== owner || d.path !== path) return null;
  const a = (d.attempt ?? {}) as Partial<ShareAttempt>;
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  let stage: ShareStage =
    (
      [
        'idle',
        'upload',
        'register',
        'failed',
        'rejected',
        'uncertain',
        'notPosted',
        'done',
      ] as const
    ).find((s) => s === a.stage) ?? 'idle';
  let error = str(a.error);
  /* 꺼진 사이 — 전송 중이면 전송 실패(다시 시도), 등록 중이면 서버가 만들었을 수 있어 결과 확인부터 */
  if (stage === 'upload') {
    stage = 'failed';
    error = '앱이 닫혀 영상 전송이 멈췄어요.';
  }
  if (stage === 'register') stage = 'uncertain';
  return {
    owner,
    path,
    kindKey: str(d.kindKey) ?? '',
    title: (str(d.title) ?? '').slice(0, POST_TITLE_MAX),
    body: (str(d.body) ?? '').slice(0, POST_BODY_MAX),
    logId: str(d.logId),
    attempt: {
      stage,
      copyPath: str(a.copyPath),
      uploaded: a.uploaded === true && !!str(a.copyPath),
      stale: Array.isArray(a.stale)
        ? a.stale.filter((p): p is string => typeof p === 'string').slice(-10)
        : [],
      postId: str(a.postId),
      country: str(a.country),
      error,
    },
    updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : 0,
  };
}

/** 메모가 이미 본문에 들었나(서버가 다듬은 꼴로 견줌 — 띄어쓰기 · 줄바꿈 차이는 같은 것으로) */
export function noteInBody(body: string, note: string | null): boolean {
  const n = cleanFeelNote(note);
  if (!n) return false;
  return body.replace(/\s+/g, ' ').includes(n);
}

/**
 * '본문에 넣기' — 끝에 한 줄 띄고 붙인다. 이미 들었으면 dup, 넣으면 본문 한도를 넘으면 long(잘라 넣지 않는다).
 */
export function insertNote(
  body: string,
  note: string | null,
  max = POST_BODY_MAX
): { ok: true; body: string } | { ok: false; reason: 'empty' | 'dup' | 'long' } {
  const n = cleanFeelNote(note);
  if (!n) return { ok: false, reason: 'empty' };
  if (noteInBody(body, n)) return { ok: false, reason: 'dup' };
  const head = body.replace(/\s+$/, '');
  const next = head ? `${head}\n\n${n}` : n;
  if (next.length > max) return { ok: false, reason: 'long' };
  return { ok: true, body: next };
}

/** 제목 · 내용이 서버 규칙에 맞나(빈칸 · 길이) — 맞으면 null */
export function shareTextError(title: string, body: string): string | null {
  if (!title.trim() || !body.trim()) return '제목과 내용을 적어 주세요.';
  if (title.trim().length > POST_TITLE_MAX)
    return `제목은 ${POST_TITLE_MAX}자까지 적을 수 있어요.`;
  if (body.trim().length > POST_BODY_MAX)
    return `내용은 ${POST_BODY_MAX}자까지 적을 수 있어요.`;
  return null;
}

/**
 * 서버로 보낼 글 — 미리보기와 같은 것만: 갈래 · 말머리 · 제목 · 내용 · 공유 사본 하나 · (고른 경우) 투구 기록 ref.
 * cardVideo:false — 기록 카드에 그 기록의 다른(원본) 영상을 싣지 않는다. 메모 · 다른 영상 · 컨디션 칸은 없다.
 */
export function sharePayload(input: {
  category: string;
  tag: string;
  title: string;
  body: string;
  copyPath: string;
  logId: string | null;
}) {
  return {
    category: input.category,
    tag: input.tag,
    title: input.title.trim(),
    body: input.body.trim(),
    media: [input.copyPath],
    ...(input.logId ? { card: `pitch:${input.logId}`, cardVideo: false as const } : {}),
  };
}

/** 확인 화면의 '공개 항목' 줄 */
export const publicItems = (withLog: boolean) => [
  '영상 사본',
  '제목',
  '내용',
  ...(withLog ? ['투구 기록(종류 · 공 수 · 날짜)'] : []),
];
