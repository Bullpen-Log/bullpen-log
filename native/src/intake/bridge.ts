/** Intake-only protocol. No account bridge, URLs or arbitrary disk paths from web messages. */
export const READ_BYTES = 2 * 1024 * 1024;
export const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const MARKER = 'SinkerIntakeOriginal/1';
export function intakeToken(raw: string | null): string | null {
  try {
    const u = new URL(raw ?? '');
    return ['sinker:', 'bullpenlog:', 'dugout:'].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      !u.port &&
      ((u.hostname === 'intake' && ['', '/'].includes(u.pathname)) ||
        (!u.hostname && u.pathname === '/intake')) &&
      !u.search &&
      TOKEN.test(u.hash.slice(1))
      ? u.hash.slice(1)
      : null;
  } catch {
    return null;
  }
}
export function intakeDocument(raw: string, source: string): boolean {
  try {
    const a = new URL(raw),
      b = new URL(source);
    return (
      a.origin === b.origin &&
      !a.username &&
      !a.password &&
      a.pathname === '/submit' &&
      !a.search &&
      a.hash === b.hash &&
      TOKEN.test(a.hash.slice(1))
    );
  } catch {
    return false;
  }
}
type Disk = {
  authorize(): Promise<boolean>;
  pick(): Promise<{ uri: string; name: string } | null>;
  size(uri: string): Promise<number>;
  read(uri: string, start: number, length: number): Promise<string>;
  remove(uri: string): Promise<void>;
  id(): string;
  cancel?(): Promise<void>;
};
type RecordFile = { uri: string; name: string; size: number; pickId: string };
export class OriginalBridge {
  private files = new Map<string, RecordFile>();
  private closed = false;
  private picking: { id: string } | null = null;
  private canceling: Promise<void> | null = null;
  private reading = false;
  private source: string;
  private disk: Disk;
  constructor(source: string, disk: Disk) {
    this.source = source;
    this.disk = disk;
  }
  async close() {
    this.closed = true;
    await this.cancelPick().catch(() => undefined);
    const files = [...this.files.values()];
    this.files.clear();
    await Promise.allSettled(files.map((f) => this.disk.remove(f.uri)));
  }
  private async cancelPick(pickId?: string) {
    const active = this.picking;
    if (active && (!pickId || active.id === pickId)) {
      // Invalidate before awaiting native cancellation; keep retry blocked until
      // cancellation finishes. A late old finally must not unlock a newer pick.
      this.picking = null;
      const cancel = Promise.resolve().then(async () => {
        await this.disk.cancel?.();
      });
      this.canceling = cancel;
      try {
        await cancel;
      } finally {
        if (this.canceling === cancel) this.canceling = null;
      }
    } else if (!active && this.canceling) await this.canceling;
    if (pickId) {
      // The original reply may already be queued when the browser timer fires.
      // Remove only that expired result, preserving previous valid selections.
      for (const [handle, file] of this.files) {
        if (file.pickId !== pickId) continue;
        this.files.delete(handle);
        await this.disk.remove(file.uri);
      }
    }
  }
  async dispatch(
    url: string,
    data: string
  ): Promise<{ id: string; result?: unknown; error?: string } | null> {
    if (this.closed || !intakeDocument(url, this.source) || data.length > 1024)
      return null;
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(data);
    } catch {
      return null;
    }
    if (
      !m ||
      m.t !== 'intake-original' ||
      typeof m.id !== 'string' ||
      !/^[\w-]{1,80}$/.test(m.id)
    )
      return null;
    const id = m.id;
    try {
      if (m.op === 'authorize') return { id, result: await this.disk.authorize() };
      if (m.op === 'cancel') {
        if (
          m.pickId !== undefined &&
          (typeof m.pickId !== 'string' || !/^[\w-]{1,80}$/.test(m.pickId))
        )
          throw new Error('취소할 원본 선택을 확인하지 못했습니다.');
        await this.cancelPick(m.pickId as string | undefined);
        return { id, result: null };
      }
      if (m.op === 'pick') {
        if (this.picking || this.canceling)
          throw new Error('이미 원본을 선택하고 있습니다.');
        // Keep all active handles valid, with a finite number of private copies per screen.
        if (this.files.size >= 12)
          throw new Error(
            '다시 선택할 수 있는 횟수를 초과했습니다. 접수 화면을 다시 엽니다.'
          );
        const operation = { id };
        this.picking = operation;
        try {
          const picked = await this.disk.pick();
          if (!picked) return { id, result: null };
          if (
            !/^file:\/\/.*\/intake-original\/[A-Fa-f0-9-]+\.(mov|mp4|m4v)$/.test(
              picked.uri
            )
          )
            throw new Error('원본 파일 위치를 확인하지 못했습니다.');
          try {
            if (this.closed || this.picking !== operation)
              throw new Error('원본 선택이 취소되었습니다.');
            const size = await this.disk.size(picked.uri);
            if (!Number.isSafeInteger(size) || size <= 0)
              throw new Error('원본 파일을 읽지 못했습니다.');
            if (this.closed || this.picking !== operation)
              throw new Error('원본 선택이 취소되었습니다.');
            const handle = this.disk.id();
            this.files.set(handle, { ...picked, size, pickId: id });
            return { id, result: { handle, size, name: picked.name } };
          } catch (e) {
            await this.disk.remove(picked.uri).catch(() => undefined);
            throw e;
          }
        } finally {
          if (this.picking === operation) this.picking = null;
        }
      }
      if (m.op === 'read') {
        const f = typeof m.handle === 'string' ? this.files.get(m.handle) : null;
        const { start, end } = m;
        if (
          !f ||
          typeof start !== 'number' ||
          typeof end !== 'number' ||
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start < 0 ||
          end <= start ||
          end > f.size ||
          end - start > READ_BYTES
        )
          throw new Error('원본 읽기 범위가 올바르지 않습니다.');
        if (this.reading) throw new Error('원본을 읽는 중입니다. 다시 시도합니다.');
        this.reading = true;
        try {
          return { id, result: await this.disk.read(f.uri, start, end - start) };
        } finally {
          this.reading = false;
        }
      }
      throw new Error('지원하지 않는 요청입니다.');
    } catch (e) {
      // Native errors may contain private paths. Never forward them to the document.
      const allowed = e instanceof Error && !/file:|\/var\/|\/Users\//.test(e.message);
      return {
        id,
        error: allowed
          ? e.message.slice(0, 180)
          : '원본을 준비하지 못했습니다. 파일 방식으로 다시 선택합니다.',
      };
    }
  }
}
