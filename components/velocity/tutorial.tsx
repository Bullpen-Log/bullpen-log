'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { BigButton, Note, SectionLabel } from './kit';

/**
 * 불펜 벨로시티 첫 사용 튜토리얼 — 다섯 장을 한 장씩 넘기며 무엇을 어떻게 하는지 알려 준다.
 *
 * 다시 보지 않기는 브라우저(localStorage)에 남는다. 측정 화면이 `useTutorialHidden()` 으로
 * 읽어 처음 온 사람에게만 띄우고, 닫을 때 `setTutorialHidden(hideNext)` 로 적는다.
 * 설정 시트(velocity-settings.tsx)의 useStoredSetup 과 같은 방식 — storage 이벤트 + 같은 탭용
 * 커스텀 이벤트로 바뀌면 다시 그린다.
 */

export const TUTORIAL_KEY = 'bullpen-velocity-tutorial-v1';
const TUTORIAL_CHANGE_EVENT = 'bullpen-velocity-tutorial-change';

const subscribe = (cb: () => void) => {
  window.addEventListener('storage', cb);
  window.addEventListener(TUTORIAL_CHANGE_EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(TUTORIAL_CHANGE_EVENT, cb);
  };
};
const readHidden = () => {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1' ? '1' : '0';
  } catch {
    return '0';
  }
};

/** 다시 보지 않기가 켜져 있나 — 서버 · 첫 렌더는 null, 브라우저에서는 true/false */
export function useTutorialHidden(): boolean | null {
  const raw = useSyncExternalStore(subscribe, readHidden, () => null);
  return raw === null ? null : raw === '1';
}

/** 다시 보지 않기를 적는다(true) · 지운다(false). 같은 탭의 useTutorialHidden 도 바로 바뀐다 */
export function setTutorialHidden(hide: boolean): void {
  try {
    if (hide) localStorage.setItem(TUTORIAL_KEY, '1');
    else localStorage.removeItem(TUTORIAL_KEY);
  } catch {
    /* 사생활 보호 모드 등에서는 못 적는다 — 이번만 보여 주고 만다 */
  }
  try {
    window.dispatchEvent(new Event(TUTORIAL_CHANGE_EVENT));
  } catch {
    /* 서버에서는 window 가 없다 */
  }
}

/* ───────────── 슬라이드 ───────────── */

type Slide = {
  key: string;
  title: string;
  body: string;
  /** 본문 아래 짧은 덧말 — 없어도 된다 */
  note?: string;
  art: React.ReactNode;
};

const SLIDES: Slide[] = [
  {
    key: 'what',
    title: '폰 카메라로 구속을 재요',
    body: '공이 날아가는 길을 장면마다 찾아 물리 궤적에 맞추고, 폰에서 그물(미트)까지 거리로 크기를 정해 구속을 내요.',
    note: '스피드건 없이, 삼각대에 올린 폰 하나면 돼요.',
    art: <ArtShrink />,
  },
  {
    key: 'prep',
    title: '먼저 준비할 것',
    body: '삼각대에 폰을 고정하고, 투수 바로 뒤 1m(또는 포수 뒤)에 두세요. 릴리스가 화면 안에 보이게 맞춰요.',
    note: '폰에서 그물(미트)까지 거리를 줄자로 재 두면 더 정확해요. 카메라는 2배 줌으로 찍어요.',
    art: <ArtPrep />,
  },
  {
    key: 'setup',
    title: '설정 → 카메라 → 존',
    body: '어떤 투구 · 카메라 위치 · 네트 · 거리를 고르고, 수평계와 표적을 맞춘 뒤 반투명 스트라이크 존을 끌어 놓으세요.',
    note: '다음부터는 "이 설정으로 시작" 한 번이면 카메라로 바로 가요.',
    art: <ArtZone />,
  },
  {
    key: 'measure',
    title: '측정은 켜 두면 알아서',
    body: '자동 모드는 시작을 누르고 던지기만 하면 공마다 잡아 줘요. 화면은 카메라 대신 구속 · 구종 · 목록을 보여 줘요. 수동 모드는 공마다 단추를 눌러요.',
    note: '아래 가운데 "세션 종료"로 끝내면 투구 기록에 정리돼요. 위쪽에 설정 · 재초점 · 뒤로가기가 있어요.',
    art: <ArtLive />,
  },
  {
    key: 'after',
    title: '잰 뒤에',
    body: '목록에서 공을 누르면 구종 · 코스 · 스피드건 값을 적고 영상 클립을 볼 수 있어요.',
    note: '투구 기록에는 [구속 측정] 표시로 남고, 거기서도 고칠 수 있어요.',
    art: <ArtAfter />,
  },
];

/* ───────────── 부품 ───────────── */

/**
 * 화면 전체를 덮는 튜토리얼. 열려 있을 때만 그린다 — 닫혔다 다시 열리면 첫 장부터.
 * 닫을 때 `onClose(hideNext)` 로 "다시 보지 않기" 체크 상태를 넘긴다(시작하기 · 건너뛰기 X 둘 다.
 * Esc 만 false). localStorage 에는 여기서도 적는다 — 부르는 쪽이 한 번 더 적어도 해롭지 않다.
 */
export function VelocityTutorial({
  open,
  onClose,
}: {
  open: boolean;
  onClose: (hideNext: boolean) => void;
}) {
  if (!open) return null;
  return <TutorialDialog onClose={onClose} />;
}

function TutorialDialog({ onClose }: { onClose: (hideNext: boolean) => void }) {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<'next' | 'back'>('next');
  const [hideNext, setHideNext] = useState(false);
  const firstButtonRef = useRef<HTMLButtonElement>(null);

  const total = SLIDES.length;
  const last = index === total - 1;
  const slide = SLIDES[index];

  // 열릴 때 첫 단추(다음)에 포커스
  useEffect(() => {
    firstButtonRef.current?.focus();
  }, []);

  // Esc 로 닫기 — 다시 보지 않기는 적지 않는다(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const go = (to: number) => {
    setDir(to > index ? 'next' : 'back');
    setIndex(Math.min(total - 1, Math.max(0, to)));
  };

  const finish = () => {
    setTutorialHidden(hideNext);
    onClose(hideNext);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="velocity-tutorial-title"
      className="motion-safe:animate-fade-in fixed inset-0 z-50 flex flex-col bg-page text-ink"
    >
      <div className="mx-auto flex h-full w-full max-w-md flex-col px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
        {/* 머리 — 이름 · 건너뛰기 */}
        <div className="flex h-12 shrink-0 items-center justify-between">
          <span className="text-xs font-medium text-muted">
            불펜 벨로시티 · 처음 안내
          </span>
          <button
            type="button"
            onClick={finish}
            aria-label="건너뛰기"
            title="건너뛰기"
            className="-mr-2 flex h-12 w-12 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        {/* 본문 — 그림 · 제목 · 글 */}
        <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto py-2">
          <section
            key={slide.key}
            className={`overflow-hidden rounded-2xl border border-line bg-surface ${
              dir === 'next'
                ? 'motion-safe:animate-step-next'
                : 'motion-safe:animate-step-back'
            }`}
          >
            <div className="flex aspect-[4/3] items-center justify-center bg-sky-tint/60 px-6 text-sky">
              {slide.art}
            </div>
            <div className="px-5 pb-5 pt-4">
              <SectionLabel>
                {index + 1} / {total}
              </SectionLabel>
              <h2 id="velocity-tutorial-title" className="text-heading text-lg">
                {slide.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink">{slide.body}</p>
              {slide.note && (
                <div className="mt-3">
                  <Note>{slide.note}</Note>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* 발 — 점 · 다시 보지 않기 · 이전/다음 */}
        <div className="shrink-0 space-y-3 pt-2">
          <div
            role="tablist"
            aria-label="안내 순서"
            className="flex items-center justify-center gap-1.5"
          >
            {SLIDES.map((s, i) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`${i + 1}번째: ${s.title}`}
                onClick={() => go(i)}
                className="flex h-6 w-6 items-center justify-center"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all ${
                    i === index ? 'w-5 bg-sky' : 'w-1.5 bg-line-strong'
                  }`}
                />
              </button>
            ))}
          </div>

          <label className="flex min-h-10 items-center justify-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={hideNext}
              onChange={(e) => setHideNext(e.target.checked)}
              className="h-5 w-5 shrink-0 accent-sky"
            />
            다시 보지 않기
          </label>

          <div className="flex gap-2">
            {index > 0 && (
              <BigButton variant="secondary" onClick={() => go(index - 1)}>
                이전
              </BigButton>
            )}
            {last ? (
              <BigButton ref={firstButtonRef} onClick={finish}>
                시작하기
              </BigButton>
            ) : (
              <BigButton ref={firstButtonRef} onClick={() => go(index + 1)}>
                다음
              </BigButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────── 그림 — setup-steps.tsx 의 카드 그림과 같은 규격(200×150 · currentColor 선) ───────────── */

const ART = 'h-full max-h-40 w-auto';

/** 1. 멀어질수록 작아지는 공 — 크기로 거리, 거리 변화로 구속 */
function ArtShrink() {
  return (
    <svg
      viewBox="0 0 200 150"
      className={ART}
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* 폰 */}
      <rect x="14" y="50" width="26" height="50" rx="5" fill="white" />
      <circle cx="27" cy="68" r="5" />
      {/* 화각 */}
      <path d="M40 60L190 26M40 90L190 124" stroke="#94a3b8" strokeDasharray="3 5" />
      {/* 점점 작아지는 공 */}
      <circle cx="70" cy="75" r="16" fill="white" />
      <path d="M62 64c6 4 6 18 0 22M78 64c-6 4-6 18 0 22" strokeWidth="3" />
      <circle cx="118" cy="75" r="10" fill="white" />
      <circle cx="152" cy="75" r="6" fill="white" />
      <circle cx="176" cy="75" r="3" fill="currentColor" stroke="none" />
      {/* 속도 화살 */}
      <path d="M62 128h110M164 120l8 8-8 8" />
    </svg>
  );
}

/** 2. 삼각대 위 폰 · 투수 뒤 1m · 해 */
function ArtPrep() {
  return (
    <svg
      viewBox="0 0 200 150"
      className={ART}
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* 해 */}
      <circle cx="170" cy="28" r="10" stroke="#b45309" />
      <path d="M170 8v6M170 42v6M150 28h6M184 28h6" stroke="#b45309" />
      {/* 삼각대 + 폰 */}
      <rect x="30" y="40" width="26" height="46" rx="5" fill="white" />
      <circle cx="43" cy="58" r="5" />
      <path d="M43 86v12M43 98L22 136M43 98l21 38M43 98v38" />
      {/* 1m 표시 */}
      <path d="M70 128h40M70 122v12M110 122v12" stroke="#94a3b8" />
      <text
        x="90"
        y="116"
        textAnchor="middle"
        fontSize="12"
        fill="#64748b"
        stroke="none"
      >
        1m
      </text>
      {/* 투수 */}
      <circle cx="140" cy="62" r="10" />
      <path d="M140 72v34M140 84l-16 10M140 84l18-14M140 106l-12 30M140 106l12 30" />
    </svg>
  );
}

/** 3. 폰 화면 위 수평계 · 표적 · 반투명 존 */
function ArtZone() {
  return (
    <svg
      viewBox="0 0 200 150"
      className={ART}
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="40" y="10" width="120" height="130" rx="14" fill="white" />
      {/* 수평계 — 왼쪽 위 작은 동그라미, 선이 수평이면 초록 */}
      <circle cx="60" cy="30" r="8" strokeWidth="3" />
      <path d="M54 30h12" stroke="#047857" strokeWidth="3" />
      {/* 표적 */}
      <circle cx="100" cy="78" r="18" stroke="#94a3b8" />
      <path d="M100 54v8M100 94v8M76 78h8M116 78h8" stroke="#94a3b8" />
      {/* 존 */}
      <rect
        x="76"
        y="60"
        width="48"
        height="60"
        rx="4"
        fill="currentColor"
        fillOpacity="0.18"
      />
      <rect x="76" y="60" width="48" height="60" rx="4" strokeDasharray="6 4" />
      {/* 끄는 손가락 */}
      <path d="M128 118l8 10 6-2-4-12" strokeWidth="3" />
    </svg>
  );
}

/** 4. 측정 중 화면 — 큰 숫자 · 목록 · 아래 가운데 종료 단추 */
function ArtLive() {
  return (
    <svg
      viewBox="0 0 200 150"
      className={ART}
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="40" y="10" width="120" height="130" rx="14" fill="white" />
      {/* 위쪽 단추 셋: 뒤로 · 재초점 · 설정 */}
      <path d="M56 24l-4 4 4 4" strokeWidth="3" />
      <circle cx="100" cy="28" r="5" strokeWidth="3" />
      <circle cx="144" cy="28" r="5" strokeWidth="3" />
      <path d="M144 20v3M144 33v3M136 28h3M149 28h3" strokeWidth="3" />
      {/* 큰 숫자 */}
      <text
        x="100"
        y="70"
        textAnchor="middle"
        fontSize="30"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        128
      </text>
      <text
        x="100"
        y="84"
        textAnchor="middle"
        fontSize="10"
        fill="#64748b"
        stroke="none"
      >
        km/h · 직구
      </text>
      {/* 목록 줄 */}
      <path d="M58 98h84M58 108h60" stroke="#94a3b8" strokeWidth="3" />
      {/* 종료 단추 */}
      <rect x="74" y="118" width="52" height="14" rx="7" fill="#dc2626" stroke="none" />
    </svg>
  );
}

/** 5. 잰 뒤 — 공 한 줄 · 연필 · 재생 */
function ArtAfter() {
  return (
    <svg
      viewBox="0 0 200 150"
      className={ART}
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* 목록 줄 셋 */}
      <rect x="20" y="24" width="160" height="28" rx="8" fill="white" />
      <rect x="20" y="62" width="160" height="28" rx="8" fill="white" />
      <rect x="20" y="100" width="160" height="28" rx="8" fill="white" />
      {/* 공 · 숫자 */}
      <circle cx="38" cy="38" r="7" />
      <path d="M54 38h40" stroke="#94a3b8" />
      <circle cx="38" cy="76" r="7" />
      <path d="M54 76h40" stroke="#94a3b8" />
      <circle cx="38" cy="114" r="7" />
      <path d="M54 114h40" stroke="#94a3b8" />
      {/* 연필(고치기) */}
      <path d="M124 44l16-16 6 6-16 16-8 2z" strokeWidth="3" />
      {/* 재생(영상) */}
      <circle cx="160" cy="76" r="9" strokeWidth="3" />
      <path d="M157 71l8 5-8 5z" fill="currentColor" stroke="none" />
      {/* 스피드건 표시 */}
      <rect
        x="120"
        y="106"
        width="48"
        height="16"
        rx="8"
        stroke="#047857"
        strokeWidth="3"
      />
      <path d="M130 114h28" stroke="#047857" strokeWidth="3" />
    </svg>
  );
}
