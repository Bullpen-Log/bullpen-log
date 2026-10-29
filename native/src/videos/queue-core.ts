import type { NewVideo } from '@/lib/my-videos';

/**
 * '영상 추가'의 기기 쪽 규칙 — React Native 없이 돌아 셀프테스트가 바로 부른다(scripts/my-videos-flow-selftest.mts, 2026-10-29).
 * 저장소(kv)와 서버 보내기(send)는 밖에서 꽂는다 — 앱은 AsyncStorage · rpc(./outbox.ts), 시험은 흉내.
 *
 * 1) 저장 전(초안) — 계정마다 하나. 파일 경로 · 번호(clientId) · 날짜/출처 · 종목 · 쓰던 메모를 고칠 때마다 남긴다. 앱이 죽어도 '이어서 작성'으로 돌아온다.
 *    예전처럼 앱을 켤 때 메모 없이 저절로 등록하지 않는다(쓰던 메모가 사라지고, 이어 쓴 저장과 겹쳤다).
 * 2) 대기열 — [저장]은 줄을 폰에 **먼저 적고**(실패하면 저장 실패 — 메모리만 바꾸지 않는다) 그다음 초안을 지우고 보낸다.
 *    신호 없음은 횟수를 안 세고 기다린다(동기화 대기). 서버 오류는 세고, 한도에 닿거나 서버가 거절(retry: false)하면 줄을 빼지 않고
 *    '저장 실패'로 남긴다 — 파일 · 메모를 조용히 잃지 않는다(다시 보내기 · 지우기는 사람이 고른다).
 * 3) 주인 — 줄마다 계정. 보내기 직전 · 답을 받은 뒤 계정이 바뀌었으면 그 답으로 거절을 정하지 않는다(다른 계정 쿠키로 갔을 수 있다).
 */
export type KV = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

export type VideoDraft = {
  owner: string;
  /** feelNote = 쓰는 중인 메모 원문(저장할 때 다듬는다) */
  input: NewVideo;
  /** 고른 파일 이름(보이기만) */
  fileName: string | null;
  updatedAt: number;
};

/** 한 키에 계정별 초안 하나씩 — { [owner]: VideoDraft } */
export function createDraftStore(kv: KV, key: string, legacyKey?: string) {
  /* 읽고 고쳐 쓰기를 한 줄로 — 두 저장이 겹쳐 앞의 것이 뒤의 것을 덮지 않게 */
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const run = chain.then(work, work);
    chain = run.catch(() => undefined);
    return run;
  };
  const readAll = async (): Promise<Record<string, VideoDraft>> => {
    const raw = await kv.get(key);
    let all: Record<string, VideoDraft> = {};
    try {
      const v: unknown = raw ? JSON.parse(raw) : {};
      if (v && typeof v === 'object' && !Array.isArray(v))
        all = v as Record<string, VideoDraft>;
    } catch {
      all = {};
    }
    /* 옛 초안(v1 — { owner, input } 하나) — 저절로 등록하지 않고 초안으로 옮긴다(메모 없이 등록되던 길을 닫음) */
    if (legacyKey) {
      const old = await kv.get(legacyKey).catch(() => null);
      if (old) {
        try {
          const d = JSON.parse(old) as { owner?: unknown; input?: NewVideo };
          if (
            typeof d?.owner === 'string' &&
            typeof d.input?.clientId === 'string' &&
            !all[d.owner]
          )
            all[d.owner] = {
              owner: d.owner,
              input: d.input,
              fileName: null,
              updatedAt: 0,
            };
        } catch {
          /* 깨진 옛 칸은 버린다 */
        }
        await kv.set(key, JSON.stringify(all));
        await kv.remove(legacyKey).catch(() => undefined);
      }
    }
    return all;
  };
  const valid = (d: VideoDraft | undefined, owner: string): d is VideoDraft =>
    !!d &&
    d.owner === owner &&
    typeof d.input?.clientId === 'string' &&
    typeof d.input?.path === 'string';

  return {
    load: (owner: string): Promise<VideoDraft | null> =>
      serial(async () => {
        const d = (await readAll())[owner];
        return valid(d, owner) ? d : null;
      }),
    /** 남긴다 — 실패하면 던진다(부르는 쪽이 '기기에 못 남겼어요'를 알린다) */
    save: (d: VideoDraft): Promise<void> =>
      serial(async () => {
        const all = await readAll();
        all[d.owner] = d;
        await kv.set(key, JSON.stringify(all));
      }),
    /** 그 번호의 초안일 때만 지운다 — 다른 영상 · 다른 계정 초안은 그대로. 지웠으면 true */
    clear: (owner: string, clientId: string): Promise<boolean> =>
      serial(async () => {
        const all = await readAll();
        if (all[owner]?.input?.clientId !== clientId) return false;
        delete all[owner];
        await kv.set(key, JSON.stringify(all));
        return true;
      }),
  };
}

export type QueueRow = {
  owner: string;
  input: NewVideo;
  /** 서버 오류 횟수(신호 없음은 안 셈) */
  fails: number;
  state: 'queued' | 'failed';
  /** '저장 실패'의 까닭 */
  error: string | null;
  /** 보내 본 횟수(메모리 — 이번에 한 번이라도 보냈나를 가른다) */
  tries: number;
};
export type SendResult = { ok: true } | { ok: false; error: string; retry?: false };
/** 던진 오류의 갈래 — offline = 서버에 못 닿음(답을 잃었을 수도), server = 서버가 처리 못 함 */
export type SendFault = 'offline' | 'server';
export type SendNow = 'sent' | 'queued' | 'failed' | 'gone';

export const FAIL_LIMIT = 8;
const LIMIT_TEXT = '서버가 여러 번 받지 못했어요.';

export function createVideoQueue(opts: {
  kv: KV;
  key: string;
  owner: () => string | null;
  send: (input: NewVideo) => Promise<SendResult>;
  fault: (e: unknown) => SendFault;
  onSent?: () => void;
  failLimit?: number;
}) {
  const limit = opts.failLimit ?? FAIL_LIMIT;
  let rows: readonly QueueRow[] = [];
  const listeners = new Set<() => void>();
  const sent = new Set<string>();
  /** 마지막 보내기가 멈춘 까닭 — 화면이 '로그인이 풀림' · '신호 없음'을 가른다 */
  let stopped: 'offline' | 'login' | null = null;
  const emit = () => listeners.forEach((l) => l());

  /* 폰에 적힌 줄 — 처음 한 번. 메모리보다 먼저 담긴 것과 겹치면(같은 번호) 메모리 것이 이긴다 */
  const ready: Promise<void> = opts.kv
    .get(opts.key)
    .then((raw) => {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return;
      const stored = (parsed as Partial<QueueRow>[])
        .filter(
          (r) =>
            r && typeof r.owner === 'string' && typeof r.input?.clientId === 'string'
        )
        .map((r): QueueRow => ({
          owner: r.owner!,
          input: r.input!,
          fails: typeof r.fails === 'number' ? r.fails : 0,
          /* 옛 줄(v1)은 state 가 없다 — 대기로 */
          state: r.state === 'failed' ? 'failed' : 'queued',
          error: typeof r.error === 'string' ? r.error : null,
          tries: 0,
        }));
      const extra = stored.filter(
        (s) => !rows.some((r) => r.input.clientId === s.input.clientId)
      );
      if (extra.length) {
        rows = [...extra, ...rows];
        emit();
      }
    })
    .catch(() => undefined);

  const persist = (next: readonly QueueRow[]) => {
    const plain = next.map(({ tries: _t, ...r }) => r);
    return next.length
      ? opts.kv.set(opts.key, JSON.stringify(plain))
      : opts.kv.remove(opts.key);
  };
  /* 보내기 쪽 바꿈(빼기 · 실패 표시) — 메모리를 먼저 바꾸고 폰엔 뒤에. 폰에 못 적어도 다음에 켜면 다시 보내 서버가 같은 번호를 하나로 둔다 */
  const commit = (next: readonly QueueRow[]) => {
    rows = next;
    emit();
    void persist(next).catch(() => undefined);
  };
  const rowOf = (clientId: string) =>
    rows.find((r) => r.input.clientId === clientId) ?? null;

  let draining: Promise<void> | null = null;
  async function drainOnce(): Promise<void> {
    await ready;
    for (;;) {
      const owner = opts.owner();
      if (!owner) return;
      /* 실패가 적은 것부터 — 서버가 계속 못 받는 한 줄이 뒤를 다 막지 않게 */
      const row = [...rows]
        .filter((r) => r.owner === owner && r.state === 'queued')
        .sort((a, b) => a.fails - b.fails)[0];
      if (!row) {
        stopped = null;
        return;
      }
      const id = row.input.clientId;
      rows = rows.map((r) =>
        r.input.clientId === id ? { ...r, tries: r.tries + 1 } : r
      );
      let res: SendResult;
      try {
        res = await opts.send(row.input);
      } catch (e) {
        if (opts.owner() !== owner) return;
        if (opts.fault(e) === 'offline') {
          stopped = 'offline';
          emit();
          return;
        }
        const fails = (rowOf(id)?.fails ?? 0) + 1;
        commit(
          rows.map((r) =>
            r.input.clientId === id
              ? {
                  ...r,
                  fails,
                  ...(fails >= limit
                    ? { state: 'failed' as const, error: LIMIT_TEXT }
                    : {}),
                }
              : r
          )
        );
        stopped = null;
        return;
      }
      if (res.ok) {
        sent.add(id);
        commit(rows.filter((r) => r.input.clientId !== id));
        opts.onSent?.();
        continue;
      }
      /* 거절인데 계정이 바뀌었으면 — 다른 계정 쿠키로 간 것일 수 있다. 실패로 정하지 않고 둔다 */
      if (opts.owner() !== owner) return;
      if (res.retry === false) {
        commit(
          rows.map((r) =>
            r.input.clientId === id ? { ...r, state: 'failed', error: res.error } : r
          )
        );
        continue;
      }
      stopped = 'login';
      emit();
      return;
    }
  }

  const queue = {
    ready,
    rows: () => rows,
    stopped: () => stopped,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    /**
     * [저장] — 폰에 먼저 적고 그다음 메모리에 담는다. 폰에 못 적으면 던진다(메모리도 그대로 — 저장된 것처럼 안 보인다).
     * 같은 번호는 덮는다(다시 저장 = 같은 줄을 고침).
     */
    async enqueue(owner: string, input: NewVideo): Promise<void> {
      await ready;
      const next = [
        ...rows.filter((r) => r.input.clientId !== input.clientId),
        { owner, input, fails: 0, state: 'queued' as const, error: null, tries: 0 },
      ];
      await persist(next);
      rows = next;
      emit();
    },
    /** 담긴 것을 하나씩 보낸다 — 이미 보내는 중이면 그 보내기를 기다린다 */
    drain(): Promise<void> {
      draining ??= drainOnce().finally(() => {
        draining = null;
      });
      return draining;
    },
    /**
     * 이 영상을 지금 보내 보고 결과 — sent(서버 확인) · queued(신호 · 로그인 · 시간 넘김 — 줄은 폰에 있다) · failed(거절 · 한도) · gone(줄이 없음).
     * 이미 가는 보내기가 이 줄에 못 닿고 끝났으면 한 번 더 부른다. waitMs 를 넘기면 queued — 보내기는 뒤에서 이어진다.
     */
    async sendNow(clientId: string, waitMs = 15000): Promise<SendNow> {
      const tried = rowOf(clientId)?.tries ?? 0;
      const run = (async () => {
        await queue.drain();
        const r = rowOf(clientId);
        if (r && r.state === 'queued' && r.tries === tried && !stopped)
          await queue.drain();
      })();
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        run,
        new Promise<void>((res) => (timer = setTimeout(res, waitMs))),
      ]);
      clearTimeout(timer);
      return queue.statusOf(clientId);
    },
    statusOf(clientId: string): SendNow {
      if (sent.has(clientId)) return 'sent';
      const r = rowOf(clientId);
      return !r ? 'gone' : r.state === 'failed' ? 'failed' : 'queued';
    },
    /** 저장 실패 → 다시 대기로(횟수 · 까닭 지움) */
    async retry(clientId: string): Promise<void> {
      if (!rowOf(clientId)) return;
      commit(
        rows.map((r) =>
          r.input.clientId === clientId
            ? { ...r, state: 'queued', fails: 0, error: null }
            : r
        )
      );
      await queue.drain();
    },
    /** 줄을 뺀다(저장 실패를 지우기로 고름) — 폰에 적고 나서 메모리 */
    async remove(clientId: string): Promise<void> {
      const next = rows.filter((r) => r.input.clientId !== clientId);
      await persist(next);
      rows = next;
      emit();
    },
  };
  return queue;
}

/**
 * 덕아웃 공유 초안 — 계정 + 영상 경로마다 하나({ [owner]: { [path]: 초안 } }). 모양 다듬기는 부르는 쪽(lib/video-share.ts restoreShareDraft).
 * 지우기는 그 계정 · 그 경로만 — 다른 영상 · 다른 계정 초안은 그대로.
 */
export function createShareStore<T extends { owner: string; path: string }>(
  kv: KV,
  key: string,
  max = 30
) {
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <R>(work: () => Promise<R>): Promise<R> => {
    const run = chain.then(work, work);
    chain = run.catch(() => undefined);
    return run;
  };
  const readAll = async (): Promise<Record<string, Record<string, unknown>>> => {
    try {
      const v: unknown = JSON.parse((await kv.get(key)) ?? '{}');
      return v && typeof v === 'object' && !Array.isArray(v)
        ? (v as Record<string, Record<string, unknown>>)
        : {};
    } catch {
      return {};
    }
  };
  return {
    load: (owner: string, path: string): Promise<unknown> =>
      serial(async () => (await readAll())[owner]?.[path] ?? null),
    /** 그 계정의 초안이 있는 경로들 */
    paths: (owner: string): Promise<string[]> =>
      serial(async () => Object.keys((await readAll())[owner] ?? {})),
    /** 남긴다 — 실패하면 던진다. 한 계정에 max 개까지(오래된 것부터 뺀다) */
    save: (d: T & { updatedAt: number }): Promise<void> =>
      serial(async () => {
        const all = await readAll();
        const mine = { ...(all[d.owner] ?? {}), [d.path]: d } as Record<
          string,
          { updatedAt?: number }
        >;
        const keys = Object.keys(mine).sort(
          (a, b) => (mine[a]?.updatedAt ?? 0) - (mine[b]?.updatedAt ?? 0)
        );
        for (const k of keys.slice(0, Math.max(0, keys.length - max))) delete mine[k];
        all[d.owner] = mine;
        await kv.set(key, JSON.stringify(all));
      }),
    clear: (owner: string, path: string): Promise<void> =>
      serial(async () => {
        const all = await readAll();
        if (!all[owner]?.[path]) return;
        const mine = { ...all[owner] };
        delete mine[path];
        all[owner] = mine;
        await kv.set(key, JSON.stringify(all));
      }),
  };
}
