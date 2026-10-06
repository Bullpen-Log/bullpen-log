/**
 * 구속 측정 정확도 시험대.
 *
 *   npm run velocity:accuracy            — 표를 찍는다
 *   npm run velocity:accuracy -- --json  — 숫자만(JSON) 찍는다(엔진을 고치기 전후 견줄 때)
 *   npm run velocity:accuracy -- --no-fallback — 대비 길(1.9.0) 없이(격자 시나리오가 대비 길 덕에 재지는지 볼 때)
 *
 * 진짜 구속을 아는 공을 프레임으로 **그려서**(가장자리 번짐 · 초점 흐림 · 모션 블러 · 센서 잡음 ·
 * 자동 노출 변화 · 배경 무늬 · 릴리스가 가운데서 벗어남 · 옆으로 흐름 · 공기저항) 엔진 전체
 * (배경 → 감지 → 추적 → 거리 → 맞춤 → 릴리스 추정)를 돌리고, 나온 값과 정답의 차이를 잰다.
 *
 * velocity-selftest 는 '관측(지름 · 시각)이 주어졌을 때 계산이 맞나'를 보고, velocity-detect-test 는
 * '규칙에 논리 오류가 없나'를 본다. 여기는 그 사이 — 실제 촬영에 가까운 그림에서 **얼마나** 틀리나를
 * 재서, 엔진을 고칠 때 좋아졌는지 나빠졌는지 숫자로 본다. 실제 스피드건 대조는 이걸로 대신 못 한다.
 *
 * 채점:
 *   avgErr  — 엔진의 구간 평균 구속 − 그 구간의 진짜 평균 구속(엔진이 쓴 거리 구간으로 계산)
 *   relErr  — 엔진의 릴리스 추정 − 진짜 릴리스 구속(v0)
 *   reject  — 숫자를 안 낸 비율
 */
import {
  analyzeFrames,
  type CapturedFrame,
} from '../lib/velocity-engine/analyze-frames.ts';
import { BALL_DIAMETER_M, focalPxFromFov } from '../lib/velocity-engine/geometry.ts';

const JSON_OUT = process.argv.includes('--json');
const SEEDS = Number(
  process.argv.find((a) => a.startsWith('--seeds='))?.split('=')[1] ?? 6
);
/** --only=글자 — 이름에 그 글자가 든 시나리오만(엔진을 고치며 빨리 돌려 볼 때) */
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1] ?? '';
/** --diag — 첫 씨앗에서 프레임마다 잰 지름 ÷ 진짜 지름을 크기 구간별로 찍는다(지름 치우침 찾기) */
const DIAG = process.argv.includes('--diag');
/** --no-fallback — 대비 길(1.9.0) 없이 1.8.x 처럼 두 길만(격자 시나리오가 실제로 대비 길 덕에 재지는지 볼 때) */
const NO_FALLBACK = process.argv.includes('--no-fallback');

/** 공기저항 — 감속 a = K v² (m/s², v 는 m/s). 야구공(C_d≈0.35, 145g, 지름 7.3cm)이면 K≈0.006/m */
const DRAG_K = 0.006;

type Scenario = {
  name: string;
  kmh: number;
  fps: number;
  /** 원본 해상도 — 가로 · 세로(세로 촬영이면 1080×1920) */
  source: { w: number; h: number };
  releaseM?: number;
  /** 릴리스가 가운데서 벗어난 정도(원본 픽셀) */
  offsetPx?: { x: number; y: number };
  /** 옆으로 흐르는 속도(m/s) — 카메라 축과 비행 방향의 각도 */
  lateralMps?: { x: number; y: number };
  /** 공 밝기(0~255) — 배경은 90~115 */
  ball?: number;
  /** 초점 흐림(분석 해상도 픽셀, 가우스 σ) */
  blur?: number;
  /** 노출 시간 동안의 번짐 — true 면 셔터 1/(2·fps) 로 옆 움직임을 평균 */
  motionBlur?: boolean;
  /** 센서 잡음 σ */
  noise?: number;
  /** 자동 노출 — 공이 나타난 뒤 프레임마다 배경이 이만큼 밝아진다(누적, 0~255) */
  exposureDrift?: number;
  /** 카메라 흔들림(분석 픽셀) — 프레임마다 배경을 이만큼 옮긴다 */
  shakePx?: number;
  /** 엔진이 가정하는 화각과 다른 실제 화각 — 렌즈 오차 */
  trueFovDeg?: number;
  approach?: 'receding' | 'approaching';
  /** 다가오는 공이 시작하는 거리(m) — 포수 뒤. 릴리스 거리로도 엔진에 준다 */
  startM?: number;
  /** 렌즈 보정을 한 경우 — 엔진에 실제 초점거리를 준다(화각 가정 대신) */
  calibrated?: boolean;
  /** 카메라 앞 흰 그물 — 실 굵기 · 코 간격(분석 픽셀) · 실 밝기. 공을 가린다(정지해 있어 배경에도 든다) */
  mesh?: { strand: number; pitch: number; luma: number };
  /** 배경 밝기(기본 90~120 회색) — 흰 망이 뒤에 있을 때는 220 쯤 */
  bgLevel?: number;
  /**
   * 밖 — 하늘(공 뒤가 공보다 밝을 수 있다). 하늘 밝기 = mid + slope × (화면 가운데 줄 − y)(분석 px, 위로 갈수록 밝다)에
   * 잔무늬 ±2(하늘은 매끈하다), 255 를 넘으면 포화(잡음 뒤에도 255 — 하얗게 날아간 하늘). horizonY 를 주면 그 줄(분석 y)
   * 밑은 땅(ground + 보통 배경 무늬). 투수 뒤 1.5m 높이에서 수평으로 찍으면 지평선이 화면 가운데에 오고, 공은 그 위
   * (하늘)에서 출발해 과녁(가운데 조금 밑)으로 간다 — 공이 날아가며 하늘과 땅에 걸친다.
   */
  sky?: { mid: number; slope?: number; horizonY?: number; ground?: number };
  /**
   * 공의 그늘 — 원판 위쪽이 이만큼 밝고 아래쪽이 이만큼 어둡다(세로로 곧게, 선형 빛이 아니라 부호값으로). 해가 위에서 비추면
   * 아래 반쪽이 그늘이다. 0 이면 예전 그림(고른 밝기) 그대로.
   */
  shade?: number;
  /**
   * 카메라처럼 담는다 — 공과 배경을 선형 빛에서 섞은 뒤 sRGB 로 눌러 담는다(실제 폰 영상 · 카메라가 그렇다:
   * 반쯤 덮인 테두리 화소가 부호값으로는 더 밝다). 끄면 예전 그림(부호값을 그대로 섞음 — 선형 카메라).
   */
  gamma?: boolean;
  /**
   * 노출 동안의 실제 움직임 — 셔터가 열린 동안(장면 간격 × shutter) 공의 화면 위치 · 크기를 7번 그려 평균한다(옆
   * 흐름뿐 아니라 소실점으로 모이는 움직임 · 멀어지며 작아짐 · 다가오며 커짐까지). 끄면 예전처럼 옆 흐름만(motionBlur).
   */
  exposure?: boolean;
  /** 셔터가 열린 비율(장면 간격 대비) — 실제 보정 영상에서 0.2~0.45(1차 조사 focal). 기본 0.35 */
  shutter?: number;
  /**
   * 흰 과녁 천 — 카메라에서 fromM 보다 먼 공이 지나가는 화면 자리(공 지름만큼 넓힘) 뒤 배경을 이 밝기로 칠한다.
   * 과녁을 겨눈 공은 끝에서 천 앞을 지난다(실제 보정 영상 eb05ae07 · e9ae8712).
   */
  brightTarget?: { level: number; fromM: number };
  /**
   * 실제 카메라의 윤곽 — 공의 선형 빛 50% 선(번진 계단의 가운데)을 참 실루엣보다 이만큼(원본 px) 안쪽에 그린다.
   * 실제 영상 13개(흰 천 없는 것)의 평균 단면(lab/core-d/profile.mts): 선형 빛에서 윤곽은 σ≈0.72(분석 px)의 대칭
   * 계단이고, 궤적 모양(공기저항 K)과 스피드건이 함께 가리킨 실루엣(부호값 α 0.3 선)은 그 가운데보다 분석 0.62px
   * (원본 0.93px) 바깥이었다. 원인은 모른다(감마는 방향이 반대 · 테두리 어두움은 단면에 없다 — 카메라의 영상 처리로
   * 본다). 이 그림의 작은 공은 실제보다 조금 작게 재져서(3×3 덮임 · 이상적인 원판), 가장자리 폭을 실제와 같게(1.40px,
   * blur 0.43) 맞춘 뒤 기본 60fps 세 시나리오가 치우치지 않는 값 0.7 을 쓴다(0.6 → −1.1~−3.1, 0.8 → +1.1~+1.6,
   * 0.93 → +3.0~+3.8km/h). 그래서 이 시나리오들이 치우치지 않는 것은 α 를 검증하지 않는다 — 속도 · fps · 먼 공 ·
   * 흰 천 · 초점 흐림 · 다가옴이 그 위에서 어떻게 움직이는지를 본다.
   */
  cameraEdgeSrcPx?: number;
  /**
   * 흔들리는 표적 그물 격자(밖, 2026-10-03) — pitch 간격의 그물코 점이 배경에 있고 장면마다 밝기가 0~amp 사이로 흔들린다.
   * 배경('둘째로 어두운 값')과 견주면 그물 전체가 '움직인 픽셀' 점 격자가 되어, 그물코 잇기(닫힘)가 공을 격자에 붙인다
   * — 1.8.1 은 공 후보를 잃고 '장면 부족'. 대비 길(1.9.0, 닫힘 0)이 잰다(result.fallback 'close').
   */
  grid?: { pitch: number; amp: number };
};

const LANDSCAPE = { w: 1920, h: 1080 };
const PORTRAIT = { w: 1080, h: 1920 };
const ENGINE_FOV = 69;

const SCENARIOS: Scenario[] = [
  { name: '기본 240fps 130km/h 세로', kmh: 130, fps: 240, source: PORTRAIT },
  { name: '기본 120fps 130km/h', kmh: 120, fps: 120, source: PORTRAIT },
  { name: '기본 60fps 130km/h', kmh: 130, fps: 60, source: PORTRAIT },
  { name: '느린 공 90km/h 120fps', kmh: 90, fps: 120, source: PORTRAIT },
  { name: '빠른 공 155km/h 240fps', kmh: 155, fps: 240, source: PORTRAIT },
  { name: '가로 1080p 240fps', kmh: 130, fps: 240, source: LANDSCAPE },
  {
    name: '릴리스 벗어남 200px · 옆으로 흐름',
    kmh: 130,
    fps: 240,
    source: PORTRAIT,
    offsetPx: { x: 160, y: -120 },
    lateralMps: { x: 1.5, y: -1.0 },
  },
  { name: '어두운 공(대비 낮음)', kmh: 130, fps: 240, source: PORTRAIT, ball: 165 },
  { name: '초점 흐림 σ1.5', kmh: 130, fps: 240, source: PORTRAIT, blur: 1.5 },
  {
    name: '모션 블러 + 옆 흐름',
    kmh: 130,
    fps: 120,
    source: PORTRAIT,
    motionBlur: true,
    lateralMps: { x: 2.5, y: 0.5 },
  },
  { name: '센서 잡음 σ6', kmh: 130, fps: 240, source: PORTRAIT, noise: 6 },
  {
    name: '자동 노출 변화(프레임당 +1.5)',
    kmh: 130,
    fps: 240,
    source: PORTRAIT,
    exposureDrift: 1.5,
  },
  { name: '멀리서 릴리스 2.2m', kmh: 130, fps: 240, source: PORTRAIT, releaseM: 2.2 },
  {
    name: '화각 오차(실제 63°, 가정 69°)',
    kmh: 130,
    fps: 240,
    source: PORTRAIT,
    trueFovDeg: 63,
  },
  {
    name: '화각 오차 63° + 렌즈 보정',
    kmh: 130,
    fps: 240,
    source: PORTRAIT,
    trueFovDeg: 63,
    calibrated: true,
  },
  {
    name: '포수 뒤(다가옴) 240fps',
    kmh: 130,
    fps: 240,
    source: PORTRAIT,
    approach: 'approaching',
    startM: 14,
  },
  {
    name: '흰 그물 앞(실 2px · 코 10px)',
    kmh: 130,
    fps: 240,
    source: PORTRAIT,
    mesh: { strand: 2, pitch: 10, luma: 225 },
  },
  {
    name: '흰 그물 앞 · 포수 뒤(다가옴)',
    kmh: 130,
    fps: 240,
    source: PORTRAIT,
    approach: 'approaching',
    startM: 14,
    mesh: { strand: 2, pitch: 10, luma: 225 },
  },
  {
    name: '흰 그물 앞 · 굵은 실 3px · 코 8px',
    kmh: 130,
    fps: 240,
    source: PORTRAIT,
    mesh: { strand: 3, pitch: 8, luma: 225 },
  },
  { name: '흰 배경(공 뒤가 흰 망 220)', kmh: 130, fps: 240, source: PORTRAIT, bgLevel: 220 },
  /* 밖 · 표적 그물 앞(1.9.0 대비 길) — 1.8.1 은 6/6 거부(장면 부족), 대비 길은 닫힘 0 으로 잰다 */
  { name: '흔들리는 그물 격자 앞(4px · ±60) 60fps', kmh: 130, fps: 60, source: PORTRAIT, grid: { pitch: 4, amp: 60 } },
  { name: '밝은 배경(공 뒤 190)', kmh: 130, fps: 240, source: PORTRAIT, bgLevel: 190 },
  {
    name: '모두 섞임(현실)',
    kmh: 135,
    fps: 240,
    source: PORTRAIT,
    offsetPx: { x: 80, y: -60 },
    lateralMps: { x: 1, y: -0.6 },
    ball: 200,
    blur: 0.8,
    motionBlur: true,
    noise: 3,
    exposureDrift: 0.5,
  },
  /*
   * ── 실제 카메라처럼 담은 공(2026-09-29, 모델 1.6.0) ──
   * 실제 보정 영상(아이폰 15 Pro Max 60fps 세로, 투수 뒤 2~3m, 어두운 실내)에 맞춘 그림: 선형 빛에서 섞어 sRGB 로
   * 담고(gamma), 셔터가 열린 동안의 진짜 움직임(소실점으로 모임 · 작아짐)으로 번지고(exposure), 윤곽은 실측한 카메라
   * 윤곽(cameraEdgeSrcPx — 설명은 타입)으로 그린다. 공은 옆에서 던져 과녁(20m, 카메라 축 근처)으로 날아간다(realThrow).
   * 주의(2차 검증 — 물리): 이 줄들은 **맞춘 모형**이다 — cameraEdgeSrcPx 0.7 은 기본 60fps 세 줄이 0 이 되게 고른 값이라,
   * 치우침이 없는 것은 윤곽 비율 · 절대 배율의 검증이 아니다. 그림에 없는 것: 1080 → 720 재표본, H.264, BT.601 가중의 색
   * 번짐, 시간 잡음 줄이기, 공의 그늘(조명). 그 위에서 속도 · fps · 먼 공 · 흰 천 · 흐림 · 다가옴이 어떻게 움직이나를 본다.
   */
  realThrow('실제 카메라 60fps 110km/h', 110, 60, 2.5),
  realThrow('실제 카메라 60fps 75km/h', 75, 60, 2.5),
  realThrow('실제 카메라 60fps 130km/h', 130, 60, 2.5),
  realThrow('실제 카메라 먼 릴리스 3.5m(작은 공)', 110, 60, 3.5),
  realThrow('실제 카메라 240fps 120km/h', 120, 240, 2.5),
  realThrow('실제 카메라 흰 과녁 천(9m부터 뒤 225)', 110, 60, 2.5, { brightTarget: { level: 225, fromM: 9 } }),
  realThrow('실제 카메라 흰 과녁 천(5m부터 뒤 225)', 110, 60, 2.5, { brightTarget: { level: 225, fromM: 5 } }),
  realThrow('실제 카메라 초점 흐림 σ1.0', 110, 60, 2.5, { blur: 1.0 }),
  {
    ...realThrow('실제 카메라 포수 뒤(다가옴) 240fps', 130, 240, 14),
    approach: 'approaching',
    startM: 14,
    offsetPx: { x: 40, y: -30 },
    lateralMps: { x: 0, y: 0 },
  },
  /*
   * 카메라 윤곽 없이 감마 · 실제 번짐만 — 이상적인 계단(선형 50% = 실루엣)에서 α 0.3 이 얼마나 크게 재는지(1차 검증 G5/G6).
   * 1.6.0 의 기대값: G5 −15.5% · G6 −9.9%(교과서 카메라라면 이만큼 낮게 읽는다). 윤곽 자의 절대 배율이 바뀌면 이 두 줄이
   * 먼저 움직인다 — 1% 넘게 바뀌면 까닭을 version.ts 에 적는다.
   */
  realThrow('G5 감마 · 실제 번짐(이상적 윤곽)', 120, 60, 2.5, { cameraEdgeSrcPx: 0 }),
  realThrow('G6 선형 · 실제 번짐(이상적 윤곽)', 120, 60, 2.5, { cameraEdgeSrcPx: 0, gamma: false }),
  /*
   * ── 밖 · 밝은 배경(2026-10-03, 극성) ──
   * 사용자가 밖에서 던졌는데 실시간 측정이 한 개도 안 잡혔다(영상은 없다). 투수 뒤에서 수평으로 찍으면 공은 하늘 앞에서
   * 출발한다 — 해를 마주하면(역광) 카메라 쪽 공 면이 그늘이라 하늘보다 **어둡다**. 감지가 '배경보다 밝아진 곳'만 보면
   * 이런 공은 처음부터 안 보인다. 공의 화면 길(분석 y): 릴리스 566 → 과녁 663(가운데 640).
   * 밖-1: 고른 하늘 230 앞 그늘진 공 160 — 공이 하늘보다 70 어둡다.
   * 밖-2: 하늘 그라데이션 — 가운데 215, 위로 0.6/px 밝아져 출발 자리는 하얗게 날아감(255), 끝은 201. 공 170(대비 31~85).
   * 밖-3: 지평선 610 — 위 하늘 235 · 아래 땅 90, 공 175. 하늘 앞(어두운 공, 대비 60) → 걸침 → 땅 앞(밝은 공, 대비 85).
   * 밖-4: 해를 등진 밝은 공 245 · 하늘 200 — 공이 하늘보다 밝다(대비 45). 예전 감지로도 보여야 한다.
   * 밖-5: 공의 그늘(위 +40 · 아래 −40, 가운데 190) · 하늘 205 — 위 반쪽은 하늘과 거의 같아 안 보이고 아래 반쪽만 어둡다.
   *       지름을 반쪽으로 잴 수는 없다 — 값을 내면 맞아야 하고, 못 재면 거부가 옳다(헛값을 내지 않는지 본다).
   */
  realThrow('밖-1 하늘 230 앞 그늘진 공 160', 110, 60, 2.5, { sky: { mid: 230 }, ball: 160 }),
  realThrow('밖-2 하늘 그라데이션 · 위 포화(공 170)', 110, 60, 2.5, { sky: { mid: 215, slope: 0.6 }, ball: 170 }),
  realThrow('밖-3 지평선 걸침(하늘 235 · 땅 90 · 공 175)', 110, 60, 2.5, {
    sky: { mid: 235, horizonY: 610, ground: 90 },
    ball: 175,
  }),
  realThrow('밖-4 해를 등진 밝은 공 245 · 하늘 200', 110, 60, 2.5, { sky: { mid: 200 }, ball: 245 }),
  realThrow('밖-5 반쪽 그늘 공(190 ±40) · 하늘 205', 110, 60, 2.5, { sky: { mid: 205 }, ball: 190, shade: 40 }),
];

/**
 * 실제 보정 영상 같은 한 번의 던지기 — 릴리스가 카메라 축에서 옆 0.25m · 위 0.2m, 공은 20m 앞 과녁(축 위, 0.5m 아래)으로
 * 곧게 간다. 엔진 식의 매개변수(offsetPx = 릴리스 시선의 화면 자리, lateralMps = 그 시선에 대한 옆 속도)로 바꾼다:
 * X(t) = (off/f)·z(t) + lat·t 가 X0 + vx·t 가 되려면 lat = vx − X0·v/z0.
 */
function realThrow(name: string, kmh: number, fps: number, releaseM: number, extra: Partial<Scenario> = {}): Scenario {
  const f = focalPxFromFov(PORTRAIT.h, ENGINE_FOV);
  const v = kmh / 3.6;
  const X0 = 0.25;
  const Y0 = -0.2;
  const flight = 20 / v;
  const vx = -X0 / flight;
  const vy = (0.5 - Y0) / flight;
  return {
    name,
    kmh,
    fps,
    source: PORTRAIT,
    releaseM,
    offsetPx: { x: (f * X0) / releaseM, y: (f * Y0) / releaseM },
    lateralMps: { x: vx - (X0 * v) / releaseM, y: vy - (Y0 * v) / releaseM },
    ball: 210,
    bgLevel: 60,
    /* 윤곽 폭(limb.ts edgePx)이 실제 영상의 1.40px 와 같아지는 초점 흐림 — 3×3 덮임 · 노출 번짐 · 광선의 보간이 나머지를 더한다 */
    blur: 0.43,
    noise: 2,
    gamma: true,
    exposure: true,
    shutter: 0.35,
    cameraEdgeSrcPx: 0.7,
    ...extra,
  };
}

/* ─────────────────────────── 그리기 ─────────────────────────── */

const ANALYZE_SHORT_SIDE = 720;

function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 미리 뽑아 둔 정규 잡음 65536개 — 프레임마다 백만 픽셀에 gaussian() 을 부르면 몇 분이 걸린다 */
const NOISE_POOL = (() => {
  const r = makeRandom(4242);
  const pool = new Float32Array(65536);
  for (let i = 0; i < pool.length; i++) pool[i] = gaussian(r);
  return pool;
})();
/** 프레임에 잡음을 더한다 — 시작 위치만 씨앗에서 뽑아 표를 돌려 쓴다 */
function addNoise(luma: Float32Array, sigma: number, start: number) {
  if (!sigma) return;
  let j = start & 0xffff;
  for (let k = 0; k < luma.length; k++) {
    const v = luma[k] + NOISE_POOL[j] * sigma;
    luma[k] = v < 0 ? 0 : v > 255 ? 255 : v;
    j = (j + 1) & 0xffff;
  }
}

/** 배경 — 회색 무늬(위치마다 조금 다름). 흔들림은 x 방향으로 밀어 그린다 */
const BG_CACHE = new Map<string, Float32Array>();
function background(
  width: number,
  height: number,
  shiftX: number,
  level = 90
): Float32Array {
  const key = `${width}x${height}@${shiftX.toFixed(2)}/${level}`;
  const cached = BG_CACHE.get(key);
  if (cached) return new Float32Array(cached);
  const made = backgroundRaw(width, height, shiftX, level);
  if (shiftX === 0) BG_CACHE.set(key, made);
  return new Float32Array(made);
}
function backgroundRaw(
  width: number,
  height: number,
  shiftX: number,
  level: number
): Float32Array {
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = x + shiftX;
      out[y * width + x] =
        level + ((sx * 7 + y * 13) % 25) + 4 * Math.sin(sx / 17) * Math.cos(y / 23);
    }
  }
  return out;
}

/**
 * 밖의 하늘(+ 땅) 배경 — Scenario.sky 설명. 255 를 넘는 값은 그대로 둔다(잡음을 더한 뒤 255 로 잘려 포화가 잡음 없이 남는다).
 * 흔들림(shiftX)은 무늬만 민다.
 */
const SKY_CACHE = new Map<string, Float32Array>();
function skyBackground(
  width: number,
  height: number,
  shiftX: number,
  sky: NonNullable<Scenario['sky']>
): Float32Array {
  const key = `${width}x${height}@${shiftX.toFixed(2)}/${JSON.stringify(sky)}`;
  const cached = SKY_CACHE.get(key);
  if (cached) return new Float32Array(cached);
  const out = new Float32Array(width * height);
  const cy = height / 2;
  for (let y = 0; y < height; y++) {
    const ground = sky.horizonY != null && y >= sky.horizonY;
    for (let x = 0; x < width; x++) {
      const sx = x + shiftX;
      out[y * width + x] = ground
        ? (sky.ground ?? 90) + ((sx * 7 + y * 13) % 25) + 4 * Math.sin(sx / 17) * Math.cos(y / 23)
        : sky.mid + (sky.slope ?? 0) * (cy - y) + 2 * Math.sin(sx / 29) * Math.cos(y / 31);
    }
  }
  if (shiftX === 0) SKY_CACHE.set(key, out);
  return new Float32Array(out);
}

/** 카메라 앞 흰 그물 — 가로 · 세로 실을 공 위에 덮어 그린다(정지해 있어 배경 표본에도 같은 자리) */
function drawMesh(
  luma: Float32Array,
  width: number,
  height: number,
  mesh: { strand: number; pitch: number; luma: number }
) {
  for (let y = 0; y < height; y++) {
    const rowStrand = y % mesh.pitch < mesh.strand;
    for (let x = 0; x < width; x++) {
      if (rowStrand || x % mesh.pitch < mesh.strand) luma[y * width + x] = mesh.luma;
    }
  }
}

/** sRGB 전달 함수(0~255 부호값 ↔ 0~1 선형) — 브라우저 캔버스 값이 이것이다 */
function srgbToLinear(v: number) {
  const e = Math.min(1, Math.max(0, v / 255));
  return e <= 0.04045 ? e / 12.92 : Math.pow((e + 0.055) / 1.055, 2.4);
}
function linearToSrgb(l: number) {
  const x = Math.min(1, Math.max(0, l));
  return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
}

/** 노출 동안의 공 한 자리(분석 픽셀) — 중심 · 지름 */
type BallPose = { x: number; y: number; d: number };

/**
 * 공 — 가장자리는 부분 덮임(3×3 표본)으로 부드럽게, 옵션으로 초점 흐림 · 노출 동안의 움직임.
 * poses 는 셔터가 열린 동안의 공 자리들 — 그 덮임을 평균한다(모션 블러). 한 자리면 멈춘 공.
 * gamma 면 공과 배경을 선형 빛에서 섞어 sRGB 로 담는다(실제 카메라). edgeInPx 는 그린 원판을 참 지름보다 한쪽 이만큼
 * 작게 한다(분석 px — 'camera edge', 시나리오 설명).
 */
function drawBall(
  luma: Float32Array,
  width: number,
  height: number,
  poses: BallPose[],
  brightness: number,
  blurSigma: number,
  /** 원근 타원 — 화면 중심(분석 픽셀)과 초점거리(분석 픽셀). 가운데서 벗어난 공은 시선 방향으로 1/cosθ 늘어난다 */
  ellipse: { cx: number; cy: number; focalPx: number } | null = null,
  gamma = false,
  edgeInPx = 0,
  /** 공의 그늘(Scenario.shade) — 0 이면 고른 밝기(예전 그림 그대로) */
  shade = 0
) {
  const shapes = poses.map((p) => {
    const r = Math.max(0.3, p.d / 2 - edgeInPx);
    /* 타원 축 — u 는 화면 중심에서 공으로 향하는 단위 벡터, 그 방향 반지름이 r/cosθ */
    let ux = 1;
    let uy = 0;
    let ra = r;
    if (ellipse) {
      const dx = p.x - ellipse.cx;
      const dy = p.y - ellipse.cy;
      const rr = Math.hypot(dx, dy);
      if (rr > 1e-6) {
        ux = dx / rr;
        uy = dy / rr;
        const cos = ellipse.focalPx / Math.hypot(ellipse.focalPx, rr);
        ra = r / cos;
      }
    }
    return { ox: p.x, oy: p.y, r, ra, ux, uy };
  });
  const inside = (px: number, py: number, sh: (typeof shapes)[number]) => {
    const ex = px - sh.ox;
    const ey = py - sh.oy;
    const pu = ex * sh.ux + ey * sh.uy;
    const pv = -ex * sh.uy + ey * sh.ux;
    return (pu * pu) / (sh.ra * sh.ra) + (pv * pv) / (sh.r * sh.r) <= 1;
  };
  let bx0 = Infinity;
  let bx1 = -Infinity;
  let by0 = Infinity;
  let by1 = -Infinity;
  for (const sh of shapes) {
    const ext = Math.max(sh.r, sh.ra) + 3 * blurSigma + 2;
    bx0 = Math.min(bx0, sh.ox - ext);
    bx1 = Math.max(bx1, sh.ox + ext);
    by0 = Math.min(by0, sh.oy - ext);
    by1 = Math.max(by1, sh.oy + ext);
  }
  const x0 = Math.max(0, Math.floor(bx0));
  const x1 = Math.min(width - 1, Math.ceil(bx1));
  const y0 = Math.max(0, Math.floor(by0));
  const y1 = Math.min(height - 1, Math.ceil(by1));
  if (x1 < x0 || y1 < y0) return;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const cover = new Float32Array(w * h);
  /* 그늘이 있으면 덮임 × 공 밝기(감마면 선형 빛)를 따로 모은다 — 화소마다 공의 어느 쪽이 덮었는지가 다르다 */
  const light = shade ? new Float32Array(w * h) : null;
  const levelAt = (py: number, sh: (typeof shapes)[number]) => {
    const v = Math.min(255, Math.max(0, brightness - (shade * (py - sh.oy)) / Math.max(0.3, sh.r)));
    return gamma ? srgbToLinear(v) : v;
  };

  for (const sh of shapes) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        let insideN = 0;
        let lightSum = 0;
        for (let sy = 0; sy < 3; sy++) {
          for (let sx = 0; sx < 3; sx++) {
            const px = x + (sx + 0.5) / 3 - 0.5;
            const py = y + (sy + 0.5) / 3 - 0.5;
            if (inside(px, py, sh)) {
              insideN++;
              if (light) lightSum += levelAt(py, sh);
            }
          }
        }
        cover[(y - y0) * w + (x - x0)] += insideN / 9 / shapes.length;
        if (light) light[(y - y0) * w + (x - x0)] += lightSum / 9 / shapes.length;
      }
    }
  }

  const blurred = (src: Float32Array): Float32Array => {
    if (!(blurSigma > 0)) return src;
    const k = Math.ceil(3 * blurSigma);
    const kernel: number[] = [];
    let sum = 0;
    for (let i = -k; i <= k; i++) {
      const v = Math.exp(-(i * i) / (2 * blurSigma * blurSigma));
      kernel.push(v);
      sum += v;
    }
    const tmp = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let i = -k; i <= k; i++) {
          const xx = Math.min(w - 1, Math.max(0, x + i));
          acc += src[y * w + xx] * kernel[i + k];
        }
        tmp[y * w + x] = acc / sum;
      }
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let i = -k; i <= k; i++) {
          const yy = Math.min(h - 1, Math.max(0, y + i));
          acc += tmp[yy * w + x] * kernel[i + k];
        }
        out[y * w + x] = acc / sum;
      }
    return out;
  };
  const field = blurred(cover);
  const lightField = light ? blurred(light) : null;

  const ballLin = srgbToLinear(brightness);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const c = field[(y - y0) * w + (x - x0)];
      if (c <= 0) continue;
      const i = y * width + x;
      if (lightField) {
        const L = lightField[(y - y0) * w + (x - x0)];
        luma[i] = gamma ? linearToSrgb(srgbToLinear(luma[i]) * (1 - c) + L) : luma[i] * (1 - c) + L;
        continue;
      }
      luma[i] = gamma
        ? linearToSrgb(srgbToLinear(luma[i]) * (1 - c) + ballLin * c)
        : luma[i] * (1 - c) + brightness * c;
    }
  }
}

/* ─────────────────────────── 한 번 던지기 ─────────────────────────── */

type Outcome =
  | { ok: true; avgErr: number; relErr: number; frames: number; conf: string; relKmh: number; relSe: number | null; relPm: number | null; trims: number; fallback: string | null }
  | { ok: false; code: string };

function throwOnce(sc: Scenario, seed: number): Outcome {
  const rand = makeRandom(seed * 7919 + 17);
  const { w: sw, h: sh } = sc.source;
  const scale = Math.min(1, ANALYZE_SHORT_SIDE / Math.min(sw, sh));
  const width = Math.round(sw * scale);
  const height = Math.round(sh * scale);
  const longSide = Math.max(sw, sh);
  const trueFocal = focalPxFromFov(longSide, sc.trueFovDeg ?? ENGINE_FOV);
  const approach = sc.approach ?? 'receding';

  const v0 = sc.kmh / 3.6;
  const dt = 1 / sc.fps;
  const z0 = approach === 'receding' ? (sc.releaseM ?? 1.2) : (sc.startM ?? 14);
  const ball = sc.ball ?? 235;
  const noise = sc.noise ?? 2;
  const blur = sc.blur ?? 0.6;
  const lat = sc.lateralMps ?? { x: 0, y: 0 };
  const off = sc.offsetPx ?? { x: 0, y: 0 };

  /* 물리 — v(t) = v0 / (1 + K v0 t), 나아간 거리 s(t) = ln(1 + K v0 t) / K (거리만 쓴다) */
  const distAt = (t: number) => Math.log(1 + DRAG_K * v0 * t) / DRAG_K;

  const frames: CapturedFrame[] = [];
  const backgroundSamples: Float32Array[] = [];
  const truth: { t: number; z: number }[] = [];

  /* 공의 화면 자리 — 시각 tt(초)의 중심 · 지름(분석 픽셀). 옆으로 흐른 만큼은 원근으로 거리에 반비례해 옮겨간다 */
  const zAt = (tt: number) => (approach === 'receding' ? z0 + distAt(tt) : z0 - distAt(tt));
  const poseAt = (tt: number): BallPose => {
    const zz = zAt(tt);
    return {
      x: (sw / 2 + off.x + (lat.x * tt * trueFocal) / zz) * scale,
      y: (sh / 2 + off.y + (lat.y * tt * trueFocal) / zz) * scale,
      d: ((BALL_DIAMETER_M * trueFocal) / zz) * scale,
    };
  };

  /*
   * 흰 과녁 천 — fromM 보다 먼 공이 지나가는 화면 자리(공 반지름 + 2px 넓힘)를 칠한다. 가만히 있는 배경이라 배경 표본에도
   * 같이 칠한다. 다가오는 공은 먼 쪽이 처음이다.
   */
  let target: { x0: number; x1: number; y0: number; y1: number } | null = null;
  if (sc.brightTarget) {
    let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity, dMax = 0;
    for (let k = 0; k < 4000; k++) {
      const tt = k * 0.0005;
      const zz = zAt(tt);
      if (zz < 0.5 || distAt(tt) > 12) break;
      if (zz < sc.brightTarget.fromM) continue;
      const pz = poseAt(tt);
      bx0 = Math.min(bx0, pz.x); bx1 = Math.max(bx1, pz.x); by0 = Math.min(by0, pz.y); by1 = Math.max(by1, pz.y);
      dMax = Math.max(dMax, pz.d);
    }
    if (Number.isFinite(bx0)) {
      const m = dMax / 2 + 2;
      target = { x0: Math.max(0, Math.floor(bx0 - m)), x1: Math.min(width - 1, Math.ceil(bx1 + m)), y0: Math.max(0, Math.floor(by0 - m)), y1: Math.min(height - 1, Math.ceil(by1 + m)) };
    }
  }
  const paintTarget = (luma: Float32Array) => {
    if (!target || !sc.brightTarget) return;
    for (let y = target.y0; y <= target.y1; y++) for (let x = target.x0; x <= target.x1; x++) luma[y * width + x] = sc.brightTarget.level;
  };

  /* 흔들리는 그물 격자 — 점마다 장면마다 0~amp 로 흔들린다(배경 표본에도 같은 자리, 다른 밝기) */
  const paintGrid = (luma: Float32Array) => {
    if (!sc.grid) return;
    const { pitch, amp } = sc.grid;
    for (let y = pitch; y < height; y += pitch) {
      for (let x = pitch; x < width; x += pitch) luma[y * width + x] += rand() * amp;
    }
  };

  /* 던지기 전 잠잠한 프레임 넷 — 배경 표본 */
  for (let i = 0; i < 4; i++) {
    const luma = sc.sky ? skyBackground(width, height, 0, sc.sky) : background(width, height, 0, sc.bgLevel);
    paintTarget(luma);
    paintGrid(luma);
    if (sc.mesh) drawMesh(luma, width, height, sc.mesh);
    addNoise(luma, noise, Math.floor(rand() * 65536));
    backgroundSamples.push(luma);
    frames.push({ t: -(4 - i) * dt, luma });
  }

  let exposure = 0;
  for (let i = 0; i < 400; i++) {
    const t = i * dt;
    const s = distAt(t);
    const z = approach === 'receding' ? z0 + s : z0 - s;
    if (z < 0.5) break;
    const dSource = (BALL_DIAMETER_M * trueFocal) / z;
    const dSmall = dSource * scale;
    if (approach === 'receding' && dSmall < 3) break;
    if (approach === 'receding' && s > 12) break;
    /* 옆으로 흐른 만큼 화면에서 옮겨간다 — 원근으로 거리에 반비례 */
    const lx = (lat.x * t * trueFocal) / z;
    const ly = (lat.y * t * trueFocal) / z;
    const cx = (sw / 2 + off.x + lx) * scale;
    const cy = (sh / 2 + off.y + ly) * scale;
    const shift = sc.shakePx ? (rand() - 0.5) * 2 * sc.shakePx : 0;
    const luma = sc.sky
      ? skyBackground(width, height, shift, sc.sky)
      : background(width, height, shift, sc.bgLevel);
    paintTarget(luma);
    paintGrid(luma);
    exposure += sc.exposureDrift ?? 0;
    if (exposure) for (let k = 0; k < luma.length; k++) luma[k] += exposure;
    const smear =
      sc.motionBlur && (lat.x || lat.y)
        ? {
            dx: ((lat.x * (dt / 2) * trueFocal) / z) * scale,
            dy: ((lat.y * (dt / 2) * trueFocal) / z) * scale,
          }
        : null;
    /* 셔터가 열린 동안의 공 자리들 — 실제 움직임(exposure) · 옛 옆 흐름(motionBlur) · 멈춘 공 */
    let poses: BallPose[];
    if (sc.exposure) {
      const open = (sc.shutter ?? 0.35) * dt;
      poses = [];
      for (let k = 0; k < 7; k++) poses.push(poseAt(t + (k / 6 - 0.5) * open));
    } else if (smear) {
      poses = [];
      for (let k = 0; k < 6; k++) {
        const f = k / 5 - 0.5;
        poses.push({ x: cx + smear.dx * f, y: cy + smear.dy * f, d: dSmall });
      }
    } else poses = [{ x: cx, y: cy, d: dSmall }];
    drawBall(
      luma,
      width,
      height,
      poses,
      ball,
      blur,
      { cx: (sw / 2) * scale, cy: (sh / 2) * scale, focalPx: trueFocal * scale },
      sc.gamma === true,
      (sc.cameraEdgeSrcPx ?? 0) * scale,
      sc.shade ?? 0
    );
    /* 그물은 공 앞에 있다 — 공을 그린 뒤 덮는다 */
    if (sc.mesh) drawMesh(luma, width, height, sc.mesh);
    addNoise(luma, noise, Math.floor(rand() * 65536));
    frames.push({ t, luma });
    truth.push({ t, z });
    if (approach === 'approaching' && dSmall > 120) break;
  }

  const result = analyzeFrames({
    frames,
    backgroundSamples,
    width,
    height,
    sourceWidth: sw,
    sourceHeight: sh,
    fovDeg: ENGINE_FOV,
    focalPx: sc.calibrated ? trueFocal : undefined,
    approach,
    releaseDistanceM: approach === 'approaching' ? z0 : undefined,
    ...(NO_FALLBACK ? { fallback: false } : {}),
  });
  if (!result.measure.ok) return { ok: false, code: result.measure.code };

  /* 엔진이 쓴 거리 구간의 진짜 평균 속도 — 거리 → 시각을 물리에서 거꾸로 */
  const m = result.measure;
  const zStart = m.detail.releaseDistanceM;
  const zEnd =
    approach === 'receding' ? zStart + m.detail.travelM : zStart - m.detail.travelM;
  const tOf = (z: number) => {
    const s = approach === 'receding' ? z - z0 : z0 - z;
    return (Math.exp(DRAG_K * s) - 1) / (DRAG_K * v0);
  };
  const t1 = tOf(zStart);
  const t2 = tOf(zEnd);
  /* 3차원 위치 — 가운데서 벗어난 공은 그 시선을 따라 비스듬히 날아가므로 z 변화보다 길다 */
  const posAt = (t: number) => {
    const zz = approach === 'receding' ? z0 + distAt(t) : z0 - distAt(t);
    return {
      x: (off.x / trueFocal) * zz + lat.x * t,
      y: (off.y / trueFocal) * zz + lat.y * t,
      z: zz,
    };
  };
  const p1 = posAt(t1);
  const p2 = posAt(t2);
  const trueAvg =
    (Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z) / Math.abs(t2 - t1)) * 3.6;
  const avgErr = m.kmh - trueAvg;
  /* 릴리스 참값도 3차원 — 시선 방향 성분(off/f · v0)과 옆 흐름을 더한 속력 */
  const v0Vec = {
    x: (off.x / trueFocal) * v0 + lat.x,
    y: (off.y / trueFocal) * v0 + lat.y,
    z: v0,
  };
  const trueRelease = Math.hypot(v0Vec.x, v0Vec.y, v0Vec.z) * 3.6;
  const relErr = result.release ? result.release.releaseKmh - trueRelease : NaN;
  if (DIAG && seed === 1) {
    const buckets: Record<string, number[]> = {
      '≥30px': [],
      '15~30': [],
      '9~15': [],
      '<9': [],
    };
    for (const o of result.track) {
      const tr = truth.find((x) => Math.abs(x.t - o.t) < 1e-9);
      if (!tr) continue;
      const trueD = ((BALL_DIAMETER_M * trueFocal) / tr.z) * scale;
      const key =
        trueD >= 30 ? '≥30px' : trueD >= 15 ? '15~30' : trueD >= 9 ? '9~15' : '<9';
      buckets[key].push(o.diameterPx / trueD);
    }
    const fmt = (a: number[]) =>
      a.length
        ? `${((a.reduce((x, y) => x + y, 0) / a.length - 1) * 100).toFixed(2)}% (n=${a.length})`
        : '—';
    console.log(
      `  [diag] ${sc.name}: 지름 치우침 ` +
        Object.entries(buckets)
          .map(([k, v]) => `${k} ${fmt(v)}`)
          .join(' · ') +
        ` · 첫 관측 ${m.detail.releaseDistanceM}m · startKmh ${m.detail.startKmh} · 참 v0(3D) ${trueRelease.toFixed(1)}` +
        (result.diameter ? ` · 가장자리 폭 ${result.diameter.edgeWidthPx} · 흐림 보정 ${result.diameter.blurCorrectionPx}px` : '')
    );
  }
  const d = m.detail as { startSeKmh?: number | null; startTrimmed?: number; endTrimmed?: number; farTrimmed?: number };
  return {
    ok: true,
    avgErr,
    relErr,
    frames: m.detail.frames,
    conf: m.confidence,
    relKmh: result.release?.releaseKmh ?? NaN,
    /* 잭나이프 SE(첫 관측 시점) · 릴리스 ±(90%) · 자른 장 수 — 불확실성이 답을 아는 그림에서 맞는 크기인지 볼 때(모델 1.6.0) */
    relSe: d.startSeKmh ?? null,
    relPm: (result.release as { errorKmh?: number } | null)?.errorKmh ?? null,
    trims: (d.startTrimmed ?? 0) + (d.endTrimmed ?? 0) + (d.farTrimmed ?? 0),
    /* 대비 길(1.9.0)로 쟀나 — 격자 시나리오만 'close' 여야 하고 나머지는 전부 null(첫 길에서 끝남) */
    fallback: result.fallback ?? null,
  };
}

/* ─────────────────────────── 채점 ─────────────────────────── */

type Row = {
  name: string;
  n: number;
  rejected: number;
  rejectCodes: Record<string, number>;
  avgBias: number;
  avgP90: number;
  relBias: number;
  relP90: number;
  frames: number;
  /** 대비 길(1.9.0)로 잰 수 — 격자 시나리오 말고는 0 이어야 한다 */
  fallbacks: number;
  /** 씨앗마다의 결과(릴리스 오차 · SE · ± · 믿음) — --json 으로 불확실성을 따로 본다 */
  outs: Outcome[];
};

const rows: Row[] = [];
for (const sc of SCENARIOS.filter((x) => !ONLY || x.name.includes(ONLY))) {
  const outs: Outcome[] = [];
  for (let s = 1; s <= SEEDS; s++) outs.push(throwOnce(sc, s));
  const ok = outs.filter((o): o is Extract<Outcome, { ok: true }> => o.ok);
  const rejected = outs.filter((o): o is Extract<Outcome, { ok: false }> => !o.ok);
  const codes: Record<string, number> = {};
  for (const r of rejected) codes[r.code] = (codes[r.code] ?? 0) + 1;
  const p90 = (xs: number[]) => {
    const a = xs.map(Math.abs).sort((x, y) => x - y);
    return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * 0.9))] : NaN;
  };
  const mean = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
  const rel = ok.map((o) => o.relErr).filter((v) => Number.isFinite(v));
  rows.push({
    name: sc.name,
    n: outs.length,
    rejected: rejected.length,
    rejectCodes: codes,
    avgBias: mean(ok.map((o) => o.avgErr)),
    avgP90: p90(ok.map((o) => o.avgErr)),
    relBias: mean(rel),
    relP90: p90(rel),
    frames: mean(ok.map((o) => o.frames)),
    fallbacks: ok.filter((o) => o.fallback != null).length,
    outs,
  });
}

if (JSON_OUT) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const f1 = (v: number) =>
    Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(1) : '  —  ';
  console.log(
    '\n구속 측정 정확도 시험대 — 130km/h 기준 오차(km/h). bias=평균 편향, p90=절대오차 90퍼센타일\n'
  );
  console.log(
    '시나리오'.padEnd(34) +
      '거부'.padStart(6) +
      '  평균bias  평균p90  릴리스bias  릴리스p90  프레임  대비'
  );
  for (const r of rows) {
    const rej = `${r.rejected}/${r.n}`;
    const codes = Object.entries(r.rejectCodes)
      .map(([k, v]) => `${k}×${v}`)
      .join(',');
    console.log(
      r.name.padEnd(34) +
        rej.padStart(6) +
        '  ' +
        f1(r.avgBias).padStart(8) +
        '  ' +
        f1(r.avgP90).padStart(7) +
        '  ' +
        f1(r.relBias).padStart(10) +
        '  ' +
        f1(r.relP90).padStart(9) +
        '  ' +
        (Number.isFinite(r.frames) ? r.frames.toFixed(0) : '—').padStart(6) +
        String(r.fallbacks || '').padStart(6) +
        (codes ? '   ' + codes : '')
    );
  }
  const worst = Math.max(
    ...rows.filter((r) => Number.isFinite(r.relP90)).map((r) => r.relP90)
  );
  console.log(`\n가장 나쁜 릴리스 p90: ${worst.toFixed(1)} km/h\n`);
}
