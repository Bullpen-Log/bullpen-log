'use client';

import type { ReactNode } from 'react';
import { isRestSession, SESSION_TYPES } from '@/lib/session-type';
import {
  CAMERA_OPTIONS,
  MODE_OPTIONS,
  NET_OPTIONS,
  type CameraPos,
  type RecordMode,
} from '@/lib/velocity-setup';

/**
 * 구속 측정 앞 설정의 그림 카드 — 어떤 투구 → 무엇을 재나 → 카메라 위치 → 네트.
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
const ART = 'h-full max-h-24 w-auto';
const FILL = 'var(--color-surface)';

export type SetupOption<V extends string> = {
  value: V;
  label: string;
  /** 무엇인지 한 줄 */
  hint: string;
  /** 어떤 상황에서 이걸 고르는지 한 줄 — 카드에 "이럴 때 · " 를 붙여 보인다 */
  when: string;
  art: ReactNode;
};

/* ───────────────────────── 선택지 ───────────────────────── */

/** 투구 종류 — 투구 기록의 SESSION_TYPES 에서 휴식을 뺀 넷. value 는 이름 그대로(기록에 같이 저장된다) */
export function sessionTypeOptions(): SetupOption<string>[] {
  const when: Record<string, string> = {
    불펜: '마운드 · 불펜에서 포수를 앉히고 던질 때',
    라이브: '타자를 세워 두고 실전처럼 던질 때',
    경기: '실제 시합 중 — 강도가 높아요',
    캐치볼: '가볍게 주고받으며 몸을 풀 때',
  };
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
    when: when[t.name] ?? '',
    art: art[t.name] ?? <ArtEmpty />,
  }));
}

/** 무엇을 재나 — 투구 · 타구. 설명은 lib/velocity-setup 의 MODE_OPTIONS 와 한곳 */
export function modeOptions(): SetupOption<RecordMode>[] {
  const when: Record<RecordMode, string> = {
    pitch: '투수가 던진 공의 구속을 잴 때(보통 이것)',
    hit: '방망이에 맞고 나가는 타구 속도를 잴 때',
  };
  return MODE_OPTIONS.map((o) => ({
    value: o.key,
    label: modeName(o.key),
    hint: o.hint,
    when: when[o.key],
    art: o.key === 'hit' ? <ArtHit /> : <ArtPitch />,
  }));
}

/** 카메라 위치 — 투수 뒤 · 포수 뒤. 그림의 공 방향은 무엇을 재나에 따라 뒤집힌다(투구는 투수 → 포수, 타구는 타자 → 밖) */
export function cameraPosOptions(mode: RecordMode): SetupOption<CameraPos>[] {
  const when: Record<CameraPos, string> = {
    'behind-pitcher': '폰을 투수 바로 뒤 1m 안에 — 릴리스 포인트까지 잡혀요(가장 정확)',
    'behind-catcher':
      '폰을 포수 · 네트 뒤 1~3m 에 — 코스가 잘 보여요, 릴리스까지 거리를 적어요',
  };
  return CAMERA_OPTIONS.map((o) => ({
    value: o.key,
    label: o.label,
    hint: o.hint,
    when: when[o.key],
    art: <ArtCameraPos behind={o.key === 'behind-pitcher'} mode={mode} />,
  }));
}

/** 네트 — 있음 · 없음. boolean 은 라디오 값이 못 되니 'yes' · 'no' 로 */
export function netOptions(): SetupOption<'yes' | 'no'>[] {
  const when = {
    yes: '카메라와 공 사이에 그물이 있을 때 — 초점을 고정해요(자동초점이면 그물코에 초점이 잡혀요)',
    no: '그물 없이 트인 곳 — 자동초점',
  };
  return NET_OPTIONS.map((o) => {
    const value = o.key ? 'yes' : 'no';
    return {
      value,
      label: o.label,
      hint: o.hint,
      when: when[value],
      art: <ArtNet net={o.key} />,
    };
  });
}

function modeName(mode: string) {
  return mode === 'hit' ? '타구' : mode === 'pitch' ? '투구' : '—';
}

function cameraName(cameraPos: string) {
  return CAMERA_OPTIONS.find((o) => o.key === cameraPos)?.label ?? '—';
}

/* ───────────────────────── 카드 ───────────────────────── */

/**
 * 그림 카드로 하나 고르기 — 라디오 묶음. 두 칸(기본) 또는 한 칸.
 * 그림 칸은 4:3(한 칸이면 높이 112px), 낮은 화면(short:)에서는 낮춘다 — 카드 둘이 한 화면에 들어오게.
 */
export function OptionCards<V extends string>({
  label,
  options,
  value,
  onChange,
  columns = 2,
}: {
  label: string;
  options: readonly SetupOption<V>[];
  value: V | null;
  onChange: (v: V) => void;
  columns?: 1 | 2;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`grid gap-3 motion-safe:animate-fade-in ${columns === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`flex w-full flex-col overflow-hidden rounded-2xl border text-left transition-[border-color,box-shadow,background-color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky ${
              on
                ? 'border-sky bg-sky/5 ring-2 ring-sky/30'
                : 'border-line bg-surface hover:border-sky-soft'
            }`}
          >
            <span
              className={`flex w-full items-center justify-center bg-sky-tint/60 px-4 py-2 text-sky ${
                columns === 1
                  ? 'h-28 short:h-20'
                  : 'aspect-[4/3] short:aspect-auto short:h-20'
              }`}
            >
              {o.art}
            </span>
            <span className="flex flex-1 flex-col px-3.5 py-3">
              <span className="text-sm font-semibold text-ink">{o.label}</span>
              <span className="mt-0.5 text-xs leading-relaxed text-muted">
                {o.hint}
              </span>
              <span className="mt-1.5 text-xs leading-relaxed text-ink">
                <span className="font-medium text-sky">이럴 때 · </span>
                {o.when}
              </span>
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
  mode,
  cameraPos,
  net,
  tone = 'light',
}: {
  sessionType: string | null;
  /** 'pitch' · 'hit' */
  mode: string;
  /** 'behind-pitcher' · 'behind-catcher' */
  cameraPos: string;
  net: boolean;
  tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';
  const cells: { kind: SetupIconKind; title: string; value: string; label: string }[] =
    [
      {
        kind: 'type',
        title: '종류',
        value: sessionType ?? '',
        label: sessionType ?? '종류 —',
      },
      { kind: 'mode', title: '재는 것', value: mode, label: modeName(mode) },
      {
        kind: 'camera',
        title: '카메라',
        value: cameraPos,
        label: cameraName(cameraPos),
      },
      {
        kind: 'net',
        title: '네트',
        value: net ? 'yes' : 'no',
        label: net ? '네트 있음' : '네트 없음',
      },
    ];
  return (
    <ul className="grid grid-cols-4 gap-2">
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

export type SetupIconKind = 'type' | 'mode' | 'camera' | 'net';

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
    /* 투구 — 날아가는 공 */
    case 'mode:pitch':
      return (
        <>
          <circle cx="10" cy="16" r="6" fill={FILL} />
          <path d="M19 16h10M25 12l4 4-4 4" />
        </>
      );
    /* 타구 — 방망이를 떠나는 공 */
    case 'mode:hit':
      return (
        <>
          <path d="M4 28L16 16" strokeWidth="3" />
          <circle cx="20" cy="12" r="4" fill={FILL} />
          <path d="M25 8l5-5M26 3h4v4" />
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
    /* 네트 있음 — 그물 뒤의 공 */
    case 'net:yes':
      return (
        <>
          <circle cx="16" cy="16" r="5" fill={FILL} />
          <rect x="4" y="4" width="24" height="24" rx="2" />
          <path d="M12 4v24M20 4v24M4 12h24M4 20h24" strokeWidth="1" opacity="0.8" />
        </>
      );
    /* 네트 없음 — 초점 틀 안의 공 */
    case 'net:no':
      return (
        <>
          <circle cx="16" cy="16" r="6" fill={FILL} />
          <path d="M4 10V5a1 1 0 0 1 1-1h5M22 4h5a1 1 0 0 1 1 1v5M28 22v5a1 1 0 0 1-1 1h-5M10 28H5a1 1 0 0 1-1-1v-5" />
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

/** 투구 — 손에서 공이 떠나는 순간, 날아가는 방향 */
function ArtPitch() {
  return (
    <Art>
      <circle cx="38" cy="48" r="8" />
      <path d="M40 56l-4 32" />
      <path d="M39 62l17-12 14-10" />
      <path d="M39 66l-12 12" />
      <path d="M36 88l-10 20M36 88l18 16" />
      <Ball cx={82} cy={36} r={7} />
      <path d="M96 36h44" />
      <path d="M132 29l8 7-8 7" />
    </Art>
  );
}

/** 타구 — 방망이에 맞아 나가는 공, 날아가는 방향 */
function ArtHit() {
  return (
    <Art>
      <circle cx="40" cy="42" r="8" />
      <path d="M40 50v34" />
      <path d="M40 84l-12 22M40 84l14 20" />
      <path d="M40 58l18 4" />
      <path d="M58 62l28-18" strokeWidth="4" />
      <Ball cx={98} cy={38} r={7} />
      {/* 맞는 순간 */}
      <path d="M84 32l-4-6M90 28l-1-7" opacity="0.6" />
      <path d="M110 33l34-12" />
      <path d="M134 18l10 3-5 8" />
    </Art>
  );
}

/**
 * 카메라 위치 — 위에서 본 그림. 왼쪽이 마운드, 오른쪽이 홈플레이트. 폰과 시야각 부채꼴이
 * 투수 뒤(왼쪽 끝) 또는 포수 뒤(오른쪽 끝)에 놓인다. 공 화살표는 투구면 마운드 → 홈,
 * 타구면 홈 → 밖(왼쪽 위).
 */
function ArtCameraPos({ behind, mode }: { behind: boolean; mode: RecordMode }) {
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
      {/* 투수 · 포수 · (타구면) 타자 */}
      <circle cx="62" cy="60" r="3" fill="currentColor" stroke="none" />
      <circle cx="136" cy="60" r="3" fill="currentColor" stroke="none" />
      {mode === 'hit' && (
        <circle cx="117" cy="49" r="3" fill="currentColor" stroke="none" />
      )}
      {/* 공 방향 */}
      {mode === 'hit' ? (
        <>
          <path d="M114 54L52 22" />
          <path d="M62 20l-10 2 4 9" />
          <Ball cx={83} cy={38} r={4} />
        </>
      ) : (
        <>
          <path d="M74 60h32" />
          <path d="M100 54l7 6-7 6" />
          <Ball cx={88} cy={60} r={4} />
        </>
      )}
    </Art>
  );
}

/** 네트 — 카메라 앞의 그물(있음) 또는 트인 공간(없음), 그 너머의 공과 초점 틀 */
function ArtNet({ net }: { net: boolean }) {
  const bx = net ? 124 : 110;
  return (
    <Art>
      {/* 폰(카메라) */}
      <rect x="12" y="40" width="22" height="40" rx="4" fill={FILL} />
      <circle cx="23" cy="52" r="4" />
      <path d={`M34 60H${bx - 14}`} strokeDasharray="3 5" opacity="0.6" />
      {net ? (
        <>
          <rect x="58" y="14" width="40" height="92" rx="2" />
          <path
            d="M68 14v92M78 14v92M88 14v92M58 26h40M58 38h40M58 50h40M58 62h40M58 74h40M58 86h40M58 98h40"
            strokeWidth="1"
            opacity="0.7"
          />
        </>
      ) : (
        <path d="M44 100h108" opacity="0.5" />
      )}
      {/* 공 + 초점 틀 */}
      <Ball cx={bx} cy={60} r={9} />
      <path
        d={`M${bx - 18} 49v-7h7M${bx + 11} 42h7v7M${bx + 18} 71v7h-7M${bx - 11} 78h-7v-7`}
      />
      {net && (
        <>
          {/* 자물쇠 — 초점 고정 */}
          <rect x={bx + 12} y="26" width="12" height="9" rx="2" fill={FILL} />
          <path d={`M${bx + 15} 26v-3a3 3 0 0 1 6 0v3`} />
        </>
      )}
    </Art>
  );
}
