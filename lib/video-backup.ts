import { isPhoneVideoPath, phoneAssetId } from '@/lib/phone-video-path';

export type VideoBackup = {
  format: 'sinker-original';
  version: 1;
  path: string;
  file: string;
  bytes: number;
  sha256: string;
  exportedAt: string;
  date: string | null;
  note: string | null;
};
/** Restore only the original belonging to the selected, server-owned gallery entry. No arbitrary paths. */
export function readVideoBackup(raw: unknown, path: string): VideoBackup | null {
  if (
    !raw ||
    typeof raw !== 'object' ||
    !isPhoneVideoPath(path) ||
    !/^[a-f\d-]{36}$/i.test(phoneAssetId(path))
  )
    return null;
  const v = raw as VideoBackup;
  if (
    v.format !== 'sinker-original' ||
    v.version !== 1 ||
    v.path !== path ||
    !/^original\.(mov|mp4|m4v)$/.test(v.file)
  )
    return null;
  if (
    !Number.isSafeInteger(v.bytes) ||
    v.bytes <= 0 ||
    typeof v.sha256 !== 'string' ||
    !/^[a-f\d]{64}$/.test(v.sha256)
  )
    return null;
  return v;
}
