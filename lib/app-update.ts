/**
 * 새 앱(Expo) 화면 코드 업데이트 — Expo Updates 약속(protocol 1)을 우리 서버로(2026-10-20 김민: "푸시하면 웹앱처럼 바로").
 * 앱(expo-updates)이 켤 때 /api/app-update 에 '이 바닥 판(runtimeVersion)의 최신 화면 코드'를 묻고, 있으면 받아 다음부터 그것으로 켠다.
 * 파일은 Cloudflare R2(전송비 0) — 올리기는 native/scripts/publish-update.mts. 여기는 순수 계산만(시험 scripts/app-update-selftest.mts).
 *
 * R2 의 꼴: updates/<runtime>/latest.json = StoredUpdate, 파일은 updates/files/<sha256> (같은 파일은 한 번만 — 내용 주소).
 */

export type StoredAsset = {
  /** 앱이 파일을 알아보는 열쇠(내보내기의 md5) */
  key: string;
  /** base64url SHA-256 — 앱이 받은 파일을 이것으로 확인한다 */
  hash: string;
  /** R2 안의 자리 */
  r2Key: string;
  contentType: string;
  /** '.png' 처럼 — 화면 코드(launch asset)는 비움 */
  fileExtension?: string;
};

export type StoredUpdate = {
  id: string;
  createdAt: string;
  runtimeVersion: string;
  launchAsset: StoredAsset;
  assets: StoredAsset[];
  /** expo-constants 의 Constants.expoConfig — 업데이트로 켠 앱은 이것을 읽는다(없으면 null 이 된다) */
  expoClient?: Record<string, unknown>;
  /** 올린 커밋(되짚기용) */
  commit?: string;
};

type Part = { name: string; contentType: string; body: string };

export function multipart(parts: Part[], boundary: string): string {
  const chunks = parts.map(
    (p) => `--${boundary}\r\nContent-Type: ${p.contentType}\r\nContent-Disposition: form-data; name="${p.name}"\r\n\r\n${p.body}\r\n`
  );
  return `${chunks.join('')}--${boundary}--\r\n`;
}

export function manifestOf(u: StoredUpdate, urlOf: (r2Key: string) => string) {
  const asset = (a: StoredAsset) => ({
    hash: a.hash,
    key: a.key,
    contentType: a.contentType,
    ...(a.fileExtension ? { fileExtension: a.fileExtension } : {}),
    url: urlOf(a.r2Key),
  });
  return {
    id: u.id,
    createdAt: u.createdAt,
    runtimeVersion: u.runtimeVersion,
    launchAsset: asset(u.launchAsset),
    assets: u.assets.map(asset),
    metadata: {},
    extra: u.expoClient ? { expoClient: u.expoClient } : {},
  };
}

export type UpdateResponse = { status: number; headers: Record<string, string>; body: string };

/**
 * 앱의 물음(머리글) → 답. 바닥 판이 없거나 · 플랫폼이 iOS 가 아니거나 · 이미 최신이면 '업데이트 없음' 지시(directive)를,
 * 아니면 manifest 를 multipart 로 준다(약속 1). 약속 0(옛 클라이언트)은 지시를 모르니 204.
 */
export function updateResponse(
  req: { runtimeVersion: string | null; platform: string | null; protocolVersion: string | null; currentUpdateId: string | null },
  latest: StoredUpdate | null,
  urlOf: (r2Key: string) => string,
  boundary: string
): UpdateResponse {
  const base = { 'expo-protocol-version': '1', 'expo-sfv-version': '0', 'cache-control': 'private, max-age=0' };
  if (!req.runtimeVersion || (req.platform && req.platform !== 'ios')) {
    return { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: 'runtime version · ios 만' };
  }
  const none = !latest || latest.runtimeVersion !== req.runtimeVersion || latest.id === req.currentUpdateId;
  if (none) {
    if (req.protocolVersion !== '1') return { status: 204, headers: base, body: '' };
    return {
      status: 200,
      headers: { ...base, 'content-type': `multipart/mixed; boundary=${boundary}` },
      body: multipart([{ name: 'directive', contentType: 'application/json', body: JSON.stringify({ type: 'noUpdateAvailable' }) }], boundary),
    };
  }
  return {
    status: 200,
    headers: { ...base, 'content-type': `multipart/mixed; boundary=${boundary}` },
    body: multipart([{ name: 'manifest', contentType: 'application/json; charset=utf-8', body: JSON.stringify(manifestOf(latest, urlOf)) }], boundary),
  };
}

/** R2 안 자리 — 바닥 판 이름은 지문(hex)이라 그대로 쓰되 다른 글자는 막는다 */
export const latestKeyOf = (runtime: string) => `updates/${runtime.replace(/[^\w.-]/g, '_')}/latest.json`;
export const fileKeyOf = (sha256hex: string) => `updates/files/${sha256hex}`;
