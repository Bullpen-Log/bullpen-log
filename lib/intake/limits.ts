/**
 * 외부 영상 접수의 크기 · 횟수 한도. 브라우저에서도 부른다(화면이 고를 때 미리 알린다). 서버가 다시 본다.
 *
 * 버킷 external-intake 의 파일 한도가 위 울타리다(scripts/intake-setup-bucket.mjs 가 같은 값으로 만든다). 프로젝트 전체 한도(Supabase 대시보드
 * Storage Settings, Pro 이상 최대 500GB)가 이보다 낮으면 저장소가 먼저 막는다. 그래서 초대별 값은 버킷 한도를 넘지 못한다.
 */

export const GIB = 1024 * 1024 * 1024;
/** 버킷 파일 한도 — 올리려면 버킷 설정과 이 값을 같이 고친다 */
export const INTAKE_BUCKET_MAX_BYTES = GIB;
export const DEFAULT_MAX_FILE_BYTES = GIB;
export const DEFAULT_MAX_TOTAL_BYTES = 2 * GIB;
/** 한 접수에서 다시 고를 수 있는 횟수까지 합한 자산 수 — 저장소를 채우는 일을 막는다 */
export const MAX_ASSETS_PER_SUBMISSION = 12;

/** Supabase TUS 조각 — 공식 문서: 지금은 반드시 6MB */
export const TUS_CHUNK_BYTES = 6 * 1024 * 1024;
/** TUS 업로드 주소 유효 시간 — 공식 문서: 최대 24시간 */
export const TUS_URL_TTL_MS = 24 * 60 * 60 * 1000;
/** 서명 업로드 토큰의 만료를 토큰에서 못 읽었을 때의 짐작 — 짧게 잡아 일찍 새로 받는다 */
export const UPLOAD_TOKEN_FALLBACK_TTL_MS = 30 * 60 * 1000;
/** 서명 읽기 주소 수명(초) — 관리자 내려받기 · 재생. 폐기해도 이 시간까지는 살아 있다 */
export const READ_URL_TTL_SEC = 300;
/** 기본 올리기 기간 */
export const DEFAULT_UPLOAD_DAYS = 14;
/** 원본 보유 기간(일) — 언제부터 세는지는 lib/intake/retention.ts. 모델 개발에 동의해도 같다(2026-11-06 금윤호 결정) */
export const INTAKE_ORIGINAL_RETENTION_DAYS = 90;
/** 철회한 접수에서 판에 오르지 못한 파일을 지우기까지의 유예(일) */
export const INTAKE_WITHDRAWN_DRAFT_GRACE_DAYS = 7;
/** 지울 날이 지나도 열린 고침을 기다려 주는 최대 일수 — 관리자가 기간을 거듭 늘려 삭제가 끝없이 밀리지 않게 */
export const INTAKE_CORRECTION_HOLD_DAYS = 14;

/*
 * ── 일감 실행 예산(서버 전용) ── 근거 · 잰 값은 docs/designs/external-intake-large-files.md.
 * 크론 라우트(app/api/cron/intake/route.ts)의 maxDuration 과 같은 값이어야 한다 — 라우트 설정은 글자 그대로 적어야 해서 시험이 둘을 견준다.
 */
/** 크론 함수 한 번의 최대 시간(초) */
export const INTAKE_CRON_MAX_DURATION_SEC = 300;
/** 함수가 끊기기 전에 일감을 돌려놓을 여유 — 이 시각에 해시를 끊고 일감을 줄에 되돌린다 */
export const INTAKE_JOB_SAFETY_MARGIN_MS = 30_000;
/** 크론 한 번에 일감에 쓸 수 있는 시간 */
export const INTAKE_CRON_BUDGET_MS = INTAKE_CRON_MAX_DURATION_SEC * 1000 - INTAKE_JOB_SAFETY_MARGIN_MS;
/**
 * 파일 검증의 보수적인 읽기 속도(바이트/초) — 저장소에서 내려받으며 SHA-256 을 재는 속도의 아래쪽 짐작이다.
 * 이 맥의 로컬 해시는 이보다 수십 배 빠르다. 실제 Supabase → Vercel(icn1) 내려받기는 재지 못했다 — 재면 이 값을 고친다.
 * 8MiB/초면 1GiB 는 128초 + 고정 몫이라, 빈 크론 한 번(270초)에 한 파일은 늘 들어간다.
 */
export const VERIFY_MIN_BYTES_PER_SEC = 8 * 1024 * 1024;
/** 파일 하나 검증의 고정 몫 — 서명 주소 · 머리 범위 읽기 · DB 쓰기 */
export const VERIFY_FIXED_OVERHEAD_MS = 10_000;
/** 예산 때문에 해시를 끊은 횟수가 이만큼 쌓이면 크론은 그 파일을 더 시작하지 않고 검증 작업자를 기다린다 */
export const VERIFY_MAX_BUDGET_ABORTS = 3;
/** 위처럼 쉬게 둔 파일도 이만큼 지나면 크론이 다시 한 번 해 본다(저장소가 잠깐 느렸을 수 있다) */
export const VERIFY_PARK_MS = 24 * 60 * 60 * 1000;
/** 검증 작업자(크론 밖에서 오래 도는 일꾼)의 임대 시간 — 1GiB 를 느린 망으로 읽어도 남는다 */
export const VERIFY_WORKER_LEASE_MS = 60 * 60 * 1000;
/**
 * 빈 크론 한 번으로도 모자라다고 어림한 파일을 그래도 한 번 읽어 보는 조건 — 남은 시간이 예산의 이만큼 이상일 때(가벼운 일만 한 크론).
 * 끊기면 그때 잰 속도가 남는다. 하루(VERIFY_PARK_MS)에 한 번까지라 같은 읽기가 5분마다 헛돌지 않는다.
 */
export const VERIFY_PROBE_MIN_LEFT_FRACTION = 0.8;
/** 공개 라우트(올리기 확인 · 접수 완료)의 함수 시간(초) — 응답 뒤 after() 검증의 예산이 여기서 나온다. 라우트 설정과 같아야 한다 */
export const INTAKE_PUBLIC_ROUTE_MAX_DURATION_SEC = 300;
/** 예산 때문에 기다리는 검증 일감의 글(lastError 칸) 머리말 — 실패가 아니라 기다림이다. 화면 · 관리자 동작이 이것으로 가른다 */
export const VERIFY_BUDGET_NOTE_PREFIX = '검증 대기:';
export const isVerifyBudgetNote = (text: string | null | undefined) => text?.startsWith(VERIFY_BUDGET_NOTE_PREFIX) === true;

export type IntakeLimits = { maxFileBytes: number; maxTotalBytes: number; maxAssets: number };

const positive = (v: unknown): number | null => {
  const n = typeof v === 'bigint' ? Number(v) : typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

/** 초대별 값 → 환경변수 → 기본값 순서. 파일 한도는 버킷 한도를 못 넘고, 합계는 파일 한도보다 작을 수 없다 */
export function intakeLimits(
  invitation?: { maxFileBytes?: bigint | number | null; maxTotalBytes?: bigint | number | null } | null,
  env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env,
): IntakeLimits {
  const file = positive(invitation?.maxFileBytes) ?? positive(env.INTAKE_MAX_FILE_BYTES) ?? DEFAULT_MAX_FILE_BYTES;
  const total = positive(invitation?.maxTotalBytes) ?? positive(env.INTAKE_MAX_TOTAL_BYTES) ?? DEFAULT_MAX_TOTAL_BYTES;
  const maxFileBytes = Math.min(file, INTAKE_BUCKET_MAX_BYTES);
  return { maxFileBytes, maxTotalBytes: Math.max(total, maxFileBytes), maxAssets: MAX_ASSETS_PER_SUBMISSION };
}

/** 사람이 읽는 크기 — 1.2GB · 345MB */
export function formatBytes(bytes: number): string {
  if (bytes >= GIB) return `${(bytes / GIB).toFixed(1)}GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}
