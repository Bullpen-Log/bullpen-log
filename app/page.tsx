import Link from 'next/link';
import { ButtonLink } from '@/components/ui';
import { SiteFooter } from '@/components/site-footer';
import { Wordmark } from '@/components/logo';
import { getCurrentUser } from '@/lib/dal';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isNativeUserAgent } from '@/lib/app-env';

/**
 * 소개 — 처음 온 사람이 보는 첫 화면(웹만. 아이폰 앱은 곧장 홈 · 로그인으로 간다).
 *
 * 2026-10-04 'AI 티 줄이기'로 다시 짰다. 예전에는 빛나는 앱 아이콘 → 가운데 이름 → '투수를 위한 기록과 트레이닝,
 * 한곳에서.' → 아이콘 + 제목 + 설명 네 줄 → 큰 단추였다. AI 가 만드는 소개 화면의 틀 그대로라, 무슨 앱인지보다
 * '또 그 화면'이 먼저 보였다. 이제 하는 일을 말하는 제목, 앱 안 화면과 같은 모양의 예시 카드, 실제로 하는 일을 숫자로
 * 쓴 세 줄. 아이콘과 빛 그라데이션은 뺐다.
 *
 * 예시 카드의 숫자는 예시다(그렇게 적어 둔다). 모양은 홈 리포트의 '오늘 · 내일' 줄과 투구 기록 달력의 칸을 따른다.
 * 휴대폰에서는 단추가 화면 바닥에 붙어 있다 — 소개를 다 읽기 전에도 엄지 밑에 있다.
 */
const POINTS: { title: string; body: string }[] = [
  {
    title: '어제 72구 던졌으면, 오늘은 35~50구',
    body: '최근 7일과 28일 투구량을 견줘서 오늘과 내일 던질 양을 정해요.',
  },
  {
    title: '어깨가 아프다고 남기면, 그 부위 운동은 빼요',
    body: '아침에 남긴 몸 상태로 오늘 할 운동을 골라요. 암케어는 화면을 보며 따라 해요.',
  },
  {
    title: '던진 날 영상은 날짜별로, 두 개를 나란히',
    body: '지난달 폼과 오늘 폼을 한 화면에서 견줘 봐요.',
  },
];

/** 예시 카드의 이번 주 — 월요일부터, 0 은 안 던진 날 */
const WEEK: { day: string; pitches: number }[] = [
  { day: '월', pitches: 0 },
  { day: '화', pitches: 45 },
  { day: '수', pitches: 0 },
  { day: '목', pitches: 72 },
  { day: '금', pitches: 0 },
  { day: '토', pitches: 0 },
  { day: '일', pitches: 0 },
];

export default async function LandingPage() {
  const user = await getCurrentUser();
  /*
   * 아이폰 앱 안에서는 소개 화면을 보이지 않는다 — 웹사이트를 처음 온 사람에게 앱을 소개하는 화면이라, 앱 안에서 열리면
   * (로그인 화면의 로고를 누르는 등) 웹페이지 같았다(2026-10-04 '앱 안에 머물기'). 로그인했으면 홈, 아니면 로그인.
   */
  if (isNativeUserAgent((await headers()).get('user-agent'))) {
    redirect(user ? '/today' : '/login');
  }

  return (
    <main className="flex min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col bg-page">
      <div className="mx-auto w-full max-w-md flex-1 px-6 pt-10 pb-8 sm:pt-16">
        <Wordmark className="text-2xl text-ink" />

        <h1 className="mt-10 text-[28px] leading-snug font-bold break-keep text-ink">
          던진 만큼 적으면,
          <br />
          오늘 할 일을 정해 줘요.
        </h1>
        <p className="mt-3 text-base leading-relaxed break-keep text-muted">
          투수를 위한 훈련 일지예요. 투구수 · 강도 · 몸 상태를 남기면 던질 양과 운동을 골라 줘요.
        </p>

        {/* 예시 카드 — 앱 안 화면과 같은 모양(홈 리포트의 오늘 · 내일 줄, 투구 기록 달력 칸) */}
        <figure className="mt-8 rounded-2xl bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-ink">이번 주</p>
            <p className="text-xs tabular-nums text-muted">117구</p>
          </div>
          <ol className="mt-3 grid grid-cols-7 gap-1.5 text-center">
            {WEEK.map((d) => (
              <li key={d.day} className="space-y-1">
                <span className="block text-xs text-muted">{d.day}</span>
                <span
                  className={`flex h-10 items-center justify-center rounded-lg text-xs font-semibold tabular-nums ${
                    d.pitches ? 'bg-sky/15 text-sky-strong' : 'bg-surface-2 text-muted/60'
                  }`}
                >
                  {d.pitches || ''}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
              <span className="w-10 text-sm font-bold text-ink">오늘</span>
              <span className="text-numeric text-xl leading-none text-sky tabular-nums">35~50구</span>
              <span className="text-xs text-muted">강도 6~8</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
              <span className="w-10 text-sm font-bold text-ink">내일</span>
              <span className="text-sm font-medium text-sky-strong">휴식</span>
              <span className="ml-auto text-xs text-muted">이틀 연속은 쉬어요</span>
            </div>
          </div>
          <figcaption className="mt-3 text-xs text-muted/70">예시 화면이에요.</figcaption>
        </figure>

        <ul className="mt-8 divide-y divide-line">
          {POINTS.map((p) => (
            <li key={p.title} className="py-4 first:pt-0">
              <p className="text-[15px] font-semibold break-keep text-ink">{p.title}</p>
              <p className="mt-1 text-sm leading-relaxed break-keep text-muted">{p.body}</p>
            </li>
          ))}
        </ul>
      </div>

      {/*
        단추 — 휴대폰은 화면 바닥에 붙는다. 밑은 홈 막대 자리만큼 비운다.
        '계정 만들기'는 로그인 화면 안에 있다(로그인 화면은 미리 만들어 둔 화면이라 주소로 모드를 고르지 않는다).
      */}
      <div className="sticky bottom-0 bg-linear-to-t from-page via-page/95 to-page/0 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:static sm:bg-none">
        <div className="mx-auto flex w-full max-w-md flex-col items-stretch gap-1 px-6">
          {user ? (
            <ButtonLink href="/today" className="min-h-13 text-base">
              홈으로
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" className="min-h-13 text-base">
                시작하기
              </ButtonLink>
              <Link
                href="/login"
                className="mx-auto flex min-h-11 items-center px-3 text-sm font-semibold text-sky transition-opacity active:opacity-60"
              >
                이미 계정이 있어요 · 로그인
              </Link>
            </>
          )}
        </div>
      </div>

      {/* 맨 밑 정보 — 앱 안 화면 · 약관 화면과 같은 것(components/site-footer.tsx) */}
      <SiteFooter width="max-w-6xl" />
    </main>
  );
}
