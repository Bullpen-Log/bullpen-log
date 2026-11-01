/**
 * 운동 → 일정 잇기 대기열(2026-11-01 2차 검토 G04 — 교정 F08 의 완성). 조직 일정의 '운동하기'로 연 개인 운동을 그 일정에 잇는 **귀속**을 폰에 내구성 있게 둔다.
 * 화면 길잡이(돌아갈 곳)와는 따로다 — 그것은 space-store 의 orgReturn(메모리).
 *
 * 규칙
 *   - 활동을 **시작할 때** 적는다(start — 계정 · 회원 · 일정 · 시작 시각), 운동 판이 열리면 그 판 번호를 붙인다(bindSession — 정확한 원본 식별). 나갈 때가 아니라
 *     시작할 때 적어 두니 앱이 꺼져도(재시작) 귀속이 남는다.
 *   - 보내기(flush)는 판 번호 · 회원 · 일정으로(서버 app-team.linkMyWork — 그 판의 세트만, since 시각 범위가 아니다). 판 번호를 모르는 옛 줄만 since.
 *   - 한 줄은 **마지막 답을 받은 뒤에만** 뺀다: 활동이 끝났고(finish — 운동 화면을 나감, 또는 오래돼 더는 세트가 안 올 때) · 그 판의 세트 대기열(workout/outbox)이
 *     비었고 · 서버가 ok. linked:0 만으로는 '다 이었다'가 아니다 — 세트가 아직 폰에 있으면 waiting 으로 남겨 세트가 간 뒤 다시 보낸다.
 *   - 서버가 거절(ok:false — 권한 없음 · 일정 없음 · 나간 회원)하면 rejected 로 남겨 화면에 보이고, 사람이 지운다. 개인 운동은 그대로다.
 *   - 꺼진 망 · 서버 오류는 횟수 · 까닭만 적고 다음에 다시. 저장은 한 번에 하나씩(차례), 실패하면 persistFailed 로 드러낸다(메모리에만 있음 — '저장했다'고 말하지 않게).
 *   - 계정마다 따로(열쇠에 userId) · 줄마다 owner — 다른 사람이 로그인해도 앞사람 줄을 그 사람으로 보내지 않는다.
 * 폰 모듈(AsyncStorage · rpc · 세트 대기열)은 주입받아 node 시험이 실제 코드를 돌린다(scripts/native-link-queue-selftest.mts).
 */
export type LinkState =
  /** 활동 중(운동 화면이 열려 있거나 앱이 꺼졌다 켜짐) — 보내되 빼지 않는다 */
  | 'active'
  /** 활동 끝 — 세트가 다 가면 보내고 뺀다 */
  | 'queued'
  /** 서버는 받았지만 그 판의 세트가 아직 폰에 있다 — 세트가 간 뒤 다시 */
  | 'waiting'
  /** 서버가 거절 — 사람이 지울 때까지 보인다 */
  | 'rejected';

export type PendingLink = {
  /** 연산 열쇠 — owner:memberId:eventId:since */
  key: string;
  owner: string;
  memberId: string;
  eventId: string;
  /** 원본 운동 판 — 열리면 붙는다. 없으면 since 로(옛 줄) */
  sessionId: string | null;
  since: number;
  state: LinkState;
  tries: number;
  /** 서버가 이었다고 답한 세트 수(누적 표시용) */
  linked: number;
  lastError?: string;
  /** 거절 까닭(서버 글) */
  rejected?: string;
};

export type LinkResponse = { ok: true; linked: number } | { ok: false; error: string };
export type LinkDeps = {
  load(key: string): Promise<unknown>;
  /** 실패하면 던진다 — 대기열이 persistFailed 로 드러낸다 */
  save(key: string, value: unknown): Promise<void>;
  send(l: PendingLink): Promise<LinkResponse>;
  /** 그 판의 아직 못 보낸 세트 수(workout/outbox) */
  pendingSets(sessionId: string): number;
  now(): number;
};

export const LINK_STORE_KEY = (userId: string) => `bullpen-links:${userId}`;
/** 판 번호 없는 활동은 이 시간이 지나면 끝난 것으로(옛 줄 · 운동 판을 못 연 것) */
export const LINK_STALE_MS = 12 * 60 * 60 * 1000;
/** 거절 · 완료가 아닌 줄을 이보다 오래 두지 않는다(서버가 옛 세트를 안 받는 7일과 같게) */
export const LINK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const isLink = (v: unknown): v is PendingLink => {
  const p = v as Record<string, unknown> | null;
  return !!p && typeof p.key === 'string' && typeof p.owner === 'string' && typeof p.memberId === 'string' && typeof p.eventId === 'string' && typeof p.since === 'number' && typeof p.state === 'string';
};

export class LinkQueue {
  private items: readonly PendingLink[] = [];
  private owner: string | null = null;
  private loaded: Promise<void> = Promise.resolve();
  private writing: Promise<void> = Promise.resolve();
  private flushing: Promise<void> | null = null;
  private failed = false;
  private readonly subs = new Set<() => void>();
  private readonly deps: LinkDeps;

  constructor(deps: LinkDeps) {
    this.deps = deps;
  }

  subscribe(f: () => void) {
    this.subs.add(f);
    return () => {
      this.subs.delete(f);
    };
  }
  snapshot = (): readonly PendingLink[] => this.items;
  /** 폰 저장소에 못 쓴 상태 — 줄이 메모리에만 있다 */
  persistFailed = () => this.failed;
  ownerNow = () => this.owner;

  private emit() {
    this.subs.forEach((f) => f());
  }
  private set(next: readonly PendingLink[]): Promise<void> {
    this.items = next;
    this.emit();
    return this.persist();
  }
  /** 쓰기 차례 — 늦게 끝난 앞 쓰기가 새 목록을 옛 목록으로 덮지 않게 하나씩. 돌려주는 약속은 이 쓰기까지 */
  private persist(): Promise<void> {
    const owner = this.owner;
    if (!owner) return Promise.resolve();
    const run = this.writing.then(async () => {
      const now = this.items.filter((l) => l.owner === owner);
      try {
        await this.deps.save(LINK_STORE_KEY(owner), now);
        if (this.failed) {
          this.failed = false;
          this.emit();
        }
      } catch {
        if (!this.failed) {
          this.failed = true;
          this.emit();
        }
      }
    });
    this.writing = run;
    return run;
  }
  /** 저장소 쓰기를 다시 해 본다 — 되면 persistFailed 가 풀린다 */
  retryPersist = () => this.persist().then(() => !this.failed);

  /** 로그인한 사람 — 그 사람의 줄을 읽는다. 다른 사람이면 앞사람 줄은 메모리에서 내린다(폰 열쇠에는 남아 그 사람이 다시 오면 돌아온다) */
  setOwner(userId: string | null): Promise<void> {
    if (this.owner === userId) return this.loaded;
    this.owner = userId;
    this.items = [];
    this.failed = false;
    this.emit();
    if (!userId) return (this.loaded = Promise.resolve());
    this.loaded = (async () => {
      const raw = await this.deps.load(LINK_STORE_KEY(userId));
      if (this.owner !== userId) return;
      const cutoff = this.deps.now() - LINK_MAX_AGE_MS;
      const stored = Array.isArray(raw) ? raw.filter(isLink).filter((l) => l.owner === userId && (l.state === 'rejected' || l.since > cutoff)) : [];
      /* 그사이 담긴 것(메모리)이 이긴다 */
      const extra = stored.filter((s) => !this.items.some((x) => x.key === s.key));
      if (extra.length) {
        this.items = [...extra, ...this.items];
        this.emit();
      }
    })();
    return this.loaded;
  }

  /** 활동 시작 — 지금 계정 · 회원 · 일정을 폰에 적는다(저장이 끝날 때까지 기다린다). 계정을 모르면 null */
  async start(e: { memberId: string; eventId: string }): Promise<PendingLink | null> {
    await this.loaded;
    const owner = this.owner;
    if (!owner) return null;
    const since = this.deps.now();
    const l: PendingLink = { key: `${owner}:${e.memberId}:${e.eventId}:${since}`, owner, memberId: e.memberId, eventId: e.eventId, sessionId: null, since, state: 'active', tries: 0, linked: 0 };
    await this.set([...this.items.filter((x) => x.key !== l.key), l]);
    return l;
  }
  /** 운동 판이 열렸다 — 판 번호 없는 활동 중 줄(가장 최근)에 붙인다. 없으면(조직에서 연 운동이 아님) 아무것도 안 한다 */
  async bindSession(sessionId: string): Promise<boolean> {
    await this.loaded;
    const owner = this.owner;
    if (!owner) return false;
    const target = [...this.items].reverse().find((l) => l.owner === owner && l.state === 'active' && !l.sessionId);
    if (!target) return false;
    await this.set(this.items.map((l) => (l.key === target.key ? { ...l, sessionId } : l)));
    return true;
  }
  /** 활동 끝(운동 화면을 나감 · 마침) — 활동 중 줄을 '끝'으로. 보내기는 부르는 쪽이 flush */
  async finish(): Promise<void> {
    await this.loaded;
    const owner = this.owner;
    if (!owner || !this.items.some((l) => l.owner === owner && l.state === 'active')) return;
    await this.set(this.items.map((l) => (l.owner === owner && l.state === 'active' ? { ...l, state: 'queued' } : l)));
  }
  /** 사람이 다시 보내기 — 거절 · 실패 줄을 다시 줄에 세운다 */
  async retry(key: string): Promise<void> {
    await this.set(this.items.map((l) => (l.key === key ? { ...l, state: l.sessionId || l.state !== 'active' ? 'queued' : l.state, tries: 0, rejected: undefined, lastError: undefined } : l)));
    await this.flush();
  }
  /** 사람이 지움 — 거절된 줄(개인 운동은 그대로) */
  async dismiss(key: string): Promise<void> {
    await this.set(this.items.filter((l) => l.key !== key));
  }

  /** 세트 대기열이 움직였을 때(세트 하나를 보냈을 때) — 그 판의 줄이 waiting 이면 다시 */
  async onSetsChanged(sessionId: string): Promise<void> {
    if (this.items.some((l) => l.sessionId === sessionId && l.state !== 'rejected')) await this.flush();
  }

  /**
   * 보내기 — 한 번에 하나씩(겹쳐 부르면 도는 것에 합류). 줄마다: 지금 계정 것만 · rejected 는 안 보냄 · 판 번호 없는 활동 중 줄은 오래됐을 때만.
   * 답: ok → 세트가 아직 폰에 있으면 waiting(남김), 활동 중이면 남김(linked 만 갱신), 끝났고 세트가 다 갔으면 뺀다. ok:false → rejected(남김). 던짐 → tries · lastError(남김).
   */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.run().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }
  private async run(): Promise<void> {
    await this.loaded;
    const owner = this.owner;
    if (!owner) return;
    for (const l of [...this.items]) {
      if (this.owner !== owner || l.owner !== owner || l.state === 'rejected') continue;
      const now = this.deps.now();
      const stale = now - l.since > LINK_STALE_MS;
      if (l.state === 'active' && !l.sessionId && !stale) continue; /* 판이 아직 안 열렸다(열리면 bindSession) */
      const pending = l.sessionId ? this.deps.pendingSets(l.sessionId) : 0;
      let res: LinkResponse;
      try {
        res = await this.deps.send(l);
      } catch (e) {
        if (this.owner !== owner) return;
        await this.set(this.items.map((x) => (x.key === l.key ? { ...x, tries: x.tries + 1, lastError: e instanceof Error ? e.message : String(e) } : x)));
        continue;
      }
      if (this.owner !== owner) return;
      const cur = this.items.find((x) => x.key === l.key);
      if (!cur) continue;
      if (!res.ok) {
        await this.set(this.items.map((x) => (x.key === l.key ? { ...x, state: 'rejected', rejected: res.error, lastError: undefined } : x)));
        continue;
      }
      const linked = cur.linked + res.linked;
      const done = (cur.state !== 'active' || stale) && pending === 0 && this.deps.pendingSets(cur.sessionId ?? '') === 0;
      if (done) await this.set(this.items.filter((x) => x.key !== l.key));
      else await this.set(this.items.map((x) => (x.key === l.key ? { ...x, linked, lastError: undefined, state: x.state === 'active' && !stale ? 'active' : 'waiting' } : x)));
    }
  }
}

/** 화면 글 — 줄 하나의 상태 */
export function linkStateText(l: PendingLink, pendingSets: number, persistFailed: boolean): { text: string; tone: 'muted' | 'danger' } {
  if (l.state === 'rejected') return { text: `일정에 잇지 못했어요 · ${l.rejected ?? '거절됨'}`, tone: 'danger' };
  if (persistFailed) return { text: '이 기기에 저장하지 못해 앱을 닫으면 잇기를 잃을 수 있어요', tone: 'danger' };
  if (l.lastError) return { text: `신호를 기다려요 · ${l.tries}번 못 보냄`, tone: 'muted' };
  if (pendingSets > 0) return { text: `세트 ${pendingSets}개를 먼저 보내는 중 · 그다음 일정에 이어요`, tone: 'muted' };
  if (l.state === 'active') return { text: l.sessionId ? `운동 중 · 마치면 일정에 이어요${l.linked ? ` · 지금까지 ${l.linked}세트` : ''}` : '운동 판을 여는 중', tone: 'muted' };
  return { text: `일정에 잇는 중${l.linked ? ` · ${l.linked}세트 이음` : ''}`, tone: 'muted' };
}
