'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Loader2, RotateCw, Upload } from '@/components/icon';
import { apiFailText, type ApiFailBody } from '../parts';

/**
 * 과거 기록 가져오기 실행(EX-REF04). '가져오기 시작'을 누른 뒤에만 한 묶음씩 차례로 보낸다(저절로 시작하지 않는다).
 * 묶음 본문은 서버가 만든 글자 그대로 보낸다 — 다시 보내도 같은 요청 번호 · 같은 내용이라 한 번만 저장된다.
 * '확인 못 함'(신호 끊김 · 503 · 목록 확인 전)만 다시 보낸다. 400 · 401 · 403 · 409 · 413 · 415 같은 거절은 다시 보내도 같으니
 * '거절됨'으로 따로 보이고 다시 보내지 않는다(묶음 파일이나 계정을 고쳐야 한다).
 */

export type RunnerChunk = { position: number; requestKey: string; index: number; total: number; records: number; body: string };

type ChunkState =
  | { kind: 'waiting' }
  | { kind: 'sending' }
  | { kind: 'saved'; replayed: boolean }
  | { kind: 'unconfirmed'; message: string }
  | { kind: 'failed'; message: string };

const STATE_LABEL: Record<ChunkState['kind'], string> = {
  waiting: '대기',
  sending: '보내는 중',
  saved: '저장됨',
  unconfirmed: '확인 못 함',
  failed: '거절됨',
};

const ERROR_TEXT: Record<number, string> = {
  400: '묶음 모양이 맞지 않아요. 묶음 파일을 다시 만들어 주세요.',
  401: '로그인이 풀렸어요. 다시 로그인한 뒤 화면을 새로 열어 주세요.',
  409: '같은 요청 번호로 다른 내용이 이미 저장돼 있어요. 묶음 파일을 확인해 주세요.',
  413: '묶음이 너무 커요.',
  415: 'JSON 본문만 받아요.',
};
const UNSURE = '저장했는지 확인하지 못했어요. 다시 보내도 겹치지 않아요.';

async function sendChunk(body: string): Promise<ChunkState> {
  let res: Response;
  try {
    res = await fetch('/api/admin/review-evidence/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-review-evidence': '1' },
      body,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    return { kind: 'unconfirmed', message: UNSURE };
  }
  let data: (ApiFailBody & { receipt?: { replayed?: boolean; visible?: boolean } }) | null = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (res.ok && data?.receipt) {
    if (data.receipt.visible === false) return { kind: 'unconfirmed', message: '저장은 됐지만 목록 확인 전이에요. 다시 보내 확인해 주세요.' };
    return { kind: 'saved', replayed: data.receipt.replayed === true };
  }
  if (res.status >= 500 || res.ok) return { kind: 'unconfirmed', message: UNSURE };
  return { kind: 'failed', message: apiFailText(res.status, data, { forbidden: '대표관리자만 보낼 수 있어요.', byStatus: ERROR_TEXT, fallback: '보내지 못했어요.' }) };
}

export function ImportRunner({ chunks, storeKind }: { chunks: RunnerChunk[]; storeKind: 'central' | 'local-fixture' }) {
  const [states, setStates] = useState<ChunkState[]>(() => chunks.map(() => ({ kind: 'waiting' })));
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);

  const setAt = (i: number, s: ChunkState) => setStates((prev) => prev.map((x, n) => (n === i ? s : x)));

  async function run(targets: number[]) {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    try {
      for (const i of targets) {
        setAt(i, { kind: 'sending' });
        setAt(i, await sendChunk(chunks[i].body));
      }
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  const started = states.some((s) => s.kind !== 'waiting');
  const retryable = states.flatMap((s, i) => (s.kind === 'unconfirmed' ? [i] : []));
  const waiting = states.flatMap((s, i) => (s.kind === 'waiting' ? [i] : []));
  const done = !running && started && waiting.length === 0;
  const count = (k: ChunkState['kind']) => states.filter((s) => s.kind === k).length;
  const replayed = states.filter((s) => s.kind === 'saved' && s.replayed).length;

  return (
    <section aria-label="묶음 보내기" className="stack-block">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={running || waiting.length === 0}
          onClick={() => void run(waiting)}
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-sky px-5 text-base font-semibold text-white disabled:opacity-50 desk:rounded-xl"
        >
          {running ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Upload aria-hidden className="h-4 w-4" />}
          {started ? '남은 묶음 보내기' : '가져오기 시작'}
        </button>
        {retryable.length > 0 && (
          <button
            type="button"
            disabled={running}
            onClick={() => void run(retryable)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-sky hover:bg-sky/10 disabled:opacity-50"
          >
            <RotateCw aria-hidden className="h-4 w-4" />
            확인 못 한 묶음 다시 보내기 {retryable.length}개
          </button>
        )}
      </div>
      <p className="text-xs text-muted">{storeKind === 'central' ? '중앙 저장소에 씁니다.' : '내 컴퓨터 시험 폴더에 씁니다.'} 누르기 전에는 보내지 않아요.</p>

      <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
        {chunks.map((c, i) => {
          const s = states[i];
          const tone = s.kind === 'failed' ? 'text-danger' : s.kind === 'unconfirmed' ? 'text-warn' : s.kind === 'saved' ? 'text-sky' : 'text-muted';
          return (
            <li key={c.position} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-(--block-pad) py-3 text-sm last:border-b-0">
              <span className="min-w-0">
                <span className="text-ink">
                  묶음 {c.index + 1}/{c.total}
                </span>
                <span className="ml-2 text-xs text-muted">줄 {c.records}개</span>
                {s.kind === 'failed' && <span className="block text-xs text-danger">{s.message}</span>}
                {s.kind === 'unconfirmed' && <span className="block text-xs text-warn">{s.message}</span>}
              </span>
              <span className={`text-xs font-semibold ${tone}`}>
                {s.kind === 'saved' && s.replayed ? '이미 저장됨' : STATE_LABEL[s.kind]}
              </span>
            </li>
          );
        })}
      </ul>

      {done && (
        <div role="status" className="rounded-2xl border border-line bg-surface p-(--block-pad) text-sm text-ink">
          <p className="font-semibold">
            저장 {count('saved') - replayed}개 · 이미 저장 {replayed}개 · 확인 못 함 {count('unconfirmed')}개 · 거절됨 {count('failed')}개
          </p>
          {retryable.length > 0 && <p className="mt-1 text-xs text-muted">확인 못 한 묶음은 다시 보내도 겹치지 않아요.</p>}
          {count('failed') > 0 && <p className="mt-1 text-xs text-danger">거절된 묶음은 다시 보내도 같아요. 묶음 파일이나 로그인 상태를 고친 뒤 화면을 새로 열어 주세요.</p>}
          <Link href="/admin/review-evidence" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-sky hover:underline desk:min-h-0">
            검수 근거자료 목록으로
          </Link>
        </div>
      )}
    </section>
  );
}
