import { BookOpen } from '@/components/icon';
import { ButtonLink, EmptyState } from '@/components/ui';
import { FAILURE_TEXT } from '@/lib/admin-references/load';

/** 참고자료를 못 보여 줄 때 — 까닭 종류만 말하고 경로 · 내부 값은 쓰지 않는다. 다시 시도는 같은 주소를 새로 읽는다 */
export function FailScreen({ reason, retryHref }: { reason: keyof typeof FAILURE_TEXT; retryHref: string }) {
  const t = FAILURE_TEXT[reason];
  return (
    <EmptyState
      icon={<BookOpen />}
      title={t.title}
      description={t.body}
      action={
        <ButtonLink href={retryHref} prefetch={false} variant="secondary" size="sm">
          다시 시도
        </ButtonLink>
      }
    />
  );
}
