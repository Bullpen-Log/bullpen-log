'use client';

import { useState } from 'react';

export type TicketTone = 'joined' | 'closed' | 'cancelled' | 'past' | 'held';
const STATUS: Record<TicketTone, string> = {
  joined: '참가 등록됨',
  closed: '참가 등록됨 · 모집 마감',
  cancelled: '모임이 취소됐어요',
  past: '지난 번개',
  held: '모였어요',
};

/**
 * 번개 참가 티켓(2026-10-27 승인 시안 · 싱커 앱 안 번개 글) — 실제 참가(CommunityJoin)에서 바로 만드는 내 보기다. 따로 저장하는 티켓은 없다.
 * 글 화면이 서버에서 '참가함'을 읽었을 때만 그린다 — 참가 단추를 누른 순간이 아니라 서버가 받은 뒤(그래야 정원 · 마감 실패 뒤에 티켓이 남지 않는다).
 * 앞면: 날짜 · 시간 · 모임 이름 · 이름 · 장소 · 상태. 뒷면: 준비물 · 비용 · 글 안 대화로 가기.
 * '참가 등록'이지 현장 입장 · 출석 확인이 아니다 — 바코드 같은 입장 코드를 그리지 않는다. 다른 참가자 이름은 싣지 않는다.
 * 뒤집기는 입체로 0.42초, 동작 줄이기면 돌지 않고 바로 바뀐다(globals.css 안전망 + motion-safe).
 * 절취선 · 양쪽 둥근 홈은 Kokonut UI Boarding Pass 의 생김새를 보고 새로 그렸다(그 코드는 옮기지 않았다).
 */
export function MeetupTicket({
  title,
  date,
  tagEn,
  nickname,
  place,
  tone,
  gear,
  cost,
  roomHref,
}: {
  title: string;
  date: { year: number; md: string; weekdayShort: string; time: string };
  tagEn: string;
  nickname: string;
  place: string;
  tone: TicketTone;
  gear: string | null;
  cost: string | null;
  roomHref: string | null;
}) {
  const [back, setBack] = useState(false);
  const live = tone === 'joined' || tone === 'closed';
  return (
    <section id="ticket" aria-label="내 참가 티켓" className="scroll-mt-20 space-y-3 motion-safe:animate-[dugout-ticket-in_420ms_cubic-bezier(0.22,1,0.36,1)]">
      <div className="[perspective:1200px]">
        <div
          className={`grid motion-safe:transition-transform motion-safe:duration-[420ms] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] [transform-style:preserve-3d] ${back ? '[transform:rotateY(180deg)]' : ''}`}
        >
          {/* 앞면 */}
          <div aria-hidden={back} className="[grid-area:1/1] overflow-hidden rounded-[22px] [backface-visibility:hidden]">
            <div className={`relative px-5 pt-4 pb-5 text-white ${live ? 'bg-[linear-gradient(150deg,#0a84d6_0%,#0070c9_60%,#005aa8_100%)]' : 'bg-[#3b4a5c]'}`}>
              <div className="flex items-center justify-between text-[12px] font-bold tracking-[0.12em] text-white/85">
                <span>DUGOUT · {tagEn}</span>
                <span>{date.year}</span>
              </div>
              <p className="mt-3 flex items-end gap-2">
                <span className="text-display text-[4.25rem] leading-[0.85]">{date.md}</span>
                <span className="text-display pb-1 text-[1.4rem] leading-none">{date.weekdayShort}</span>
              </p>
              <p className="mt-4 text-[15px] font-bold">{date.time}</p>
              <p className="mt-0.5 text-[20px] leading-snug font-bold">{title}</p>
              {live && (
                <span
                  aria-hidden
                  className="absolute top-12 right-4 rotate-[10deg] rounded-lg border-2 border-white/90 px-2 py-0.5 text-center text-[13px] leading-tight font-black tracking-wide"
                >
                  JOINED
                  <span className="block text-[10px] font-bold tracking-normal">참가 등록</span>
                </span>
              )}
            </div>
            <Perforation />
            <dl className="space-y-1.5 bg-surface px-5 pt-3 pb-4 text-[14px]">
              <Row label="이름" value={nickname} />
              <Row label="장소" value={place} />
              <Row label="상태" value={STATUS[tone]} />
            </dl>
          </div>
          {/* 뒷면 */}
          <div
            aria-hidden={!back}
            className="[grid-area:1/1] flex flex-col overflow-hidden rounded-[22px] bg-surface [backface-visibility:hidden] [transform:rotateY(180deg)]"
          >
            <div className="flex-1 space-y-3 px-5 pt-5 pb-4">
              <p className="text-[13px] font-bold tracking-[0.12em] text-muted">DUGOUT · {tagEn}</p>
              <dl className="space-y-1.5 text-[14px]">
                <Row label="준비물" value={gear || '글에 적지 않았어요'} />
                <Row label="비용" value={cost || '글에 적지 않았어요'} />
              </dl>
              <p className="text-[13px] text-muted">참가 등록 표시예요. 현장 입장 · 출석 확인은 아니에요.</p>
            </div>
            {roomHref && (
              <a href={roomHref} tabIndex={back ? 0 : -1} className="m-4 mt-0 flex min-h-12 items-center justify-center rounded-2xl bg-sky text-[15px] font-bold text-white">
                글 안 대화로 가기
              </a>
            )}
          </div>
        </div>
      </div>
      <button
        type="button"
        aria-pressed={back}
        onClick={() => setBack((v) => !v)}
        className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-2xl bg-sky-tint text-[15px] font-semibold text-sky-strong transition-colors active:bg-sky-tint/70"
      >
        <span aria-hidden>↻</span> {back ? '앞면 보기' : '티켓 뒤집기'}
      </button>
    </section>
  );
}

/** 절취선 — 양쪽 둥근 홈(바탕색 원)과 점선 */
function Perforation() {
  return (
    <div aria-hidden className="relative h-0 bg-surface">
      <span className="absolute -top-2.5 -left-2.5 h-5 w-5 rounded-full bg-page" />
      <span className="absolute -top-2.5 -right-2.5 h-5 w-5 rounded-full bg-page" />
      <span className="absolute inset-x-4 top-0 border-t-2 border-dashed border-line" />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4">
      <dt className="w-14 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 font-semibold text-ink">{value}</dd>
    </div>
  );
}
