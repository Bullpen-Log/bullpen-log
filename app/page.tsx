import { ButtonLink, Eyebrow } from '@/components/ui';
import { SiteFooter } from '@/components/site-footer';
import { BullpenMark } from '@/components/logo';
import { getCurrentUser } from '@/lib/dal';

const PILLARS = [
  {
    num: '01',
    title: '투구 기록',
    desc: '날짜별로 투구수, 체감 강도, 최고·평균 구속을 남깁니다. 그날 던진 영상과 느낀점도 함께 기록합니다.',
  },
  {
    num: '02',
    title: '영상 분석',
    desc: '캘린더에서 날짜를 고르면 그날의 영상과 메모가 함께 열립니다. 예전 폼과 지금을 나란히 되돌아봅니다.',
  },
  {
    num: '03',
    title: '리포트',
    desc: '최근 7일·30일 투구량과 강도, 구속을 보고서로 정리합니다. 직전 기간과 비교해 짚어야 할 점을 알려줍니다.',
  },
  {
    num: '04',
    title: '트레이닝',
    desc: '하체·상체 스트렝스부터 모빌리티, 파워, 코어, 암케어, 회복까지 일곱 파트로 나눠 영상과 설명을 정리합니다.',
  },
  {
    num: '05',
    title: '투구 메커니즘',
    desc: '스로잉 드릴, 메디신볼 드릴, 무브먼트 패턴 드릴을 설명과 함께 봅니다. 자주 하는 것은 즐겨찾기에 담아 바로 찾습니다.',
  },
  {
    num: '06',
    title: '자료실',
    desc: '투구 역학과 트레이닝에 관한 분석글을 모아 둡니다. 근거 있는 훈련을 위한 참고 자료입니다.',
  },
];

export default async function LandingPage() {
  const user = await getCurrentUser();

  return (
    <main className="min-h-dvh">
      {/* 히어로 */}
      <section className="bg-spotlight border-b border-line">
        <div className="mx-auto flex max-w-4xl flex-col items-center px-6 py-28 text-center sm:py-36">
          <Eyebrow>For Pitchers</Eyebrow>
          <h1 className="text-display mt-6 text-6xl leading-[0.95] text-ink sm:text-8xl">
            {/* 첫 글자 B 자리에 로고 — components/logo.tsx 의 Wordmark 와 같은 짜임(두 줄이라 따로 둔다) */}
            <span aria-hidden className="inline-flex items-baseline">
              <BullpenMark className="mr-[0.07em] h-[0.7em]" />
              ULLPEN
            </span>
            <span className="sr-only">BULLPEN</span>
            <br />
            {/* 로고와 같은 파랑 — 하늘색(sky)이면 바로 위 B 와 파랑이 두 가지로 보인다 */}
            <span className="text-brand">LOG</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-relaxed text-muted">
            트레이닝, 메커니즘, 투구 기록, 자료실. 투수에게 필요한 것들을 한 곳에
            모았습니다.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            {user ? (
              <ButtonLink href="/today">오늘 트레이닝 →</ButtonLink>
            ) : (
              <>
                <ButtonLink href="/login">시작하기 →</ButtonLink>
                <ButtonLink href="/login" variant="secondary">
                  로그인
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </section>

      {/* 4개 축 소개 */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
          {PILLARS.map((p) => (
            <div key={p.num} className="bg-surface p-8 sm:p-10">
              <span className="text-display text-3xl text-sky-soft">{p.num}</span>
              <h2 className="mt-4 text-xl font-bold text-ink">{p.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 맨 밑 정보 — 앱 안 화면 · 약관 화면과 같은 것(components/site-footer.tsx) */}
      <SiteFooter width="max-w-6xl" />
    </main>
  );
}
