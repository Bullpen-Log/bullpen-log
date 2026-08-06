import Link from 'next/link';
import { toDateKey } from '@/lib/pitch-stats';
import { AuthForm } from './auth-form';
import { BaseballMark } from '@/components/logo';

/** 렌더 중에 현재 시각을 직접 읽지 않도록 함수로 감싼다. */
function todayKey() {
  return toDateKey(new Date());
}

const HIGHLIGHTS = [
  { title: '투구기록', desc: '투구수·강도·구속과 그날의 영상' },
  { title: '영상분석', desc: '과거 폼을 느낀점과 함께 되돌아보기' },
  { title: '리포트', desc: '기간별 기록 정리와 코멘트' },
  { title: '트레이닝', desc: '파트별 운동과 메커니즘 드릴' },
];

export default function LoginPage() {
  return (
    <main className="bg-spotlight flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <Link href="/" className="group mb-10 flex items-center gap-3">
        <BaseballMark className="h-12 w-12" />
        <span className="text-display text-3xl leading-none text-ink transition-colors group-hover:text-sky">
          BULLPEN LOG
        </span>
      </Link>

      <AuthForm today={todayKey()} />

      <div className="mt-12 grid w-full max-w-md grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-8">
        {HIGHLIGHTS.map((item) => (
          <div key={item.title}>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky">
              {item.title}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{item.desc}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
