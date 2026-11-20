import { connection } from 'next/server';
import { requireAdmin } from '@/lib/dal';
import { PageHeading } from '@/components/ui';
import { evidenceStoreKind } from '@/lib/review-evidence/storage';
import { todayKst } from '@/lib/review-evidence/model';
import { BackToList, StoreBanner } from '../parts';
import { RegisterForm } from './register-form';

/**
 * 검수 근거 새로 등록(대표관리자만, EX-REF04). 실제로 쓴 출처 하나와 쓰임 하나를 한 번에 보낸다.
 * 보내기는 브라우저가 /api/admin/review-evidence 로(같은 요청 번호면 몇 번 보내도 한 번만 저장된다).
 */
export default async function NewReviewEvidencePage() {
  await connection();
  await requireAdmin();
  return (
    <div className="stack-page">
      <BackToList />
      <PageHeading title="새 근거 등록" description="검수에서 실제로 쓴 출처와 어디에 썼는지를 적어요. 원문 · PDF는 올리지 않고 링크만 남겨요." />
      <StoreBanner kind={evidenceStoreKind()} />
      <RegisterForm today={todayKst()} />
    </div>
  );
}
