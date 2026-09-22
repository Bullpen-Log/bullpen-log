import Link from 'next/link';
import { redirect } from 'next/navigation';
import { toDateKey } from '@/lib/pitch-stats';
import { getCurrentUser } from '@/lib/dal';
import { AuthForm } from './auth-form';
import { BaseballMark } from '@/components/logo';

/** 렌더 중에 현재 시각을 직접 읽지 않도록 함수로 감싼다. */
function todayKey() {
  return toDateKey(new Date());
}

const HIGHLIGHTS = [
  { title: '투구 일지', desc: '투구수·강도·구속과 그날의 영상' },
  { title: '영상 분석', desc: '과거 폼을 느낀점과 함께 되돌아보기' },
  { title: '리포트', desc: '기간별 기록 정리와 코멘트' },
  { title: '트레이닝', desc: '몸 상태에 맞춰 고른 오늘의 운동' },
];

/*
 * 이미 로그인한 사람은 오늘 화면으로 보낸다.
 *
 * 예전에는 proxy.ts 가 모든 요청을 가로채 이 판단을 했다. 그런데 Next 16
 * 부터 proxy 는 Node 런타임에서 돌아 요청마다 서버 함수를 한 번 더 깨운다
 * (node_modules/next/dist/docs/.../proxy.md:223 — 런타임을 바꿀 수도 없다).
 * 실제로 재보니 어느 주소든 90ms 가 얹혔다. 약관처럼 로그인과 무관한
 * 화면까지 그 값을 물고 있었다.
 *
 * 그래서 판단을 필요한 자리로 옮겼다. 로그인이 필요한 화면을 막는 일은
 * app/(app)/layout.tsx 의 requireUser() 가 이미 하고 있었다 — 같은 문을
 * 두 번 잠그고 있었던 셈이다.
 */
export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/today');

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
            <p className="text-xs font-medium tracking-normal text-sky">{item.title}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{item.desc}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
