/**
 * 영상 보내기의 차례 — 화면과 떨어진 순수 흐름이라 시험이 실제 라우트에 대고 그대로 돌린다.
 *
 * 차례: 고른 파일을 다 재고(준비) → 칸을 다 잡고(같은 파일 · 크기 한도를 바이트 전에 막는다) → 한 파일씩 보내고 → 도착을 확인한다.
 * 같은 칸에 같은 파일이면 서버가 있던 자산을 돌려주고, 업로드 주소가 살아 있으면 이어 간다. 다시 눌러도 처음부터 안 보낸다.
 * 완료는 따로다(finishRun). 응답을 잃어도 같은 키로 다시 부르면 같은 영수증이 온다.
 * 영수증을 받은 뒤의 일은 전송이 아니다 — 상태를 다시 못 읽어도 '못 보냈다'고 말하면 안 된다(stateAfterReceipt · refreshQuietly).
 *
 * 멈춤(signal): 모든 기다림의 앞뒤에서 멈췄는지 본다 — 해시 · 칸 잡기 · 토큰 · 전송 시작 · 도착 확인 · 완료 직전.
 * 멈춘 뒤에는 새 전송도 완료도 시작하지 않는다. 멈추면 RunStop('cancelled') 다. 이어 올리기 기록은 지우지 않는다(같은 파일을 다시 고르면 이어 간다).
 * 단 완료 요청을 이미 보낸 뒤라면 '멈췄다'고 단정하지 않는다 — 서버가 얼렸을 수 있다. 결과를 다시 확인한다(finishRun).
 */
import {
  CANCELLED_TEXT,
  IntakeRequestError,
  isSessionError,
  raceSignal,
  type IntakeClient,
  type IntakeReceipt,
  type PublicAsset,
  type PublicIntakeState,
  type UploadGrant,
} from '@/lib/intake/public-client';
import type { ConsentAnswer } from '@/lib/intake/consent';
import { assetArrived, publicStatusText, type IntakeView } from '@/lib/intake/state';
import { IntakeUploadError, recoveryKey, type RecoveryStore, type StartUploadOptions, type UploadHandle } from '@/lib/intake/upload-client';

export type RunItem = { view: IntakeView; file: Blob; fileName: string; type: string | null };

export type RunEvent =
  | { type: 'stage'; stage: 'prepare' | 'send' | 'confirm' }
  | { type: 'hash'; view: IntakeView; done: number; total: number }
  | { type: 'reserved'; view: IntakeView; asset: PublicAsset; version: number }
  | { type: 'send'; view: IntakeView; sent: number; total: number }
  | { type: 'file'; view: IntakeView; status: 'sending' | 'confirming' | 'arrived' };

export type RunDeps = {
  api: Pick<IntakeClient, 'reserveAsset' | 'issueToken' | 'registerUploadUrl' | 'confirmUpload'>;
  submissionId: string;
  /** 보내는 사람이 방금 이 짝을 같은 투구라고 확인했나 — 서버가 확인 표시를 남긴다 */
  pairConfirmed?: boolean;
  /** 같은 파일을 다시 재지 않게 부르는 쪽이 기억해 둔다 */
  hash: (file: Blob, onProgress: (done: number, total: number) => void, signal: AbortSignal) => Promise<string>;
  start: (o: StartUploadOptions) => UploadHandle;
  store: RecoveryStore;
  sleep?: (ms: number) => Promise<void>;
};

type Sleep = (ms: number) => Promise<void>;

/** 어느 칸에서 왜 멈췄나 — 화면이 까닭별로 다음 행동을 고른다 */
export class RunStop extends Error {
  readonly code: string;
  readonly view: IntakeView | null;
  readonly detail: Record<string, unknown> | null;
  constructor(code: string, message: string, view: IntakeView | null = null, detail: Record<string, unknown> | null = null) {
    super(message);
    this.name = 'RunStop';
    this.code = code;
    this.view = view;
    this.detail = detail;
  }
}

const UPLOAD_TEXT: Record<string, string> = {
  network: '연결이 끊겼습니다. 신호가 돌아오면 이어서 보낼 수 있습니다.',
  file_unreadable: '파일을 더 읽을 수 없습니다. 같은 파일을 다시 선택하십시오.',
  token_refused: '전송 권한을 다시 확인해야 합니다. 다시 시도하십시오.',
  conflict: '다른 곳에서 이 영상을 보내고 있을 수 있습니다. 잠시 뒤 다시 시도하십시오.',
  unknown: '영상을 보내지 못했습니다. 다시 시도하십시오.',
};

/** 완료를 보낸 뒤 결과를 모를 때 — 서버의 지금 상태를 다시 봐야 한다(화면은 '최신 내용 확인') */
export const FINALIZE_UNKNOWN_TEXT = '접수가 끝났는지 확인하지 못했습니다. 최신 내용을 확인하십시오.';

const defaultSleep: Sleep = (ms) => new Promise<void>((r) => setTimeout(r, ms));

const cancelStop = (view: IntakeView | null = null) => new RunStop('cancelled', CANCELLED_TEXT, view);

/** 멈췄으면 여기서 끝낸다 — 기다림의 앞뒤마다 부른다 */
export function throwIfAborted(signal: AbortSignal | undefined, view: IntakeView | null = null): void {
  if (signal?.aborted) throw cancelStop(view);
}

/** 멈춤으로 끝난 것인가 — 화면은 이것을 실패로 그리지 않는다 */
export const isCancelStop = (e: unknown): boolean =>
  (e instanceof RunStop && e.code === 'cancelled') ||
  (e instanceof IntakeRequestError && e.code === 'cancelled') ||
  (e instanceof IntakeUploadError && e.code === 'aborted');

/** 멈출 수 있는 쉼 — 쉬는 사이 멈추면 곧바로 'cancelled' 로 거절한다 */
export function sleepOrCancel(sleep: Sleep, ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return sleep(ms);
  if (signal.aborted) return Promise.reject(cancelStop());
  return raceSignal(sleep(ms), signal, () => cancelStop());
}

function asStop(e: unknown, view: IntakeView | null): RunStop {
  if (e instanceof RunStop) return e;
  if (isCancelStop(e)) return cancelStop(view);
  if (e instanceof IntakeRequestError) return new RunStop(e.code, e.message, view, e.detail);
  /* 전송 도중 토큰 새로 받기가 세션이 끝나 막혔다 — '권한이 끝났다'가 아니라 이름 · PIN 을 다시 물을 일이다(화면이 확인 뒤 이어서 보낸다) */
  if (e instanceof IntakeUploadError && e.code === 'token_refused' && isSessionError(e.reason)) {
    const r = e.reason as IntakeRequestError;
    return new RunStop(r.code, r.message, view, r.detail);
  }
  if (e instanceof IntakeUploadError) return new RunStop(e.code, UPLOAD_TEXT[e.code] ?? UPLOAD_TEXT.unknown, view);
  return new RunStop('unknown', UPLOAD_TEXT.unknown, view);
}

/** 응답을 못 받은 것(끊김 · 시한)만 다시 물을 까닭이 있다. 서버 거절 · 멈춤은 다시 물어도 같다 */
const lostAnswer = (e: unknown) => e instanceof IntakeRequestError && (e.code === 'network' || e.code === 'timeout');

/**
 * 시한으로 끝난 요청은 몇 번까지 다시 묻나. 끊김(곧바로 거절)은 짧아 waits 만큼 다시 묻지만, 시한은 한 번이 20~30초다.
 * 시한마다 끝까지 다시 물으면 단추 없는 기다림이 몇 분이 된다 — 한 번만 더 묻고 화면에 다시 시도 단추를 보인다.
 */
export const TIMEOUT_RETRIES = 1;

/**
 * 신호가 잠깐 끊겨도 넘어가게 — 응답을 못 받은 때만 다시 묻는다. 서버가 거절한 것은 그대로 올린다. 멈추면 쉬는 중이라도 곧바로 끝낸다.
 * 시한(timeout)은 timeoutRetries 번까지만 다시 묻는다(끊김은 waits 만큼).
 */
export async function retryNetwork<T>(
  run: () => Promise<T>,
  sleep: Sleep,
  signal?: AbortSignal,
  waits = [500, 1500, 3000],
  timeoutRetries = TIMEOUT_RETRIES,
): Promise<T> {
  let timeouts = 0;
  for (let i = 0; ; i++) {
    throwIfAborted(signal);
    try {
      /* 요청이 멈춤을 안 따르더라도 멈추면 기다리지 않는다 — 늦게 온 답은 버린다(같은 파일의 칸 잡기 · 같은 키의 완료는 다시 물으면 같은 답이다) */
      return await raceSignal(run(), signal, () => cancelStop());
    } catch (e) {
      if (!lostAnswer(e) || i >= waits.length) throw e;
      if ((e as IntakeRequestError).code === 'timeout' && ++timeouts > timeoutRetries) throw e;
      await sleepOrCancel(sleep, waits[i], signal);
    }
  }
}

/** 전송이 끝난 뒤 저장소가 바로 안 보일 수 있어 잠깐 기다린다 */
async function confirmArrival(deps: RunDeps, assetId: string, sleep: Sleep, signal: AbortSignal): Promise<PublicAsset> {
  const waits = [700, 1500, 3000];
  for (let i = 0; ; i++) {
    try {
      return await retryNetwork(() => deps.api.confirmUpload(assetId, { signal }), sleep, signal);
    } catch (e) {
      if (!(e instanceof IntakeRequestError) || e.code !== 'upload_missing' || i >= waits.length) throw e;
      await sleepOrCancel(sleep, waits[i], signal);
    }
  }
}

/** 파일을 보낸다. 모두 도착하면 풀리고, 멈추면 RunStop 을 던진다. known 은 화면이 아는 칸마다의 자산 번호다 */
export async function runUpload(
  deps: RunDeps,
  items: readonly RunItem[],
  known: Record<IntakeView, string | null>,
  emit: (e: RunEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const sleep = deps.sleep ?? defaultSleep;
  throwIfAborted(signal);

  emit({ type: 'stage', stage: 'prepare' });
  const hashes = new Map<IntakeView, string>();
  for (const item of items) {
    try {
      throwIfAborted(signal, item.view);
      /* 해시가 멈춤을 안 따르더라도(가짜 · 옛 구현) 멈추면 기다리지 않는다 */
      const sha = await raceSignal(
        deps.hash(item.file, (done, total) => emit({ type: 'hash', view: item.view, done, total }), signal),
        signal,
        () => cancelStop(item.view),
      );
      throwIfAborted(signal, item.view);
      hashes.set(item.view, sha);
    } catch (e) {
      throw asStop(e, item.view);
    }
  }

  const reserved: { item: RunItem; asset: PublicAsset }[] = [];
  for (const item of items) {
    try {
      throwIfAborted(signal, item.view);
      const r = await retryNetwork(
        () =>
          deps.api.reserveAsset(
            {
              view: item.view,
              expectedAssetId: known[item.view],
              fileName: item.fileName,
              sizeBytes: item.file.size,
              declaredType: item.type,
              sha256: hashes.get(item.view)!,
              pairConfirmed: deps.pairConfirmed === true,
            },
            { signal },
          ),
        sleep,
        signal,
      );
      /* 서버가 칸을 잡았다는 사실은 멈춰도 알린다 — 다음 시도가 낡은 칸 번호로 부딪히지 않게(화면 갱신은 부르는 쪽이 가린다) */
      emit({ type: 'reserved', view: item.view, asset: r.asset, version: r.version });
      throwIfAborted(signal, item.view);
      reserved.push({ item, asset: r.asset });
    } catch (e) {
      throw asStop(e, item.view);
    }
  }

  throwIfAborted(signal);
  emit({ type: 'stage', stage: 'send' });
  for (const { item, asset } of reserved) {
    const { view } = item;
    try {
      throwIfAborted(signal, view);
      if (assetArrived(asset.status)) {
        emit({ type: 'send', view, sent: item.file.size, total: item.file.size });
        emit({ type: 'file', view, status: 'arrived' });
        continue;
      }
      emit({ type: 'file', view, status: 'sending' });
      await sendOne(deps, item, asset, hashes.get(view)!, emit, signal, sleep);
      throwIfAborted(signal, view);
      emit({ type: 'send', view, sent: item.file.size, total: item.file.size });
      emit({ type: 'file', view, status: 'confirming' });
      const arrived = await confirmArrival(deps, asset.id, sleep, signal);
      throwIfAborted(signal, view);
      if (arrived.status === 'rejected') throw new RunStop('asset_rejected', '이 영상은 보낼 수 없습니다. 다른 영상을 선택하십시오.', view);
      emit({ type: 'file', view, status: 'arrived' });
    } catch (e) {
      throw asStop(e, view);
    }
  }
  throwIfAborted(signal);
  emit({ type: 'stage', stage: 'confirm' });
}

async function sendOne(
  deps: RunDeps,
  item: RunItem,
  asset: PublicAsset,
  sha256: string,
  emit: (e: RunEvent) => void,
  signal: AbortSignal,
  sleep: Sleep,
): Promise<void> {
  throwIfAborted(signal, item.view);
  let grant: UploadGrant;
  try {
    grant = await retryNetwork(() => deps.api.issueToken(asset.id, { signal }), sleep, signal);
  } catch (e) {
    /* 응답을 잃은 사이 전송이 끝난 경우 — 도착 확인으로 넘어간다 */
    if (e instanceof IntakeRequestError && e.code === 'asset_finished') return;
    throw e;
  }
  throwIfAborted(signal, item.view);

  /*
   * 확인 → 듣기 → 다시 확인 → 시작. 듣기를 붙이기 전에 멈춘 것도, 시작 도중에 멈춘 것도 놓치지 않는다.
   * signal 은 시작 함수에도 넘긴다 — 이미 멈췄으면 첫 요청도 안 보낸다.
   */
  let handle: UploadHandle | null = null;
  /* 멈추기가 던지거나 거절해도 처리되지 않은 거절로 남기지 않는다 */
  const stop = () => {
    const h = handle;
    if (!h) return;
    try {
      void Promise.resolve(h.abort()).catch(() => {});
    } catch {
      /* 멈추기 자체가 던졌다 — 기다리기는 아래 raceSignal 이 끊는다 */
    }
  };
  signal.addEventListener('abort', stop, { once: true });
  try {
    throwIfAborted(signal, item.view);
    handle = deps.start({
      file: item.file,
      fileName: item.fileName,
      sha256,
      grant,
      /* 전송 도중의 토큰 새로 받기도 응답을 잃으면 다시 묻는다 — 한 번 늦었다고 '권한이 끝났다'로 멈추지 않게 */
      refreshGrant: async () => {
        const g = await retryNetwork(() => deps.api.issueToken(asset.id, { signal }), sleep, signal);
        return { token: g.token, tokenTtlMs: g.tokenTtlMs };
      },
      store: deps.store,
      storeKey: recoveryKey(deps.submissionId, asset.id),
      /* 못 남겨도 전송은 계속된다 — 다음에 이어 가지 못할 뿐이다 */
      onUploadUrl: (url) => void deps.api.registerUploadUrl(asset.id, url, { signal }).catch(() => {}),
      onProgress: (sent, total) => emit({ type: 'send', view: item.view, sent, total }),
      signal,
    });
    /* 시작하는 동안(콜백 안에서) 멈췄으면 듣기는 handle 이 없어 못 멈췄다 — 여기서 멈춘다 */
    if (signal.aborted) {
      stop();
      throw cancelStop(item.view);
    }
    try {
      /* 멈춘 뒤 전송이 끝나기를 기다리지 않는다 — 멈추는 대로 돌아간다 */
      await raceSignal(handle.done, signal, () => cancelStop(item.view));
    } catch (e) {
      if (signal.aborted) throw cancelStop(item.view);
      /* '이미 끝났을 수 있다' — 저장소를 직접 물어본다. 정말 없으면 confirm 이 upload_missing 으로 알린다 */
      if (e instanceof IntakeUploadError && e.code === 'conflict') {
        await deps.api.confirmUpload(asset.id, { signal }).catch((err: unknown) => {
          if (err instanceof IntakeRequestError && err.code === 'upload_missing') throw e;
          throw err;
        });
        return;
      }
      throw e;
    }
    /* 전송이 다 끝났어도 그 사이 멈췄으면 도착 확인 · 완료로 가지 않는다 */
    throwIfAborted(signal, item.view);
  } finally {
    signal.removeEventListener('abort', stop);
  }
}

/** 완료 요청 키 — 접수 + 판마다 하나. 다시 시도 · 새로고침에도 같은 값이라 판이 둘로 안 나뉜다. 고침 뒤에는 새 판이라 새 키다 */
export function finalizeKey(store: RecoveryStore, submissionId: string, round: number, make: () => string): string {
  const key = `intake-finalize:${submissionId}:${round}`;
  const had = store.getItem(key);
  if (had) return had;
  const next = make();
  store.setItem(key, next);
  return next;
}

/**
 * 화면이 알던 판(round = 그때까지의 마지막 영수증 판, 처음이면 0)보다 새 영수증이 상태에 있으면 이번 완료는 끝난 것이다.
 * 응답을 잃은 뒤 상태로 결과를 되찾을 때 쓴다. 다른 기기가 먼저 낸 경우도 같다 — 서버도 접수된 뒤에는 새 판을 안 만든다.
 */
export function receiptFromState(state: PublicIntakeState, round: number): IntakeReceipt | null {
  const r = state.receipt;
  if (!r || r.revision == null || r.revision <= round) return null;
  return {
    created: false,
    revision: r.revision,
    receiptCode: r.code,
    receivedAt: r.receivedAt,
    receiptDate: r.receiptDate,
    athleteName: state.draft.athleteName ?? '',
    submissionStatus: state.submissionStatus,
    version: state.version,
  };
}

/**
 * 접수를 끝낸다. 얼리는 것은 화면이 보여 준 것이어야 한다 — 다른 기기가 칸이나 글을 바꿨으면 멈춘다. 그 판을 몰래 얼리면 안 된다.
 * - expected: 화면이 알던 칸의 자산. 서버에도 그대로 보내 잠근 채 다시 맞춘다(expectedAssets).
 * - expectedVersion: 화면이 알던 판. 주면 그 판으로만 낸다 — 낡았으면 새 판으로 다시 내지 않고 'stale_version' 으로 멈춘다.
 *   안 주면 지금 판을 읽어 내고, 낡으면 몇 번 다시 읽는다(자산 번호만 맞춘다).
 *
 * 응답을 잃음(끊김 · 시한): 서버는 이미 얼렸을 수 있다. 키는 절대 새로 안 만든다 — 같은 키로 다시 낸다(같은 영수증이 온다).
 * 끊김은 곧바로 같은 키로 다시 낸다. 시한은 다시 내지 않고 상태를 한 번 읽어 이번 판의 영수증이 있으면(round 를 줬을 때) 그것을 결과로 삼는다.
 * 그래도 모르면 'timeout' 으로 멈춘다 — 다시 시도는 같은 키로 완료만 낸다(alreadySent).
 * 멈춤: 완료를 보내기 전이면 'cancelled'. 보낸 뒤라면 실패로 단정하지 않는다 — 상태로 결과를 되찾고, 모르면 'finalize_unknown'(다시 보기)으로 멈춘다.
 */
export async function finishRun(
  api: Pick<IntakeClient, 'state' | 'finalize'>,
  input: {
    idempotencyKey: string;
    /** 이번에 보낸 칸의 자산 번호 — 서버 상태와 맞아야 한다 */
    expected: Partial<Record<IntakeView, string>>;
    /** 화면이 그린 판(이번 전송으로 칸을 잡았으면 그 뒤의 판) */
    expectedVersion?: number;
    samePitchConfirmed?: boolean;
    consents?: readonly ConsentAnswer[];
    /** 화면이 알던 마지막 영수증 판(없으면 0) — 응답을 잃었을 때 상태로 결과를 되찾는 데 쓴다 */
    round?: number;
    signal?: AbortSignal;
    /** 완료 요청을 처음 보내기 직전 — 부르는 쪽은 다시 시도할 때 전송을 되풀이하지 않고 완료만 다시 낸다 */
    onSent?: () => void;
    /**
     * 앞선 시도가 같은 키로 완료를 이미 보냈나. 그러면 이번 시도는 처음부터 '보낸 뒤'다 —
     * 완료를 다시 내기 전에 멈추거나 상태를 못 읽어도 'cancelled' 로 끝내지 않고 결과를 되찾는다.
     */
    alreadySent?: boolean;
  },
  sleep: Sleep = defaultSleep,
): Promise<IntakeReceipt> {
  const { signal } = input;
  let sent = input.alreadySent === true;
  /** 결과를 모를 때 상태로 되찾는다. 멈춘 뒤에도 묻는다(그 요청의 시한은 클라이언트가 지킨다) */
  const recover = async (): Promise<IntakeReceipt | null> => {
    if (input.round == null) return null;
    try {
      const { state } = await api.state();
      return receiptFromState(state, input.round);
    } catch {
      return null;
    }
  };
  try {
    for (let attempt = 0; ; attempt++) {
      throwIfAborted(signal);
      const { state } = await retryNetwork(() => api.state({ signal }), sleep, signal);
      /* 앞선 시도에서 이미 얼렸다 — 같은 키로 다시 내면 같은 영수증이 오지만, 상태에 있으면 그대로 쓴다 */
      if (sent) {
        const done = input.round == null ? null : receiptFromState(state, input.round);
        if (done) return done;
      }
      for (const view of ['side', 'rear'] as const) {
        const want = input.expected[view];
        if (want && state.assets[view]?.id !== want) {
          throw new RunStop('stale_selection', '다른 기기에서 영상을 바꿨습니다. 최신 내용을 확인하십시오.', view);
        }
      }
      throwIfAborted(signal);
      if (!sent) input.onSent?.();
      sent = true;
      try {
        return await retryNetwork(
          () =>
            api.finalize(
              {
                expectedVersion: input.expectedVersion ?? state.version,
                idempotencyKey: input.idempotencyKey,
                samePitchConfirmed: input.samePitchConfirmed,
                consents: input.consents,
                expectedAssets: input.expected,
              },
              { signal },
            ),
          sleep,
          signal,
          undefined,
          /* 완료는 시한이면 곧바로 다시 내지 않는다 — 무거운 트랜잭션이 아직 도는 중일 수 있다. 상태로 결과를 되찾고(recover), 모르면 다시 시도 단추로 같은 키를 낸다 */
          0,
        );
      } catch (e) {
        if (e instanceof IntakeRequestError && e.code === 'stale_version' && input.expectedVersion == null && attempt < 2) continue;
        throw e;
      }
    }
  } catch (e) {
    if (sent && (isCancelStop(e) || lostAnswer(e))) {
      const done = await recover();
      if (done) return done;
      if (isCancelStop(e)) throw new RunStop('finalize_unknown', FINALIZE_UNKNOWN_TEXT);
    }
    throw asStop(e, null);
  }
}

/**
 * 영수증을 받은 직후의 상태 — 서버를 다시 못 읽어도 접수가 끝난 사실은 화면에 있어야 한다.
 * 분석 · 공개 칸은 다음 읽기가 채운다. 화면이 알던 그 판의 영수증이면(같은 판 · created false) 분석 상태 · 원본 사실은 안 건드린다.
 * 새 판이면 지금 판은 방금 보낸 두 파일이다 — 옛 판의 '지웠어요 · 지우는 중'을 들고 있으면 머리가 방금 보낸 영상을 지웠다고 말한다.
 * 새 판인지는 created 만으로 모른다: 완료 응답을 잃고 같은 키로 다시 내면(finishRun 의 retryNetwork) 서버는 방금 얼린 판을 created false 로 준다.
 * 다른 기기가 먼저 낸 경우도 같다. 그래서 영수증의 판이 화면이 알던 판과 다르면 새 판으로 본다.
 * 새 지울 날은 서버만 알아서 비워 둔다. 옛 판을 지우는 중인지도 다음 읽기가 다시 채운다.
 */
export function stateAfterReceipt(state: PublicIntakeState, r: IntakeReceipt): PublicIntakeState {
  const fresh = r.created || r.revision !== state.receipt?.revision;
  const analysisStatus = fresh ? 'none' : state.analysisStatus;
  const originals = fresh ? { originalsGone: null, originalDeleting: null, originalDeletedDate: null, originalDeleteDate: null } : {};
  return {
    ...state,
    ...originals,
    screen: 'receipt',
    statusText: publicStatusText(r.submissionStatus, analysisStatus, false, { originalsGone: fresh ? null : state.originalsGone }),
    version: r.version,
    submissionStatus: r.submissionStatus,
    analysisStatus,
    draft: { ...state.draft, athleteName: r.athleteName, samePitchConfirmed: true },
    receipt: { code: r.receiptCode, receivedAt: r.receivedAt, receiptDate: r.receiptDate, revision: r.revision },
    correction: null,
  };
}

/**
 * 조용히 다시 읽는다 — 던지지 않는다. 연결 문제(끊김 · 시한)면 몇 번 더 묻고, 그래도 안 되면 마지막 오류를 돌려준다(없으면 null).
 * 폐기 같은 서버 거절은 다시 물어도 같으니 바로 돌려준다.
 */
export async function refreshQuietly(load: () => Promise<unknown>, sleep: Sleep = defaultSleep, waits = [1000, 3000, 8000]): Promise<IntakeRequestError | null> {
  for (let i = 0; ; i++) {
    try {
      await load();
      return null;
    } catch (e) {
      const r = e instanceof IntakeRequestError ? e : new IntakeRequestError('unknown', '다시 시도하십시오.');
      if ((r.code !== 'network' && r.code !== 'timeout' && r.code !== 'internal') || i >= waits.length) return r;
      await sleep(waits[i]);
    }
  }
}
