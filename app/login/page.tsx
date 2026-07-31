import Link from 'next/link';
import { AuthForm } from './auth-form';

const HIGHLIGHTS = [
  { title: '트레이닝', desc: '부위별 컨디셔닝 운동과 루틴' },
  { title: '메커니즘', desc: '와인드업부터 팔로우스루까지' },
  { title: '투구기록', desc: '날짜별 구속·투구수·컨디션 추적' },
  { title: '자료실', desc: '스포츠 과학 논문과 분석글' },
];

export default function LoginPage() {
  return (
    <main className="bg-spotlight flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <Link href="/" className="group mb-10 flex items-center gap-3">
        <span aria-hidden className="text-2xl">⚾</span>
        <span className="text-display text-3xl leading-none text-cream transition-colors group-hover:text-gold">
          BULLPEN LOG
        </span>
      </Link>

      <AuthForm />

      <div className="mt-12 grid w-full max-w-md grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-8">
        {HIGHLIGHTS.map((item) => (
          <div key={item.title}>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">
              {item.title}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{item.desc}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
