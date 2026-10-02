import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/dal';
import { loadVelocityRecording } from '@/lib/velocity-recording-load';
import { VELOCITY_ENGINE_VERSION } from '@/lib/velocity-engine/version';
import { BackLink } from '@/components/ui';
import { RecordingEditor } from './recording-editor';

/**
 * 엔진 개발용 녹화 편집기(관리자) — 녹화 조각을 보며 공마다 범위를 잡고(파일은 자르지 않고 조각 안의 초만 적는다), 스피드건 값 ·
 * 구종을 적고, 지금 모델로 그 범위를 다시 잰다. 그리는 것은 recording-editor.tsx.
 */
export default async function VelocityRecordingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) notFound();
  const detail = await loadVelocityRecording(id);
  if (!detail) notFound();
  return (
    <div className="stack-page">
      <BackLink href="/admin/velocity/recordings">엔진 개발용 녹화</BackLink>
      <RecordingEditor detail={detail} engineVersion={VELOCITY_ENGINE_VERSION} />
    </div>
  );
}
