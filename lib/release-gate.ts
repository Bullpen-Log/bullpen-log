import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Permission } from '@/lib/permissions';
import {
  FEATURE_LOCKED_BETA,
  decideAccess,
  decidePath,
  isBetaRestricted,
  releaseAccessOf,
  type AccessDecision,
  type AccessSubject,
  type Capability,
  type ReleaseAccess,
  type ReleaseStage,
} from '@/lib/release-access';

/**
 * 출시 단계 관문 — 서버에서 실제로 막는 곳(2026-10-29 출시 전 베타). 판정 표는 lib/release-access.ts, 목록은 docs/designs/pitch-3d-beta-access-impl.md.
 *
 * 어디서 막나: 로그인한 사람을 읽는 한곳(lib/dal.ts getCurrentUser)이다. 서버 동작 · 화면 · API 가 모두 거기서 사람을 읽으므로, 베타 제한을 받는
 * 사람(일반 · 준관리자)이면 읽는 순간 판정한다. 서버 동작은 웹에서 직접 POST 로 부를 수 있어(Next 문서 data-security) 화면 · RPC 입구만 막으면 안 된다.
 *
 * 무엇으로 판정하나(요청의 종류 — proxy.ts 가 모든 요청에 덧쓰는 x-bp-entry · x-bp-path, 손님이 보낸 값은 덮인다):
 *   - 화면 보기(page, GET): 주소의 기능(capabilityOfPath). 잠긴 주소면 베타 홈(/today)으로 보낸다.
 *   - 서버 동작(action, 화면 주소로 오는 POST): 주소도 열려 있어야 하고, 동작이 스스로 기능을 밝혀야(allowFeature · allowAdmin) 한다.
 *   - 앱 RPC · API: 동작 · 처리기가 스스로 기능을 밝혀야 한다. 밝히지 않은 것은 막는다(기본 거부).
 * 기능을 밝히는 줄은 사람을 읽기 전에 둔다 — 함수 맨 위 한 줄(allowFeature('pitch3d')).
 *
 * 정식 출시(RELEASE_STAGE 비움)면 아무것도 하지 않는다 — 헤더도 안 읽는다. 대표관리자도 그대로 지나간다.
 * 기존 역할 · 소유권 · 동의 · 비용 검사는 각 동작에 그대로 있다. 이 관문은 그 앞에 하나 더 있을 뿐이다.
 */

/**
 * 출시 단계 — 서버 환경변수만 본다(클라이언트 변수 · 앱이 보낸 값으로 정하지 않는다). 2026-10-29 금윤호: 환경변수로 켜고 끈다.
 * 값은 너그럽게 읽는다 — 대시보드에 붙여 넣다 생긴 앞뒤 빈칸 · 따옴표 · 대문자 · 가운데 줄표(restricted-beta)도 베타로(2026-10-30).
 */
export function releaseStage(): ReleaseStage {
  return stageOf(process.env.RELEASE_STAGE);
}

/** 환경변수 값 → 출시 단계(시험용으로 따로) */
export function stageOf(raw: string | undefined): ReleaseStage {
  const v = (raw ?? '').trim().replace(/^['"]+|['"]+$/g, '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  return v === 'restricted_beta' ? 'restricted_beta' : 'released';
}

/** 앱 시작 정보에 싣는 판정 요약(그리기용) */
export function releaseAccessFor(subject: AccessSubject): ReleaseAccess {
  return releaseAccessOf(subject, releaseStage());
}

export const isRestrictedNow = (subject: AccessSubject) => isBetaRestricted(subject, releaseStage());

/** 서버가 막았다 — 기계용 코드는 FEATURE_LOCKED_BETA(권한 없는 관리 업무는 PERMISSION_DENIED) */
export class FeatureLockedError extends Error {
  readonly code: string;
  readonly decision: AccessDecision;
  constructor(decision: AccessDecision) {
    super(decision.reason === 'permission_denied' ? 'PERMISSION_DENIED' : FEATURE_LOCKED_BETA);
    this.code = this.message;
    this.decision = decision;
  }
}

type Grant = { cap: Capability; perm?: Permission };
type GateStore = { entry?: 'rpc' | 'api'; op?: string; grants: Grant[]; denied?: AccessDecision };
const gate = new AsyncLocalStorage<GateStore>();

/** 앱 RPC 입구가 한 번 부를 때 감싼다 — 그 안의 동작이 밝힌 기능 · 막힘을 입구가 본다 */
export function runInGate<T>(entry: 'rpc' | 'api', op: string, fn: () => Promise<T>): Promise<T> {
  return gate.run({ entry, op, grants: [] }, fn);
}

/** 지금 요청에서 관문이 막았나(동작이 자기 try/catch 로 오류를 삼켜도 입구가 403 으로 바꾼다) */
export function gateDenied(): AccessDecision | null {
  return gate.getStore()?.denied ?? null;
}

function store(): GateStore {
  const s = gate.getStore();
  if (s) return s;
  const fresh: GateStore = { grants: [] };
  /* 웹 서버 동작 — Next 가 부르는 함수 안이라 감쌀 곳이 없다. 이 동작의 남은 실행에만 붙는다 */
  gate.enterWith(fresh);
  return fresh;
}

/**
 * 이 동작 · 처리기가 이 기능의 일이다 — 사람을 읽기 전에 부른다. 판정은 사람을 읽을 때(getCurrentUser) 한다.
 * 베타가 아니면(정식 출시) 아무것도 적지 않는다.
 */
export function allowFeature(cap: Capability): void {
  if (releaseStage() !== 'restricted_beta') return;
  store().grants.push({ cap });
}

/** 이 동작은 관리 업무다 — 기존 권한 표(lib/permissions.ts)의 이 권한이 있으면 베타에도 쓴다. 권한 검사는 동작이 그대로 한다 */
export function allowAdmin(perm: Permission): void {
  if (releaseStage() !== 'restricted_beta') return;
  store().grants.push({ cap: 'admin', perm });
}

function deny(decision: AccessDecision): never {
  const s = gate.getStore();
  if (s) s.denied = decision;
  throw new FeatureLockedError(decision);
}

/** 화면이 막힌 주소에 왔을 때 보내는 곳 — 베타 홈 */
export const BETA_HOME = '/today';

/**
 * 사람을 읽은 직후(lib/dal.ts getCurrentUser) 부른다. 지나가면 그대로, 아니면 화면은 베타 홈으로 보내고 동작 · RPC · API 는 FeatureLockedError.
 * 베타 제한을 안 받는 사람(대표관리자 · 정식 출시)은 바로 지나간다.
 */
export async function enforceRelease(user: { role: string | null | undefined }): Promise<void> {
  const stage = releaseStage();
  if (!isBetaRestricted(user, stage)) return;
  const s = gate.getStore();
  let entry: string = s?.entry ?? 'unknown';
  let path = '';
  if (!s?.entry) {
    const h = await headers();
    entry = h.get('x-bp-entry') ?? 'unknown';
    path = h.get('x-bp-path') ?? '';
  }
  if (entry === 'page') {
    if (decidePath(user, path, { stage }).allowed) return;
    redirect(BETA_HOME);
  }
  /* 서버 동작은 그 동작을 부른 화면 주소도 열려 있어야 한다 — 동작 뒤에 다시 그리는 화면이 잠긴 주소의 것이면 안 된다 */
  if (entry === 'action') {
    const d = decidePath(user, path, { stage });
    if (!d.allowed) deny(d);
  }
  const grants = gate.getStore()?.grants ?? [];
  let last: AccessDecision | null = null;
  for (const g of grants) {
    const d = decideAccess(user, g.cap, { stage, perm: g.perm });
    if (d.allowed) return;
    last = d;
  }
  deny(last ?? { allowed: false, reason: 'locked_beta', capability: 'unclassified' });
}

/** RPC · API 처리기가 막힘을 답으로 바꿀 때 */
export const isFeatureLocked = (e: unknown): e is FeatureLockedError => e instanceof FeatureLockedError;
