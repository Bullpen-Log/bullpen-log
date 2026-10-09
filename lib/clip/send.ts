'use client';

/**
 * 맡겨 둔 촬영 영상 하나를 올려 운동에 붙인다 — 영상 → 첫 장면 이미지 → 붙이기(서버) 차례. 다 되면 폰에서 지운다.
 *
 * - 한 운동은 한 번에 하나만 보낸다(다시 올리기와 새로 찍은 것이 겹쳐 옛 촬영본이 새 것을 덮지 않게).
 * - 올린 경로는 폰 기록에 적어 둔다 — 붙이기 대답만 못 받았으면(신호 끊김) 다음에 다시 올리지 않고 붙이기만 한다.
 *   서버는 같은 경로를 다시 붙여도 그 파일을 지우지 않는다(app/actions/shoot.ts attachShootClip).
 * - 올린 파일은 서버가 붙이기를 분명히 거절했을 때만 지운다. 신호가 끊긴 것이면 서버가 이미 붙였을 수도 있어 두고 본다.
 * - 폰 기록은 보낸 그 촬영본(savedAt)일 때만 지운다(lib/clip/outbox.ts dropClip).
 */
import { uploadToStorage } from '@/components/video-upload';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { attachShootClip, discardShootUpload, type ShootResult } from '@/app/actions/shoot';
import { dropClip, markUploaded, type PendingClip } from '@/lib/clip/outbox';

const ENDPOINT = '/api/library/upload-url';

/** 진행 몫 — 영상 올리기가 거의 전부 */
const VIDEO_SHARE = 0.92;

/** 지금 보내는 운동 */
const sending = new Set<string>();

export function isSending(exerciseId: string): boolean {
  return sending.has(exerciseId);
}

export async function sendClip(
  clip: PendingClip,
  onProgress: (p: number) => void = () => {}
): Promise<ShootResult> {
  if (sending.has(clip.exerciseId)) {
    return { ok: false, error: '이 운동 영상을 이미 올리고 있어요. 잠시 뒤에 다시 해 주세요.' };
  }
  sending.add(clip.exerciseId);
  try {
    let videoPath = clip.videoPath ?? null;
    let thumbPath = clip.thumbPath ?? null;
    if (!videoPath) {
      try {
        const video = new File([clip.video], 'clip.mp4', { type: 'video/mp4' });
        videoPath = await uploadToStorage(video, ENDPOINT, (pct) =>
          onProgress((pct / 100) * VIDEO_SHARE)
        );
        if (clip.thumb) {
          const thumb = new File([clip.thumb], 'thumb.jpg', { type: 'image/jpeg' });
          // 이미지는 없어도 된다 — 실패하면 영상만 붙인다
          thumbPath = await uploadToStorage(thumb, ENDPOINT, () => {}, 'thumbnail').catch(
            () => null
          );
        }
        await markUploaded(clip.exerciseId, clip.savedAt, { videoPath, thumbPath });
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error && err.message ? err.message : OFFLINE_MESSAGE,
        };
      }
    }
    onProgress(0.97);

    const LOST = Symbol('lost');
    const res = await orOffline(
      attachShootClip(clip.exerciseId, {
        videoPath,
        thumbPath,
        aspectRatio: clip.aspectRatio,
      }),
      LOST
    );
    if (res === LOST) return { ok: false, error: OFFLINE_MESSAGE };
    if (!res.ok) {
      // 서버가 거절했다 — 올린 파일을 치우고, 다음에는 처음부터 다시 올린다
      void orOffline(
        discardShootUpload([videoPath, thumbPath].filter((p): p is string => !!p)),
        null
      );
      await markUploaded(clip.exerciseId, clip.savedAt, { videoPath: null, thumbPath: null });
      return res;
    }
    onProgress(1);
    await dropClip(clip.exerciseId, clip.savedAt);
    return res;
  } finally {
    sending.delete(clip.exerciseId);
  }
}
