'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, MapPin, Users } from '@/components/icon';
import type { BenchMeetup } from '@/lib/sinker-dugout-load';

/**
 * 같이 연습 — 작은 입체 벤치와 실제 번개 정보가 함께 보이는 컴팩트 카드.
 * 날짜 · 곳 · 남은 자리 · 실력은 모두 실제 글에서(lib/sinker-dugout-load.ts loadSinkerMeetup). 정원을 안 적은 번개는 남은 자리를 말하지 않는다.
 * 모임 정보와 상세 단추를 읽을 수 있고, 입체 장면을 쓸 수 있으면 버튼이나 드래그로 돌린다. 못 그릴 때는 정적 벤치 그림이 선다.
 * 단추: 아직 참가 안 했으면 '같이 연습 보기'(글에서 조건을 보고 참가), 참가했으면 '참가 티켓 보기'(글의 티켓으로).
 */
export function BenchCard({ meetup }: { meetup: BenchMeetup }) {
  const [live, setLive] = useState(false);
  const d = meetup.date;
  const place = [meetup.place, meetup.area].filter(Boolean).join(' · ') || '장소 미정';
  return (
    <article aria-labelledby="bench-title" className="overflow-hidden rounded-[20px] border border-line bg-surface shadow-[0_5px_18px_rgba(23,59,80,0.06)]">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {meetup.tagLabel && <span className="rounded-md bg-sky-tint px-2 py-1 text-[13px] font-semibold text-sky-strong">{meetup.tagLabel}</span>}
            <span className="flex items-center gap-1 text-[13px] font-semibold text-ok"><span aria-hidden className="size-1.5 rounded-full bg-current" />모집 중</span>
          </div>
          <h3 id="bench-title" className="text-[18px] leading-snug font-bold break-words text-ink">{meetup.title}</h3>
          <div className="space-y-1 text-[14px] leading-5 text-muted">
            <p className="flex items-start gap-1.5"><CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0" /><span><span className="sr-only">일시: </span>{d.month}월 {d.day}일 {d.dayKo}요일 · {d.time}</span></p>
            <p className="flex items-start gap-1.5"><MapPin aria-hidden className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 break-words"><span className="sr-only">장소: </span>{place}</span></p>
            {meetup.seats !== null && <p className="flex items-start gap-1.5"><Users aria-hidden className="mt-0.5 size-4 shrink-0" /><span>{meetup.seats}자리 남음</span></p>}
            {meetup.level && <p className="pl-[22px]">{meetup.level}</p>}
          </div>
        </div>
        <BenchStage pass={{ md: d.md, line: `${meetup.tagEn} / ${d.time}` }} live={live} setLive={setLive} />
      </div>
      <Link
        href={meetup.joined ? `/community/${meetup.id}#ticket` : `/community/${meetup.id}`}
        className="flex min-h-11 items-center justify-between gap-2 border-t border-line px-4 text-[15px] font-semibold text-sky-strong transition-colors active:bg-sky-tint"
      >
        {meetup.joined ? '참가 티켓 보기' : '같이 연습 보기'}
        <span aria-hidden>↗</span>
      </Link>
    </article>
  );
}

/**
 * 입체 벤치 자리 — 카드가 화면에 들어올 때 three 장면을 불러온다(components/dugout/bench-three.ts). 그 전 · 실패 · 문맥 잃음은 정적 그림.
 * 동작 줄이기(기기 설정 · 앱 설정 html[data-reduce-motion])면 미끄러짐 없이 누를 때 조금만 돈다. 화면을 떠나면 장면 · 자원을 모두 놓는다.
 */
function BenchStage({ pass, live, setLive }: { pass: { md: string; line: string }; live: boolean; setLive: (v: boolean) => void }) {
  const host = useRef<HTMLButtonElement>(null);
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
    <button
      type="button"
      ref={host}
      disabled={!live}
      aria-label={live ? '벤치 돌려보기. 옆으로 밀어서도 돌릴 수 있어요.' : '벤치 그림'}
      data-live={live ? '' : undefined}
      className="relative h-[120px] w-[104px] shrink-0 touch-pan-y overflow-hidden rounded-2xl bg-sky-tint p-0 opacity-100 cursor-grab active:cursor-grabbing [&:not([data-live])>canvas]:hidden"
    >
      {!live && <StaticBench />}
    </button>
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
