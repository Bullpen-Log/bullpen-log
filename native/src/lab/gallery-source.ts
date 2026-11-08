import { File, Paths } from 'expo-file-system';
import { createVideoPlayer } from 'expo-video';
import type { ImagePickerAsset } from 'expo-image-picker';
import { isPhoneVideoPath, phoneAssetId } from '@/lib/phone-video-path';
import { LAB_MAX_VIDEO_BYTES } from '@/lib/pitch-lab-meta';
import { rpc } from '~/lib/rpc';
import type { MyVideoItem } from '@/lib/my-videos';
import { serverVideoUrls } from '~/pitch/api';
import { LocalVideo } from '../../modules/local-video';

/** Re-read ownership, copy the exact original and run the same upload validation as album picks. */
export async function galleryLabAsset(path: string): Promise<ImagePickerAsset> {
  const list = await rpc<{ ok: true; items: MyVideoItem[] } | { ok: false }>(
    'my-videos.loadMyVideoList'
  );
  if (!list.ok || !list.items.some((v) => v.path === path && v.sport === 'pitch'))
    throw Error('내 투구 영상을 확인할 수 없어요.');
  let file: File;
  const dest = new File(
    Paths.cache,
    `lab-gallery-${Date.now()}-${Math.random().toString(16).slice(2)}.mov`
  );
  try {
    if (isPhoneVideoPath(path)) {
      const original = await LocalVideo.fileUrl({ id: phoneAssetId(path) });
      const source = new File(original.url);
      if (source.size > LAB_MAX_VIDEO_BYTES)
        throw Error('분석할 수 있는 영상 크기를 넘었어요.');
      await source.copy(dest);
      file = dest;
    } else {
      const url = (await serverVideoUrls([path]))[path];
      if (!url) throw Error('원본을 불러오지 못했어요.');
      file = await File.downloadFileAsync(url, dest);
    }
    if (file.size > LAB_MAX_VIDEO_BYTES)
      throw Error('분석할 수 있는 영상 크기를 넘었어요.');
    const player = createVideoPlayer(file.uri);
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          sub.remove();
          reject(Error('영상 정보를 읽는 데 시간이 걸려요. 다시 골라 주세요.'));
        }, 10_000);
        const finish = (status: string) => {
          if (status !== 'readyToPlay' && status !== 'error') return;
          clearTimeout(timer);
          sub.remove();
          if (status === 'error') reject(Error('영상 파일을 읽지 못했어요.'));
          else resolve();
        };
        const sub = player.addListener('statusChange', ({ status }) => finish(status));
        finish(player.status);
      });
      const size = player.videoTrack?.size;
      if (!size?.width || !size.height || !(player.duration > 0))
        throw Error('영상의 길이와 해상도를 확인할 수 없어요.');
      return {
        uri: file.uri,
        fileName: file.name,
        fileSize: file.size,
        width: size.width,
        height: size.height,
        duration: player.duration * 1000,
        type: 'video',
      };
    } finally {
      player.release();
    }
  } catch (error) {
    if (dest.exists) dest.delete();
    throw error;
  }
}
