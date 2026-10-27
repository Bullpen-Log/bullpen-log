'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { BenchMeetup } from '@/lib/sinker-dugout-load';

/** 카드 무대 — 네이비 바탕(시안 그대로, 테마와 상관없이). 나머지 면 · 글자는 앱 토큰 */
const NAVY = 'bg-[linear-gradient(160deg,#0d2c52_0%,#0a2240_55%,#071a33_100%)]';


/**
 * 같이 연습 — 실제 번개 한 건을 담은 벤치 카드(2026-10-27 승인 시안: 네이비 무대 · 파란 벤치 · 공 · 배트 · 큰 날짜 · 상세 단추).
 * 날짜 · 곳 · 남은 자리 · 실력은 모두 실제 글에서(lib/sinker-dugout-load.ts loadSinkerMeetup). 정원을 안 적은 번개는 남은 자리를 말하지 않는다.
 * 무대 밖의 글과 단추가 먼저 읽힌다 — 입체 장면은 꾸밈(aria-hidden)이고, 불러오는 동안 · 못 그릴 때는 정적 벤치 그림이 선다.
 * 단추: 아직 참가 안 했으면 '같이 연습 보기'(글에서 조건을 보고 참가), 참가했으면 '참가 티켓 보기'(글의 티켓으로).
 */
export function BenchCard({ meetup }: { meetup: BenchMeetup }) {
  const [live, setLive] = useState(false);
  const d = meetup.date;
  const line = [d.time, meetup.place, meetup.level].filter(Boolean).join(' · ');
  return (
    <section aria-labelledby="bench-title" className={`overflow-hidden rounded-[22px] text-white shadow-[0_10px_30px_-12px_rgba(7,26,51,0.55)] ${NAVY}`}>
      <div className="relative h-[13.5rem] select-none">
        <BenchStage pass={{ md: d.md, line: `${meetup.tagEn} / ${d.time}` }} live={live} setLive={setLive} />
        <div className="pointer-events-none relative flex h-full flex-col p-4">
          <div className="flex items-center justify-between text-[13px] text-white/80">
            <span className="flex items-center gap-1">
              <PinIcon />
              {meetup.area ?? '지역 안 적음'}
            </span>
            <span>같이 연습</span>
          </div>
          <p aria-hidden className="text-display mt-2 text-[4.5rem] leading-[0.85] tracking-tight">
            {d.md}
          </p>
          <p aria-hidden className="text-display text-[2.4rem] leading-none tracking-wide text-white/22 [-webkit-text-stroke:1px_rgba(255,255,255,0.45)]">
            {d.weekday}
          </p>
          {/* 돌릴 수 있을 때만(장면이 섰을 때) — 정적 그림에서는 밀어도 안 돌아서 말하지 않는다 */}
          <p aria-hidden className={`mt-auto flex items-center gap-1 text-[12px] text-white/70 transition-opacity duration-200 ${live ? 'opacity-100' : 'opacity-0'}`}>
            <span>↔</span> 옆으로 밀어 돌려보기
          </p>
        </div>
      </div>
      <div className="space-y-2 bg-[#071a33]/60 px-4 pt-3 pb-4">
        <div className="flex items-center justify-between gap-2">
          {meetup.tagLabel ? (
            <span className="rounded-md bg-white/12 px-2 py-0.5 text-[12px] font-semibold text-white/90">{meetup.tagLabel}</span>
          ) : (
            <span />
          )}
          {meetup.seats !== null && <span className="text-[13px] text-white/80">{meetup.seats}자리 남음</span>}
        </div>
        <h3 id="bench-title" className="text-[20px] leading-snug font-bold text-white">
          {meetup.title}
        </h3>
        <p className="text-[14px] text-white/75">
          <span className="sr-only">{`${d.month}월 ${d.day}일 ${d.dayKo}요일 `}</span>
          {line}
        </p>
        <Link
          href={meetup.joined ? `/community/${meetup.id}#ticket` : `/community/${meetup.id}`}
          className="mt-2 flex min-h-12 items-center justify-center gap-1.5 rounded-2xl bg-sky text-[16px] font-bold text-white transition-[transform,background-color] duration-200 active:scale-[0.98] active:bg-sky-strong"
        >
          {meetup.joined ? '참가 티켓 보기' : '같이 연습 보기'}
          <span aria-hidden>↗</span>
        </Link>
      </div>
    </section>
  );
}

/**
 * 입체 벤치 자리 — 카드가 화면에 들어올 때 three 장면을 불러온다(components/dugout/bench-three.ts). 그 전 · 실패 · 문맥 잃음은 정적 그림.
 * 동작 줄이기(기기 설정 · 앱 설정 html[data-reduce-motion])면 미끄러짐 없이 누를 때 조금만 돈다. 화면을 떠나면 장면 · 자원을 모두 놓는다.
 */
function BenchStage({ pass, live, setLive }: { pass: { md: string; line: string }; live: boolean; setLive: (v: boolean) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const { md, line } = pass;
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let gone = false;
    let off = () => {};
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-reduce-motion');
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        io.disconnect();
        import('./bench-three')
          .then((m) => {
            if (gone) return;
            off = m.mountBench(el, { reduced, pass: { md, line }, onReady: () => setLive(true), onLost: () => setLive(false) });
          })
          .catch(() => setLive(false));
      },
      { rootMargin: '120px' }
    );
    io.observe(el);
    return () => {
      gone = true;
      io.disconnect();
      off();
    };
  }, [md, line, setLive]);
  return (
    <div
      ref={host}
      aria-hidden
      data-live={live ? '' : undefined}
      className="absolute inset-y-0 right-0 w-[64%] cursor-grab touch-pan-y active:cursor-grabbing [&:not([data-live])>canvas]:hidden"
    >
      {!live && <StaticBench />}
    </div>
  );
}

/** 정적 벤치 — 장면을 못 그릴 때도 같은 자리 · 같은 느낌(받침 · 파란 벤치 · 공 · 배트) */
function StaticBench() {
  return (
    <svg viewBox="0 0 220 200" className="absolute inset-0 h-full w-full" aria-hidden>
      <ellipse cx="118" cy="150" rx="96" ry="34" fill="#0c4465" />
      <ellipse cx="118" cy="146" rx="96" ry="34" fill="#13557d" />
      <path d="M58 70 L176 52 L176 66 L58 84 Z" fill="#0a7cc4" />
      <path d="M58 88 L176 70 L176 84 L58 102 Z" fill="#028ede" />
      <path d="M48 118 L166 100 L190 112 L72 130 Z" fill="#028ede" />
      <path d="M72 130 L190 112 L190 118 L72 136 Z" fill="#00568f" />
      <rect x="62" y="84" width="6" height="58" fill="#16425b" />
      <rect x="170" y="66" width="6" height="58" fill="#16425b" />
      <rect x="78" y="134" width="6" height="18" fill="#16425b" />
      <rect x="182" y="116" width="6" height="18" fill="#16425b" />
      <circle cx="132" cy="102" r="12" fill="#f6f4ea" />
      <path d="M124 94 q6 8 0 16 M140 94 q-6 8 0 16" stroke="#b73b32" strokeWidth="1.4" fill="none" />
      <path d="M196 40 L206 128" stroke="#c49660" strokeWidth="7" strokeLinecap="round" />
      <path d="M205 118 L207 136" stroke="#1b3445" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}
