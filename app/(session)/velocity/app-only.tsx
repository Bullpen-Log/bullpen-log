import Link from 'next/link';
import { ArrowLeft, Smartphone } from 'lucide-react';

/**
 * 웹에서 일반 계정이 구속 측정을 열었을 때 — 왜 안 되는지, 어디서 되는지.
 *
 * 404 로 두지 않는다. 기능이 있는데 여기서 못 쓰는 것이라, 없는 척하면 찾다가 포기한다.
 */
export function AppOnly() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-tint text-sky">
          <Smartphone aria-hidden className="h-6 w-6" />
        </span>
        <h1 className="text-heading mt-4 text-xl text-ink">
          구속 측정은 앱에서 쓸 수 있어요
        </h1>
        <p className="mt-2 text-sm leading-relaxed break-keep text-muted">
          폰 카메라의 고속 촬영으로 공을 찍어야 구속을 잴 수 있어요. 웹 브라우저의
          카메라는 그만큼 빠르게 찍지 못해서, 이 기능은 Bullpen Log 앱에서만 열려요.
        </p>
        <p className="mt-2 text-xs leading-relaxed break-keep text-muted">
          스피드건으로 잰 구속은 지금도 투구 기록에 직접 적을 수 있어요.
        </p>
        <Link
          href="/videos"
          className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-sky px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" />
          투구 기록으로
        </Link>
      </div>
    </main>
  );
}
