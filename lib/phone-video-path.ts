/**
 * 폰 사진 앱에 둔 회원 영상의 '경로' — DB 의 영상 자리(PitchLog.videoPaths · VelocityPitch.clipPath)에 적는다.
 *
 * `{userId}/local-<사진 앱 영상 번호>` 꼴이라 본인 폴더 검사(isOwnedBy) · 썸네일 자리(pitchThumbPath →
 * `{userId}/thumb-local-….jpg`, 썸네일만 서버에 둔다)가 서버 영상과 똑같이 돈다. 저장소에 그런 파일은 없다 — 재생 주소를
 * 만들거나 지우는 곳은 isPhoneVideoPath 로 거른다. 사진 앱 번호(PHAsset.localIdentifier, 'UUID/L0/001')의 '/' 는 '~' 로.
 * 서버 · 브라우저 공용(순수). 폰과 이어 주는 쪽은 lib/local-video.ts.
 */

const MARK = 'local-';
const ID_RE = /^[A-Za-z0-9-]+(\/[A-Za-z0-9-]+)*$/;

export function isPhoneVideoPath(path: string | null | undefined): path is string {
  return typeof path === 'string' && /^[^/]+\/local-[A-Za-z0-9~-]+$/.test(path);
}

/** 사진 앱 영상 번호 → 경로. 번호 꼴이 아니면 null */
export function phoneVideoPath(userId: string, assetId: string): string | null {
  if (assetId.length > 120 || !ID_RE.test(assetId)) return null;
  return `${userId}/${MARK}${assetId.replaceAll('/', '~')}`;
}

/** 경로 → 사진 앱 영상 번호 */
export function phoneAssetId(path: string): string {
  return path.slice(path.indexOf('/') + 1 + MARK.length).replaceAll('~', '/');
}
