import type { Metadata } from 'next';
import { Wordmark } from '@/components/logo';

export const metadata: Metadata = { title: '앱으로 써 주세요' };

/** 휴대폰 브라우저가 보는 화면(proxy.ts) — 웹은 PC · 맥에서만, 휴대폰은 앱만(2026-10-20 김민) */
export default function PhonePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-page px-6 text-center">
      <Wordmark className="text-4xl text-ink" />
      <div className="flex max-w-xs flex-col gap-3">
        <h1 className="text-xl font-semibold text-ink">휴대폰에서는 앱으로 써요</h1>
        <p className="text-sm leading-relaxed text-muted">
          불펜로그 웹은 PC · 맥에서만 열려요. 휴대폰에서는 TestFlight 에서 받은 불펜로그 앱을 열어 주세요.
        </p>
        <p className="text-sm leading-relaxed text-muted">앱 초대를 아직 못 받았으면 운영팀에 알려 주세요.</p>
      </div>
    </main>
  );
}
