import { headers } from 'next/headers';
import Link from 'next/link';
import { requireUser } from '@/lib/dal';
import { expoLevel } from '@/lib/app-env';
import { PITCH_READING_NATIVE_LEVEL, PITCH_READING_SCENE } from '@/lib/pitch-reading';
import { OpenNative } from '@/app/(session)/velocity/open-native';

export default async function PitchReadingPage() {
  const user = await requireUser();
  if (expoLevel((await headers()).get('user-agent')) >= PITCH_READING_NATIVE_LEVEL)
    return <OpenNative path="/pitch-reading" cover={false} />;
  return (
    <section
      className="fixed inset-0 z-60 flex flex-col bg-page text-ink"
      aria-label="선구안 훈련"
    >
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-line px-5">
        <Link href="/hitting" className="text-sm font-semibold">
          ‹ 타격
        </Link>
        <h1 className="text-sm font-semibold">선구안 훈련</h1>
      </header>
      <iframe
        title="선구안 훈련 연습"
        src={`${PITCH_READING_SCENE}?embed=1&scope=${encodeURIComponent(user.id)}`}
        className="min-h-0 flex-1 border-0"
        allow="fullscreen"
      />
    </section>
  );
}
