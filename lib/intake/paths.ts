/**
 * 저장 경로와 내려받기 이름. 경로는 서버가 번호로만 만든다 — 이름 · 확장자를 넣지 않고, 브라우저가 경로를 고를 수 없다.
 */
import type { IntakeView } from '@/lib/intake/state';

export const INTAKE_BUCKET = 'external-intake';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isIntakeId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

function must(id: string) {
  if (!isIntakeId(id)) throw new Error('intake id 모양이 아니에요');
  return id;
}

/** 원본 자리 — 자산마다 새 경로라 덮어쓰지 않는다 */
export const assetObjectPath = (submissionId: string, assetId: string) => `sub/${must(submissionId)}/${must(assetId)}/original`;

/** 분석 결과 폴더 */
export const runObjectPrefix = (submissionId: string, runId: string) => `sub/${must(submissionId)}/runs/${must(runId)}`;

/** 이 경로가 이 접수의 것인가 */
export const isSubmissionPath = (path: string, submissionId: string) =>
  isIntakeId(submissionId) && path.startsWith(`sub/${submissionId}/`) && !path.includes('..');

const UUID_PART = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PURGEABLE = new RegExp(`^sub/(${UUID_PART})/(?:${UUID_PART}/original|runs/${UUID_PART}/preview-(?:side|rear)\\.mp4)$`);

/**
 * 지워도 되는 경로인가 — 이 접수의 원본이거나 실행의 미리보기 영상이어야 한다. 모양을 통째로 맞춰 본다.
 * 분석 결과(analysis.json)는 여기 안 든다. 다른 접수의 경로 · 경로 뛰어넘기도 안 든다. 정리 · 보유 삭제가 저장소를 부르기 전에 꼭 지난다.
 */
export const isPurgeablePath = (path: string, submissionId: string) => isIntakeId(submissionId) && PURGEABLE.exec(path)?.[1] === submissionId;

/** 시각 → 한국 날짜 'YYYY-MM-DD' */
export function seoulDateKey(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** 파일 이름 한 조각 — 한글은 지키고 경로 · 제어 · 보이지 않는 글자를 뺀다 */
export function safeNamePart(text: string, max = 40): string {
  const cleaned = text
    .normalize('NFC')
    .replace(/[\p{C}\p{Zl}\p{Zp}]/gu, '')
    .replace(/[/\\:*?"<>|'`$%&#;~^{}[\]=+,!@]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/_+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');
  return [...cleaned].slice(0, max).join('').replace(/[.-]+$/g, '');
}

/**
 * 내려받기 이름의 확장자 — 파일 머리에서 읽은 그릇으로만 정한다. 보낸 사람이 지은 이름의 확장자는 쓰지 않는다(접수 번호가 붙은 이름으로 .exe · .html 이 내려받히면 안 된다).
 * 둘째 인자는 예전 호출을 위해 받기만 하고 쓰지 않는다.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function originalExtension(container: string | null | undefined, _ignoredName?: string | null): string {
  if (container === 'mov' || container === 'mp4') return container;
  if (container === 'matroska') return 'mkv';
  return 'bin';
}

/** 내려받기 이름: athlete_receipt-date_receipt-id_side-or-rear_original.ext */
export function downloadFileName(input: {
  athleteName: string;
  receivedAt: Date;
  receiptCode: string;
  view: IntakeView;
  ext: string;
}): string {
  const athlete = safeNamePart(input.athleteName) || 'athlete';
  const receipt = safeNamePart(input.receiptCode, 24) || 'receipt';
  const ext = /^[a-z0-9]{1,5}$/.test(input.ext) ? input.ext : 'bin';
  return `${athlete}_${seoulDateKey(input.receivedAt)}_${receipt}_${input.view}_original.${ext}`;
}
