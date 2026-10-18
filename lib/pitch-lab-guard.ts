/**
 * 투구 분석 GPU 비용 지키기 — 순수 함수(저장소를 모른다). 저장은 lib/pitch-lab.ts(loadLabGuard · saveLabGuard), 쓰는 곳은
 * app/actions/pitch-lab.ts · app/(app)/videos/lab/lab-client.tsx.
 *
 * 2026-10-14 사용자: "사용자가 자꾸 이상한 영상으로 시도해서 계속 실패하는데 그거 때문에 그래픽 비용이 많이 나가는 게 걱정" → 셋:
 *   1 올리기 전 검사(폰이 파일 머리만 읽는다 — GPU 0원): 화면 녹화 · 30fps 급 · 낮은 해상도 · 줌 · 너무 짧음은 못 올린다
 *   2 같은 영상 다시 막기: 영상 탓으로 실패한 파일(지문)은 같은 엔진 판으로는 GPU 를 안 부른다
 *   3 하루 실패 상한 10번(한국 날짜) — GPU 를 쓰지 않은 실패(gpu · gpu-auth)는 안 센다
 * GPU 쪽 일찍 멈추기(거친 2D 에서 투수가 작으면 'framing')는 services/pitch3d-gpu/pitch3d_gpu/pipeline.py.
 *
 * 2026-10-15 사용자: "녹화 영상 금지, 두 번 따로 촬영도 금지, 무조건 동시에" → 넷을 더했다:
 *   - 화면 녹화는 이름만이 아니라 파일로도 알아챈다(렌즈 정보 없음 + 화면 비율 + 슬로모 아님 — labVideoBlock)
 *   - 옆 · 뒤가 같은 파일이면 막는다, 찍은 시각이 영상 길이보다 멀면(따로 찍음) 막는다(labPairBlock)
 *   - 촬영 정보의 '한 대로 나눠' · '화면 녹화' 고르기는 없앴고, 서버(saveLabSample)도 그 둘이 오면 받지 않는다
 * 시각 · 렌즈는 lib/pitch-lab-file.ts 가 파일 머리에서 읽는다.
 */
import { V2_VIDEO_FAULT, type V2FailCode } from '@/lib/pitch-3d/v2/contract';
import { LAB_VIEWS, type LabFile, type LabMeta } from '@/lib/pitch-lab-meta';

export const DAILY_FAIL_LIMIT = 10;
/** 지문을 몇 개까지 기억하나(오래된 것부터 버린다) */
const MAX_FAILED = 200;

/* ─────────────────────── 1 올리기 전 검사 ─────────────────────── */

/** 폰이 파일에서 읽은 것 — 못 읽은 칸은 null(그 칸으로는 막지 않는다) */
export type LabVideoInfo = {
  name: string;
  fps: number | null;
  /** 영상 짧은 변(px) */
  shortSide: number | null;
  durationSec: number | null;
  /** 35mm 환산 초점거리(mm) — 아이폰 1배 = 24 · 26(옛 기종), 0.5배 13, 2배 48 */
  focal35: number | null;
  /** 긴 변 ÷ 짧은 변 — 카메라 영상 16:9 = 1.78 · 4:3 = 1.33, 아이폰 화면 녹화 ≈ 2.16 */
  aspect?: number | null;
  /** 카메라 렌즈 정보가 있나(파일 머리를 못 읽었으면 null) — 아이폰 카메라 영상은 늘 있고 화면 녹화에는 없다 */
  hasLens?: boolean | null;
};

const SCREEN_TEXT = '화면 녹화 영상은 올릴 수 없어요. 사진 앱의 원본 영상을 올려 주세요.';

/** 폰 · 태블릿 화면 모양인가 — 아이폰 19.5:9(2.16) · 안드로이드 20:9(2.22) · 아이패드(1.43~1.52). 카메라 영상(1.33 · 1.78)은 아니다 */
export function looksScreenAspect(aspect: number): boolean {
  return (aspect >= 1.95 && aspect <= 2.35) || (aspect >= 1.4 && aspect <= 1.56);
}

/** 아이폰 화면 기록(ScreenRecording_… · 옛 RPReplay_…) · 한국어 이름 '화면 기록' */
export function looksScreenRecording(name: string): boolean {
  return /screen ?recording|rpreplay|화면 ?기록|화면 ?녹화/i.test(name);
}

/** 막는 까닭(해요체 한 줄) — 없으면 null. 화면이 그대로 보이고 '다시 찍어 주세요' 안내를 붙인다 */
export function labVideoBlock(v: LabVideoInfo): string | null {
  if (looksScreenRecording(v.name)) return SCREEN_TEXT;
  /*
   * 이름을 바꾼 화면 녹화 — 렌즈 정보가 없고, 화면 모양이고, 슬로모(100fps 넘음)가 아니면. 셋 다일 때만(안드로이드 카메라 영상은 렌즈 정보가
   * 없어도 16:9 · 4:3 이라 걸리지 않고, 슬로모는 화면 녹화로 나올 수 없다).
   */
  if (
    v.hasLens === false &&
    (v.fps == null || v.fps < 100) &&
    v.aspect != null &&
    looksScreenAspect(v.aspect)
  )
    return SCREEN_TEXT;
  if (v.fps != null && Math.round(v.fps) <= 30)
    return `초당 ${Math.round(v.fps)}장 영상이라 팔이 너무 번져요. 슬로 모션(120 · 240fps)으로 찍어 주세요. 슬로 모션으로 찍었다면 다른 폰으로 옮기며 바뀐 거예요. AirDrop 은 옵션에서 모든 사진 데이터를 켜고 다시 옮겨 주세요.`;
  if (v.shortSide != null && v.shortSide < 720)
    return `화질이 낮아요(${v.shortSide}p). 1080p 이상 원본으로 올려 주세요.`;
  if (v.focal35 != null && (v.focal35 < 20 || v.focal35 > 32))
    return '줌이나 광각으로 찍은 영상이에요. 1배(기본 렌즈)로 다시 찍어 주세요.';
  if (v.durationSec != null && v.durationSec < 2)
    return '영상이 너무 짧아요. 다리를 들기 전부터 공을 던진 뒤까지 찍어 주세요.';
  return null;
}

/* ─────────────────────── 1-2 옆 · 뒤 짝 — 동시에 찍었나 ─────────────────────── */

/** 짝 검사 재료(lib/pitch-lab-file.ts readLabFileFacts + 지문) — 못 읽은 칸은 null(그 칸으로는 안 막는다) */
export type LabCapture = {
  fp?: string | null;
  startMs: number | null;
  timeSource: 'apple' | 'mvhd' | null;
  durationSec: number | null;
};

/** 두 폰 시계 차 · 녹화 버튼을 누른 때의 차를 봐 주는 몫(초) */
export const PAIR_CLOCK_SLACK_SEC = 3;

function gapText(sec: number): string {
  if (sec < 120) return `${Math.round(sec)}초`;
  if (sec < 2 * 3600) return `${Math.round(sec / 60)}분`;
  if (sec < 2 * 86400) return `${Math.round(sec / 3600)}시간`;
  return `${Math.round(sec / 86400)}일`;
}

/**
 * 옆 · 뒤가 같은 공을 동시에 찍은 짝인가 — 아니면 까닭(해요체 한 줄).
 *
 * 찍은 시각은 아이폰이면 녹화 시작, 다른 기기는 시작이나 끝일 수 있다. 그래서 '시작끼리'가 아니라 '두 시각의 차가 더 긴 영상의 길이 +
 * 3초 안'이면 같이 찍은 것으로 본다(한쪽이 끝 시각이어도 걸리지 않는다). 한 대로 옆을 찍고 자리를 옮겨 뒤를 찍으면 첫 영상 길이에
 * 옮기는 시간이 더해져 이 범위를 넘는다. 출처가 다르면(아이폰 시작 · 다른 기기 mvhd) 시간대를 잘못 적는 기기가 있어 30분의 배수만큼
 * 어긋난 것은 봐준다.
 */
export function labPairBlock(a: LabCapture, b: LabCapture): string | null {
  if (a.fp && b.fp && a.fp === b.fp)
    return '옆과 뒤에 같은 영상을 골랐어요. 두 폰으로 찍은 영상을 하나씩 골라 주세요.';
  if (a.startMs == null || b.startMs == null) return null;
  const limit = Math.max(a.durationSec ?? 0, b.durationSec ?? 0) + PAIR_CLOCK_SLACK_SEC;
  const gap = Math.abs(a.startMs - b.startMs) / 1000;
  if (gap <= limit) return null;
  if (a.timeSource !== b.timeSource && gap <= 14 * 3600 + limit) {
    const off = gap % 1800;
    if (Math.min(off, 1800 - off) <= limit) return null;
  }
  return `옆과 뒤 영상을 찍은 시각이 ${gapText(gap)} 떨어져 있어요. 두 폰으로 같은 공을 동시에 찍은 영상만 올릴 수 있어요.`;
}

const captureOf = (f: LabFile | undefined): LabCapture => ({
  fp: f?.fp ?? null,
  startMs: f?.at ? Date.parse(f.at) : null,
  timeSource: f?.src ?? null,
  durationSec: f?.dur ?? null,
});

export const SPLIT_TEXT = '두 폰으로 같은 공을 동시에 찍은 영상만 올릴 수 있어요.';

/**
 * 서버(saveLabSample)가 저장 전에 한 번 더 — 화면을 거치지 않은 요청 · 고치기 전 화면(그때는 '한 대로 나눠' · '화면 녹화'를 고를 수
 * 있었다)이 보낸 정보도 막는다. raw 는 화면이 보낸 그대로(readLabMeta 는 빈 칸을 '화면 녹화'로 읽어서 고르기 전 값을 본다).
 */
export function labMetaBlock(raw: unknown, meta: LabMeta): string | null {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (v.synced === false) return SPLIT_TEXT;
  if (v.screenRecorded !== false) return SCREEN_TEXT;
  if (LAB_VIEWS.some((view) => looksScreenRecording(meta.files[view]?.name ?? ''))) return SCREEN_TEXT;
  return labPairBlock(captureOf(meta.files.side), captureOf(meta.files.back));
}

/* ─────────────────────── 2 · 3 지문 · 하루 상한 ─────────────────────── */

/**
 * 파일 지문 — 크기 + 앞 1MB + 뒤 1MB 의 SHA-256(150MB 통째로 읽으면 폰이 느리다). 같은 파일을 새 샘플로 다시 올려도 같다.
 * 앞뒤 1MB 가 같은 다른 영상은 사실상 없다(mov 머리 · 끝에 시각 · 장면 표가 든다).
 */
export async function fileFingerprint(file: Blob): Promise<string> {
  const MB = 1 << 20;
  const parts: BlobPart[] = [String(file.size), file.slice(0, MB)];
  if (file.size > MB) parts.push(file.slice(Math.max(MB, file.size - MB)));
  const buf = await new Blob(parts).arrayBuffer();
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');
}


export type LabGuard = {
  /** 한국 날짜 'YYYY-MM-DD' — fails 가 센 날 */
  day: string;
  fails: number;
  /** 영상 탓으로 실패한 파일 지문과 그때 엔진 판 */
  failed: { fp: string; engine: string }[];
};

/** 한국 날짜(서버는 UTC) */
export function seoulDay(nowMs: number): string {
  return new Date(nowMs + 9 * 3600_000).toISOString().slice(0, 10);
}

export function readLabGuard(raw: unknown): LabGuard {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const failed = Array.isArray(r.failed)
    ? r.failed.flatMap((x) =>
        x && typeof x === 'object' && typeof x.fp === 'string' && typeof x.engine === 'string'
          ? [{ fp: x.fp, engine: x.engine }]
          : []
      )
    : [];
  return {
    day: typeof r.day === 'string' ? r.day : '',
    fails: typeof r.fails === 'number' && Number.isFinite(r.fails) && r.fails >= 0 ? r.fails : 0,
    failed: failed.slice(-MAX_FAILED),
  };
}

/** 분석을 걸기 전 — 막는 까닭 또는 null */
export function guardBlock(
  g: LabGuard,
  input: { nowMs: number; fps: string[]; engine: string }
): string | null {
  if (g.day === seoulDay(input.nowMs) && g.fails >= DAILY_FAIL_LIMIT)
    return `오늘 분석이 ${DAILY_FAIL_LIMIT}번 실패했어요. 촬영 안내대로 다시 찍어 내일 해 주세요.`;
  if (input.fps.some((fp) => g.failed.some((f) => f.fp === fp && f.engine === input.engine)))
    return '이 영상은 전에 분석하지 못했어요. 같은 영상으로는 또 실패해요. 다시 찍어 올려 주세요.';
  return null;
}

/** GPU 를 쓰고 끝난 실패만 센다 — GPU 를 못 부른 것(gpu · gpu-auth)은 사용자 탓도 비용도 아니다 */
export function countsAsFail(code: V2FailCode): boolean {
  return code !== 'gpu' && code !== 'gpu-auth';
}

/** 실패 하나를 적는다 — 영상 탓이면 지문도 */
export function recordFail(
  g: LabGuard,
  input: { nowMs: number; code: V2FailCode; fps: string[]; engine: string }
): LabGuard {
  if (!countsAsFail(input.code)) return g;
  const day = seoulDay(input.nowMs);
  const fails = (g.day === day ? g.fails : 0) + 1;
  const failed = V2_VIDEO_FAULT.has(input.code)
    ? [
        ...g.failed.filter((f) => !input.fps.includes(f.fp)),
        ...input.fps.map((fp) => ({ fp, engine: input.engine })),
      ].slice(-MAX_FAILED)
    : g.failed;
  return { day, fails, failed };
}
