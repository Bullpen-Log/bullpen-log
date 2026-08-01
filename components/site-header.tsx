import Link from 'next/link';
import { getCurrentUser } from '@/lib/dal';
import { logout } from '@/app/actions/auth';
import { MobileNav, NavLinks } from '@/components/nav-links';

// 기록 → 분석 → 코치 → 재료 순으로, 실제 사용 흐름대로 놓는다.
const NAV_ITEMS = [
  { href: '/pitch-log', label: '투구기록' },
  { href: '/analysis', label: '영상분석' },
  { href: '/coach', label: 'AI 코치' },
  { href: '/library', label: '라이브러리' },
  { href: '/board', label: '자료실' },
];

const ADMIN_NAV_ITEM = { href: '/admin', label: '관리자' };

/**
 * 내 정보는 데스크탑에서 오른쪽 위 닉네임을 눌러 들어간다.
 * 모바일에는 그 자리가 없어 하단 내비게이션 끝에 붙인다.
 */
const PROFILE_NAV_ITEM = { href: '/profile', label: '내정보' };

export async function SiteHeader() {
  const user = await getCurrentUser();

  // 관리자에게만 관리자 메뉴를 추가로 보여준다.
  const navItems =
    user?.role === 'ADMIN' ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

  return (
    <>
    <header className="sticky top-0 z-50 border-b border-line bg-ink/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
        <Link href={user ? '/dashboard' : '/'} className="group flex items-center gap-2.5">
          <span aria-hidden className="text-lg">⚾</span>
          <span className="text-display text-lg leading-none text-cream transition-colors group-hover:text-gold sm:text-xl">
            BULLPEN LOG
          </span>
        </Link>

        {user && <NavLinks items={navItems} />}

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <Link
                href="/profile"
                className="group hidden text-right sm:block"
                aria-label="내 정보"
              >
                <p className="text-sm leading-tight text-cream transition-colors group-hover:text-gold">
                  {user.nickname}
                </p>
                {user.role === 'ADMIN' && (
                  <p className="text-[10px] uppercase tracking-widest text-gold">Admin</p>
                )}
              </Link>
              <form action={logout}>
                <button
                  type="submit"
                  className="rounded-lg border border-line px-3 py-2 text-xs text-muted transition-colors hover:border-line-strong hover:text-cream"
                >
                  로그아웃
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-gold px-4 py-2 text-xs font-semibold text-ink transition-colors hover:bg-gold-bright"
            >
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>

    {user && <MobileNav items={[...navItems, PROFILE_NAV_ITEM]} />}
    </>
  );
}
