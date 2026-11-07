/**
 * 영상 보내기의 차례 — 화면과 떨어진 순수 흐름이라 시험이 실제 라우트에 대고 그대로 돌린다.
 *
 * 차례: 고른 파일을 다 재고(준비) → 칸을 다 잡고(같은 파일 · 크기 한도를 바이트 전에 막는다) → 한 파일씩 보내고 → 도착을 확인한다.
 * 같은 칸에 같은 파일이면 서버가 있던 자산을 돌려주고, 업로드 주소가 살아 있으면 이어 간다. 다시 눌러도 처음부터 안 보낸다.
 * 완료는 따로다(finishRun). 응답을 잃어도 같은 키로 다시 부르면 같은 영수증이 온다.
 * 영수증을 받은 뒤의 일은 전송이 아니다 — 상태를 다시 못 읽어도 '못 보냈다'고 말하면 안 된다(stateAfterReceipt · refreshQuietly).
 */
import { IntakeRequestError, type IntakeClient, type IntakeReceipt, type PublicAsset, type PublicIntakeState, type UploadGrant } from '@/lib/intake/public-client';
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
  network: '연결이 끊겼어요. 신호가 돌아오면 이어서 보낼 수 있어요.',
  file_unreadable: '파일을 더 읽을 수 없어요. 같은 파일을 다시 골라 주세요.',
  token_refused: '전송 권한을 다시 확인해야 해요. 다시 시도해 주세요.',
  conflict: '다른 곳에서 이 영상을 보내고 있을 수 있어요. 잠시 뒤에 다시 시도해 주세요.',
  unknown: '영상을 보내지 못했어요. 다시 시도해 주세요.',
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function asStop(e: unknown, view: IntakeView | null): RunStop {
  if (e instanceof RunStop) return e;
  if (e instanceof IntakeRequestError) return new RunStop(e.code, e.message, view, e.detail);
  if (e instanceof IntakeUploadError) return new RunStop(e.code, UPLOAD_TEXT[e.code] ?? UPLOAD_TEXT.unknown, view);
  return new RunStop('unknown', UPLOAD_TEXT.unknown, view);
}

/** 신호가 잠깐 끊겨도 넘어가게 — 응답을 못 받은 때만 다시 묻는다. 서버가 거절한 것은 그대로 올린다 */
async function retryNetwork<T>(run: () => Promise<T>, sleep: (ms: number) => Promise<void>, waits = [500, 1500, 3000]): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await run();
    } catch (e) {
      if (!(e instanceof IntakeRequestError) || e.code !== 'network' || i >= waits.length) throw e;
      await sleep(waits[i]);
    }
  }
}

/** 전송이 끝난 뒤 저장소가 바로 안 보일 수 있어 잠깐 기다린다 */
async function confirmArrival(deps: RunDeps, assetId: string, sleep: (ms: number) => Promise<void>): Promise<PublicAsset> {
  const waits = [700, 1500, 3000];
  for (let i = 0; ; i++) {
    try {
      return await retryNetwork(() => deps.api.confirmUpload(assetId), sleep);
    } catch (e) {
      if (!(e instanceof IntakeRequestError) || e.code !== 'upload_missing' || i >= waits.length) throw e;
      await sleep(waits[i]);
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

  emit({ type: 'stage', stage: 'prepare' });
  const hashes = new Map<IntakeView, string>();
  for (const item of items) {
    try {
      hashes.set(item.view, await deps.hash(item.file, (done, total) => emit({ type: 'hash', view: item.view, done, total }), signal));
    } catch (e) {
      throw asStop(e, item.view);
    }
  }

  const reserved: { item: RunItem; asset: PublicAsset }[] = [];
  for (const item of items) {
    try {
      const r = await retryNetwork(
        () =>
          deps.api.reserveAsset({
            view: item.view,
            expectedAssetId: known[item.view],
            fileName: item.fileName,
            sizeBytes: item.file.size,
            declaredType: item.type,
            sha256: hashes.get(item.view)!,
            pairConfirmed: deps.pairConfirmed === true,
          }),
        sleep,
      );
      emit({ type: 'reserved', view: item.view, asset: r.asset, version: r.version });
      reserved.push({ item, asset: r.asset });
    } catch (e) {
      throw asStop(e, item.view);
    }
  }

  emit({ type: 'stage', stage: 'send' });
  for (const { item, asset } of reserved) {
    const { view } = item;
    if (assetArrived(asset.status)) {
      emit({ type: 'send', view, sent: item.file.size, total: item.file.size });
      emit({ type: 'file', view, status: 'arrived' });
      continue;
    }
    try {
      emit({ type: 'file', view, status: 'sending' });
      await sendOne(deps, item, asset, hashes.get(view)!, emit, signal, sleep);
      emit({ type: 'send', view, sent: item.file.size, total: item.file.size });
      emit({ type: 'file', view, status: 'confirming' });
      const arrived = await confirmArrival(deps, asset.id, sleep);
      if (arrived.status === 'rejected') throw new RunStop('asset_rejected', '이 영상은 보낼 수 없어요. 다른 영상을 골라 주세요.', view);
      emit({ type: 'file', view, status: 'arrived' });
    } catch (e) {
      throw asStop(e, view);
    }
  }
  emit({ type: 'stage', stage: 'confirm' });
}

async function sendOne(
  deps: RunDeps,
  item: RunItem,
  asset: PublicAsset,
  sha256: string,
  emit: (e: RunEvent) => void,
  signal: AbortSignal,
  sleep: (ms: number) => Promise<void>,
): Promise<void> {
  let grant: UploadGrant;
  try {
    grant = await retryNetwork(() => deps.api.issueToken(asset.id), sleep);
  } catch (e) {
    /* 응답을 잃은 사이 전송이 끝난 경우 — 도착 확인으로 넘어간다 */
    if (e instanceof IntakeRequestError && e.code === 'asset_finished') return;
    throw e;
  }

  const handle = deps.start({
    file: item.file,
    fileName: item.fileName,
    sha256,
    grant,
    refreshGrant: async () => {
      const g = await deps.api.issueToken(asset.id);
      return { token: g.token, tokenTtlMs: g.tokenTtlMs };
    },
    store: deps.store,
    storeKey: recoveryKey(deps.submissionId, asset.id),
    /* 못 남겨도 전송은 계속된다 — 다음에 이어 가지 못할 뿐이다 */
    onUploadUrl: (url) => void deps.api.registerUploadUrl(asset.id, url).catch(() => {}),
    onProgress: (sent, total) => emit({ type: 'send', view: item.view, sent, total }),
  });
  const stop = () => void handle.abort();
  signal.addEventListener('abort', stop, { once: true });
  try {
    await handle.done;
  } catch (e) {
    /* '이미 끝났을 수 있다' — 저장소를 직접 물어본다. 정말 없으면 confirm 이 upload_missing 으로 알린다 */
    if (e instanceof IntakeUploadError && e.code === 'conflict') {
      await deps.api.confirmUpload(asset.id).catch((err: unknown) => {
        if (err instanceof IntakeRequestError && err.code === 'upload_missing') throw e;
        throw err;
      });
      return;
    }
    throw e;
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
 * 접수를 끝낸다. 얼리는 것은 화면이 보여 준 것이어야 한다 — 다른 기기가 칸이나 글을 바꿨으면 멈춘다. 그 판을 몰래 얼리면 안 된다.
 * - expected: 화면이 알던 칸의 자산. 서버에도 그대로 보내 잠근 채 다시 맞춘다(expectedAssets).
 * - expectedVersion: 화면이 알던 판. 주면 그 판으로만 낸다 — 낡았으면 새 판으로 다시 내지 않고 'stale_version' 으로 멈춘다.
 *   안 주면 지금 판을 읽어 내고, 낡으면 몇 번 다시 읽는다(자산 번호만 맞춘다).
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
  },
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<IntakeReceipt> {
  try {
    for (let attempt = 0; ; attempt++) {
      const { state } = await retryNetwork(() => api.state(), sleep);
      for (const view of ['side', 'rear'] as const) {
        const want = input.expected[view];
        if (want && state.assets[view]?.id !== want) {
          throw new RunStop('stale_selection', '다른 기기에서 영상을 바꿨어요. 최신 내용을 확인해 주세요.', view);
        }
      }
      try {
        return await retryNetwork(
          () =>
            api.finalize({
              expectedVersion: input.expectedVersion ?? state.version,
              idempotencyKey: input.idempotencyKey,
              samePitchConfirmed: input.samePitchConfirmed,
              consents: input.consents,
              expectedAssets: input.expected,
            }),
          sleep,
        );
      } catch (e) {
        if (e instanceof IntakeRequestError && e.code === 'stale_version' && input.expectedVersion == null && attempt < 2) continue;
        throw e;
      }
    }
  } catch (e) {
    throw asStop(e, null);
  }
}

/**
 * 영수증을 받은 직후의 상태 — 서버를 다시 못 읽어도 접수가 끝난 사실은 화면에 있어야 한다.
 * 분석 · 공개 칸은 다음 읽기가 채운다. 같은 키의 재시도면(created false) 분석 상태는 안 건드린다.
 */
export function stateAfterReceipt(state: PublicIntakeState, r: IntakeReceipt): PublicIntakeState {
  const analysisStatus = r.created ? 'none' : state.analysisStatus;
  return {
    ...state,
    screen: 'receipt',
    statusText: publicStatusText(r.submissionStatus, analysisStatus, false),
    version: r.version,
    submissionStatus: r.submissionStatus,
    analysisStatus,
    draft: { ...state.draft, athleteName: r.athleteName, samePitchConfirmed: true },
    receipt: { code: r.receiptCode, receivedAt: r.receivedAt, receiptDate: r.receiptDate, revision: r.revision },
    correction: null,
  };
}

/**
 * 조용히 다시 읽는다 — 던지지 않는다. 연결 문제면 몇 번 더 묻고, 그래도 안 되면 마지막 오류를 돌려준다(없으면 null).
 * 폐기 같은 서버 거절은 다시 물어도 같으니 바로 돌려준다.
 */
export async function refreshQuietly(load: () => Promise<unknown>, sleep: (ms: number) => Promise<void> = defaultSleep, waits = [1000, 3000, 8000]): Promise<IntakeRequestError | null> {
  for (let i = 0; ; i++) {
    try {
      await load();
      return null;
    } catch (e) {
      const r = e instanceof IntakeRequestError ? e : new IntakeRequestError('unknown', '다시 시도해 주세요.');
      if ((r.code !== 'network' && r.code !== 'internal') || i >= waits.length) return r;
      await sleep(waits[i]);
    }
  }
}
