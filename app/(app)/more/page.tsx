import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { NAV_ICONS } from '@/components/nav-icons';
import { requireUser } from '@/lib/dal';
import { logout } from '@/app/actions/auth';
import { moreGroups } from '@/lib/nav';
import { ThemeToggle } from '@/components/theme-toggle';

/*
 * 아이콘 배경색.
 *
 * 표로 적어 두는 이유가 있다. Tailwind 는 소스에 그대로 적힌 클래스만 찾아
 * 넣으므로 `bg-cat-${tone}/10` 처럼 이어 붙이면 아무 색도 안 나온다.
 */
const TONE_CLASS: Record<string, string> = {
  lower: 'bg-cat-lower/10 text-cat-lower',
  upper: 'bg-cat-upper/10 text-cat-upper',
  mobility: 'bg-cat-mobility/10 text-cat-mobility',
  power: 'bg-cat-power/10 text-cat-power',
  core: 'bg-cat-core/10 text-cat-core',
  armcare: 'bg-cat-armcare/10 text-cat-armcare',
  recovery: 'bg-cat-recovery/10 text-cat-recovery',
};

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

      {/*
        한 줄에 하나씩 세로로 늘어놓는다.

        예전에는 두 칸 격자였다. 이름만 들어가니 두 개씩 놓을 수 있었는데,
        '자료실'이 무엇을 모아둔 곳인지 눌러 봐야 알았다. 설명을 한 줄 붙이려면
        가로가 필요하고, 그러면 한 줄에 하나가 맞다.

        아이콘 색은 라이브러리 카테고리와 같은 토큰을 쓴다. 색이 다르면 목록을
        훑을 때 글자를 읽기 전에 어느 항목인지 알아본다.
      */}
      {groups.map((group, gi) => (
        <section key={group.title ?? `g${gi}`} className="space-y-3">
          {group.title && (
            <h2 className="text-heading px-1 text-xl text-ink">{group.title}</h2>
          )}
          <div className="space-y-2.5">
            {group.items.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              const tone = item.tone ? TONE_CLASS[item.tone] : 'bg-surface-2 text-muted';
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface px-4 py-4 transition-colors hover:border-sky-soft"
                >
                  <span
                    aria-hidden
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tone}`}
                  >
                    <Icon className="h-[1.35rem] w-[1.35rem]" strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold tracking-[-0.01em] text-ink">
                      {item.label}
                    </span>
                    {item.desc && (
                      <span className="mt-0.5 block text-[13px] leading-snug break-keep text-muted">
                        {item.desc}
                      </span>
                    )}
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="h-5 w-5 shrink-0 text-line-strong"
                  />
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <section className="space-y-3">
        <h2 className="text-heading px-1 text-xl text-ink">화면</h2>
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
