import Link from 'next/link';

/**
 * 통증이 있는 날.
 *
 * 목록이 아예 안 나오는 날이라 세션을 열 수 없다. 막는 대신 이유를 적는다 —
 * 이 앱의 규칙은 '경고는 하되 강제하지 않는다'지만, 통증만은 예외다.
 */
export default function RestPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-xs font-medium tracking-normal text-sky">TODAY</p>
      <h1 className="mt-3 text-2xl font-bold text-ink">오늘은 쉬는 것이 훈련입니다</h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
        오늘 체크인에 통증을 남기셨습니다. 아픈 날에 무게를 드는 것은 회복을 늦추기만
        합니다.
      </p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
        통증이 이어지면 수치와 관계없이 전문의와 상담하세요.
      </p>
      <Link
        href="/training"
        className="mt-8 rounded-xl border border-line-strong px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-sky hover:text-sky"
      >
        트레이닝으로 돌아가기
      </Link>
    </main>
  );
}
