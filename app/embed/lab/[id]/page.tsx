import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/dal';
import { loadLabSample, loadV2Result } from '@/lib/pitch-lab';
import { isLabId } from '@/lib/pitch-lab-meta';
import { readPitch3dV2Result } from '@/lib/pitch-3d/v2/contract';
import { LabEmbed } from './lab-embed';

/**
 * 3D 동작 분석 결과의 3D 칸만 — 아이폰 앱 결과 화면(native/src/app/lab/[id].tsx)이 작은 웹뷰로 띄운다(2026-10-18 김민: 둘레는 앱, 3D 는 웹 WebGL).
 * 앱 틀 · 하단 탭 · 체크인 관문이 없는 맨 화면이다(app/(app) 밖). 로그인은 앱과 같은 'session' 쿠키.
 * 웹 결과 화면(app/(app)/videos/lab/[id])과 같은 샘플 · 보여 줄 결과(job.shownJobId)를 그린다. 결과가 없으면 짧은 글만(앱이 그 칸을 따로 그린다).
 */
export default async function LabEmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isLabId(id)) notFound();
  const user = await getCurrentUser();
  if (!user) return <Note text="로그인이 필요해요." />;
  const sample = await loadLabSample(id, user);
  if (!sample) notFound();
  const shown = sample.v2.job?.shownJobId ?? null;
  const parsed = shown
    ? readPitch3dV2Result(await loadV2Result(sample.ownerId, id, shown).catch(() => null))
    : null;
  if (!parsed?.ok) return <Note text="3D 결과가 아직 없어요." />;
  const meta = sample.meta;
  return (
    <LabEmbed
      id={id}
      result={parsed}
      ground={meta?.ground ?? 'mound'}
      heightCm={meta?.heightCm ?? (sample.ownerId === user.id ? (user.heightCm ?? null) : null)}
    />
  );
}

function Note({ text }: { text: string }) {
  return (
    <p data-safe-area className="grid min-h-dvh place-items-center bg-[#151722] px-6 text-center text-sm text-[#c7cfdd]">{text}</p>
  );
}
