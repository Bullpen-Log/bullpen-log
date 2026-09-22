import Link from 'next/link';
import { toDateKey } from '@/lib/pitch-stats';
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
 * 이 화면은 쿠키를 읽지 않는다. 미리 만들어 두고 CDN 에서 바로 내보내기
 * 위해서다.
 *
 * 예전에는 proxy.ts 가 여기 오는 요청을 가로채, 이미 로그인한 사람이면
 * 오늘 화면으로 되돌려보냈다. 그 proxy 를 걷어내면서 그 판단을 잠깐 이
 * 화면으로 옮겼는데, 쿠키를 읽는 순간 이 화면이 '미리 만들 수 없는 화면'이
 * 되어 요청마다 서버를 깨우게 됐다. 배포본에서 재보니 61ms 로 끝날 일이
 * 258ms 가 됐다.
 *
 * 되돌려보내는 것은 편의일 뿐이고, 로그인 화면은 로그아웃한 뒤나 처음
 * 들어올 때 반드시 거치는 자리다. 그래서 편의를 버리고 속도를 택했다.
 * 이미 로그인한 사람이 이 주소로 들어오면 로그인 폼이 그대로 보인다 —
 * 다시 로그인하면 평소처럼 동작한다.
 *
 * 둘 다 가지려면 cacheComponents(부분 캐싱)를 켜서 껍데기는 미리 만들고
 * 판단만 따로 떼어내야 하는데, 레이아웃까지 함께 손봐야 하는 별도의 일이다.
 */
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
            <p className="text-xs font-medium tracking-normal text-sky">{item.title}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{item.desc}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
