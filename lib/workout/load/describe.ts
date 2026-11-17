/**
 * EX-LOAD01-R1 — 못 보낸 세트를 사람 말로(밴드 · 섞임 · 양손 다른 무게 · 기구 이름 · kg). 순수 — React · DB · 저장소를 부르지 않는다.
 * 웹 · 앱의 복구 화면, 앱 마치기 창의 '못 보낸 세트' 목록이 같이 쓴다(다른 화면도 가져다 써도 된다 — 아래 함수 이름 · 모양은 고정).
 *
 * - 대기열에 담긴 원래 값을 그대로 말한다. kg 를 만들어 내지 않는다(밴드에 kg 없음 · 양손 다른 무게를 한 숫자로 합치지 않음).
 * - 이 앱이 모르는 모양(앞으로 나올 판의 load 등)이어도 던지지 않는다 — '모르는 기록 형식'이라고만 말하고 원래 값은 대기열에 그대로 둔다.
 * - 운동의 기록 계약(contract)을 알면 받지 않는 kg(맨몸 운동의 옛 kg)은 무게 글에 쓰지 않고 excludedKg 로 따로 돌려준다.
 *
 * 함수: describeLoad · describeAmount · describeSet · heldReasonOf · ownerGroupOf · recoverySummary(+ RECOVERY_STALE_MS) ·
 * recoveryEditOf · recoveryActionsOf(복구 화면이 줄마다 무엇을 내놓을지 — 웹 · 앱이 같은 판단).
 */

import { formatSeconds } from '@/lib/exercise-meta';
import { BAND_CATALOG_REVISION, bandText, levelById, type BandComponent } from '@/lib/workout/load/band-catalog';
import { BASIS_LABEL, RESOLVER_VERSION, acceptsMass, contractForVariant, type MassBasis, type RecordingContract } from '@/lib/workout/load/contract';
import { LOAD_PROTOCOL } from '@/lib/workout/load/protocol';

/** 말하려는 세트 한 줄(대기열 줄 · 저장된 세트 모두) — load 는 모르는 모양일 수 있어 unknown 으로 받는다 */
export type DescribableSet = {
  weightKg?: number | null;
  load?: unknown;
  variant?: 'band' | 'mass' | null | unknown;
  reps?: number | null;
  holdSeconds?: number | null;
  rir?: number | null;
};

export type DescribeOptions = {
  /** 그 운동의 기록 계약 — 알면 받지 않는 kg 을 따로 뺀다 */
  contract?: RecordingContract | null;
  /** kg 를 화면 단위로 — 기본 '60kg' */
  fmtKg?: (kg: number) => string;
};

export type LoadDescription = {
  /** none: 무게 없음 · kg: 숫자만 · mass: 무게 기록(기구 이름 · 기준) · unequal: 양손 다른 무게 · band · combined · unknown: 이 앱이 모르는 형식 */
  kind: 'none' | 'kg' | 'mass' | 'unequal' | 'band' | 'combined' | 'unknown';
  /** 한 줄 — 무게가 없으면 null */
  text: string | null;
  /** 성분마다 한 줄(섞임이면 무게 줄 · 밴드 줄) */
  lines: string[];
  /** 받지 않는 운동에 남은 옛 kg — 무게 글에 안 쓰고 따로(지우지 않는다) */
  excludedKg: number | null;
};

const defaultKg = (kg: number) => `${Math.round(kg * 100) / 100}kg`;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const ROLE_WORD: Record<string, string> = { resistance: '저항 밴드', assistance: '보조 밴드', unknown: '밴드(역할 모름)' };

/**
 * EX-LOAD01-R1 — 밴드 역할 한 마디(웹 · 앱 기록 · 복구 화면이 같이 쓴다). 저항 · 보조는 그대로, 모름 · 알 수 없는 값은 '밴드(역할 모름)' —
 * 역할을 짐작해 저항 · 보조로 바꾸지 않는다.
 */
export function bandRoleWord(role: unknown): string {
  return typeof role === 'string' && (role === 'resistance' || role === 'assistance') ? ROLE_WORD[role] : ROLE_WORD.unknown;
}

function bandsLine(band: unknown): string | null {
  if (!isObj(band)) return null;
  const role = typeof band.role === 'string' && ROLE_WORD[band.role] ? ROLE_WORD[band.role] : '밴드';
  const list = Array.isArray(band.bands) ? band.bands : null;
  if (!list) return null;
  if (list.length === 0) return `${role} · 어느 밴드인지 모름`;
  const names = list.map((b) => {
    try {
      return bandText(b as BandComponent);
    } catch {
      return '알 수 없는 밴드';
    }
  });
  return `${role} · ${names.join(' + ')}`;
}

function basisText(basis: unknown): string | null {
  return typeof basis === 'string' && basis in BASIS_LABEL ? BASIS_LABEL[basis as MassBasis].ko : null;
}

/** 무게 성분 한 줄 — 양손 다른 무게면 parts 그대로, 아니면 kg(기준 · 기구 이름과 함께). 말할 것이 없으면 null */
function massLine(m: unknown, fmt: (kg: number) => string): { text: string | null; unequal: boolean } | null {
  if (!isObj(m)) return null;
  const setup = isObj(m.setup) && typeof m.setup.label === 'string' && m.setup.label ? m.setup.label : null;
  const parts = Array.isArray(m.parts) && m.parts.length ? m.parts : null;
  let main: string | null = null;
  if (parts) {
    main = parts
      .map((p) => {
        if (!isObj(p)) return '알 수 없는 무게';
        const kg = num(p.kg);
        const side = p.side === 'left' ? '왼손 ' : p.side === 'right' ? '오른손 ' : '';
        const count = num(p.count);
        return `${side}${kg == null ? '무게 모름' : fmt(kg)}${count != null && count > 1 ? ` × ${count}개` : ''}`;
      })
      .join(' · ');
  } else {
    const kg = num(m.kg);
    if (kg != null) {
      const b = basisText(m.basis);
      main = b ? `${fmt(kg)}(${b})` : fmt(kg);
    }
  }
  const text = [main, setup].filter(Boolean).join(' · ') || null;
  return { text, unequal: !!parts };
}

/** 무게 기록을 사람 말로 */
export function describeLoad(set: DescribableSet, opts: DescribeOptions = {}): LoadDescription {
  const fmt = opts.fmtKg ?? defaultKg;
  const kg = num(set.weightKg);
  const l = set.load;
  /* 계약이 kg 을 받지 않으면(맨몸 · 밴드만 · 장비 확인 중) 옛 kg 을 따로 — 고르는 운동이면 고른 변형 기준 */
  const c = opts.contract ?? null;
  const variant = set.variant === 'band' || set.variant === 'mass' ? set.variant : null;
  const active = c ? (c.mode === 'alternative' ? (variant ? contractForVariant(c, variant) : null) : c) : null;
  const kgAccepted = c == null ? true : active ? acceptsMass(active) : variant == null && kg != null && c.mode === 'alternative';

  if (l === undefined || l === null) {
    if (kg == null) return { kind: 'none', text: null, lines: [], excludedKg: null };
    if (!kgAccepted) return { kind: 'none', text: null, lines: [], excludedKg: kg };
    const b = active?.massBasis ? BASIS_LABEL[active.massBasis].ko : null;
    const text = b ? `${fmt(kg)}(${b})` : fmt(kg);
    return { kind: 'kg', text, lines: [text], excludedKg: null };
  }
  if (!isObj(l) || typeof l.kind !== 'string') return { kind: 'unknown', text: '이 앱이 모르는 기록 형식이에요', lines: [], excludedKg: null };
  if (l.kind === 'none') return { kind: 'none', text: null, lines: [], excludedKg: kg != null && !kgAccepted ? kg : null };
  if (l.kind === 'mass') {
    const m = massLine(l, fmt);
    const text = m?.text ?? (kg != null ? fmt(kg) : null);
    return { kind: m?.unequal ? 'unequal' : 'mass', text, lines: text ? [text] : [], excludedKg: null };
  }
  if (l.kind === 'band') {
    const text = bandsLine(l) ?? '어느 밴드인지 모름';
    return { kind: 'band', text, lines: [text], excludedKg: kg != null && !kgAccepted ? kg : null };
  }
  if (l.kind === 'combined') {
    const m = massLine(l.mass, fmt);
    const b = bandsLine(l.band) ?? '어느 밴드인지 모름';
    const lines = [m?.text ?? null, b].filter((x): x is string => !!x);
    return { kind: 'combined', text: lines.join(' + '), lines, excludedKg: null };
  }
  return { kind: 'unknown', text: '이 앱이 모르는 기록 형식이에요', lines: [], excludedKg: null };
}

/** 횟수 · 시간 — '8회' · '30초' · '1분 10초', 둘 다 없으면 '양 없음' */
export function describeAmount(set: DescribableSet): string {
  const hold = num(set.holdSeconds);
  if (hold != null) return formatSeconds(Math.max(0, Math.round(hold)));
  const reps = num(set.reps);
  return reps != null ? `${reps}회` : '양 없음';
}

/** 세트 한 줄 — '저항 밴드 · 노랑 … · 8회 · 여유 2' */
export function describeSet(set: DescribableSet, opts: DescribeOptions = {}): string {
  const d = describeLoad(set, opts);
  const fmt = opts.fmtKg ?? defaultKg;
  const rir = num(set.rir);
  return [
    d.text,
    describeAmount(set),
    rir != null ? `여유 ${rir >= 4 ? '4+' : rir}` : null,
    d.excludedKg != null ? `${fmt(d.excludedKg)}은 계산에서 뺐어요` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/* ───────────────────── 붙든 까닭 ───────────────────── */

const HELD_TITLE: Record<string, string> = {
  LOAD_NOT_ALLOWED: '이 운동은 이 무게 기록을 받지 않아요',
  LOAD_UNSUPPORTED: '서버가 아직 이 기록을 저장하지 못해요',
  LOAD_CONFLICT: '같은 세트에 서로 다른 무게가 있어요',
  LOAD_INVALID: '값을 다시 확인해 주세요',
  LOAD_REQUIRED: '무게를 적어야 하는 운동이에요',
  LOAD_VERSION: '다른 판의 앱이나 서버 기록이에요',
  REJECTED: '서버가 이 세트를 받지 않았어요',
  MALFORMED: '서버 답을 확인하지 못했어요',
  SESSION_UNAVAILABLE: '마친 운동이거나 찾을 수 없는 운동이에요',
  OWNER_UNKNOWN: '어느 계정의 세트인지 몰라요',
  SEND_FAILED: '여러 번 보내지 못했어요',
};

/** 붙든 표를 짧은 제목 + 서버가 준 말로. 표가 없거나 모양이 틀리면 null */
export function heldReasonOf(held: unknown): { code: string; title: string; message: string | null } | null {
  if (!isObj(held)) return null;
  const code = typeof held.code === 'string' ? held.code : 'UNKNOWN';
  const message = typeof held.message === 'string' && held.message.trim() ? held.message.trim() : null;
  return { code, title: HELD_TITLE[code] ?? '보내지 못했어요', message };
}

/* ───────────────────── 계정 묶음 ───────────────────── */

/**
 * 대기열 줄이 지금 계정에게 무엇인가.
 *   mine    지금 계정이 담은 줄 — 다시 보내기 · 고치기 · 버리기
 *   unknown 계정 표시가 없는 옛 줄 — 지금 계정의 기록으로 보이지 않는다(서버가 계정을 확인한다). 버리기만
 *   other   다른 계정이 담은 줄 — 수만 보인다. 보내기 · 고치기 · 버리기 없음(그 계정으로 로그인해야 한다)
 * 지금 계정을 모르면(로그아웃) 표시가 있는 줄은 모두 other 다.
 */
export function ownerGroupOf(row: { owner?: unknown }, me: string | null): 'mine' | 'unknown' | 'other' {
  const o = typeof row.owner === 'string' && row.owner.length > 0 ? row.owner : null;
  if (o == null) return 'unknown';
  return me != null && o === me ? 'mine' : 'other';
}

/** 이보다 오래 못 보낸 내 세트는 붙들리지 않았어도 사람에게 알린다(운동을 신호 없이 마치고 나간 경우) */
export const RECOVERY_STALE_MS = 6 * 60 * 60 * 1000;

export type RecoverySummary = {
  /** 내 줄 가운데 붙든 것 */
  mineHeld: number;
  /** 내 줄 가운데 붙들지 않았지만 오래 못 보낸 것 */
  mineStale: number;
  /** 내 줄 전체 */
  mine: number;
  /** 계정을 모르는 옛 줄 */
  unknown: number;
  /** 계정을 모르는 옛 줄 가운데 붙든 것 */
  unknownHeld: number;
  /** 다른 계정의 줄(수만) */
  other: number;
};

export function recoverySummary(rows: readonly { owner?: unknown; held?: unknown; recordedAt?: unknown }[], me: string | null, nowMs: number): RecoverySummary {
  const s: RecoverySummary = { mineHeld: 0, mineStale: 0, mine: 0, unknown: 0, unknownHeld: 0, other: 0 };
  for (const r of rows) {
    const g = ownerGroupOf(r, me);
    const held = !!r.held;
    if (g === 'other') s.other++;
    else if (g === 'unknown') {
      s.unknown++;
      if (held) s.unknownHeld++;
    } else {
      s.mine++;
      if (held) s.mineHeld++;
      else {
        const at = typeof r.recordedAt === 'string' ? Date.parse(r.recordedAt) : NaN;
        if (Number.isFinite(at) && nowMs - at > RECOVERY_STALE_MS) s.mineStale++;
      }
    }
  }
  return s;
}

/* ───────────────────── 고칠 수 있는 줄인가 ───────────────────── */

/** 이 앱이 아는 대기열 줄의 칸 — 그 밖의 칸이 있으면 앞으로 나올 판이 만든 줄이다(고치면 그 칸을 잃을 수 있다) */
const ROW_KEYS = new Set([
  'sessionId', 'exerciseId', 'setNo', 'weightKg', 'reps', 'holdSeconds', 'recordedAt', 'rir',
  'loadProtocol', 'load', 'loadResolver', 'variant', 'held', 'owner', 'heldUnder',
]);
const MASS_KEYS = new Set(['basis', 'apparatusFamily', 'setup', 'kg', 'parts']);
const onlyKeys = (o: Record<string, unknown>, allowed: Set<string>, extra: string[] = []) =>
  Object.keys(o).every((k) => allowed.has(k) || extra.includes(k));
const numOrNull = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v));

function massOk(m: unknown, withKind: boolean): boolean {
  if (!isObj(m) || !onlyKeys(m, MASS_KEYS, withKind ? ['kind'] : [])) return false;
  if (typeof m.basis !== 'string' || !(m.basis in BASIS_LABEL)) return false;
  if (!numOrNull(m.kg) || !(m.apparatusFamily === null || typeof m.apparatusFamily === 'string')) return false;
  if (!(m.setup === null || (isObj(m.setup) && onlyKeys(m.setup, new Set(['key', 'label'])) && typeof m.setup.key === 'string' && typeof m.setup.label === 'string')))
    return false;
  if (m.parts === null) return true;
  return (
    Array.isArray(m.parts) &&
    m.parts.every(
      (p) =>
        isObj(p) &&
        onlyKeys(p, new Set(['kg', 'count', 'side'])) &&
        typeof p.kg === 'number' &&
        numOrNull(p.count) &&
        (p.side === null || p.side === 'left' || p.side === 'right')
    )
  );
}

function bandOk(b: unknown, withKind: boolean): boolean {
  if (!isObj(b) || !onlyKeys(b, new Set(['role', 'bands']), withKind ? ['kind'] : [])) return false;
  if (b.role !== 'resistance' && b.role !== 'assistance' && b.role !== 'unknown') return false;
  if (!Array.isArray(b.bands)) return false;
  return b.bands.every((x) => {
    if (!isObj(x)) return false;
    if ('custom' in x) {
      const c = x.custom;
      return (
        onlyKeys(x, new Set(['custom', 'unstandardized'])) &&
        x.unstandardized === true &&
        isObj(c) &&
        onlyKeys(c, new Set(['brand', 'series', 'level'])) &&
        typeof c.brand === 'string' &&
        typeof c.level === 'string' &&
        (c.series === null || typeof c.series === 'string')
      );
    }
    /* 이 앱의 카탈로그 판 · 아는 단계만 — 다른 판의 밴드는 이 앱이 다시 고르게 하면 원래 고름을 잃는다 */
    return (
      onlyKeys(x, new Set(['catalog', 'seriesId', 'levelId', 'label', 'swatch'])) &&
      x.catalog === BAND_CATALOG_REVISION &&
      typeof x.seriesId === 'string' &&
      typeof x.levelId === 'string' &&
      levelById(x.seriesId, x.levelId) != null
    );
  });
}

/**
 * 복구 화면의 [고치기]를 내놓아도 되는가. 이 앱이 모두 아는 줄만 — 다른(앞으로 나올) 약속 · 해석기 판, 다른 카탈로그 판의 밴드, 모르는 무게 모양,
 * 모르는 칸이 하나라도 있으면 고치지 않는다(고치는 칸이 그것을 다시 만들며 잃거나 옛 판으로 바꾼다). 그런 줄도 [다시 보내기]는 원래 값 그대로,
 * [버리기]는 확인을 받고 된다.
 */
export function recoveryEditOf(row: unknown): { editable: true } | { editable: false; reason: string } {
  const NEWER = '이 기록은 새 앱 버전에서 만들었어요. 앱을 업데이트한 뒤 고칠 수 있어요.';
  if (!isObj(row)) return { editable: false, reason: NEWER };
  if (!Object.keys(row).every((k) => ROW_KEYS.has(k))) return { editable: false, reason: NEWER };
  if (row.loadProtocol !== undefined && row.loadProtocol !== LOAD_PROTOCOL) return { editable: false, reason: NEWER };
  if (row.loadResolver !== undefined && row.loadResolver !== RESOLVER_VERSION) return { editable: false, reason: NEWER };
  if (!(row.variant === undefined || row.variant === null || row.variant === 'band' || row.variant === 'mass')) return { editable: false, reason: NEWER };
  if (!(row.rir === undefined || numOrNull(row.rir))) return { editable: false, reason: NEWER };
  const l = row.load;
  if (l === undefined || l === null) return { editable: true };
  if (!isObj(l)) return { editable: false, reason: NEWER };
  const ok =
    l.kind === 'none'
      ? onlyKeys(l, new Set(['kind']))
      : l.kind === 'mass'
        ? massOk(l, true)
        : l.kind === 'band'
          ? bandOk(l, true)
          : l.kind === 'combined'
            ? onlyKeys(l, new Set(['kind', 'mass', 'band'])) && (l.mass === null || massOk(l.mass, false)) && bandOk(l.band, false)
            : false;
  return ok ? { editable: true } : { editable: false, reason: NEWER };
}

export type RecoveryActions = {
  group: 'mine' | 'unknown' | 'other';
  /** 원래 값 그대로 다시 보내기(붙든 표만 푼다) */
  retry: boolean;
  /** 고치기 — 이 앱이 모두 아는 내 줄만 */
  correct: boolean;
  /** 이 기기에서 버리기(확인을 받은 뒤) */
  discard: boolean;
  /** '내 기록으로 확인하기'(판 번호만 묻는 읽기) — 계정을 모르는 줄만 */
  confirmOwner: boolean;
  /** 고치기를 내놓지 않는 까닭(내 줄인데 새 판일 때) */
  readOnlyReason: string | null;
};

/**
 * 줄마다 내놓을 동작 — 웹 · 앱 복구 화면이 같은 판단을 쓴다. 다른 계정의 줄은 아무것도 없다(수만). 계정을 모르는 줄은 확인하기 · 버리기만.
 * 내 줄은 다시 보내기 · 버리기, 고치기는 recoveryEditOf 가 허락할 때만. me 는 지금(살아 있는) 계정 — 모르면 아무것도 내놓지 않는다.
 */
export function recoveryActionsOf(row: { owner?: unknown } & Record<string, unknown>, me: string | null): RecoveryActions {
  const group = ownerGroupOf(row, me);
  const none = { retry: false, correct: false, discard: false, confirmOwner: false, readOnlyReason: null };
  if (me == null || group === 'other') return { group, ...none };
  if (group === 'unknown') return { group, ...none, discard: true, confirmOwner: true };
  const e = recoveryEditOf(row);
  return { group, retry: true, correct: e.editable, discard: true, confirmOwner: false, readOnlyReason: e.editable ? null : e.reason };
}
