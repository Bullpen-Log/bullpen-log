import Link from 'next/link';
import { Activity, BookOpen, CalendarDays, FileText } from 'lucide-react';
import { requireUser } from '@/lib/dal';
import { Eyebrow } from '@/components/ui';

const CATEGORIES = [
  {
    href: '/training',
    title: '트레이닝',
    desc: '투수에게 필요한 부위별 컨디셔닝 운동을 영상과 함께.',
    icon: Activity,
  },
  {
    href: '/mechanics',
    title: '투구 메커니즘 가이드',
    desc: '와인드업부터 팔로우스루까지 구간별 폼 학습.',
    icon: BookOpen,
  },
  {
    href: '/pitch-log',
    title: '투구 기록',
    desc: '날짜별 구속·투구수·컨디션 기록과 추이 그래프.',
    icon: CalendarDays,
  },
  {
    href: '/board',
    title: '참고자료',
    desc: '투구 역학·트레이닝 논문과 분석글 게시판.',
    icon: FileText,
  },
] as const;

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div className="space-y-12">
      <div className="space-y-3">
        <Eyebrow>Dashboard</Eyebrow>
        <h1 className="text-3xl font-bold tracking-tight text-cream sm:text-4xl">
          안녕하세요, {user.nickname}님
        </h1>
        <p className="text-sm text-muted">오늘도 기록을 남겨볼까요?</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {CATEGORIES.map(({ href, title, desc, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-surface p-7 transition-colors hover:border-gold"
          >
            <div>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-line-strong bg-surface-2 text-gold transition-colors group-hover:border-gold">
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="mt-5 text-lg font-bold text-cream transition-colors group-hover:text-gold">
                {title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{desc}</p>
            </div>
            <span className="mt-6 text-xs font-medium uppercase tracking-[0.2em] text-muted transition-colors group-hover:text-gold">
              들어가기 →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
