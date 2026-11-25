import 'server-only';

// Reviewed member catalog. The content digest identifies a private Storage object;
// Supabase server credentials and the authenticated Wiki API still control access.
const MEMBER_RELEASE_DIGEST = '256d63530cbec9c37c2cd777f5aa6865e5f2e903964a77ac6c57d535e8ead6ed';

export function wikiReleaseDigest(override: string | undefined): string | null {
  if (override === undefined) return MEMBER_RELEASE_DIGEST;
  return /^[a-f0-9]{64}$/.test(override) ? override : null;
}
