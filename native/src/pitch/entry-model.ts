import { readEffort, snapEffortPct, effortScaleText } from '@/lib/pitch-effort';
import { MAX_EFFORT_PCT, MIN_EFFORT_PCT } from '@/lib/pitch-stats';
import { isRatedSession } from '@/lib/pitch-satisfaction';
import { SESSION_TYPES, isRestSession } from '@/lib/session-type';
import { fromSpeed, round1, toSpeed, type SpeedUnit } from '@/lib/units';
import { summarize, type LogPrefill, type VelocitySessionView } from '@/lib/velocity-meta';
import type { PitchEntry, PitchLog, VelocityLink } from './api';

/**
 * 투구 기록 '퀵 스텝' 입력의 규칙 — 순수(시험: scripts/native-pitch-entry-selftest.mts). 화면(pitch/quick-step.tsx)은 이 값을 들고 그리기만 한다.
 * 2026-10-29 김민 확정: 투구 종류 → 투구 수 → 팔의 피로, 마지막 단계에서 영상 · 느낀 점 · 구속은 고를 때만.
 *
 * 저장 칸은 그대로다(app/api/pitch-log). 팔의 피로 7 = effortPct 70 — 변환 · 옛 기록 호환은 lib/pitch-effort.ts 를 그대로 쓴다.
 * 서버 검사(1~500구 · 30~200km/h · 평균 ≤ 최고)도 그대로 두고, 여기서는 저장 전에 같은 규칙으로 먼저 알린다.
 */

/** 입력 단계 — 0 종류 · 1 투구 수 · 2 팔의 피로(마지막, 선택 기록이 붙는다) */
export type Step = 0 | 1 | 2;
export const STEPS: readonly { step: Step; label: string }[] = [
  { step: 0, label: '종류' },
  { step: 1, label: '투구 수' },
  { step: 2, label: '팔의 피로' },
];

/** 휴식이 아닌 고를 수 있는 투구 종류 — 저장 글자는 lib/session-type.ts 그대로 */
export const THROW_TYPES: readonly string[] = SESSION_TYPES.filter((t) => !isRestSession(t.name)).map((t) => t.name);
export const REST = SESSION_TYPES.find((t) => isRestSession(t.name))!.name;

/** 서버와 같은 한도(app/api/pitch-log MAX_PITCH_COUNT · MIN/MAX_VELOCITY) */
export const MAX_PITCH_COUNT = 500;
export const MIN_KMH = 30;
export const MAX_KMH = 200;
export const MAX_VIDEOS = 2;

/* ------------------------------------------------------------------ *
 * 구속 칸 — 저장은 km/h. 화면 단위를 오가도 값이 반올림으로 변하지 않게 원래 km/h 를 쥐고 있다.
 * typed 가 있으면 사용자가 그 단위로 친 글자(아직 km/h 로 바꾸지 않음), 없으면 kmh 를 지금 단위로 그린다.
 * ------------------------------------------------------------------ */
export type SpeedOrigin = 'none' | 'record' | 'measured' | 'typed';
export type SpeedField = { kmh: number | null; typed: string | null; typedUnit: SpeedUnit; origin: SpeedOrigin };

export const speedOf = (kmh: number | null | undefined, origin: SpeedOrigin, unit: SpeedUnit): SpeedField =>
  kmh == null ? { kmh: null, typed: null, typedUnit: unit, origin: 'none' } : { kmh, typed: null, typedUnit: unit, origin };

/** 엄격한 소수 — '30.5abc' · '1e2' · '.5' 를 숫자로 보지 않는다(parseFloat 는 30.5 로 읽었다) */
const DECIMAL = /^\d{1,3}(\.\d{1,2})?$/;
const parseDecimal = (s: string): number | null => (DECIMAL.test(s.trim()) ? Number(s.trim()) : null);

export function speedText(f: SpeedField, unit: SpeedUnit): string {
  if (f.typed != null) return f.typed;
  return f.kmh == null ? '' : String(round1(toSpeed(f.kmh, unit)));
}

export function typeSpeed(text: string, unit: SpeedUnit): SpeedField {
  return text.trim() === '' ? { kmh: null, typed: null, typedUnit: unit, origin: 'none' } : { kmh: null, typed: text, typedUnit: unit, origin: 'typed' };
}

/** 단위를 바꿀 때 — 친 글자가 숫자면 그 단위로 km/h 를 잡아 두고(반올림 없이) 글자는 놓는다. 숫자가 아니면 글자 그대로(고치게) */
export function switchSpeedUnit(f: SpeedField, next: SpeedUnit): SpeedField {
  if (f.typed == null) return { ...f, typedUnit: next };
  const n = parseDecimal(f.typed);
  if (n == null) return { ...f, typedUnit: next };
  return { kmh: fromSpeed(n, f.typedUnit), typed: null, typedUnit: next, origin: 'typed' };
}

/** 저장할 km/h — 손대지 않은 값은 받은 그대로, 친 값은 소수 한 자리. 칸이 틀렸으면 error */
export function speedValue(f: SpeedField): { kmh: number | null } | { error: 'format' | 'range' } {
  if (f.typed == null) {
    if (f.kmh == null) return { kmh: null };
    /* 친 뒤 단위를 바꾼 값은 소수 한 자리로(친 값과 같은 규칙), 받은 값(기록 · 측정)은 그대로 */
    const v = f.origin === 'typed' ? round1(f.kmh) : f.kmh;
    return v < MIN_KMH || v > MAX_KMH ? { error: 'range' } : { kmh: v };
  }
  const n = parseDecimal(f.typed);
  if (n == null) return { error: 'format' };
  const kmh = round1(fromSpeed(n, f.typedUnit));
  return kmh < MIN_KMH || kmh > MAX_KMH ? { error: 'range' } : { kmh };
}

/* ------------------------------------------------------------------ *
 * 투구 수 — 글자 그대로 쥐고(빈칸 = 안 적음), 저장 때 정수 1~500 만 받는다.
 * ------------------------------------------------------------------ */
export function countError(text: string): string | null {
  const t = text.trim();
  if (t === '') return '투구 수를 적어 주세요.';
  if (/^\d+\.\d*$/.test(t)) return '투구 수는 소수점 없이 적어 주세요.';
  if (!/^\d+$/.test(t)) return '투구 수는 숫자만 적어 주세요.';
  const n = Number(t);
  if (n < 1) return '1구 이상 적어 주세요. 안 던졌으면 ‘던지지 않았어요’를 눌러 주세요.';
  if (n > MAX_PITCH_COUNT) return `${MAX_PITCH_COUNT}구를 넘었어요. 다시 확인해 주세요. 나눠 던졌다면 따로 남겨 주세요.`;
  return null;
}

/** −/＋ · +5/+10 — 빈칸은 0 에서 시작, 숫자가 아닌 글자가 있으면 바꾸지 않는다(고치게). 1 밑으로는 안 내린다. 500 을 넘기면 그대로 두고 오류로 알린다 */
export function bumpCount(text: string, delta: number): string {
  const t = text.trim();
  if (t !== '' && !/^\d+$/.test(t)) return text;
  const base = t === '' ? 0 : Number(t);
  if (delta < 0 && base <= 1) return t === '' ? '' : String(base);
  return String(Math.max(1, base + delta));
}

/* ------------------------------------------------------------------ *
 * 팔의 피로 — 화면 1~10, 저장 %(× 10). 옛 기록의 85% · 5% 같은 값은 칸에 없어도 그대로 보이고 지킨다.
 * ------------------------------------------------------------------ */
export const FATIGUE_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const FATIGUE_QUESTION = '던진 뒤 팔이 얼마나 지쳤나요?';
/** 기준 창의 다섯 범위 — lib/pitch-effort.ts PITCH_EFFORT_LEVELS 와 같은 뜻 */
export function fatigueWord(scale: number): string {
  const v = Math.round(scale);
  if (v <= 2) return '거의 부담 없음';
  if (v <= 4) return '가벼운 피로';
  if (v <= 6) return '적당한 부하';
  if (v <= 8) return '꽤 지침';
  return '다 씀';
}
export const fatigueLabel = (pct: number) => `${effortScaleText(pct)}/10 · ${fatigueWord(pct / 10)}`;
/** 고를 수 있는 값인가(5~100) — 측정 세션 · 드릴에서 온 % 를 그대로 쓸지 */
export const validEffortPct = (pct: unknown): pct is number =>
  typeof pct === 'number' && Number.isFinite(pct) && pct >= MIN_EFFORT_PCT && pct <= MAX_EFFORT_PCT;

/* ------------------------------------------------------------------ *
 * 입력의 출처 — 새로 · 고치기 · 구속 측정 · 드릴 · 지난 영상 가져오기
 * ------------------------------------------------------------------ */
export type MeasuredSource = {
  sessionIds: string[];
  sessionType: string | null;
  /** 측정한 공(잰 공) 수 — 전체 투구 수와 따로 쥔다 */
  measured: number;
  /** 최고 · 평균을 셈한 공 수(믿기 어려운 공을 뺀 수, 다 빠지면 전부 — lib/velocity-meta.ts summarize) */
  sample: number;
  /** 공을 봤는데 못 잰 시도 — 서버가 센 값만(없으면 0) */
  missed: number;
  maxKmh: number;
  avgKmh: number;
  effortPct: number | null;
  /** 세션마다 한 줄(측정 내역 보기) */
  sessions: { id: string; createdAt: string; n: number; max: number | null; avg: number | null }[];
};

/**
 * 서버가 그 날 · 그 계정으로 확인해 준 측정(app.loadAppVelocityDay — prefill 은 아직 기록에 안 이은 세션만)으로 출처를 만든다.
 * 최고 · 평균 · 공 수는 서버의 logPrefillOf 값 그대로(다시 셈하지 않는다). sample 은 그 평균에 쓴 공 수(summarize 의 제외 규칙).
 */
export function measuredFrom(prefill: LogPrefill, sessions: readonly VelocitySessionView[]): MeasuredSource {
  const mine = sessions.filter((s) => prefill.sessionIds.includes(s.id));
  const pitches = mine.flatMap((s) => s.pitches);
  /* 화면이 받는 공(VelocityPitchView)에는 제외 표시가 없을 수 있다 — 있으면 summarize 처럼 빼고 센다 */
  const sure = pitches.filter((p) => !(p as { excluded?: boolean }).excluded).length;
  return {
    sessionIds: prefill.sessionIds,
    sessionType: prefill.sessionType,
    measured: prefill.pitchCount,
    sample: sure || pitches.length || prefill.pitchCount,
    missed: prefill.missed ?? 0,
    maxKmh: prefill.maxVelocity,
    avgKmh: prefill.avgVelocity,
    effortPct: prefill.effortPct,
    sessions: mine.map((s) => {
      const sum = summarize(s.pitches);
      return { id: s.id, createdAt: s.createdAt, n: s.pitches.length, max: sum?.max ?? null, avg: sum?.avg ?? null };
    }),
  };
}

export type EntrySource =
  | { kind: 'new' }
  | { kind: 'edit'; log: PitchLog }
  | { kind: 'measured'; m: MeasuredSource }
  | { kind: 'drill'; throws: number; effortPct: number | null }
  | { kind: 'import'; paths: string[]; importKey?: string };

export type EntryForm = {
  type: string;
  count: string;
  effortPct: number | null;
  max: SpeedField;
  avg: SpeedField;
  memo: string;
  satisfaction: number | null;
  good: string[];
  bad: string[];
};

/** 처음 값 — 새 기록은 종류 · 공 수 · 피로를 비워 둔다(예시 값을 채우지 않는다) */
export function initialForm(source: EntrySource, unit: SpeedUnit): EntryForm {
  const blank: EntryForm = {
    type: '',
    count: '',
    effortPct: null,
    max: speedOf(null, 'none', unit),
    avg: speedOf(null, 'none', unit),
    memo: '',
    satisfaction: null,
    good: [],
    bad: [],
  };
  switch (source.kind) {
    case 'edit': {
      const l = source.log;
      const rest = isRestSession(l.sessionType);
      return {
        type: l.sessionType,
        count: rest ? '' : String(l.pitchCount),
        effortPct: rest ? null : (readEffort({ intensity: l.intensity ?? 0, effortPct: l.effortPct })?.pct ?? null),
        max: speedOf(l.maxVelocity, 'record', unit),
        avg: speedOf(l.avgVelocity, 'record', unit),
        memo: l.memo ?? '',
        satisfaction: l.satisfaction ?? null,
        good: [...(l.cuesGood ?? [])],
        bad: [...(l.cuesBad ?? [])],
      };
    }
    case 'measured': {
      const m = source.m;
      return {
        ...blank,
        /* 종류가 없으면 비워 두고 고르게 한다(불펜을 미리 고르지 않는다) */
        type: m.sessionType && THROW_TYPES.includes(m.sessionType) ? m.sessionType : '',
        count: m.measured > 0 ? String(m.measured) : '',
        effortPct: validEffortPct(m.effortPct) ? m.effortPct : null,
        max: speedOf(m.maxKmh, 'measured', unit),
        avg: speedOf(m.avgKmh, 'measured', unit),
      };
    }
    case 'drill':
      /* 웹 drillPrefill 과 같은 값 — 캐치볼 · 공 수 · 강도(없으면 6) · 메모 */
      return {
        ...blank,
        type: '캐치볼',
        count: String(source.throws),
        effortPct: snapEffortPct(validEffortPct(source.effortPct) ? source.effortPct : 60),
        memo: `메카닉 드릴 ${source.throws}회`,
      };
    default:
      return blank;
  }
}

/** 처음 보일 단계 — 고치기는 마지막(한눈에 보고 고친다), 측정에서 종류가 왔으면 투구 수 확인부터 */
export function firstStep(source: EntrySource, form: EntryForm): Step {
  if (source.kind === 'edit') return 2;
  if ((source.kind === 'measured' || source.kind === 'drill') && form.type) return 1;
  return 0;
}

/** 단계를 다 채웠는가(위 단계 표시의 체크) */
export function stepDone(form: EntryForm, step: Step): boolean {
  if (step === 0) return form.type !== '';
  if (step === 1) return countError(form.count) == null;
  return form.effortPct != null;
}

export type Problem = { step: Step | 'extra'; field: 'type' | 'count' | 'effort' | 'speed' | 'video'; message: string };

/** 한 단계의 검사 — '다음'이 부른다 */
export function stepProblem(form: EntryForm, step: Step): Problem | null {
  if (step === 0 && !form.type) return { step: 0, field: 'type', message: '투구 종류를 골라 주세요.' };
  if (step === 1) {
    const e = countError(form.count);
    if (e) return { step: 1, field: 'count', message: e };
  }
  if (step === 2 && form.effortPct == null) return { step: 2, field: 'effort', message: '팔의 피로를 골라 주세요.' };
  return null;
}

/** 구속 칸 검사 — 선택 입력이어도 틀린 값을 그냥 버리지 않는다 */
export function speedProblem(form: EntryForm, unit: SpeedUnit, unitLabel: string): Problem | null {
  const max = speedValue(form.max);
  const avg = speedValue(form.avg);
  for (const [label, v] of [
    ['최고 구속', max],
    ['평균 구속', avg],
  ] as const) {
    if ('error' in v) {
      const lo = Math.round(toSpeed(MIN_KMH, unit));
      const hi = Math.round(toSpeed(MAX_KMH, unit));
      return {
        step: 'extra',
        field: 'speed',
        message: v.error === 'format' ? `${label}는 숫자로 적어 주세요.` : `${label}는 ${lo}~${hi}${unitLabel} 사이로 적어 주세요.`,
      };
    }
  }
  if ('kmh' in max && 'kmh' in avg && max.kmh != null && avg.kmh != null && avg.kmh > max.kmh) {
    return { step: 'extra', field: 'speed', message: '평균 구속이 최고 구속보다 클 수 없어요.' };
  }
  return null;
}

/** 저장 전 모든 검사 — 처음 걸린 것 하나(그 단계로 데려간다) */
export function saveProblem(form: EntryForm, unit: SpeedUnit, unitLabel: string): Problem | null {
  if (!form.type) return stepProblem(form, 0);
  if (isRestSession(form.type)) return null;
  return stepProblem(form, 1) ?? stepProblem(form, 2) ?? speedProblem(form, unit, unitLabel);
}

/** 감각 칩 — 한쪽에 켜면 다른 쪽에서 뺀다(같은 감각이 좋았던 것 · 아쉬웠던 것에 같이 남지 않게) */
export function toggleCue(form: EntryForm, cue: string, side: 'good' | 'bad'): Pick<EntryForm, 'good' | 'bad'> {
  const mine = side === 'good' ? form.good : form.bad;
  const other = side === 'good' ? form.bad : form.good;
  const nextMine = mine.includes(cue) ? mine.filter((x) => x !== cue) : [...mine, cue];
  const nextOther = other.filter((x) => x !== cue);
  return side === 'good' ? { good: nextMine, bad: nextOther } : { good: nextOther, bad: nextMine };
}

/** 휴식으로 바꿀 때 없어지는 것 — 있으면 묻는다 */
export function restLoses(form: EntryForm): string[] {
  const out: string[] = [];
  if (form.count.trim()) out.push('투구 수');
  if (form.effortPct != null) out.push('팔의 피로');
  if (form.max.kmh != null || form.avg.kmh != null || form.max.typed || form.avg.typed) out.push('구속');
  if (form.satisfaction != null || form.good.length || form.bad.length) out.push('만족도 · 감각');
  return out;
}

/**
 * 저장할 몸 — 서버(app/api/pitch-log)가 받는 꼴 그대로. 검사(saveProblem)를 먼저 통과한 폼만 넘긴다.
 * - 휴식: 공 수 0 · 강도 없음 · 구속 없음(서버도 그렇게 못박는다). 붙어 있던 영상은 지우지 않고 그대로 보낸다.
 * - 옛 기록(1~10 만 있음)의 강도를 손대지 않았으면 옛 1~10 을 보낸다 — 서버가 % 칸을 비운 채 둔다(웹 entry-form 과 같다).
 * - 만족도 · 감각은 불펜 · 라이브 · 경기만(안 보내면 서버가 비운다 — 캐치볼 · 휴식).
 * - 측정 세션은 새 기록 · 투구일 때만 잇는다.
 */
export function buildEntry(
  form: EntryForm,
  ctx: { date: string; source: EntrySource; videoPaths: string[] }
): PitchEntry {
  const rest = isRestSession(form.type);
  const sp = (f: SpeedField) => {
    const v = speedValue(f);
    return 'kmh' in v ? v.kmh : null;
  };
  const entry: PitchEntry = {
    date: ctx.date,
    sessionType: form.type,
    pitchCount: rest ? 0 : Number(form.count.trim()),
    effortPct: rest ? null : form.effortPct,
    maxVelocity: rest ? null : sp(form.max),
    avgVelocity: rest ? null : sp(form.avg),
    memo: form.memo,
    videoPaths: ctx.videoPaths,
    ...(isRatedSession(form.type) ? { satisfaction: form.satisfaction, cuesGood: form.good, cuesBad: form.bad } : {}),
  };
  if (ctx.source.kind === 'edit') {
    const log = ctx.source.log;
    const initial = readEffort({ intensity: log.intensity ?? 0, effortPct: log.effortPct });
    if (!rest && initial?.derivedFrom != null && form.effortPct === initial.pct) {
      delete entry.effortPct;
      entry.intensity = initial.derivedFrom;
    }
    entry.baseVideoPaths = log.videoPaths;
  }
  if (ctx.source.kind === 'measured' && !rest) entry.velocitySessionIds = ctx.source.m.sessionIds;
  return entry;
}

/** 저장 단추 위 한 줄 — '불펜 · 30구 · 팔의 피로 7/10' */
export function summaryLine(form: EntryForm): string | null {
  if (!form.type || isRestSession(form.type)) return null;
  const parts = [form.type];
  if (countError(form.count) == null) parts.push(`${Number(form.count)}구`);
  if (form.effortPct != null) parts.push(`팔의 피로 ${effortScaleText(form.effortPct)}/10`);
  return parts.join(' · ');
}

/** 빈 폼과 다른가 — 닫을 때 버릴지 물을지 */
export function isDirty(form: EntryForm, start: EntryForm, videosChanged: boolean): boolean {
  return videosChanged || JSON.stringify(form) !== JSON.stringify(start);
}

/* ------------------------------------------------------------------ *
 * 저장 여부를 모를 때(답을 못 받음) — 그 달을 다시 읽어 방금 보낸 기록이 생겼는지 본다.
 * 새 기록은 '보내기 전에 없던 id' 중 값이 같은 것. 고치기는 그 id 의 값이 보낸 것과 같은지.
 * ------------------------------------------------------------------ */
const sameNum = (a: number | null | undefined, b: number | null | undefined) =>
  (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 0.05);
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function matchesEntry(log: PitchLog, e: PitchEntry): boolean {
  return (
    log.date.slice(0, 10) === e.date &&
    log.sessionType === e.sessionType &&
    log.pitchCount === e.pitchCount &&
    (e.effortPct !== undefined ? sameNum(log.effortPct, e.effortPct) : e.intensity === undefined || sameNum(log.intensity, e.intensity)) &&
    (e.satisfaction === undefined || sameNum(log.satisfaction, e.satisfaction)) &&
    (e.cuesGood === undefined || sameList(log.cuesGood, e.cuesGood)) &&
    (e.cuesBad === undefined || sameList(log.cuesBad, e.cuesBad)) &&
    (log.memo ?? '') === e.memo.trim() &&
    sameNum(log.maxVelocity, e.maxVelocity) &&
    sameNum(log.avgVelocity, e.avgVelocity) &&
    sameList(log.videoPaths, e.videoPaths)
  );
}

export function findCreated(logs: readonly PitchLog[], e: PitchEntry, knownIds: ReadonlySet<string>): PitchLog | null {
  return logs.find((l) => !knownIds.has(l.id) && matchesEntry(l, e)) ?? null;
}

/* ------------------------------------------------------------------ *
 * 측정 연결 — 기록 저장과 따로 본다(서버는 연결을 못 해도 기록은 저장했다고 답한다).
 * ------------------------------------------------------------------ */
export type LinkResult = VelocityLink;
export type LinkStatus = 'none' | 'linked' | 'partial' | 'unknown';

export function linkStatus(r: LinkResult | null, requested: readonly string[]): LinkStatus {
  if (!requested.length) return 'none';
  if (!r) return 'unknown';
  return requested.every((id) => r.linked.includes(id)) ? 'linked' : 'partial';
}

/** 다시 해 볼 만한가 — 다른 기록에 이미 이어졌거나 없는 세션은 다시 해도 안 된다 */
export const retryableLink = (r: LinkResult) => r.failed.some((f) => f.reason === 'error');

/* ------------------------------------------------------------------ *
 * 초안 — 계정 · 날짜 · 기록마다. 영상은 담지 않는다(다시 넣어야 한다).
 * ------------------------------------------------------------------ */
export const DRAFT_DAYS = 7;
export type DraftBody = { v: 2; owner: string; date: string; recordId: string | null; savedAt: number; step: Step; form: EntryForm };

export const draftKey = (owner: string, date: string, recordId: string | null) => `pitch-draft:v2:${owner}:${date}:${recordId ?? 'new'}`;

export function readDraftBody(raw: unknown, want: { owner: string; date: string; recordId: string | null }, now: number): DraftBody | null {
  const d = raw as Partial<DraftBody> | null;
  if (!d || d.v !== 2 || typeof d.savedAt !== 'number' || !d.form || typeof d.form.type !== 'string') return null;
  /* 계정 · 날짜 · 기록이 다르면 쓰지 않는다 — 열쇠에도 들어 있지만 값으로 한 번 더 본다 */
  if (d.owner !== want.owner || d.date !== want.date || (d.recordId ?? null) !== want.recordId) return null;
  if (now - d.savedAt > DRAFT_DAYS * 24 * 3600 * 1000) return null;
  const f = d.form;
  const okSpeed = (s: unknown): s is SpeedField =>
    !!s && typeof s === 'object' && ('kmh' in s) && ('typed' in s) && ('typedUnit' in s) && ('origin' in s);
  if (typeof f.count !== 'string' || typeof f.memo !== 'string' || !okSpeed(f.max) || !okSpeed(f.avg)) return null;
  if (!Array.isArray(f.good) || !Array.isArray(f.bad)) return null;
  const step = d.step === 0 || d.step === 1 || d.step === 2 ? d.step : 0;
  return { v: 2, owner: d.owner, date: d.date, recordId: d.recordId ?? null, savedAt: d.savedAt, step, form: f as EntryForm };
}
