import 'server-only';
import { IntakeError } from '@/lib/intake/errors';
import { createIntakeStorage, type IntakeRunStorage } from '@/lib/intake/storage-core';

export type { HashResult, IntakeRunStorage, IntakeStorage, IssuedUpload, ObjectStat } from '@/lib/intake/storage-core';

let cached: IntakeRunStorage | null = null;

/**
 * 앱이 쓰는 저장소. service role 키는 서버에만 있다.
 * SUPABASE_PUBLISHABLE_KEY 는 브라우저로 나가도 되는 공개 키다(TUS apikey 머리). service role 키를 여기 넣지 않는다.
 */
export function getIntakeStorage(): IntakeRunStorage {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new IntakeError('storage_unavailable', { cause: 'not_configured' });
  cached = createIntakeStorage({ url, serviceKey, publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? null });
  return cached;
}
