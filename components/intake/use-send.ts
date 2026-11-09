'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { hashOnce } from '@/components/intake/pick';
import type { ConsentAnswer } from '@/lib/intake/consent';
import type { IntakeClient, IntakeReceipt, PublicAsset } from '@/lib/intake/public-client';
import type { IntakeView } from '@/lib/intake/state';
import { browserRecoveryStore, startIntakeUpload, type RecoveryStore } from '@/lib/intake/upload-client';
import { RunStop, finalizeKey, finishRun, isCancelStop, runUpload, type RunDeps, type RunEvent, type RunItem } from '@/lib/intake/upload-run';

export type SendRow = {
  view: IntakeView;
  name: string;
  size: number;
  status: 'waiting' | 'hashing' | 'hashed' | 'sending' | 'confirming' | 'arrived';
  hashed: number;
  sent: number;
};

export type SendStage = 'prepare' | 'send' | 'confirm' | 'finalize';

export type SendState = {
  stage: SendStage;
  rows: SendRow[];
  stop: RunStop | null;
  running: boolean;
  /** 몇 번째 시도인가 — 같은 진행에서 다시 시도해도 화면이 새 시도로 알아보게 */
  attempt: number;
};

export type SendOptions = {
  known: Record<IntakeView, string | null>;
  /** 지금까지 얼린 판 수 — 완료 키를 판마다 새로 만든다 */
  round: number;
  /** 화면이 그린 판 — 칸을 잡으면 그 뒤의 판으로 따라간다. 낡았으면 완료가 멈춘다 */
  version: number;
  samePitchConfirmed?: boolean;
  consents?: readonly ConsentAnswer[];
};

/** 멈췄을 때 화면에 보이는 글 — 실패가 아니라 이어서 보낼 수 있다는 뜻이다 */
export const SEND_CANCELLED_TEXT = '보내기를 멈췄어요. 이어서 보낼 수 있어요.';

const randomKey = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

function reduce(s: SendState, e: RunEvent): SendState {
  const row = (view: IntakeView, patch: Partial<SendRow>) => ({ ...s, rows: s.rows.map((r) => (r.view === view ? { ...r, ...patch } : r)) });
  switch (e.type) {
    case 'stage':
      return { ...s, stage: e.stage };
    case 'hash':
      return row(e.view, { hashed: e.done, status: e.done >= e.total ? 'hashed' : 'hashing' });
    case 'send':
      return row(e.view, { sent: e.sent });
    case 'file':
      return row(e.view, { status: e.status });
    default:
      return s;
  }
}

type Job = {
  items: readonly RunItem[];
  options: SendOptions;
  expected: Partial<Record<IntakeView, string>>;
  /** 완료 요청을 한 번이라도 보냈나 — 그러면 다시 시도는 전송을 되풀이하지 않고 같은 키로 완료만 다시 낸다 */
  finalizeSent: boolean;
  /**
   * 이 일감의 완료 키 — 처음 완료로 갈 때 한 번 정하고 다시 시도마다 그대로 쓴다.
   * 기기 저장소(localStorage)를 못 쓰는 브라우저에서도 응답을 잃은 완료가 새 키로 나가지 않게 일감이 쥔다.
   */
  finalizeKey: string | null;
};

/** 부를 때마다 최신 값을 읽는 것 — 화면이 다시 그려져도 같은 보내기가 이어 간다 */
export type SendControllerInput = {
  client: Pick<IntakeClient, 'reserveAsset' | 'issueToken' | 'registerUploadUrl' | 'confirmUpload' | 'state' | 'finalize'>;
  submissionId: string;
  onReserved: (view: IntakeView, asset: PublicAsset, version: number) => void;
  /** 영수증을 받은 뒤 — 전송은 끝났으니 여기서 난 일은 '못 보냈다'가 아니다. 던지지 않는다 */
  onDone: (receipt: IntakeReceipt) => void;
};

/** 보내기 하나를 이루는 바깥 것 — 브라우저 · 시험이 바꿔 끼운다 */
export type SendControllerEnv = {
  /** 이어 올리기 기록 · 완료 키 자리 — 보내기 하나에 하나 */
  store: RecoveryStore;
  hash: RunDeps['hash'];
  start: RunDeps['start'];
  makeKey: () => string;
  /** 상태가 바뀌었다 — now 면 곧바로, 아니면 묶어서 그린다(진행 막대) */
  publish: (s: SendState, now: boolean) => void;
  sleep?: (ms: number) => Promise<void>;
};

export type SendController = ReturnType<typeof createSendController>;

/**
 * 보내기 하나의 상태 · 차례 — React 와 떨어져 있어 시험이 그대로 돌린다(useSend 가 감싼다).
 * 시작은 누름에서만 한다. 멈춰도 항목을 쥐고 있어 '이어서 보내기'가 재기 · 칸 잡기를 되풀이해도 바이트는 이어서 간다.
 *
 * 시도마다 번호를 둔다. 치웠거나(dispose) 더 새 시도가 있으면 옛 시도의 끝은 화면을 안 바꾼다(publish · onDone · onReserved 를 안 부른다).
 * 다만 서버가 칸을 잡은 사실(known · expected)은 일감에 남긴다 — 다음 시도가 낡은 칸 번호로 부딪히지 않게.
 * 준비 중에 멈추면 전송 · 완료를 시작하지 않는다(runUpload 가 지킨다). 완료를 보낸 뒤에 멈추면 결과를 되찾는다(finishRun).
 */
export function createSendController(input: () => SendControllerInput, env: SendControllerEnv) {
  let current: SendState | null = null;
  let job: Job | null = null;
  let abort: AbortController | null = null;
  let attempt = 0;
  let disposed = false;

  const set = (s: SendState, now: boolean) => {
    current = s;
    env.publish(s, now);
  };

  const go = async (): Promise<void> => {
    const j = job;
    if (disposed || !j || !current || current.running) return;
    /* 앞 시도가 남아 있으면 멈춘다 — 새 시도만 화면을 바꾼다 */
    abort?.abort();
    const id = ++attempt;
    const live = () => !disposed && attempt === id;
    const ctrl = new AbortController();
    abort = ctrl;
    set({ ...current, stop: null, running: true, attempt: id }, true);

    const emit = (e: RunEvent) => {
      if (e.type === 'reserved') {
        /* 서버가 칸을 잡은 사실은 낡은 시도라도 일감에 남긴다 */
        j.options.known[e.view] = e.asset.id;
        j.options.version = e.version;
        j.expected[e.view] = e.asset.id;
        if (live()) input().onReserved(e.view, e.asset, e.version);
        return;
      }
      if (!live() || !current) return;
      set(reduce(current, e), e.type !== 'send' && e.type !== 'hash');
    };

    const { client, submissionId } = input();
    let receipt: IntakeReceipt;
    try {
      /* 완료를 이미 보냈으면 전송은 끝난 것이다 — 같은 키로 완료만 다시 낸다(서버가 얼렸으면 같은 영수증이 온다) */
      if (!j.finalizeSent) {
        await runUpload(
          { api: client, submissionId, pairConfirmed: j.options.samePitchConfirmed === true, hash: env.hash, start: env.start, store: env.store, sleep: env.sleep },
          j.items,
          j.options.known,
          emit,
          ctrl.signal,
        );
      }
      if (!live()) return;
      set({ ...(current as SendState), stage: 'finalize' }, true);
      j.finalizeKey ??= finalizeKey(env.store, submissionId, j.options.round, env.makeKey);
      receipt = await finishRun(
        client,
        {
          idempotencyKey: j.finalizeKey,
          expected: j.expected,
          expectedVersion: j.options.version,
          samePitchConfirmed: j.options.samePitchConfirmed,
          consents: j.options.consents,
          round: j.options.round,
          signal: ctrl.signal,
          alreadySent: j.finalizeSent,
          onSent: () => {
            j.finalizeSent = true;
          },
        },
        env.sleep,
      );
    } catch (e) {
      /* 치웠거나 새 시도가 있다 — 옛 시도의 끝은 그리지 않는다 */
      if (!live()) return;
      const stop = isCancelStop(e)
        ? new RunStop('cancelled', SEND_CANCELLED_TEXT, e instanceof RunStop ? e.view : null)
        : e instanceof RunStop
          ? e
          : new RunStop('unknown', '영상을 보내지 못했어요. 다시 시도해 주세요.');
      set({ ...(current as SendState), stop, running: false }, true);
      return;
    } finally {
      if (abort === ctrl) abort = null;
    }
    if (!live()) return;
    set({ ...(current as SendState), running: false }, true);
    input().onDone(receipt);
  };

  const start = (items: readonly RunItem[], options: SendOptions): Promise<void> => {
    if (disposed || current?.running) return Promise.resolve();
    /* 이번에 안 보내는 칸도 화면이 보여 준 그 자산이어야 한다 — 보내는 칸은 칸을 잡을 때 새 번호로 바뀐다 */
    const expected: Partial<Record<IntakeView, string>> = {};
    for (const view of ['side', 'rear'] as const) {
      const id = options.known[view];
      if (id) expected[view] = id;
    }
    job = { items, options: { ...options, known: { ...options.known } }, expected, finalizeSent: false, finalizeKey: null };
    set(
      {
        stage: 'prepare',
        rows: items.map((i) => ({ view: i.view, name: i.fileName, size: i.file.size, status: 'waiting', hashed: 0, sent: 0 })),
        stop: null,
        running: false,
        attempt,
      },
      true,
    );
    return go();
  };

  return {
    start,
    /** 멈춘 뒤 이어서 — 받은 파일 · 이어 올리기 기록 · 완료 키를 그대로 쓴다 */
    retry: go,
    /** 지금 시도를 멈춘다 — 받은 파일 · 이어 올리기 기록은 그대로 둔다. 완료를 이미 보냈으면 결과를 다시 확인한다(finishRun) */
    cancel: () => abort?.abort(),
    /** 화면이 떨어졌다 — 지금 시도를 낡게 만들고 멈춘다. 늦게 끝나도 화면을 안 바꾼다 */
    dispose: () => {
      disposed = true;
      attempt += 1;
      abort?.abort();
    },
    get state() {
      return current;
    },
  };
}

/**
 * 보내기 하나를 화면에 잇는다. 차례는 createSendController 가 쥐고, 여기서는 그리기 묶음 · 붙고 떨어짐만 맡는다.
 * 저장소는 보내기 하나에 한 번만 고른다 — localStorage 를 못 쓰는 브라우저도 다시 시도 사이에 기록이 남는다.
 */
export function useSend(input: SendControllerInput) {
  const [run, setRun] = useState<SendState | null>(null);
  const latest = useRef(input);
  const controller = useRef<SendController | null>(null);

  useEffect(() => {
    latest.current = input;
  });

  useEffect(() => {
    let mounted = true;
    let timer = 0;
    const c = createSendController(() => latest.current, {
      store: browserRecoveryStore(),
      hash: (file, onProgress, signal) => hashOnce(file, onProgress, signal),
      start: startIntakeUpload,
      makeKey: randomKey,
      publish: (s, now) => {
        if (!mounted) return;
        if (now) {
          window.clearTimeout(timer);
          timer = 0;
          setRun(s);
          return;
        }
        if (timer) return;
        timer = window.setTimeout(() => {
          timer = 0;
          if (mounted) setRun(c.state);
        }, 120);
      },
    });
    controller.current = c;
    return () => {
      mounted = false;
      window.clearTimeout(timer);
      c.dispose();
      if (controller.current === c) controller.current = null;
    };
  }, []);

  const start = useCallback((items: readonly RunItem[], options: SendOptions) => void controller.current?.start(items, options), []);
  const retry = useCallback(() => void controller.current?.retry(), []);
  const cancel = useCallback(() => controller.current?.cancel(), []);

  return { run, start, retry, cancel };
}
