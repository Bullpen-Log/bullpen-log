import { BackLink, PageHeading } from '@/components/ui';
import { RecoveryList } from '@/components/load/recovery-list';
import { requireUser } from '@/lib/dal';

/**
 * EX-LOAD01-R1 — 못 보낸 운동 세트(웹). 운동 화면 밖에서 언제든 열 수 있다 — 어느 화면에서든 알림 한 줄(components/send-pending-sets.tsx)이
 * 여기로 데려온다. 세트는 이 기기(브라우저 저장소)에만 있어서 서버가 그리는 것은 틀뿐이고, 목록은 화면이 저장소에서 읽는다
 * (components/load/recovery-list.tsx). 지금 계정으로만 고르고, 다른 계정 · 계정을 모르는 세트는 수만 보인다.
 */
export default async function TrainingRecoveryPage() {
  const user = await requireUser();
  return (
    <div className="stack-page">
      <BackLink href="/training">트레이닝</BackLink>
      <PageHeading
        title="못 보낸 세트"
        description="이 기기에 남아 아직 서버에 저장되지 않은 운동 세트예요. 저장이 확인되거나 직접 버릴 때까지 지우지 않아요."
      />
      <RecoveryList ownerId={user.id} />
    </div>
  );
}
