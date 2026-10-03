import { Clapperboard } from 'lucide-react';
import { requireAdmin } from '@/lib/dal';
import { loadVelocityRecordings } from '@/lib/velocity-recording-load';
import { BackLink, EmptyState, PageHeading } from '@/components/ui';
import { RecordingList } from './recording-list';

/**
 * 엔진 개발용 녹화 목록(관리자) — 측정 화면에서 '엔진 개발용 녹화'로 찍은 원본 영상들. 하나를 누르면 편집기에서 공마다 범위를
 * 잡고 스피드건 값을 적는다(./[id]). 구속 측정 관리자 머리의 '엔진 개발용 녹화' 단추가 여기로 온다.
 */
export default async function VelocityRecordingsPage() {
  await requireAdmin();
  const rows = await loadVelocityRecordings();
  return (
    <div className="stack-page">
      <div className="space-y-2">
        <BackLink href="/admin/velocity">구속 측정 관리자</BackLink>
        <PageHeading
          title="엔진 개발용 녹화"
          description="측정이 안 돼도 찍어 둔 원본 영상이에요. 녹화를 열어 공마다 범위를 잡고 스피드건 값을 적은 뒤 지금 모델로 다시 재요."
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={<Clapperboard />}
          title="아직 녹화가 없어요"
          description="측정 화면 왼쪽 관리자 단추 → 관리자 설정 → '엔진 개발용 녹화'를 켜면 시작 단추가 녹화 단추가 돼요."
        />
      ) : (
        <RecordingList rows={rows} />
      )}
    </div>
  );
}
