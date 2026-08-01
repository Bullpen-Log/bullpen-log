import Link from 'next/link';
import {
  Activity,
  BookOpen,
  CalendarDays,
  FileText,
  TrendingUp,
  UserCog,
  Users,
  Video,
} from 'lucide-react';
import { requireUser } from '@/lib/dal';
import { Eyebrow } from '@/components/ui';

const CATEGORIES = [
  {
    href: '/pitch-log',
    title: '투구 기록',
    desc: '날짜별 투구수·강도·구속과 그날의 영상을 기록.',
    icon: CalendarDays,
  },
  {
    href: '/analysis',
    title: '영상분석',
    desc: '과거에 던진 영상을 그날의 느낀점과 함께 되돌아보기.',
    icon: Video,
  },
  {
    href: '/report',
    title: '리포트',
    desc: '기간별 투구량·강도·구속 정리와 기록 메모 모아보기.',
    icon: TrendingUp,
  },
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
    href: '/board',
    title: '참고자료',
    desc: '투구 역학·트레이닝 분석글 게시판.',
    icon: FileText,
  },
] as const;

const ADMIN_CATEGORY = {
  href: '/admin',
  title: '관리자',
  desc: '회원 현황과 권한 관리, 사이트 활동 통계.',
  icon: Users,
} as const;

export default async function DashboardPage() {
  const user = await requireUser();

  const categories =
    user.role === 'ADMIN' ? [...CATEGORIES, ADMIN_CATEGORY] : CATEGORIES;

  return (
    <div className="space-y-12">
      <div className="space-y-3">
        <Eyebrow>Dashboard</Eyebrow>
        <h1 className="text-3xl font-bold tracking-tight text-cream sm:text-4xl">
          안녕하세요, {user.nickname}님
        </h1>
        <p className="text-sm text-muted">오늘도 기록을 남겨볼까요?</p>
      </div>

      {/* 가입할 때 생년월일을 받기 전에 가입한 회원에게만 보인다. */}
      {!user.birthDate && (
        <Link
          href="/profile"
          className="flex items-center gap-4 rounded-2xl border border-gold-dim/60 bg-gold/5 px-5 py-4 transition-colors hover:border-gold"
        >
          <UserCog className="h-5 w-5 shrink-0 text-gold" />
          <span className="min-w-0 flex-1 text-sm leading-relaxed text-cream/90">
            생년월일이 아직 등록되지 않았습니다. 나이에 맞는 안전한 투구수를
            계산하려면 필요합니다.
          </span>
          <span className="shrink-0 text-xs font-medium uppercase tracking-[0.2em] text-gold">
            입력 →
          </span>
        </Link>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {categories.map(({ href, title, desc, icon: Icon }) => (
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
