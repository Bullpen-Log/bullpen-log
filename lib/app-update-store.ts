import 'server-only';
import { storageBucket } from '@/lib/storage';

/**
 * 새 앱 업데이트 파일을 두는 곳 — Supabase 저장소 공개 버킷 app-updates(2026-10-20 만듦, 50MB · 종류 제한 없음).
 * 안에 드는 것은 앱에 이미 든 화면 코드 · 그림뿐이라 공개로 둔다(주소에 서명이 필요 없어 물을 때마다 같은 주소).
 * 사용자가 많아져 전송비가 커지면 이 파일만 Cloudflare R2(lib/r2.ts)로 바꾼다 — 나머지(약속 · 올리기 · 앱)는 그대로.
 */
const BUCKET = 'app-updates';
const bucket = () => storageBucket(BUCKET);

export function publicUrlOf(path: string): string {
  return bucket().getPublicUrl(path).data.publicUrl;
}

export async function readText(path: string): Promise<string | null> {
  const { data, error } = await bucket().download(path);
  if (error) {
    if (/not.?found|404|Object not found/i.test(`${error.message} ${(error as { status?: number }).status ?? ''}`)) return null;
    throw new Error(`앱 업데이트 읽기 ${path}: ${error.message}`);
  }
  return data.text();
}

export async function exists(path: string): Promise<boolean> {
  const { data, error } = await bucket().exists(path);
  if (error) return false;
  return data;
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  const { error } = await bucket().upload(path, JSON.stringify(value), { contentType: 'application/json', upsert: true });
  if (error) throw new Error(`앱 업데이트 쓰기 ${path}: ${error.message}`);
}

/** GitHub 굽기가 파일을 바로 올리는 1회용 주소(서버를 거치지 않아 큰 파일도) */
export async function uploadTarget(path: string): Promise<string> {
  const { data, error } = await bucket().createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error(`올릴 주소 ${path}: ${error?.message}`);
  return data.signedUrl;
}
