import Link from 'next/link';
import { requireUser } from '@/lib/dal';
import { logout } from '@/app/actions/auth';
import { moreGroups } from '@/lib/nav';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * 모바일 "더보기" — 전체 메뉴를 한 화면에 펼친다.
 * PC에는 같은 목록이 왼쪽 사이드바에 늘 떠 있어 이 화면이 필요 없다.
 */
export default async function MorePage() {
  const user = await requireUser();
  const groups = moreGroups(user.role === 'ADMIN');

  return (
    <div className="space-y-6">
      {/* 프로필 헤더 */}
      <Link
        href="/profile"
        className="bg-hero flex items-center gap-4 rounded-2xl px-5 py-5 text-white"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/25 text-xl font-bold text-white">
          {user.nickname.slice(0, 1)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-lg font-bold">{user.nickname}</span>
          <span className="block text-sm text-white/80">
            {user.role === 'ADMIN' ? '관리자' : '내 정보 보기'}
          </span>
        </span>
      </Link>

      {groups.map((group, gi) => (
        <section key={group.title ?? `g${gi}`} className="space-y-3">
          {group.title && (
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <span aria-hidden className="h-4 w-1 rounded-full bg-sky" />
              {group.title}
            </h2>
          )}
          <div className="grid grid-cols-2 gap-3">
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-4 transition-colors hover:border-sky-soft"
              >
                <span aria-hidden className="text-xl leading-none">
                  {item.icon}
                </span>
                <span className="min-w-0 text-sm font-semibold text-ink">
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <span aria-hidden className="h-4 w-1 rounded-full bg-sky" />
          화면
        </h2>
        <ThemeToggle />
      </section>

      <form action={logout}>
        <button
          type="submit"
          className="w-full rounded-2xl border border-line bg-surface px-4 py-4 text-sm text-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          로그아웃
        </button>
      </form>

      <p className="pt-2 text-center text-xs text-muted">
        ⚾ Bullpen Log — 투수를 위한 트레이닝 &amp; 기록 플랫폼
      </p>
    </div>
  );
}
