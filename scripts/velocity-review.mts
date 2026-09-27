/**
 * 구속 측정 자료 되짚기 — 저장된 세션 · 공 · 스피드건 짝을 뽑아 엔진을 다시 맞추는 데 쓴다.
 *
 *   npm run velocity:review                       — 최근 60일, 한국어 표
 *   npm run velocity:review -- --days=365         — 최근 N일
 *   npm run velocity:review -- --user=1a2b3c4d    — 그 사람(id 앞 8자)만
 *   npm run velocity:review -- --json             — 끝에 JSON 하나만(Claude 가 읽기 좋게)
 *   npm run velocity:review -- --download=./clips — 영상 클립까지 내려받기(Supabase 서비스 키 필요)
 *
 * 읽기 전용이다 — DB 에 아무것도 쓰거나 지우지 않는다.
 *
 * 관리자가 '정확도 보정용 저장'을 켜고 재면 공마다 영상 클립(clipPath)과 엔진이 본 자료(analysis:
 * 궤적 · 분석 해상도 · 초점거리 · 흔들림)가 남는다. 여기서는 그 자료로
 *   ① 전체 · ② 날짜별 · ③ 설정별 · ④ 사람별 오차(카메라 − 스피드건)
 *   ⑤ 보정식(raw → 건, 릴리스 → 건)
 *   ⑥ 렌즈 — 세션에 박힌 초점거리와 화각으로 구한 초점거리의 비율
 *   ⑦ 재맞춤 실험 — 궤적을 초점거리 배율 k 로 다시 재서 편향이 0 이 되는 k 를 찾는다
 *   ⑧ 클립 목록
 * 을 찍는다. 별칭(@/) import 를 못 쓰는 스크립트라 엔진은 상대 경로로 부른다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  measureVelocity,
  type Approach,
  type MeasureResult,
} from '../lib/velocity-engine/measure.ts';
import {
  DRAG_K_PER_M,
  focalPxFromFov,
  type BallObservation,
} from '../lib/velocity-engine/geometry.ts';
import {
  fitCalibration,
  type CalFit,
  type CalPair,
} from '../lib/velocity-calibration.ts';

/* ───────── 옵션 ───────── */

const argOf = (name: string) =>
  process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=');

const DAYS = Math.max(1, Number(argOf('days') ?? 60) || 60);
const USER_PREFIX = argOf('user') ?? '';
const JSON_OUT = process.argv.includes('--json');
const DOWNLOAD_DIR = argOf('download') ?? '';

/** 재맞춤 실험에서 초점거리에 곱해 볼 배율 */
const K_STEPS = [0.94, 0.96, 0.98, 1.0, 1.02, 1.04, 1.06];

/** 클립을 둔 저장소 버킷(lib/storage.ts 의 VIDEO_BUCKET 과 같다 — 별칭 import 를 피해 적어 둔다) */
const VIDEO_BUCKET = 'pitch-videos';

/* ───────── 조용한 출력(--json 이면 표를 안 찍는다) ───────── */

const say = (...lines: string[]) => {
  if (!JSON_OUT) for (const l of lines) console.log(l);
};

/* ───────── 통계 도우미 ───────── */

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

type ErrStat = {
  n: number;
  /** 평균 오차(카메라 − 건, km/h). 양수면 카메라가 높게 잰다 */
  bias: number | null;
  /** 절대 오차의 90 백분위 */
  p90: number | null;
  /** 오차의 표준편차 */
  sd: number | null;
  /** 절대 오차 평균 */
  mae: number | null;
};

function errStat(errs: number[]): ErrStat {
  const n = errs.length;
  if (n === 0) return { n: 0, bias: null, p90: null, sd: null, mae: null };
  const bias = errs.reduce((s, e) => s + e, 0) / n;
  const sd =
    n > 1 ? Math.sqrt(errs.reduce((s, e) => s + (e - bias) ** 2, 0) / (n - 1)) : 0;
  const abs = errs.map((e) => Math.abs(e)).sort((a, b) => a - b);
  const p90 = abs[Math.min(n - 1, Math.ceil(n * 0.9) - 1)];
  const mae = abs.reduce((s, e) => s + e, 0) / n;
  return { n, bias: round2(bias), p90: round1(p90), sd: round2(sd), mae: round2(mae) };
}

const fmt = (n: number | null | undefined, digits = 1) =>
  n == null || Number.isNaN(n) ? '—' : n.toFixed(digits);
const signed = (n: number | null | undefined, digits = 1) =>
  n == null || Number.isNaN(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;

/* ───────── 한국어 표 ───────── */

/** 한글 · 한자는 두 칸 — 표 칸을 맞출 때 */
function width(s: string): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    w += c > 0x2e7f && c !== 0x3000 && !(c >= 0xff61 && c <= 0xff9f) ? 2 : 1;
  }
  return w;
}
const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - width(s)));

function table(headers: string[], rows: string[][]) {
  const all = [headers, ...rows];
  const widths = headers.map((_, i) => Math.max(...all.map((r) => width(r[i] ?? ''))));
  const line = (r: string[]) =>
    '  ' + r.map((c, i) => pad(c ?? '', widths[i])).join('  ');
  say(line(headers), '  ' + widths.map((w) => '─'.repeat(w)).join('  '));
  for (const r of rows) say(line(r));
}

const statRow = (label: string, s: ErrStat) => [
  label,
  String(s.n),
  signed(s.bias, 2),
  fmt(s.p90),
  fmt(s.sd, 2),
];
const STAT_HEAD = ['', '짝', '편향', 'p90', 'sd'];

/* ───────── 설정 규칙(lib/velocity-setup.ts 와 같다 — 별칭 import 를 피해 적어 둔다) ───────── */

/** 투구: 투수 뒤 = 멀어짐 · 포수 뒤 = 다가옴. 타구는 반대(타자 뒤에 있는 카메라에서 공이 멀어진다) */
function approachOf(mode: string, cameraPos: string): Approach {
  const behindPitcher = cameraPos !== 'behind-catcher';
  if (mode === 'hit') return behindPitcher ? 'approaching' : 'receding';
  return behindPitcher ? 'receding' : 'approaching';
}

const POS_KO: Record<string, string> = {
  'behind-pitcher': '투수 뒤',
  'behind-catcher': '포수 뒤',
};
const SRC_KO: Record<string, string> = { camera: '카메라', file: '영상 파일' };

/* ───────── analysis JSON(lib/velocity-analysis.ts 의 AnalysisJson) ───────── */

type AnalysisJson = {
  v: number;
  track: number[][];
  analyzeSize: { width: number; height: number };
  sourceSize: { width: number; height: number };
  fps: number | null;
  shakePx: number;
  focalPx: number;
  approach?: Approach;
};

function parseAnalysis(raw: unknown): AnalysisJson | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const size = (v: unknown) => {
    const o = v as { width?: unknown; height?: unknown } | null;
    return o &&
      typeof o.width === 'number' &&
      typeof o.height === 'number' &&
      o.width > 0
      ? { width: o.width, height: o.height }
      : null;
  };
  const analyzeSize = size(a.analyzeSize);
  const sourceSize = size(a.sourceSize);
  if (!Array.isArray(a.track) || !analyzeSize || !sourceSize) return null;
  if (typeof a.focalPx !== 'number' || !(a.focalPx > 0)) return null;
  const track = a.track.filter(
    (row): row is number[] =>
      Array.isArray(row) && row.length >= 4 && row.every((n) => typeof n === 'number')
  );
  if (track.length < 4) return null;
  return {
    v: typeof a.v === 'number' ? a.v : 1,
    track,
    analyzeSize,
    sourceSize,
    fps: typeof a.fps === 'number' ? a.fps : null,
    shakePx: typeof a.shakePx === 'number' ? a.shakePx : 0,
    focalPx: a.focalPx,
    approach:
      a.approach === 'approaching' || a.approach === 'receding'
        ? a.approach
        : undefined,
  };
}

/* ───────── DB 읽기 ───────── */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const since = new Date();
since.setUTCHours(0, 0, 0, 0);
since.setUTCDate(since.getUTCDate() - DAYS);

const sessions = await prisma.velocitySession.findMany({
  where: {
    date: { gte: since },
    ...(USER_PREFIX ? { userId: { startsWith: USER_PREFIX } } : {}),
  },
  orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  include: {
    pitches: { orderBy: { seq: 'asc' } },
    user: { select: { nickname: true } },
  },
});

type Session = (typeof sessions)[number];
type Pitch = Session['pitches'][number];

if (sessions.length === 0) {
  const msg = '아직 자료가 없어요 — 관리자 설정에서 정확도 보정용 저장을 켜고 재세요';
  if (JSON_OUT)
    console.log(
      JSON.stringify({
        days: DAYS,
        user: USER_PREFIX || null,
        empty: true,
        message: msg,
      })
    );
  else console.log(msg);
  await prisma.$disconnect();
  process.exit(0);
}

const dateKey = (d: Date) => d.toISOString().slice(0, 10);

/** 스피드건 짝 — 건 값이 있고 보정에서 빼지 않은 공 */
type PairRow = {
  session: Session;
  pitch: Pitch;
  gun: number;
  /** 릴리스 기준 오차(릴리스 추정이 없으면 보정값 기준) */
  errRelease: number;
  /** 카메라 원값 기준 오차 */
  errRaw: number;
};

const pairs: PairRow[] = [];
for (const s of sessions) {
  for (const p of s.pitches) {
    if (p.gunKmh == null || p.calibExclude) continue;
    pairs.push({
      session: s,
      pitch: p,
      gun: p.gunKmh,
      errRelease: (p.releaseKmh ?? p.kmh) - p.gunKmh,
      errRaw: p.rawKmh - p.gunKmh,
    });
  }
}

const allPitches = sessions.flatMap((s) => s.pitches);
const clips = allPitches.filter((p) => p.clipPath);

/* ───────── ① 전체 ───────── */

say(
  `구속 측정 되짚기 — 최근 ${DAYS}일(${dateKey(since)} 부터)${USER_PREFIX ? ` · 사용자 ${USER_PREFIX}…` : ''}`,
  ''
);

const total = {
  sessions: sessions.length,
  pitches: allPitches.length,
  pairs: pairs.length,
  clips: clips.length,
  withAnalysis: allPitches.filter((p) => parseAnalysis(p.analysis)).length,
  excluded: allPitches.filter((p) => p.calibExclude).length,
  release: errStat(pairs.map((r) => r.errRelease)),
  raw: errStat(pairs.map((r) => r.errRaw)),
};

say('① 전체');
say(
  `  세션 ${total.sessions} · 공 ${total.pitches} · 스피드건 짝 ${total.pairs}(뺀 공 ${total.excluded}) · 클립 ${total.clips} · 분석 자료 ${total.withAnalysis}`
);
table(STAT_HEAD, [
  statRow('릴리스 기준', total.release),
  statRow('원값(raw) 기준', total.raw),
]);
say('  (편향 = 카메라 − 스피드건, km/h. 양수면 카메라가 높게 잰다)', '');

/* ───────── ② 날짜별 ───────── */

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  return m;
}

type GroupStat = {
  key: string;
  sessions: number;
  pitches: number;
  release: ErrStat;
  raw: ErrStat;
};

function groupStats(keyOfSession: (s: Session) => string): GroupStat[] {
  const bySession = groupBy(sessions, keyOfSession);
  const byPair = groupBy(pairs, (r) => keyOfSession(r.session));
  return [...bySession.entries()].map(([key, ss]) => {
    const ps = byPair.get(key) ?? [];
    return {
      key,
      sessions: ss.length,
      pitches: ss.reduce((n, s) => n + s.pitches.length, 0),
      release: errStat(ps.map((r) => r.errRelease)),
      raw: errStat(ps.map((r) => r.errRaw)),
    };
  });
}

const groupTable = (title: string, label: string, groups: GroupStat[]) => {
  say(title);
  table(
    [label, '세션', '공', '짝', '편향(릴리스)', 'p90', 'sd', '편향(raw)'],
    groups.map((g) => [
      g.key,
      String(g.sessions),
      String(g.pitches),
      String(g.release.n),
      signed(g.release.bias, 2),
      fmt(g.release.p90),
      fmt(g.release.sd, 2),
      signed(g.raw.bias, 2),
    ])
  );
  say('');
};

const byDate = groupStats((s) => dateKey(s.date));
groupTable('② 날짜별', '날짜', byDate);

/* ───────── ③ 설정별 ───────── */

const setupKey = (s: Session) =>
  [
    POS_KO[s.cameraPos] ?? s.cameraPos,
    s.net ? '네트' : '네트 없음',
    SRC_KO[s.source] ?? s.source,
    s.device ?? '기기 모름',
  ].join(' · ');
const bySetup = groupStats(setupKey);
groupTable('③ 설정별(카메라 위치 × 네트 × 출처 × 기기)', '설정', bySetup);

/* ───────── ④ 사람별 ───────── */

const byUser = groupStats((s) => s.user.nickname);
groupTable('④ 사람별', '닉네임', byUser);

/* ───────── ⑤ 보정식 ───────── */

const rawPairs: CalPair[] = pairs.map((r) => ({
  measured: r.pitch.rawKmh,
  gun: r.gun,
}));
const releasePairs: CalPair[] = pairs.map((r) => ({
  measured: r.pitch.releaseKmh ?? r.pitch.kmh,
  gun: r.gun,
}));
const fitRaw = fitCalibration(rawPairs);
const fitRelease = fitCalibration(releasePairs);

const fitText = (f: CalFit) =>
  f.n === 0
    ? '짝 없음'
    : `건 ≈ ${f.scale} × 카메라 ${f.offset >= 0 ? '+' : '−'} ${Math.abs(f.offset)} (짝 ${f.n})`;

say('⑤ 보정식(fitCalibration)');
say(`  raw → 건      : ${fitText(fitRaw)}`);
say(`  릴리스 → 건   : ${fitText(fitRelease)}`);
say(
  '  (셋 미만이면 기울기 1 고정, 셋 이상이면 최소제곱 · 기울기 0.8~1.25 로 묶음)',
  ''
);

/* ───────── ⑥ 렌즈 ───────── */

type LensRow = {
  sessionId: string;
  date: string;
  nickname: string;
  device: string | null;
  fovDeg: number;
  focalPx: number | null;
  /** 화각으로 구한 초점거리(원본 긴 변 기준) */
  focalFromFov: number | null;
  /** focalPx ÷ focalFromFov — 1 에서 멀수록 화각 설정과 렌즈 보정이 다르다 */
  ratio: number | null;
  calibrated: boolean;
};

const lensRows: LensRow[] = sessions.map((s) => {
  const longSide = Math.max(s.frameW ?? 0, s.frameH ?? 0);
  const focalFromFov = longSide > 0 ? focalPxFromFov(longSide, s.fovDeg) : null;
  const ratio = s.focalPx != null && focalFromFov ? s.focalPx / focalFromFov : null;
  return {
    sessionId: s.id,
    date: dateKey(s.date),
    nickname: s.user.nickname,
    device: s.device,
    fovDeg: s.fovDeg,
    focalPx: s.focalPx,
    focalFromFov: focalFromFov ? Math.round(focalFromFov) : null,
    ratio: ratio != null ? round3(ratio) : null,
    calibrated: s.lensCal != null,
  };
});

const ratios = lensRows
  .map((r) => r.ratio)
  .filter((r): r is number => r != null)
  .sort((a, b) => a - b);
const median = (xs: number[]) =>
  xs.length === 0
    ? null
    : xs.length % 2
      ? xs[(xs.length - 1) / 2]
      : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
const lensSummary = {
  n: ratios.length,
  min: ratios.length ? ratios[0] : null,
  median: median(ratios),
  max: ratios.length ? ratios[ratios.length - 1] : null,
  uncalibrated: lensRows.filter((r) => !r.calibrated).length,
};

say('⑥ 렌즈 — 세션 초점거리 ÷ 화각으로 구한 초점거리');
if (lensSummary.n === 0)
  say(
    '  초점거리 · 프레임 크기가 남은 세션이 없어요(옛 세션이거나 카메라 정보를 못 받음)'
  );
else
  say(
    `  비율 ${lensSummary.n}건: 최소 ${fmt(lensSummary.min, 3)} · 중앙 ${fmt(lensSummary.median, 3)} · 최대 ${fmt(lensSummary.max, 3)} · 렌즈 보정 없이 잰 세션 ${lensSummary.uncalibrated}`
  );
table(
  ['날짜', '닉네임', '기기', '화각', 'focalPx', '화각→focal', '비율', '렌즈 보정'],
  lensRows.map((r) => [
    r.date,
    r.nickname,
    r.device ?? '—',
    `${r.fovDeg}°`,
    r.focalPx != null ? String(Math.round(r.focalPx)) : '—',
    r.focalFromFov != null ? String(r.focalFromFov) : '—',
    fmt(r.ratio, 3),
    r.calibrated ? '있음' : '없음(화각만)',
  ])
);
say('');

/* ───────── ⑦ 재맞춤 실험 ───────── */

type RefitRow = {
  pitchId: string;
  date: string;
  gun: number;
  /** k 별 릴리스 추정(km/h) — 거부면 사유 코드 */
  byK: Record<string, number | string>;
};

type KStat = {
  k: number;
  n: number;
  rejected: number;
  rejectCodes: Record<string, number>;
  bias: number | null;
  p90: number | null;
  sd: number | null;
};

const refitRows: RefitRow[] = [];
const kStats: KStat[] = K_STEPS.map((k) => ({
  k,
  n: 0,
  rejected: 0,
  rejectCodes: {},
  bias: null,
  p90: null,
  sd: null,
}));
const kErrs: number[][] = K_STEPS.map(() => []);

for (const row of pairs) {
  const a = parseAnalysis(row.pitch.analysis);
  if (!a) continue;
  const s = row.session;
  const scale = a.sourceSize.width / a.analyzeSize.width;
  const observations: BallObservation[] = a.track.map(([t, x, y, d]) => ({
    t,
    x: x * scale,
    y: y * scale,
    diameterPx: d * scale,
  }));
  const approach = a.approach ?? approachOf(s.mode, s.cameraPos);
  const out: RefitRow = {
    pitchId: row.pitch.id,
    date: dateKey(s.date),
    gun: row.gun,
    byK: {},
  };

  K_STEPS.forEach((k, i) => {
    const result: MeasureResult = measureVelocity({
      observations,
      lens: {
        focalPx: a.focalPx * k,
        frameWidth: a.sourceSize.width,
        frameHeight: a.sourceSize.height,
      },
      stability: { maxBackgroundShiftPx: a.shakePx ?? 0 },
      approach,
    });
    const stat = kStats[i];
    if (!result.ok) {
      stat.rejected += 1;
      stat.rejectCodes[result.code] = (stat.rejectCodes[result.code] ?? 0) + 1;
      out.byK[String(k)] = result.code;
      return;
    }
    let est = result.detail.startKmh;
    /* 포수 뒤: 엔진의 첫 관측은 가장 먼 지점 — 거기서 릴리스 지점까지 공기저항만큼 되돌린다 */
    if (approach === 'approaching' && s.releaseDistM != null) {
      est *= Math.exp(
        DRAG_K_PER_M * Math.max(0, s.releaseDistM - result.detail.releaseDistanceM)
      );
    }
    est = round1(est);
    out.byK[String(k)] = est;
    kErrs[i].push(est - row.gun);
    stat.n += 1;
  });
  refitRows.push(out);
}

for (let i = 0; i < K_STEPS.length; i++) {
  const st = errStat(kErrs[i]);
  kStats[i].bias = st.bias;
  kStats[i].p90 = st.p90;
  kStats[i].sd = st.sd;
}

const base = kStats.find((k) => k.k === 1);
const best = kStats
  .filter((k) => k.bias != null && k.n > 0)
  .reduce<KStat | null>(
    (acc, k) => (acc == null || Math.abs(k.bias!) < Math.abs(acc.bias!) ? k : acc),
    null
  );

let suggestion: string | null = null;
if (best && base && base.bias != null && best.n > 0) {
  const pct = Math.round((best.k - 1) * 100);
  suggestion =
    pct === 0
      ? `지금 초점거리(k=1.00)가 편향 ${signed(base.bias, 1)} 로 가장 낫다 — 초점거리 말고 다른 곳(지름 재기 · 릴리스 거리)을 본다`
      : `초점거리를 ${Math.abs(pct)}% ${pct > 0 ? '올리면' : '내리면'} 편향 ${signed(base.bias, 1)} → ${signed(best.bias, 1)} (k=${best.k.toFixed(2)}, 짝 ${best.n})`;
}

say('⑦ 재맞춤 실험 — 궤적을 초점거리 × k 로 다시 잼(릴리스 추정 − 건)');
if (refitRows.length === 0)
  say('  분석 자료(analysis)와 스피드건 값이 같이 있는 공이 없어요');
else {
  say(`  공 ${refitRows.length}개`);
  table(
    ['k', '짝', '편향', 'p90', 'sd', '거부', '거부 사유'],
    kStats.map((k) => [
      k.k.toFixed(2),
      String(k.n),
      signed(k.bias, 2),
      fmt(k.p90),
      fmt(k.sd, 2),
      String(k.rejected),
      Object.entries(k.rejectCodes)
        .map(([c, n]) => `${c}×${n}`)
        .join(' ') || '—',
    ])
  );
  if (suggestion) say(`  → 제안: ${suggestion}`);
}
say('');

/* ───────── ⑧ 클립 목록(· 내려받기) ───────── */

type ClipRow = {
  pitchId: string;
  sessionId: string;
  date: string;
  nickname: string;
  seq: number;
  path: string;
  bytes: number | null;
  sec: number | null;
  eventSec: number | null;
  kmh: number;
  releaseKmh: number | null;
  gun: number | null;
  excluded: boolean;
  savedTo: string | null;
};

const clipRows: ClipRow[] = [];
for (const s of sessions) {
  for (const p of s.pitches) {
    if (!p.clipPath) continue;
    clipRows.push({
      pitchId: p.id,
      sessionId: s.id,
      date: dateKey(s.date),
      nickname: s.user.nickname,
      seq: p.seq,
      path: p.clipPath,
      bytes: p.clipBytes,
      sec: p.clipSec,
      eventSec: p.clipEventSec,
      kmh: p.kmh,
      releaseKmh: p.releaseKmh,
      gun: p.gunKmh,
      excluded: p.calibExclude,
      savedTo: null,
    });
  }
}

let downloadNote: string | null = null;
if (DOWNLOAD_DIR && clipRows.length > 0) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    downloadNote =
      '.env 에 SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 없어 클립은 내려받지 않았어요';
  } else {
    let createClient: ((u: string, k: string) => SupabaseLike) | null = null;
    try {
      const mod = (await import('@supabase/supabase-js')) as unknown as {
        createClient: (u: string, k: string) => SupabaseLike;
      };
      createClient = mod.createClient;
    } catch {
      downloadNote =
        '@supabase/supabase-js 를 못 불러왔어요 — `npm ls @supabase/supabase-js` 로 확인하고 `npm install` 뒤 다시 돌리세요. 클립은 건너뛰었어요';
    }
    if (createClient) {
      mkdirSync(DOWNLOAD_DIR, { recursive: true });
      const supabase = createClient(url, key);
      let ok = 0;
      let failed = 0;
      for (const c of clipRows) {
        try {
          const { data, error } = await supabase.storage
            .from(VIDEO_BUCKET)
            .createSignedUrl(c.path, 600);
          if (error || !data?.signedUrl)
            throw new Error(error?.message ?? '서명 URL 없음');
          const res = await fetch(data.signedUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = Buffer.from(await res.arrayBuffer());
          const file = join(DOWNLOAD_DIR, `${c.date}_${c.seq}_${basename(c.path)}`);
          writeFileSync(file, buf);
          c.savedTo = file;
          ok += 1;
        } catch (e) {
          failed += 1;
          say(
            `  클립 못 받음: ${c.path} — ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
      downloadNote = `클립 ${ok}개 내려받음${failed ? ` · 실패 ${failed}` : ''} → ${DOWNLOAD_DIR}`;
    }
  }
} else if (DOWNLOAD_DIR) {
  downloadNote = '내려받을 클립이 없어요';
}

say('⑧ 클립 목록');
if (clipRows.length === 0) say('  저장된 클립이 없어요');
else
  table(
    [
      '날짜',
      '닉네임',
      '#',
      '경로',
      '크기',
      '길이',
      '카메라',
      '릴리스',
      '건',
      '뺌',
      '공 id',
      ...(DOWNLOAD_DIR ? ['받은 파일'] : []),
    ],
    clipRows.map((c) => [
      c.date,
      c.nickname,
      String(c.seq),
      c.path,
      c.bytes != null ? `${(c.bytes / 1024 / 1024).toFixed(1)}MB` : '—',
      c.sec != null ? `${c.sec.toFixed(1)}s` : '—',
      fmt(c.kmh),
      fmt(c.releaseKmh),
      fmt(c.gun),
      c.excluded ? '뺌' : '',
      c.pitchId,
      ...(DOWNLOAD_DIR ? [c.savedTo ?? '—'] : []),
    ])
  );
if (downloadNote) say(`  ${downloadNote}`);
say('');

/* ───────── --json ───────── */

if (JSON_OUT) {
  const out = {
    days: DAYS,
    since: dateKey(since),
    user: USER_PREFIX || null,
    empty: false,
    total,
    byDate,
    bySetup,
    byUser,
    calibration: { rawToGun: fitRaw, releaseToGun: fitRelease },
    lens: { summary: lensSummary, sessions: lensRows },
    refit: { kSteps: K_STEPS, byK: kStats, suggestion, pitches: refitRows },
    clips: clipRows,
    downloadNote,
    sessions: sessions.map((s) => ({
      id: s.id,
      date: dateKey(s.date),
      nickname: s.user.nickname,
      fovDeg: s.fovDeg,
      focalPx: s.focalPx,
      frameW: s.frameW,
      frameH: s.frameH,
      releaseDistM: s.releaseDistM,
      calScale: s.calScale,
      calOffset: s.calOffset,
      calPairs: s.calPairs,
      source: s.source,
      mode: s.mode,
      cameraPos: s.cameraPos,
      net: s.net,
      device: s.device,
      forCalibration: s.forCalibration,
      autoMode: s.autoMode,
      lensCal: s.lensCal,
      pitches: s.pitches.map((p) => ({
        id: p.id,
        seq: p.seq,
        rawKmh: p.rawKmh,
        kmh: p.kmh,
        releaseKmh: p.releaseKmh,
        errorKmh: p.errorKmh,
        confidence: p.confidence,
        releaseDistM: p.releaseDistM,
        travelM: p.travelM,
        durationSec: p.durationSec,
        frames: p.frames,
        fps: p.fps,
        gunKmh: p.gunKmh,
        calibExclude: p.calibExclude,
        autoDetected: p.autoDetected,
        clipPath: p.clipPath,
        hasAnalysis: parseAnalysis(p.analysis) != null,
      })),
    })),
  };
  console.log(JSON.stringify(out));
}

await prisma.$disconnect();

/* ───────── 타입(supabase 클라이언트는 필요한 만큼만) ───────── */

type SupabaseLike = {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (
        path: string,
        expiresIn: number
      ) => Promise<{
        data: { signedUrl: string } | null;
        error: { message: string } | null;
      }>;
    };
  };
};
