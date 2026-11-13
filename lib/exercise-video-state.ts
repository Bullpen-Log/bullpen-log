/**
 * 기본 운동영상 플레이어의 공통 규칙(VP01) — 웹(HTMLVideoElement · YouTube IFrame API)과 앱(expo-video · WebView)이
 * 같은 '사용자 의도'를 따르게 하는 순수 계산. 화면 · DOM · React Native 를 모른다.
 *
 * 핵심: 실제 재생 상태(버퍼링 · 멈춤 이벤트)와 사용자가 원하는 상태를 따로 쥔다. 늦게 온 준비 · 끝 · 재생 알림이
 * 사용자의 멈춤 · 영상 교체 · 화면 이탈보다 앞서지 못하게 세대 번호를 비교한다.
 */

/* ------------------------------ 재생 의도 ------------------------------ */

/** 재생 요청 시점의 표 — 이 표가 아직 유효해야 늦게 온 콜백이 재생을 켤 수 있다. */
export type PlayTicket = { source: number; interrupt: number };

export type InterruptReason = 'user' | 'blur' | 'background' | 'hidden' | 'offscreen' | 'other-player' | 'unmount' | 'source';

export class PlaybackIntent {
  /** 영상(소스)이 바뀔 때마다 1 씩. 이전 소스의 이벤트는 새 소스 상태를 못 바꾼다. */
  source = 0;
  /** 멈춤(사용자 · 화면 이탈 · 다른 플레이어)마다 1 씩. 그 전에 시작된 재생 · 탐색 재개 권한을 없앤다. */
  interrupt = 0;
  /** 사용자가 지금 재생을 원하는가. 실제 playing 상태와 다르다(로딩 · 버퍼링 중에도 true 일 수 있다). */
  desired = false;
  /** 마지막 멈춤 까닭 — 표시 · 시험용. */
  lastReason: InterruptReason | null = null;

  /** 새 소스. 이전 재생 의도는 끊고, 새 소스에 대한 의도는 명시 요청이 있어야 생긴다. */
  setSource(keepIntent = false): number {
    this.source += 1;
    this.interrupt += 1;
    if (!keepIntent) this.desired = false;
    return this.source;
  }

  /** 사용자의 명시적 재생 요청(첫 활성화 · 재생 단추 · 영상 탭). 중단을 새로 연다. */
  requestPlay(): PlayTicket {
    this.desired = true;
    this.lastReason = null;
    return this.ticket();
  }

  ticket(): PlayTicket {
    return { source: this.source, interrupt: this.interrupt };
  }

  /** 멈춤. 사용자 멈춤도 중단 세대를 올린다 — 그 전에 발급된 표로는 다시 켜지지 않는다. */
  pause(reason: InterruptReason): void {
    this.desired = false;
    this.interrupt += 1;
    this.lastReason = reason;
  }

  /** 늦게 온 준비 · 끝 · 재생 콜백이 재생을 켜도 되는가. */
  allows(t: PlayTicket | null | undefined): boolean {
    return !!t && this.desired && t.source === this.source && t.interrupt === this.interrupt;
  }

  /** 실제로 재생이 시작됐다는 알림이 왔을 때 — 원하지 않았던 재생이면 멈춰야 한다. */
  shouldStopUnwantedPlay(): boolean {
    return !this.desired;
  }
}

/* --------------------------- 명령 · 실제 상태 맞추기 --------------------------- */

/**
 * 우리가 공급자(영상 요소 · expo-video · YouTube)에 보낸 마지막 명령을 기억해, 뒤따라 오는 재생 · 멈춤 알림이
 * '우리가 시킨 것'인지 '공급자 화면 · 시스템이 한 것'인지 가른다(VP01 검토 보완).
 *
 * - 멈춤 명령 뒤에 온 재생 알림 = 늦게 처리된 예전 재생 명령(late) → 다시 멈춘다.
 * - 아무 명령도 기다리지 않는데 온 재생 알림 = 공급자 화면에서 사용자가 튼 것(external).
 * - 우리가 멈추지 않았는데 온 멈춤 알림 = 공급자 화면 · 미디어 키 · 오디오 끊김 같은 바깥 멈춤 → 의도도 내린다.
 *
 * 처리되지 않은 명령은 ttlMs 뒤 잊는다 — 공급자가 알림을 안 주는 경우(이미 멈춘 것을 또 멈춤)에 영원히 매달리지 않게.
 */
export type ProviderCommand = 'play' | 'pause';

export class CommandTracker {
  private pending: ProviderCommand | null = null;
  private at = 0;
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(now: () => number = () => Date.now(), ttlMs = 4000) {
    this.now = now;
    this.ttlMs = ttlMs;
  }

  sentPlay(): void {
    this.pending = 'play';
    this.at = this.now();
  }

  /**
   * 멈춤을 보냄. active = 공급자가 지금 재생 중(이라 알고 있음). 재생 중도 아니고 재생 명령도 기다리지 않으면
   * 멈춤 알림이 오지 않을 수 있어 기다리지 않는다(다음 바깥 재생을 '늦은 재생'으로 오해하지 않게).
   */
  sentPause(active: boolean): void {
    if (active || this.current() === 'play') {
      this.pending = 'pause';
      this.at = this.now();
    } else this.pending = null;
  }

  /** 지금 기다리는 명령(만료 반영). 표시 · 시험용. */
  current(): ProviderCommand | null {
    if (this.pending && this.now() - this.at > this.ttlMs) this.pending = null;
    return this.pending;
  }

  /** 재생 알림 — 기다리던 명령은 이것으로 끝난다(다시 멈춰야 하면 호출하는 쪽이 sentPause 를 다시 부른다). */
  onPlaying(): 'ours' | 'late' | 'external' {
    const p = this.current();
    this.pending = null;
    return p === 'pause' ? 'late' : p === 'play' ? 'ours' : 'external';
  }

  onPaused(): 'ours' | 'external' {
    const p = this.current();
    this.pending = null;
    return p === 'pause' ? 'ours' : 'external';
  }

  /**
   * 기다리던 명령을 버린다 — 공급자가 우리 재생을 거절했을 때(자동 재생 막힘). 막힘에는 멈춤 알림이 오지 않아
   * 그대로 두면 곧이어 사용자가 공식 재생 단추로 튼 재생을 '우리 재생'으로 오해해 멈췄다(VP01 검토).
   */
  clear(): void {
    this.pending = null;
  }
}

/**
 * 앱 자체 영상(expo-video)의 바깥 멈춤 확정 — 잠시 기다린 뒤에도 멈춰 있고(반복 끝의 잠깐 멈춤이 아니고) 끄는 중이 아니고
 * 준비된(버퍼링이 아닌) 상태에서 의도가 재생이면 의도를 멈춤으로 맞춘다. 맞췄으면 true.
 */
export function settleExternalPause(intent: PlaybackIntent, s: { playing: boolean; scrubbing: boolean; ready: boolean }): boolean {
  if (s.playing || s.scrubbing || !s.ready || !intent.desired) return false;
  intent.pause('user');
  return true;
}

/**
 * YouTube 에 멈춤을 보낼 때 멈춤 알림을 기다려야 하는가. 재생 중만이 아니라 버퍼링(3) · 끝(0, 반복 재시작 중) ·
 * 한 번 재생된 뒤의 시작 전(-1, 반복 재시작 중)도 곧 재생(1)이 올 수 있어 '활동 중'으로 본다 — 그 재생은 늦은 재생으로 멈춘다.
 */
export function ytActiveForPause(lastState: YtState | null, playing: boolean, hasPlayed: boolean): boolean {
  return playing || lastState === 3 || lastState === 0 || (lastState === -1 && hasPlayed);
}

/**
 * 공식 문서: 시작 전(-1) · 대기(5) 상태에서 seekTo 를 부르면 재생이 시작된다. 그런 탐색 뒤에 오는 재생 알림은
 * 사용자가 공식 단추로 튼 것이 아니다 — 의도가 멈춤이면 늦은 재생으로 보고 멈추도록 '멈춤 대기'를 걸어 둔다.
 */
export function ytSeekMayStart(lastState: YtState | null): boolean {
  return lastState == null || lastState === -1 || lastState === 5;
}

/**
 * 공급자가 '재생 중'을 알렸을 때 할 일.
 * - 사용자가 재생을 원하면 둔다(반복 재시작 · 버퍼링 뒤 재개 포함).
 * - 원하지 않는데 공급자 화면에서 시작된 재생(external)은 acceptExternal 이면 사용자 재생 요청으로 받아들인다
 *   (YouTube 공식 재생 단추 — VP01 12: 공식 표면은 YouTube 의 것). 새 표를 돌려준다.
 * - 그 밖(늦은 재생 · 우리 재생 명령이었지만 그새 멈춤 · 받지 않는 공급자)은 멈춘다.
 */
export function onProviderPlaying(
  intent: PlaybackIntent,
  tracker: CommandTracker,
  opts: { acceptExternal: boolean }
): { verdict: 'keep' | 'stop'; ticket: PlayTicket | null } {
  const kind = tracker.onPlaying();
  if (intent.desired) return { verdict: 'keep', ticket: null };
  if (kind === 'external' && opts.acceptExternal) return { verdict: 'keep', ticket: intent.requestPlay() };
  return { verdict: 'stop', ticket: null };
}

/**
 * 공급자가 '멈춤'을 알렸을 때 — 우리가 시키지 않은 멈춤이면 사용자 의도도 멈춤으로 맞춘다.
 * 끄는 중(scrubbing)에는 우리가 멈춘 것이라 건드리지 않는다. 의도가 바뀌었으면 true.
 */
export function onProviderPaused(intent: PlaybackIntent, tracker: CommandTracker, scrubbing: boolean): boolean {
  const kind = tracker.onPaused();
  if (kind === 'external' && !scrubbing && intent.desired) {
    intent.pause('user');
    return true;
  }
  return false;
}

/* ------------------------------ 시간 · 탐색 ------------------------------ */

export const SEEK_STEP = 5;

/** 탐색 가능한 범위. 길이를 모르거나(NaN · Infinity · 0 이하) 범위가 이상하면 null — 탐색을 끄고 '--:--'. */
export function seekRange(duration: number | null | undefined, seekable?: { start: number; end: number } | null): { min: number; max: number } | null {
  if (duration == null || !Number.isFinite(duration) || duration <= 0) return null;
  let min = 0;
  let max = duration;
  if (seekable) {
    if (!Number.isFinite(seekable.start) || !Number.isFinite(seekable.end) || seekable.end <= seekable.start) return null;
    min = Math.max(0, seekable.start);
    max = Math.min(duration, seekable.end);
    if (max <= min) return null;
  }
  return { min, max };
}

export function clampTime(t: number, range: { min: number; max: number } | null): number {
  if (!range) return 0;
  if (!Number.isFinite(t)) return range.min;
  return Math.min(range.max, Math.max(range.min, t));
}

/** 키보드 · VoiceOver 증감 — ±5초. 범위가 없으면 그대로(0). */
export function stepTime(current: number, dir: 1 | -1, range: { min: number; max: number } | null): number {
  return clampTime((Number.isFinite(current) ? current : 0) + dir * SEEK_STEP, range);
}

/** 'm:ss'. 모르는 값은 '--:--' — NaN · Infinity · 음수를 그대로 보이지 않는다. */
export function timeText(t: number | null | undefined): string {
  if (t == null || !Number.isFinite(t) || t < 0) return '--:--';
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 현재 위치 표시용 — 모르는 값은 0. */
export function finiteTime(t: number | null | undefined): number {
  return t != null && Number.isFinite(t) && t > 0 ? t : 0;
}

/* ------------------------------ 탐색(끌기) ------------------------------ */

export type ScrubSession = {
  origin: number;
  draft: number;
  wasPlaying: boolean;
  ticket: PlayTicket;
};

/**
 * 끌기 시작 — 원래 위치 · 재생 의도를 저장하고 멈춘다(호출하는 쪽이 실제 pause).
 *
 * 끝나고 다시 틀지는 '사용자 의도'(intent.desired)로만 정한다. 화면의 playing 표시는 공급자 알림이 늦게 와
 * 방금 누른 멈춤 · 공급자 화면의 멈춤을 아직 모를 수 있다(VP01 검토: 멈춘 영상이 끌기 뒤 다시 재생되던 것).
 * 이미 끄는 중이면(두 번째 손가락 등) 그 세션을 그대로 돌려준다 — 처음 의도를 잃지 않게.
 */
export function beginScrub(intent: PlaybackIntent, origin: number, existing?: ScrubSession | null): ScrubSession {
  if (existing) return existing;
  const keep = intent.desired;
  // 끄는 동안의 멈춤은 사용자 멈춤이 아니라 일시 보류 — 세대는 올리지 않고 의도만 내린다.
  intent.desired = false;
  return { origin: finiteTime(origin), draft: finiteTime(origin), wasPlaying: keep, ticket: intent.ticket() };
}

/**
 * 끌기 끝. commit 이면 draft 로 이동, 아니면(취소) 실시간 미리보기 전의 원래 위치로 복원.
 * 끄는 사이 다른 중단(배경 · 화면 이탈 · 다른 플레이어 · 소스 교체 · 명시 멈춤)이 있었으면 이동·재개 모두 하지 않는다.
 */
export function endScrub(
  intent: PlaybackIntent,
  session: ScrubSession,
  commit: boolean,
  range: { min: number; max: number } | null
): { seekTo: number | null; resume: boolean } {
  const stillOurs = session.ticket.source === intent.source && session.ticket.interrupt === intent.interrupt;
  // Live previews already moved the frame. Cancel restores origin; interrupted sessions must not seek a newer source.
  const seekTo = stillOurs && range ? clampTime(commit ? session.draft : session.origin, range) : null;
  const resume = session.wasPlaying && stillOurs;
  if (resume) intent.desired = true;
  return { seekTo, resume };
}

/* ------------------------------ 하나만 재생 ------------------------------ */

export type ActiveRegistry = {
  /** 이 플레이어가 재생을 시작한다 — 다른 활성 플레이어는 멈춘다. */
  activate(id: string, stop: () => void): void;
  release(id: string): void;
  isActive(id: string): boolean;
  current(): string | null;
};

/** 실행 환경당 하나 — 자체 영상과 YouTube 모두 같은 표에 올린다. */
export function createActiveRegistry(): ActiveRegistry {
  let cur: { id: string; stop: () => void } | null = null;
  return {
    activate(id, stop) {
      if (cur && cur.id !== id) {
        const prev = cur;
        cur = null;
        try {
          prev.stop();
        } catch {
          /* 이미 정리된 플레이어 */
        }
      }
      cur = { id, stop };
    },
    release(id) {
      if (cur?.id === id) cur = null;
    },
    isActive(id) {
      return cur?.id === id;
    },
    current() {
      return cur?.id ?? null;
    },
  };
}

/* ------------------------------ 배속 ------------------------------ */

/** 우리가 내미는 배속. 자체 영상은 둘 다, YouTube 는 공식 제공 목록과 겹치는 것만. */
export const OFFERED_RATES = [0.5, 1] as const;

export function supportedRates(available: readonly number[] | null | undefined): number[] {
  if (!available?.length) return [];
  return OFFERED_RATES.filter((r) => available.some((a) => Math.abs(a - r) < 1e-6));
}

/* ------------------------------ YouTube ------------------------------ */

/** YouTube 영상 번호(11자). 다른 글자가 섞이면 쓰지 않는다. */
export const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** 공식 IFrame API onError 코드 → 사용자 안내. 153 은 재생기 식별(출처) 실패. */
export function youtubeErrorText(code: number): string {
  switch (code) {
    case 2:
      return '영상 정보를 읽지 못했어요.';
    case 5:
      return '이 기기에서 재생할 수 없는 영상이에요.';
    case 100:
      return '영상이 삭제됐거나 비공개로 바뀌었어요.';
    case 101:
    case 150:
      return '이 영상은 다른 화면에서 재생할 수 없게 설정돼 있어요.';
    case 153:
      return '유튜브가 재생기를 확인하지 못했어요. 다시 불러와 주세요.';
    default:
      return '유튜브 영상을 재생하지 못했어요.';
  }
}

/** 공식 PlayerState: -1 시작 전, 0 끝, 1 재생, 2 멈춤, 3 버퍼링, 5 대기. */
export type YtState = -1 | 0 | 1 | 2 | 3 | 5;

/* --------------------------- 앱 WebView 다리 --------------------------- */

/** WebView 안 YouTube → 앱. 형식이 틀리거나 지난 세대 · 다른 플레이어 메시지는 null(무시). */
export type BridgeMessage =
  | { t: 'ready'; duration: number; rates: number[]; muted: boolean }
  | { t: 'state'; state: YtState; time: number; duration: number }
  | { t: 'time'; time: number; duration: number; muted: boolean }
  | { t: 'rate'; rate: number }
  | { t: 'error'; code: number }
  | { t: 'blocked' };

const num = (v: unknown, min = 0, max = 24 * 3600): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;

export function parseBridgeMessage(raw: unknown, expect: { pid: string; gen: number }): BridgeMessage | null {
  if (typeof raw !== 'string' || raw.length > 2000) return null;
  let m: Record<string, unknown>;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    m = v as Record<string, unknown>;
  } catch {
    return null;
  }
  if (m.pid !== expect.pid || m.gen !== expect.gen) return null;
  switch (m.t) {
    case 'ready': {
      const duration = num(m.duration);
      const rates = Array.isArray(m.rates) ? m.rates.filter((r): r is number => num(r, 0.05, 4) != null).slice(0, 16) : null;
      if (duration == null || !rates || typeof m.muted !== 'boolean') return null;
      return { t: 'ready', duration, rates, muted: m.muted };
    }
    case 'state': {
      const state = m.state;
      const time = num(m.time);
      const duration = num(m.duration);
      if (![-1, 0, 1, 2, 3, 5].includes(state as number) || time == null || duration == null) return null;
      return { t: 'state', state: state as YtState, time, duration };
    }
    case 'time': {
      const time = num(m.time);
      const duration = num(m.duration);
      if (time == null || duration == null || typeof m.muted !== 'boolean') return null;
      return { t: 'time', time, duration, muted: m.muted };
    }
    case 'rate': {
      const rate = num(m.rate, 0.05, 4);
      return rate == null ? null : { t: 'rate', rate };
    }
    case 'error': {
      const code = num(m.code, 0, 10000);
      return code == null || !Number.isInteger(code) ? null : { t: 'error', code };
    }
    case 'blocked':
      return { t: 'blocked' };
    default:
      return null;
  }
}

/** 앱 → WebView 명령. 정해진 종류와 유한한 숫자만. 문자열 코드를 실행하지 않는다. */
export type BridgeCommand =
  | { cmd: 'play' }
  | { cmd: 'pause' }
  | { cmd: 'seek'; value: number; preview?: boolean }
  | { cmd: 'loop'; value: boolean }
  | { cmd: 'rate'; value: number }
  | { cmd: 'mute' }
  | { cmd: 'unmute' };

export function serializeCommand(c: BridgeCommand, gen: number): string | null {
  if (!Number.isInteger(gen) || gen < 0) return null;
  switch (c.cmd) {
    case 'play':
    case 'pause':
    case 'mute':
    case 'unmute':
      return JSON.stringify({ cmd: c.cmd, gen });
    case 'loop':
      return typeof c.value !== 'boolean' ? null : JSON.stringify({ cmd: 'loop', value: c.value, gen });
    case 'seek':
      return num(c.value) == null ? null : JSON.stringify({ cmd: 'seek', value: c.value, preview: c.preview === true, gen });
    case 'rate':
      return num(c.value, 0.05, 4) == null ? null : JSON.stringify({ cmd: 'rate', value: c.value, gen });
    default:
      return null;
  }
}


/** Latest-only live seeking. First frame immediately, then bounded provider traffic.
 * Finish/interrupt/unmount must cancel the pending preview before the exact final seek.
 */
export class LiveSeek {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: (() => void) | null = null;
  private intervalMs: number;
  constructor(intervalMs = 80) { this.intervalMs = intervalMs; }
  request(write: () => void): void {
    this.pending = write;
    if (this.timer != null) return;
    this.flush();
  }
  private flush(): void {
    const work = this.pending;
    this.pending = null;
    if (!work) { this.timer = null; return; }
    // Arm before invoking: reentrant requests remain bounded too.
    this.timer = setTimeout(() => this.flush(), this.intervalMs);
    work();
  }
  cancel(): void {
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }
}

/** Inline native stage only; controls occupy their own black footer, never this rectangle. */
export function nativeVideoStageHeight(width: number, windowHeight: number, ratio: number | null, preferred?: number): number {
  const aspect = ratio != null && Number.isFinite(ratio) && ratio > 0 ? ratio : 16 / 9;
  const available = Math.max(100, Math.min(420, windowHeight - 240));
  const natural = preferred != null && Number.isFinite(preferred) && preferred > 0 ? preferred : width / aspect;
  return Math.max(100, Math.min(available, natural));
}
