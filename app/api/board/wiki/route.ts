import { loadSessionUserUnchecked } from '@/lib/dal';
import { readWikiSnapshot } from '@/lib/wiki/private-store';

export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Vercel-CDN-Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
  'Cross-Origin-Resource-Policy': 'same-origin',
  Vary: 'Cookie',
};

export async function GET() {
  try {
    const user = await loadSessionUserUnchecked();
    if (!user) return Response.json({ error: 'authentication-required' }, { status: 401, headers });

    const snapshot = await readWikiSnapshot();
    if (snapshot) return Response.json({ viewerId: user.id, snapshot }, { headers });
  } catch {
    // Keep storage configuration, errors and data out of the response.
  }
  return Response.json({ error: 'wiki-unavailable' }, { status: 503, headers });
}
