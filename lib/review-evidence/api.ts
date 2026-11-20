import { apiLibraryView } from '@/lib/review-evidence/api-view';
import { checkWriteRequest, errorResponse, jsonResponse, LIST_FAILURE_TEXT, readBodyCapped } from '@/lib/review-evidence/http';
import { MAX_IMPORT_BYTES, MAX_REGISTER_BYTES, parseImport, parseRegister, parseWithdraw, type Actor } from '@/lib/review-evidence/model';
import { loadLibrary, writeOp, type EvidenceObjectStore, type LoadFailure, type OpCache, type WriteOptions, type WriteResult } from '@/lib/review-evidence/store';

/**
 * EX-REF04 — API 처리 순서(순수: 보는 사람 · 저장소를 밖에서 넣는다 — 시험이 '저장소를 묻기 전에 막는가'를 센다).
 * 순서: 보는 사람(로그인 → 대표관리자) → [쓰기만] 요청 출처 · 형식 · 크기 → 본문 모양 → 저장소.
 * 라우트(app/api/admin/review-evidence/…)는 로그인 사용자와 진짜 저장소만 넣는다.
 */

export type ApiViewer = { id: string; role: string; nickname?: string | null } | null | undefined | 'gate-error';
export type ApiDeps = {
  store: () => EvidenceObjectStore;
  cache?: OpCache;
  storeKind: 'central' | 'local-fixture';
  now?: () => Date;
  /** 시험만: 쓰기 번호 · 시간 · 다시 묻기(빼면 store.ts 기본값) */
  write?: WriteOptions;
};

type Owner = { id: string; role: string; nickname?: string | null };

function gate(viewer: ApiViewer): { ok: true; owner: Owner } | { ok: false; res: Response } {
  if (viewer === 'gate-error') return { ok: false, res: errorResponse('forbidden') };
  if (!viewer) return { ok: false, res: errorResponse('unauthenticated') };
  if (viewer.role !== 'ADMIN') return { ok: false, res: errorResponse('forbidden') };
  return { ok: true, owner: viewer };
}

const actorOf = (o: Owner): Actor => ({ userId: o.id, label: (o.nickname ?? '').trim().slice(0, 40) || '대표관리자' });

/** 목록을 모으지 못함 — 늘 503 unavailable, 까닭(reason)과 그 까닭의 짧은 글 */
const listFailure = (reason: LoadFailure) => errorResponse('unavailable', { reason, message: LIST_FAILURE_TEXT[reason] });

function writeResponse(res: WriteResult, storeKind: ApiDeps['storeKind']): Response {
  if (res.status === 'conflict') return errorResponse('conflict');
  if (res.status === 'too_large') return errorResponse('too_large');
  if (res.status === 'pending') return errorResponse('pending', { reason: res.reason });
  return jsonResponse({ ok: true, store: storeKind, receipt: res.receipt }, res.receipt.replayed ? 200 : 201);
}

export async function handleList(req: Request, viewer: ApiViewer, deps: ApiDeps): Promise<Response> {
  const g = gate(viewer);
  if (!g.ok) return g.res;
  const res = await loadLibrary(deps.store(), deps.cache, deps.write);
  if (!res.ok) return listFailure(res.reason);
  const summaryOnly = new URL(req.url).searchParams.get('view') === 'summary';
  return jsonResponse({ ok: true, store: deps.storeKind, viewer: { label: g.owner.nickname ?? null }, ...apiLibraryView(res.library, summaryOnly, g.owner.id) });
}

export async function handleRegister(req: Request, viewer: ApiViewer, deps: ApiDeps): Promise<Response> {
  const g = gate(viewer);
  if (!g.ok) return g.res;
  const checked = checkWriteRequest(req, MAX_REGISTER_BYTES);
  if (!checked.ok) return errorResponse(checked.error);
  const body = await readBodyCapped(req, MAX_REGISTER_BYTES);
  if (!body.ok) return errorResponse(body.error);
  const now = deps.now?.() ?? new Date();
  if (body.value && typeof body.value === 'object' && 'withdraw' in body.value) return handleWithdraw(body.value, g.owner, deps, now);
  const parsed = parseRegister(body.value, now);
  if (!parsed.ok) return errorResponse('invalid', { issues: parsed.issues });
  const res = await writeOp(deps.store(), { kind: 'register', actor: actorOf(g.owner), requestKey: parsed.requestKey ?? null, payload: parsed.value }, now, deps.cache, deps.write);
  return writeResponse(res, deps.storeKind);
}

/**
 * 거두기 — 쓰임을 지우지 않고 '거둔 쓰임'으로 표시한다. 저장 전에 대상이 있는지 · 거둘 수 있는 사람인지 먼저 본다
 * (내 계정의 쓰임, 또는 과거 기록의 쓰임만). 대상이 없으면 저장하지 않는다.
 */
async function handleWithdraw(raw: unknown, owner: Owner, deps: ApiDeps, now: Date): Promise<Response> {
  const parsed = parseWithdraw(raw, now);
  if (!parsed.ok) return errorResponse('invalid', { issues: parsed.issues });
  const lib = await loadLibrary(deps.store(), deps.cache, deps.write);
  if (!lib.ok) return listFailure(lib.reason);
  const target = lib.library.sources.flatMap((s) => s.uses).find((u) => u.useId === parsed.value.useId);
  if (!target) return errorResponse('invalid', { issues: [{ field: 'withdraw.useId', message: '그 번호의 쓰임이 없어요.' }] });
  const mine = target.scope === 'historical' || target.ownerUserId === owner.id;
  if (!mine) return errorResponse('forbidden', { issues: [{ field: 'withdraw.useId', message: '다른 사람이 등록한 쓰임은 거둘 수 없어요.' }] });
  const res = await writeOp(deps.store(), { kind: 'withdraw', actor: actorOf(owner), requestKey: parsed.requestKey ?? null, payload: parsed.value }, now, deps.cache, deps.write);
  return writeResponse(res, deps.storeKind);
}

export async function handleImport(req: Request, viewer: ApiViewer, deps: ApiDeps): Promise<Response> {
  const g = gate(viewer);
  if (!g.ok) return g.res;
  const checked = checkWriteRequest(req, MAX_IMPORT_BYTES);
  if (!checked.ok) return errorResponse(checked.error);
  const body = await readBodyCapped(req, MAX_IMPORT_BYTES);
  if (!body.ok) return errorResponse(body.error);
  const now = deps.now?.() ?? new Date();
  const parsed = parseImport(body.value, now);
  if (!parsed.ok || !parsed.requestKey) return errorResponse('invalid', { issues: parsed.ok ? [] : parsed.issues });
  const res = await writeOp(deps.store(), { kind: 'import', actor: actorOf(g.owner), requestKey: parsed.requestKey, payload: parsed.value }, now, deps.cache, deps.write);
  return writeResponse(res, deps.storeKind);
}
