'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { hashOnce } from '@/components/intake/pick';
import type { ConsentAnswer } from '@/lib/intake/consent';
import type { IntakeClient, IntakeReceipt, PublicAsset } from '@/lib/intake/public-client';
import type { IntakeView } from '@/lib/intake/state';
import { browserRecoveryStore, startIntakeUpload } from '@/lib/intake/upload-client';
import { RunStop, finalizeKey, finishRun, runUpload, type RunEvent, type RunItem } from '@/lib/intake/upload-run';

export type SendRow = {
  view: IntakeView;
  name: string;
  size: number;
  status: 'waiting' | 'hashing' | 'hashed' | 'sending' | 'confirming' | 'arrived';
  hashed: number;
  sent: number;
};

export type SendStage = 'prepare' | 'send' | 'confirm' | 'finalize';

export type SendState = { stage: SendStage; rows: SendRow[]; stop: RunStop | null; running: boolean };

export type SendOptions = {
  known: Record<IntakeView, string | null>;
  /** 지금까지 얼린 판 수 — 완료 키를 판마다 새로 만든다 */
  round: number;
  /** 화면이 그린 판 — 칸을 잡으면 그 뒤의 판으로 따라간다. 낡았으면 완료가 멈춘다 */
  version: number;
  samePitchConfirmed?: boolean;
  consents?: readonly ConsentAnswer[];
};

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

/**
 * 보내기 하나의 상태. 시작은 누름에서만 한다(화면이 붙을 때 저절로 보내지 않는다).
 * 멈춰도 항목을 쥐고 있어 '이어서 보내기'가 재기 · 칸 잡기를 되풀이해도 바이트는 이어서 간다.
 */
export function useSend(input: {
  client: IntakeClient;
  submissionId: string;
  onReserved: (view: IntakeView, asset: PublicAsset, version: number) => void;
  /** 영수증을 받은 뒤 — 전송은 끝났으니 여기서 난 일은 '못 보냈다'가 아니다. 던지지 않는다 */
  onDone: (receipt: IntakeReceipt) => void;
}) {
  const { client, submissionId, onReserved, onDone } = input;
  const [run, setRun] = useState<SendState | null>(null);
  const current = useRef<SendState | null>(null);
  const job = useRef<{ items: readonly RunItem[]; options: SendOptions; expected: Partial<Record<IntakeView, string>> } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef(0);

  useEffect(
    () => () => {
      abort.current?.abort();
      window.clearTimeout(timer.current);
    },
    [],
  );

  const publish = useCallback((now: boolean) => {
    if (now) {
      window.clearTimeout(timer.current);
      timer.current = 0;
      setRun(current.current);
      return;
    }
    if (timer.current) return;
    timer.current = window.setTimeout(() => {
      timer.current = 0;
      setRun(current.current);
    }, 120);
  }, []);

  const go = useCallback(async () => {
    const j = job.current;
    if (!j || current.current?.running) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    current.current = { ...(current.current as SendState), stop: null, running: true };
    publish(true);

    const emit = (e: RunEvent) => {
      if (e.type === 'reserved') {
        j.options.known[e.view] = e.asset.id;
        j.options.version = e.version;
        j.expected[e.view] = e.asset.id;
        onReserved(e.view, e.asset, e.version);
        return;
      }
      current.current = reduce(current.current as SendState, e);
      publish(e.type !== 'send' && e.type !== 'hash');
    };

    const store = browserRecoveryStore();
    let receipt: IntakeReceipt;
    try {
      await runUpload(
        { api: client, submissionId, pairConfirmed: j.options.samePitchConfirmed === true, hash: (file, onProgress, signal) => hashOnce(file, onProgress, signal), start: startIntakeUpload, store },
        j.items,
        j.options.known,
        emit,
        ctrl.signal,
      );
      current.current = { ...(current.current as SendState), stage: 'finalize' };
      publish(true);
      receipt = await finishRun(client, {
        idempotencyKey: finalizeKey(store, submissionId, j.options.round, randomKey),
        expected: j.expected,
        expectedVersion: j.options.version,
        samePitchConfirmed: j.options.samePitchConfirmed,
        consents: j.options.consents,
      });
    } catch (e) {
      const stop = e instanceof RunStop ? e : new RunStop('unknown', '영상을 보내지 못했어요. 다시 시도해 주세요.');
      current.current = { ...(current.current as SendState), stop, running: false };
      publish(true);
      return;
    }
    current.current = { ...(current.current as SendState), running: false };
    publish(true);
    onDone(receipt);
  }, [client, onDone, onReserved, publish, submissionId]);

  const start = useCallback(
    (items: readonly RunItem[], options: SendOptions) => {
      if (current.current?.running) return;
      /* 이번에 안 보내는 칸도 화면이 보여 준 그 자산이어야 한다 — 보내는 칸은 칸을 잡을 때 새 번호로 바뀐다 */
      const expected: Partial<Record<IntakeView, string>> = {};
      for (const view of ['side', 'rear'] as const) {
        const id = options.known[view];
        if (id) expected[view] = id;
      }
      job.current = { items, options: { ...options, known: { ...options.known } }, expected };
      current.current = {
        stage: 'prepare',
        rows: items.map((i) => ({ view: i.view, name: i.fileName, size: i.file.size, status: 'waiting', hashed: 0, sent: 0 })),
        stop: null,
        running: false,
      };
      publish(true);
      void go();
    },
    [go, publish],
  );

  return { run, start, retry: go };
}
