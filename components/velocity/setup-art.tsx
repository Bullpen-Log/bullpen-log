'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { isRestSession, SESSION_TYPES } from '@/lib/session-type';
import { CAMERA_OPTIONS, type CameraPos } from '@/lib/velocity-setup';

/**
 * 구속 측정 앞 설정의 그림 카드 — 어떤 투구 → 카메라 위치 → 네트.
 *
 * 예전 설정 화면은 Segmented 한 줄에 설명 한 줄이라 "투수 뒤 · 포수 뒤"가 무슨 상황인지
 * 눈에 안 들어왔다(사용자: "뭐가 뭔지 모르겠다"). 단계마다 큰 카드에 그림 + 이름 + 설명 +
 * "이럴 때" 한 줄을 붙여, 고르기 전에 어떤 자리 · 어떤 상황인지 보이게 한다.
 *
 * 그림은 전부 SVG · currentColor · 선 굵기 2 · 둥근 끝(주의사항 카드의 ArtTripod 와 같은 계열).
 * 글자는 SVG 안에 넣지 않는다 — 크기를 줄이면 못 읽고, 단위 · 말이 바뀌면 그림을 다시 그려야 한다.
 * 채움은 var(--color-surface) — 'white' 로 못박으면 어두운 테마에서 카드 안만 하얗게 튄다.
 *
 * 같은 그림의 작은 단색판(SetupIcon, 32×32)은 "지난 설정 그대로 쓸까요?" 카드와 구속 측정
 * 메인 화면의 요약 줄(SetupSummaryRow)이 쓴다 — 큰 카드에서 고른 것과 같은 모양이라 한눈에 잇는다.
 */

/* 그림 크기 · 채움 — 카드 그림 칸(h-full max-h-24)에 맞춘다. 채움은 테마 토큰이라 어두운 테마도 맞는다 */
const ART = 'h-full max-h-24 w-auto max-w-full';
const FILL = 'var(--color-surface)';

export type SetupOption<V extends string> = {
  value: V;
  label: string;
  /** 무엇인지 한 줄 */
  hint: string;
  /** 어떤 상황에서 이걸 고르는지 — 지금은 화면에 안 보인다(2026-10-15 "너무 조잡해" — 카드마다 세 줄이던 것을 한 줄로) */
  when?: string;
  art: ReactNode;
};

/* ───────────────────────── 선택지 ───────────────────────── */

/** 투구 종류 — 투구 기록의 SESSION_TYPES 에서 휴식을 뺀 넷. value 는 이름 그대로(기록에 같이 저장된다) */
export function sessionTypeOptions(): SetupOption<string>[] {
  const art: Record<string, ReactNode> = {
    불펜: <ArtBullpen />,
    라이브: <ArtLive />,
    경기: <ArtGame />,
    캐치볼: <ArtCatch />,
  };
  return SESSION_TYPES.filter((t) => !isRestSession(t.name)).map((t) => ({
    value: t.name,
    label: t.name,
    hint: t.hint,
    art: art[t.name] ?? <ArtEmpty />,
  }));
}

/** 카메라 위치 — 지금은 투수 뒤 하나(lib/velocity-setup.ts CAMERA_OPTIONS). 그림의 공은 투수 → 포수 */
export function cameraPosOptions(): SetupOption<CameraPos>[] {
  const hint: Record<CameraPos, string> = {
    'behind-pitcher': '던지는 팔 쪽으로 30cm쯤 비키면 릴리스가 가운데 와요',
    'behind-catcher': '포수 · 네트 뒤 1~3m',
  };
  return CAMERA_OPTIONS.map((o) => ({
    value: o.key,
    label: o.label,
    hint: hint[o.key],
    art: <ArtCameraPos behind={o.key === 'behind-pitcher'} />,
  }));
}

function cameraName(cameraPos: string) {
  return CAMERA_OPTIONS.find((o) => o.key === cameraPos)?.label ?? '';
}

/* ───────────────────────── 카드 ───────────────────────── */

/**
 * 그림 카드로 하나 고르기 — 라디오 묶음. 앱의 고르기 카드(components/onboarding/choices.tsx OptionCards)와 같은 줄:
 * 왼쪽 그림 칸 · 이름 + 한 줄 · 오른쪽 동그라미 체크. 예전에는 위에 큰 그림 · 밑에 설명 두 줄 + '이럴 때' 한 줄이라
 * 카드마다 글이 세 줄씩 쌓였다(2026-10-15 사용자 "구속측정이 너무 조잡해").
 */
export function OptionCards<V extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly SetupOption<V>[];
  value: V | null;
  onChange: (v: V) => void;
  /** 예전 두 칸 · 한 칸 고르기 — 이제 늘 한 줄에 하나라 쓰지 않는다 */
  columns?: 1 | 2;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-1 gap-2.5">
      {options.map((o, i) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            style={{ '--row': i } as React.CSSProperties}
            className={`motion-safe:animate-row-in flex min-h-16 w-full items-center gap-3 rounded-2xl border py-2.5 pl-2.5 pr-4 text-left transition-[border-color,background-color,box-shadow] duration-200 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-strong ${
              on
                ? 'border-sky bg-sky/10 shadow-[inset_0_0_0_1px_var(--color-sky)]'
                : 'border-line bg-surface hover:border-sky-soft'
            }`}
          >
            <span
              aria-hidden
              className={`flex h-14 w-16 shrink-0 items-center justify-center rounded-xl px-1.5 py-2 text-sky transition-colors ${
                on ? 'bg-surface' : 'bg-sky-tint/60'
              }`}
            >
              {o.art}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`block text-base font-semibold break-keep ${on ? 'text-sky-strong' : 'text-ink'}`}
              >
                {o.label}
              </span>
              <span
                className={`mt-0.5 block text-footnote leading-snug break-keep ${on ? 'text-sky-strong/80' : 'text-muted'}`}
              >
                {o.hint}
              </span>
            </span>
            <span
              aria-hidden
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-[background-color,border-color,transform] duration-200 ${
                on
                  ? 'scale-100 border-sky bg-sky text-white'
                  : 'scale-90 border-line-strong bg-surface text-transparent'
              }`}
            >
              <Check className="h-3.5 w-3.5" />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────── 요약 줄 ───────────────────────── */

/**
 * 고른 설정 네 칸을 가로로 — 아이콘 + 이름. "지난 설정 그대로 쓸까요?" 카드와 구속 측정 메인 화면이 쓴다.
 * tone='dark' 는 카메라 · 검은 바탕 위(측정 화면)에서 흰 글자로.
 */
export function SetupSummaryRow({
  sessionType,
  cameraPos,
  tone = 'light',
}: {
  sessionType: string | null;
  /** 'behind-pitcher' · 'behind-catcher' */
  cameraPos: string;
  /** 옛 부르는 곳이 넘기는 값 — 네트는 더 묻지 않아 안 보인다(2026-10-15) */
  net?: boolean;
  tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';
  const cells: { kind: SetupIconKind; title: string; value: string; label: string }[] =
    [
      {
        kind: 'type',
        title: '종류',
        value: sessionType ?? '',
        label: sessionType ?? '종류 없음',
      },
      {
        kind: 'camera',
        title: '카메라',
        value: cameraPos,
        label: cameraName(cameraPos),
      },
    ];
  return (
    <ul className="grid grid-cols-2 gap-2">
      {cells.map((c) => (
        <li
          key={c.kind}
          aria-label={`${c.title}: ${c.label}`}
          className="flex flex-col items-center gap-1.5 text-center"
        >
          <span
            className={`flex h-12 w-12 items-center justify-center rounded-xl ${
              dark ? 'bg-white/10 text-white' : 'bg-sky-tint/60 text-sky'
            }`}
          >
            <SetupIcon kind={c.kind} value={c.value} className="h-7 w-7" />
          </span>
          <span
            className={`text-xs font-medium leading-tight ${dark ? 'text-white/90' : 'text-ink'}`}
          >
            {c.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ───────────────────────── 작은 아이콘 ───────────────────────── */

export type SetupIconKind = 'type' | 'camera';

/** 큰 그림의 작은 단색판(currentColor · 선 1.75 · 32×32). 모르는 값이면 빈 원 */
export function SetupIcon({
  kind,
  value,
  className = 'h-8 w-8',
}: {
  kind: SetupIconKind;
  value: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {iconShape(kind, value)}
    </svg>
  );
}

function iconShape(kind: SetupIconKind, value: string): ReactNode {
  const key = `${kind}:${value === 'true' ? 'yes' : value === 'false' ? 'no' : value}`;
  switch (key) {
    /* 불펜 — 마운드(투수판)와 공 */
    case 'type:불펜':
      return (
        <>
          <path d="M3 27c4-7 8-10 13-10s9 3 13 10" />
          <path d="M13 17h6" strokeWidth="2.5" />
          <circle cx="24" cy="8" r="3.5" fill={FILL} />
        </>
      );
    /* 라이브 — 방망이를 든 타자 */
    case 'type:라이브':
      return (
        <>
          <circle cx="13" cy="7" r="3.5" />
          <path d="M13 11v9M13 20l-4 8M13 20l4 8M13 14l6-2" />
          <path d="M19 12l8-7" strokeWidth="2.5" />
        </>
      );
    /* 경기 — 다이아몬드 */
    case 'type:경기':
      return (
        <>
          <path d="M16 29L28 16 16 3 4 16Z" />
          <circle cx="16" cy="16" r="2.5" fill="currentColor" stroke="none" />
          <path d="M25 16h2M16 5v2M7 16h-2" />
        </>
      );
    /* 캐치볼 — 두 사람 사이의 포물선 */
    case 'type:캐치볼':
      return (
        <>
          <circle cx="7" cy="22" r="3" />
          <circle cx="25" cy="22" r="3" />
          <path d="M7 25v4M25 25v4" />
          <path d="M9 17c3-9 11-9 14 0" strokeDasharray="2 3" />
          <circle cx="16" cy="10" r="2.5" fill="currentColor" stroke="none" />
        </>
      );
    /* 투수 뒤 — 폰 · 시야 · 투수 · 홈플레이트(위에서 본 것) */
    case 'camera:behind-pitcher':
      return (
        <>
          <rect
            x="2"
            y="11"
            width="5"
            height="10"
            rx="1.5"
            fill="currentColor"
            stroke="none"
          />
          <path d="M7 16l11-7M7 16l11 7" strokeDasharray="2 2" />
          <circle cx="14" cy="16" r="3" fill="currentColor" stroke="none" />
          <path d="M23 13h4l3 3-3 3h-4z" />
        </>
      );
    /* 포수 뒤 — 마운드 · 홈플레이트 · 시야 · 폰 */
    case 'camera:behind-catcher':
      return (
        <>
          <circle cx="5" cy="16" r="3" fill="currentColor" stroke="none" />
          <path d="M11 13h4l3 3-3 3h-4z" />
          <rect
            x="25"
            y="11"
            width="5"
            height="10"
            rx="1.5"
            fill="currentColor"
            stroke="none"
          />
          <path d="M25 16l-11-7M25 16l-11 7" strokeDasharray="2 2" />
        </>
      );
    default:
      return <circle cx="16" cy="16" r="10" />;
  }
}

/* ───────────────────────── 큰 그림 ───────────────────────── */

function Art({
  children,
  viewBox = '0 0 160 120',
}: {
  children: ReactNode;
  viewBox?: string;
}) {
  return (
    <svg
      viewBox={viewBox}
      className={ART}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** 공 — 크면(r ≥ 6) 실밥 두 줄을 넣는다 */
function Ball({ cx, cy, r = 5 }: { cx: number; cy: number; r?: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={FILL} />
      {r >= 6 && (
        <path
          d={`M${cx - 0.5 * r} ${cy - 0.85 * r}Q${cx + 0.05 * r} ${cy} ${cx - 0.5 * r} ${cy + 0.85 * r}M${cx + 0.5 * r} ${cy - 0.85 * r}Q${cx - 0.05 * r} ${cy} ${cx + 0.5 * r} ${cy + 0.85 * r}`}
          strokeWidth="1.25"
        />
      )}
    </>
  );
}

function ArtEmpty() {
  return (
    <Art>
      <circle cx="80" cy="60" r="24" />
    </Art>
  );
}

/** 불펜 — 마운드 위 투수 옆모습, 앉은 포수, 공 */
function ArtBullpen() {
  return (
    <Art>
      <path d="M8 100h144" />
      <path d="M18 100c10-12 20-16 30-16s20 4 30 16" />
      <path d="M42 84h12" strokeWidth="3" />
      {/* 투수 — 앞발을 내딛고 공을 놓는 순간 */}
      <circle cx="50" cy="44" r="6" />
      <path d="M50 50v24" />
      <path d="M50 56l14-6 6-4" />
      <path d="M50 58l-10 8" />
      <path d="M50 74l14 12M50 74l-10 12" />
      <Ball cx={76} cy={44} r={4} />
      <path d="M82 45c14 3 26 8 38 16" strokeDasharray="3 5" />
      {/* 포수 — 앉아서 미트를 내민다 */}
      <circle cx="138" cy="64" r="6" />
      <path d="M138 70l-3 12" />
      <path d="M135 82l-11 4-2 14M135 82l11 4 2 14" />
      <path d="M136 74l-10-4" />
      <circle cx="123" cy="67" r="4" fill="currentColor" stroke="none" />
    </Art>
  );
}

/** 라이브 — 투수, 타석의 타자, 포수 */
function ArtLive() {
  return (
    <Art>
      <path d="M8 100h144" />
      <path d="M10 100c8-10 16-14 26-14s18 4 26 14" />
      {/* 투수 */}
      <circle cx="36" cy="48" r="5" />
      <path d="M36 53v20" />
      <path d="M36 58l12-6 4-3" />
      <path d="M36 60l-8 6" />
      <path d="M36 73l10 13M36 73l-8 13" />
      <Ball cx={57} cy={47} r={3.5} />
      <path d="M62 48c22 4 44 10 64 20" strokeDasharray="3 5" />
      {/* 타자 — 방망이를 들고 기다린다 */}
      <circle cx="108" cy="42" r="6" />
      <path d="M108 48v26" />
      <path d="M108 74l-8 24M108 74l10 24" />
      <path d="M108 56l10-4" />
      <path d="M118 52l16-20" strokeWidth="3.5" />
      {/* 포수 */}
      <circle cx="146" cy="70" r="5" />
      <path d="M146 75l-2 10" />
      <path d="M144 85l-9 4-2 11M144 85l9 4 2 11" />
      <path d="M145 78l-9-4" />
      <circle cx="133" cy="72" r="3.5" fill="currentColor" stroke="none" />
    </Art>
  );
}

/** 경기 — 다이아몬드 내야, 투수 · 타자, 관중석 암시 */
function ArtGame() {
  return (
    <Art>
      {/* 관중석 — 점선 호 두 줄 */}
      <path
        d="M10 40c20-22 44-32 70-32s50 10 70 32"
        strokeDasharray="2 5"
        opacity="0.55"
      />
      <path
        d="M24 48c16-16 36-24 56-24s40 8 56 24"
        strokeDasharray="2 5"
        opacity="0.55"
      />
      {/* 내야 */}
      <path d="M80 108L124 76 80 44 36 76Z" />
      <rect x="121" y="73" width="6" height="6" fill="currentColor" stroke="none" />
      <rect x="77" y="41" width="6" height="6" fill="currentColor" stroke="none" />
      <rect x="33" y="73" width="6" height="6" fill="currentColor" stroke="none" />
      <path d="M75 103h10v4l-5 4-5-4z" fill={FILL} />
      <circle cx="80" cy="76" r="8" />
      {/* 투수 — 마운드 위에 선다 */}
      <circle cx="80" cy="56" r="4" />
      <path d="M80 60v9M80 63l6-4M80 64l-6 4" />
      {/* 타자 */}
      <circle cx="94" cy="90" r="4" />
      <path d="M94 94v10M94 98l6-3" />
      <path d="M100 95l8-10" strokeWidth="3" />
    </Art>
  );
}

/** 캐치볼 — 마주 본 두 사람, 포물선을 그리는 공 */
function ArtCatch() {
  return (
    <Art>
      <path d="M8 100h144" />
      {/* 던지는 사람 */}
      <circle cx="34" cy="50" r="6" />
      <path d="M34 56v22" />
      <path d="M34 62l14-12" />
      <path d="M34 64l-8 8" />
      <path d="M34 78l-8 20M34 78l8 20" />
      {/* 받는 사람 */}
      <circle cx="126" cy="50" r="6" />
      <path d="M126 56v22" />
      <path d="M126 62l-12-8" />
      <path d="M126 64l8 8" />
      <path d="M126 78l-8 20M126 78l8 20" />
      <circle cx="111" cy="52" r="4.5" fill="currentColor" stroke="none" />
      {/* 공 */}
      <path d="M52 46c14-26 42-26 56 2" strokeDasharray="3 5" />
      <Ball cx={80} cy={27} r={4.5} />
    </Art>
  );
}

/**
 * 카메라 위치 — 위에서 본 그림. 왼쪽이 마운드, 오른쪽이 홈플레이트. 폰과 시야각 부채꼴이
 * 투수 뒤(왼쪽 끝) 또는 포수 뒤(오른쪽 끝)에 놓인다. 공 화살표는 마운드 → 홈.
 */
function ArtCameraPos({ behind }: { behind: boolean }) {
  return (
    <Art>
      {/* 파울선 — 홈에서 퍼지는 두 줄 */}
      <path d="M122 60L30 18M122 60L30 102" opacity="0.3" />
      {/* 시야각 */}
      {behind ? (
        <>
          <path
            d="M22 60L115 24A100 100 0 0 1 115 96Z"
            fill="currentColor"
            fillOpacity="0.1"
            stroke="none"
          />
          <path d="M22 60L115 24M22 60L115 96" strokeDasharray="2 4" opacity="0.5" />
          <rect
            x="12"
            y="52"
            width="8"
            height="16"
            rx="2"
            fill="currentColor"
            stroke="none"
          />
        </>
      ) : (
        <>
          <path
            d="M146 60L53 24A100 100 0 0 0 53 96Z"
            fill="currentColor"
            fillOpacity="0.1"
            stroke="none"
          />
          <path d="M146 60L53 24M146 60L53 96" strokeDasharray="2 4" opacity="0.5" />
          <rect
            x="148"
            y="52"
            width="8"
            height="16"
            rx="2"
            fill="currentColor"
            stroke="none"
          />
        </>
      )}
      {/* 마운드 · 홈플레이트 */}
      <circle cx="62" cy="60" r="9" />
      <path d="M118 55h6l5 5-5 5h-6z" fill={FILL} />
      {/* 투수 · 포수 */}
      <circle cx="62" cy="60" r="3" fill="currentColor" stroke="none" />
      <circle cx="136" cy="60" r="3" fill="currentColor" stroke="none" />
      {/* 공 방향 */}
      <path d="M74 60h32" />
      <path d="M100 54l7 6-7 6" />
      <Ball cx={88} cy={60} r={4} />
    </Art>
  );
}
