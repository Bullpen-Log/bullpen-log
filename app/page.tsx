import { ButtonLink, Eyebrow } from '@/components/ui';
import { getCurrentUser } from '@/lib/dal';

const PILLARS = [
  {
    num: '01',
    title: '투구 기록',
    desc: '날짜별로 투구수, 체감 강도, 최고·평균 구속을 남깁니다. 그날 던진 영상과 느낀점도 함께 기록합니다.',
  },
  {
    num: '02',
    title: '영상분석',
    desc: '달력에서 날짜를 고르면 그날의 영상과 메모가 함께 열립니다. 예전 폼과 지금을 나란히 되돌아봅니다.',
  },
  {
    num: '03',
    title: '리포트',
    desc: '최근 7일·30일 투구량과 강도, 구속을 보고서로 정리합니다. 직전 기간과 비교해 짚어야 할 점을 알려줍니다.',
  },
  {
    num: '04',
    title: '트레이닝',
    desc: '스트렝스, 모빌리티, 파워, 코어, 회복 및 보강까지 다섯 파트로 나눠 영상과 설명을 정리합니다.',
  },
  {
    num: '05',
    title: '투구 메커니즘',
    desc: '스로잉 드릴, 메디신볼 드릴, 무브먼트 패턴 드릴로 나눠 학습합니다. 진도 체크로 놓치지 않습니다.',
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
    <main className="min-h-screen">
      {/* 히어로 */}
      <section className="bg-spotlight border-b border-line">
        <div className="mx-auto flex max-w-4xl flex-col items-center px-6 py-28 text-center sm:py-36">
          <Eyebrow>For Pitchers</Eyebrow>
          <h1 className="text-display mt-6 text-6xl leading-[0.95] text-cream sm:text-8xl">
            BULLPEN
            <br />
            <span className="text-gold">LOG</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-relaxed text-muted">
            트레이닝, 메커니즘, 투구 기록, 자료실. 투수에게 필요한 것들을 한 곳에
            모았습니다.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            {user ? (
              <ButtonLink href="/dashboard">대시보드로 이동 →</ButtonLink>
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
            <div key={p.num} className="bg-ink p-8 sm:p-10">
              <span className="text-display text-3xl text-gold-dim">{p.num}</span>
              <h2 className="mt-4 text-xl font-bold text-cream">{p.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-10 text-center sm:flex-row sm:justify-between sm:text-left">
          <span className="text-display text-lg text-cream">BULLPEN LOG</span>
          <span className="text-xs text-muted">
            투수를 위한 트레이닝 &amp; 기록 플랫폼
          </span>
        </div>
      </footer>
    </main>
  );
}
