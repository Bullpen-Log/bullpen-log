import { randomUUID } from 'node:crypto';
import { latestKeyOf, updateResponse, type StoredUpdate } from '@/lib/app-update';
import { r2Env, r2GetText, r2Url } from '@/lib/r2';

/**
 * 새 앱이 켤 때 묻는 '최신 화면 코드' — Expo Updates 약속 1(lib/app-update.ts). 앱 설정 native/app.json updates.url 이 이 주소다.
 * 로그인 없이 연다(앱이 켜지기 전에 묻는다). 최신 기록(latest.json)은 R2 에서 30초 기억하고, 파일 주소는 물을 때마다 1시간짜리로 서명한다.
 * R2 열쇠가 없으면(설정 전) 늘 '업데이트 없음' — 앱은 앱 안에 든 화면 코드로 켠다.
 */
const kept = new Map<string, { at: number; value: StoredUpdate | null }>();
const KEEP_MS = 30_000;

async function latestOf(runtime: string): Promise<StoredUpdate | null> {
  const env = r2Env();
  if (!env) return null;
  const hit = kept.get(runtime);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.value;
  const text = await r2GetText(env, latestKeyOf(runtime));
  const value = text ? (JSON.parse(text) as StoredUpdate) : null;
  kept.set(runtime, { at: Date.now(), value });
  return value;
}

export async function GET(req: Request) {
  const h = req.headers;
  const runtimeVersion = h.get('expo-runtime-version');
  let latest: StoredUpdate | null = null;
  try {
    latest = runtimeVersion ? await latestOf(runtimeVersion) : null;
  } catch (e) {
    /* R2 가 안 되면 '업데이트 없음'으로 — 앱은 지금 화면 코드로 켜진다(켜지기를 막지 않는다) */
    console.error('[app-update]', e instanceof Error ? e.message : e);
  }
  const env = r2Env();
  const res = updateResponse(
    { runtimeVersion, platform: h.get('expo-platform'), protocolVersion: h.get('expo-protocol-version'), currentUpdateId: h.get('expo-current-update-id') },
    latest,
    (key) => (env ? r2Url(env, 'GET', key) : ''),
    randomUUID()
  );
  return new Response(res.body || null, { status: res.status, headers: res.headers });
}
