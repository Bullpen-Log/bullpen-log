/**
 * 고른 파일 살피기 — 브라우저에서만 돈다. 파일 머리만 읽어 사실을 보이고, 큰 파일을 통째로 쥐지 않는다.
 * 재생이 안 되는 것(HEVC · MOV)은 막을 까닭이 아니다. 막는 것은 빈 파일 · 한도 초과 · 바이트로 봐도 영상이 아닌 것 · 같은 파일뿐이다.
 */
import { INTAKE_ERROR_TEXT } from '@/lib/intake/errors';
import { formatBytes, type IntakeLimits } from '@/lib/intake/limits';
import { MEDIA_REJECT_TEXT, mediaRejectCode, readIntakeMediaFacts, type IntakeMediaFacts } from '@/lib/intake/media';
import type { PublicAsset } from '@/lib/intake/public-client';
import { IntakeUploadError, hashFileSha256 } from '@/lib/intake/upload-client';

export type Picked = {
  file: File;
  /** 미리보기 주소 — 파일을 복사하지 않는다 */
  url: string;
  /** 머리를 못 읽으면 null — 그래도 서버 확인까지 간다 */
  facts: IntakeMediaFacts | null;
};

const known = new WeakMap<Blob, string>();

/**
 * 파일 전체 해시 — 한 번 잰 파일은 다시 안 잰다.
 * 멈추면(signal) 조각 사이에서 'aborted' 로 끝난다. 기억은 끝까지 잰 값만 남긴다 — 멈춘 재기는 아무것도 안 남겨 다음에 처음부터 다시 잰다.
 */
export async function hashOnce(file: Blob, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new IntakeUploadError('aborted');
  const had = known.get(file);
  if (had) {
    onProgress?.(file.size, file.size);
    return had;
  }
  const sha = await hashFileSha256(file, { onProgress, signal, sliceBytes: 4 * 1024 * 1024 });
  /* 끝까지 잰 값은 맞는 값이다 — 마지막 조각 뒤에 멈췄어도 남겨 둔다. 멈춤은 부르는 쪽(runUpload)이 따로 본다 */
  known.set(file, sha);
  return sha;
}

/**
 * 한도를 넘은 영상 — 원본을 줄이거나 다시 만들라고 하지 않는다(분석에 쓸 수 없게 된다). 받는 쪽이 따로 받아 준다.
 * 고르기 전 안내(guided-steps)와 같은 말을 쓴다.
 */
export const SIZE_HELP_TEXT = '원본을 줄이거나 다시 만들지 마세요. 링크를 보내 준 분에게 알려 주시면 따로 받는 방법을 안내해 드려요.';
export const overFileText = (limits: IntakeLimits) => `영상 하나는 ${formatBytes(limits.maxFileBytes)}까지 보낼 수 있어요. ${SIZE_HELP_TEXT}`;
export const overTotalText = (limits: IntakeLimits) => `두 영상을 합쳐 ${formatBytes(limits.maxTotalBytes)}까지 보낼 수 있어요. ${SIZE_HELP_TEXT}`;

const UNREADABLE = '파일을 읽지 못했어요. iCloud에 있는 영상이면 내려받기가 끝난 뒤 다시 골라 주세요.';

/** 다른 칸의 파일 — 이 기기가 쥔 파일 또는 서버가 아는 자산 */
export type OtherSlot = { picked: Picked | null; asset: PublicAsset | null };

export type InspectResult = { ok: true; picked: Picked } | { ok: false; message: string };

/** 고른 파일을 살핀다. 실패해도 다른 칸의 선택은 건드리지 않는다 */
export async function inspectPick(file: File, limits: IntakeLimits, other: OtherSlot): Promise<InspectResult> {
  if (file.size === 0) return { ok: false, message: INTAKE_ERROR_TEXT.file_empty };
  if (file.size > limits.maxFileBytes) {
    return { ok: false, message: overFileText(limits) };
  }
  const otherSize = other.picked?.file.size ?? other.asset?.sizeBytes ?? 0;
  if (file.size + otherSize > limits.maxTotalBytes) {
    return { ok: false, message: overTotalText(limits) };
  }

  const reader = {
    size: file.size,
    read: async (start: number, end: number) => new Uint8Array(await file.slice(start, end).arrayBuffer()),
  };
  try {
    await reader.read(0, Math.min(file.size, 64));
  } catch {
    return { ok: false, message: UNREADABLE };
  }

  let facts: IntakeMediaFacts | null = null;
  try {
    facts = await readIntakeMediaFacts(reader);
  } catch {
    /* 머리를 못 읽어도 막지 않는다 — 서버가 다시 본다 */
  }
  const reject = facts ? mediaRejectCode(facts) : null;
  if (reject) return { ok: false, message: MEDIA_REJECT_TEXT[reject] };

  /* 크기가 같을 때만 전체를 잰다 — 다른 파일은 크기가 다르다 */
  if (otherSize === file.size) {
    try {
      const sha = await hashOnce(file);
      const otherSha = other.picked ? await hashOnce(other.picked.file) : other.asset?.sha256;
      if (sha === otherSha) return { ok: false, message: INTAKE_ERROR_TEXT.same_file };
    } catch {
      return { ok: false, message: UNREADABLE };
    }
  }

  return { ok: true, picked: { file, url: URL.createObjectURL(file), facts } };
}
