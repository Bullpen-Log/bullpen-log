import { Directory, File, Paths } from 'expo-file-system';
import type { MyVideoItem } from '@/lib/my-videos';
import { phoneAssetId } from '@/lib/phone-video-path';
import { readVideoBackup, type VideoBackup } from '@/lib/video-backup';
import { LocalVideo } from '../../modules/local-video';

export const videoBackupAvailable = () =>
  !!LocalVideo.prepareBackup && !!LocalVideo.restoreBackup;

export async function exportOriginal(v: MyVideoItem, current: () => boolean) {
  if (!LocalVideo.prepareBackup)
    throw Error('원본 보관 기능을 사용하려면 앱을 업데이트해 주세요.');
  // Select destination before making a potentially large temporary copy.
  const destination = await Directory.pickDirectoryAsync();
  if (!current()) return false;
  const backup = await LocalVideo.prepareBackup({ id: phoneAssetId(v.path) });
  const temp = new File(backup.path);
  let folder: Directory | null = null;
  let committed = false;
  try {
    if (!current()) return false;
    const ext = temp.extension.toLowerCase();
    if (!/^\.(mov|mp4|m4v)$/.test(ext))
      throw Error('이 영상 형식은 원본 보관을 지원하지 않아요.');
    folder = new Directory(
      destination,
      `Sinker-${v.date ?? 'video'}-${phoneAssetId(v.path)}-${Date.now()}`
    );
    await folder.create();
    const original = new File(folder, `original${ext}`);
    await temp.copy(original);
    if (original.size !== backup.size)
      throw Error('사본의 크기가 달라요. 다시 보관해 주세요.');
    if (!current()) return false;
    const manifest: VideoBackup = {
      format: 'sinker-original',
      version: 1,
      path: v.path,
      file: original.name,
      bytes: backup.size,
      sha256: backup.sha256,
      exportedAt: new Date().toISOString(),
      date: v.date,
      note: v.note,
    };
    const info = new File(folder, 'sinker-video.json');
    await info.write(JSON.stringify(manifest, null, 2));
    committed = true;
    return true;
  } finally {
    try {
      if (temp.parentDirectory.exists) temp.parentDirectory.delete();
    } catch {
      /* Native startup removes old preparation files. */
    }
    if (!committed && folder?.exists) {
      try {
        folder.delete();
      } catch {
        /* Incomplete folder has no valid manifest. */
      }
    }
  }
}

export async function restoreOriginal(v: MyVideoItem, current: () => boolean) {
  if (!LocalVideo.restoreBackup)
    throw Error('원본 복원 기능을 사용하려면 앱을 업데이트해 주세요.');
  const folder = await Directory.pickDirectoryAsync();
  if (!current()) return false;
  const info = new File(folder, 'sinker-video.json');
  if (!info.exists || info.size > 32_768)
    throw Error('싱커에서 내보낸 보관 폴더를 선택해 주세요.');
  const manifest = readVideoBackup(JSON.parse(await info.text()), v.path);
  if (!manifest)
    throw Error(
      '이 영상의 보관 사본이 아니에요. 같은 계정에서 이 영상을 내보낸 폴더를 선택해 주세요.'
    );
  const source = new File(folder, manifest.file);
  if (!source.exists || source.size !== manifest.bytes)
    throw Error('원본이 없거나 사본이 손상됐어요.');
  const dir = new Directory(
    Paths.cache,
    `sinker-restore-${Date.now()}-${phoneAssetId(v.path)}`
  );
  await dir.create();
  const temp = new File(dir, manifest.file);
  try {
    await source.copy(temp);
    if (!current()) return false;
    await LocalVideo.restoreBackup({
      id: phoneAssetId(v.path),
      path: temp.uri,
      sha256: manifest.sha256,
    });
    return true;
  } finally {
    try {
      if (dir.exists) dir.delete();
    } catch {
      /* Cache cleanup must not mask a successful restore. */
    }
  }
}
