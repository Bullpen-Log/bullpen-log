'use client';

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Info,
  Minus,
  MoveDiagonal2,
  Plus,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import {
  setupSummary,
  type CameraPos,
  type VelocitySetup,
  type ZoneRect,
} from '@/lib/velocity-setup';
import { PITCH_OK_DEG, type DeviceLevel } from '@/lib/use-device-level';
import { BottomSheet } from './pitch-editor';
import { SectionLabel, StepBar } from './kit';

/**
 * 구속 측정 앞 단계들 — 카메라를 켜기 전에 고르고 읽는 것.
 *
 *   지난 설정 → (투구 · 카메라 위치 · 네트) → 주의사항 카드 → 카메라(수평 · 표적) → 스트라이크 존 → 측정
 *
 * Smart Scout · PitchLab 이 이렇게 묻고 시작한다. 여기서 고른 것은 엔진의 방향(공이 멀어지나
 * 다가오나)과 안내 문구를 정하고, 세션에 함께 저장된다.
 */

/* ───────────────────────── 단계 껍데기 ───────────────────────── */

export function StepShell({
  step,
  total,
  title,
  subtitle,
  children,
  footer,
}: {
  step: number;
  total: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-2 short:pt-1">
        {/* 진행 띠 + 'n/전체' — 체크인 흐름의 머리와 같은 줄(components/checkin-flow/flow.tsx) */}
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <StepBar step={step} total={total} />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted" aria-hidden>
            {step}/{total}
          </span>
        </div>
        <h2 className="text-heading mt-6 text-2xl leading-tight text-ink short:mt-3 short:text-xl">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1.5 text-subhead leading-snug text-muted short:mt-1">
            {subtitle}
          </p>
        )}
        <div className="mt-6 short:mt-3">{children}</div>
      </div>
      {/* 아래 막대 — 체크인 흐름과 같이 테두리 없이 맨바탕 위에 */}
      <div className="flex shrink-0 items-center gap-2 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        {footer}
      </div>
    </div>
  );
}

/**
 * 카메라 위 안내창 — 구속 측정 첫 화면이 카메라가 된 뒤(2026-10-15 김민: "카메라처럼, 측정 시작을 누르면 그 위로 안내창 · 밑의
 * 촬영 단추는 가리지 않게") 설정 단계(지난 설정 · 종류 · 카메라 위치 · 주의사항)와 수평 · 존 안내를 뷰파인더 위 카드로 띄운다.
 * 앞으로 가기 단추는 카드 안(footer — 김민: "다음 버튼은 창에다가, 셔터로 하니까 헷갈려"), 돌아가기는 위 줄 ‹. 세로가 모자라면 카드
 * 안에서만 굴린다.
 */
export function GuideCard({
  step,
  total,
  title,
  subtitle,
  children,
  footer,
}: {
  step?: number;
  total?: number;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  /** 카드 밑 단추 줄 — 다음 · 완료 · 이 설정으로 시작 */
  footer?: React.ReactNode;
}) {
  return (
    <div className="pointer-events-auto max-h-full overflow-y-auto overscroll-contain rounded-3xl bg-page px-5 pb-5 pt-4 text-ink shadow-2xl motion-safe:animate-sheet-up">
      {step != null && total != null && (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <StepBar step={step} total={total} />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted" aria-hidden>
            {step}/{total}
          </span>
        </div>
      )}
      <h2 className="text-heading mt-4 text-xl leading-tight text-ink">{title}</h2>
      {subtitle && (
        <p className="mt-1.5 text-subhead leading-snug text-muted">{subtitle}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
      {footer && <div className="mt-5 flex items-center gap-2">{footer}</div>}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  tone = 'sky',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'sky' | 'quiet';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-14 items-center justify-center gap-2 rounded-2xl transition-colors disabled:opacity-50 ${
        tone === 'sky'
          ? 'flex-1 bg-sky text-lg font-bold text-white hover:bg-sky-strong'
          : 'min-w-28 bg-ink/6 px-5 text-base font-semibold text-ink hover:bg-ink/10'
      }`}
    >
      {children}
    </button>
  );
}

/* ───────────────────────── 1. 지난 설정 ───────────────────────── */

export function AskPreviousStep({
  setup,
  onUse,
  onFresh,
}: {
  setup: VelocitySetup;
  onUse: () => void;
  onFresh: () => void;
}) {
  const when = setup.savedAt ? new Date(setup.savedAt) : null;
  return (
    <StepShell
      step={1}
      total={6}
      title="지난 설정 그대로 쓸까요?"
      subtitle="같은 자리에서 같은 방식으로 재면 바로 카메라로 가요."
      footer={
        <>
          <PrimaryButton tone="quiet" onClick={onFresh}>
            새로 설정
          </PrimaryButton>
          <PrimaryButton onClick={onUse}>그대로 쓰기</PrimaryButton>
        </>
      }
    >
      <div className="overflow-hidden rounded-2xl bg-surface">
        <div className="px-4 py-3">
          <p className="text-sm font-semibold">{setupSummary(setup)}</p>
          <p className="mt-0.5 text-xs text-muted">
            스트라이크 존 자리 저장됨 · 소리 안내 {setup.voice ? '켬' : '끔'}
            {when && ` · ${when.getMonth() + 1}월 ${when.getDate()}일에 저장`}
          </p>
        </div>
      </div>
    </StepShell>
  );
}

/* ───────────────────────── 2. 고르기 ───────────────────────── */

export type Choices = { cameraPos: CameraPos; net: boolean };

/**
 * 거리 한 칸(m) — 엔진 2.0 은 이 거리로 구속의 크기를 정한다(투수 뒤: 카메라 → 공이 닿는 곳, 포수 뒤: 카메라 → 릴리스).
 * 빼기 · 더하기는 0.5m, 숫자 칸은 0.1m 까지. 누르는 단추는 48px(폰 화면 규격).
 */
export function DistanceField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const set = (n: number) => {
    const v = Math.round(Math.min(max, Math.max(min, n)) * 10) / 10;
    if (v !== value) onChange(v);
  };
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="0.5m 줄이기"
          onClick={() => set(value - 0.5)}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-ink/6 text-ink transition-colors hover:bg-ink/10"
        >
          <Minus aria-hidden className="h-6 w-6" />
        </button>
        <label className="flex h-14 min-w-0 flex-1 items-center justify-center gap-1 rounded-2xl bg-surface px-3">
          <input
            inputMode="decimal"
            key={value}
            defaultValue={value}
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= min && n <= max) set(n);
              else e.target.value = String(value);
            }}
            aria-label={`${label}(m)`}
            className="w-20 bg-transparent text-center text-2xl font-black tabular-nums text-ink focus:outline-none"
          />
          <span className="text-base text-muted">m</span>
        </label>
        <button
          type="button"
          aria-label="0.5m 늘리기"
          onClick={() => set(value + 0.5)}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-ink/6 text-ink transition-colors hover:bg-ink/10"
        >
          <Plus aria-hidden className="h-6 w-6" />
        </button>
      </div>
      <p className="mt-2 px-0.5 text-xs leading-relaxed text-muted">{hint}</p>
    </div>
  );
}

/* ───────────────────────── 3. 주의사항 카드 ───────────────────────── */

export type Tip = {
  key: string;
  title: string;
  short: string;
  long: string;
  art: React.ReactNode;
};

/** 고른 설정에 맞는 주의사항 카드들 — 카메라 위 안내창(components/velocity/tips-popup.tsx TipsCard)이 그린다 */
export function tipsFor(c: Choices): Tip[] {
  const behind = c.cameraPos === 'behind-pitcher';
  return [
    {
      key: 'tripod',
      title: '삼각대에 고정하세요',
      short: '손으로 들면 재지 않아요. 흔들리면 배경이 밀려 공을 못 찾아요.',
      long: '계산은 "배경은 가만히 있고 공만 움직인다"는 전제로 돌아가요. 손으로 들면 화면 전체가 조금씩 밀려서 공이 아닌 것이 움직인 것처럼 보여요. 조금 흔들리면 값에 알림이 붙고, 많이 흔들리면 재지 않아요. 삼각대가 없으면 가방 위, 펜스 틈 같은 곳에 단단히 기대 두세요. 셔터를 누를 때 폰을 건드리지 않게 소리 안내나 타이머를 쓰면 좋아요.',
      art: <ArtTripod />,
    },
    ...(behind
      ? []
      : [
          {
            key: 'lens',
            title: '렌즈 보정을 한 번 하세요',
            short:
              '카메라 유리에서 공 앞면까지 줄자로 1m. 원에 맞춰 재면 이 폰의 초점거리가 나와요.',
            long: '포수 뒤에서는 다가오는 공이 화면에서 몇 픽셀인지로 거리를 재요. 그 환산에 렌즈의 초점거리가 곱해지는데, 기종 · 동영상 모드의 크롭 · 손떨림 보정에 따라 5~10% 달라요. 렌즈 보정은 공을 카메라 렌즈에서 정확히 잰 거리(카메라 유리에서 공 앞면까지 줄자로 1m 권장)에 두고 화면에서 크기를 재 초점거리를 직접 구해요. 폰 · 렌즈(1x/0.5x) · 촬영 해상도를 바꾸면 다시 하세요. 설정 → 렌즈 보정.',
            art: <ArtLens />,
          },
          {
            key: 'camera',
            title: '1x 기본 렌즈, 줌 끄기',
            short:
              '0.5x · 2x · 디지털 줌은 크기 기준이 달라져요. 보정한 렌즈 그대로 쓰세요.',
            long: '렌즈를 바꾸거나 화면을 확대하면 초점거리가 달라져 보정값이 안 맞아요. 항상 1x 기본(광각 아님) 렌즈로, 줌은 1.0 에 두세요. 앱 카메라는 손떨림 보정을 켜고, 렌즈 보정도 그 화면으로 재요. HDR · 시네마틱 같은 밝기 자동 처리는 끄세요.',
            art: <ArtCamera />,
          },
        ]),
    /*
     * 투수 뒤의 자리(1m · 정면) · 거리(20m · 줄자) · 표적은 카메라 위치 단계와 수평 단계 안내가 한 번씩 말한다(2026-10-15 사용자:
     * "중복 설명 없게 한 번만"). 포수 뒤만 따로 안내가 필요하다.
     */
    ...(behind
      ? []
      : [
          {
            key: 'place',
            title: '포수 뒤, 네트에서 1~3m',
            short:
              '포수 · 미트 뒤에서 마운드를 정면으로 보게 두세요. 카메라에서 릴리스 지점까지 거리를 설정에 적어요.',
            long: '포수 뒤에서는 공이 카메라 쪽으로 다가오며 커지는 크기로 거리를 재요. 잴 만큼 커지는 것은 마지막 4m 안이라, 설정의 "카메라에서 릴리스 지점까지" 거리만큼 공기저항을 되돌려 릴리스 구속을 내요. 줄자나 걸음으로 재서 적어 두세요(정규 마운드 · 홈 뒤 1.8m 면 약 18.5m). 네트 바로 뒤에 붙이면 그물코가 공을 가려요. 조금 떨어져서 초점이 네트가 아니라 마운드에 맞게 하세요.',
            art: <ArtDistance behind={false} />,
          },
          {
            key: 'target',
            title: '미트가 오는 자리를 표적에',
            short: '높이를 맞춰 미트가 화면 한가운데 표적 근처에 오게 하세요.',
            long: '공이 마지막에 오는 자리(미트)가 가운데 근처에 오게 높이를 맞추세요. 스트라이크 존은 다음 단계에서 화면 위에 따로 놓아요.',
            art: <ArtTarget />,
          },
        ]),
    {
      key: 'level',
      title: '폰을 수평으로',
      short: "카메라 화면 왼쪽 위 수평계가 초록 '수평'이 되게 맞추세요.",
      long: '옆으로 기울면 공이 화면을 비스듬히 지나가고 스트라이크 존 격자도 기울어요. 삼각대 헤드를 돌려 좌우 기울기를 1.5° 안으로 맞추세요. 수평계의 선이 양쪽 눈금과 나란해지면 초록이 돼요. 앞뒤는 표적을 맞추느라 조금(10° 안) 숙이거나 젖혀도 괜찮아요. 폰이 기울기 값을 주지 않는 기기면 수평계가 안 뜨고, 그때는 눈으로 맞추세요.',
      art: <ArtLevel />,
    },
    {
      key: 'light',
      title: '밝은 곳, 단순한 배경',
      short:
        '밝을수록 셔터가 빨라져 공이 덜 번져요. 역광을 피하고, 흰 공 · 어두운 배경이 가장 잘 잡혀요.',
      long: '공은 배경보다 밝게 찍혀야 찾을 수 있어요. 해를 마주 보면 공이 검게 찍혀 못 찾고, 흰 벽 · 밝은 하늘이 배경이면 공과 구분이 안 돼요. 그물 · 초록 펜스 · 어두운 실내 벽이 좋은 배경이에요. 어두우면 카메라가 셔터를 길게 열어 공이 길게 번지고 자리를 잘못 잡아요. 낮의 야외나 밝은 실내에서 재세요. 형광등 · LED 아래에서는 조명 깜빡임(60Hz)으로 밝기가 프레임마다 흔들릴 수 있어요. 때가 탄 공보다 흰 공이 정확해요. 카메라 바로 앞에 그물이 있으면 초점이 그물에 잡힐 수 있으니 그물에서 30cm 이상 떨어지세요.',
      art: <ArtLight />,
    },
    {
      key: 'fps',
      title: '고속 촬영 · 1080p 이상',
      short: '앱이 1080p · 60fps 로 찍어요. 공이 날아가는 길을 장면마다 담아요.',
      long: '공은 손을 떠나 0.5~1초 동안 그물까지 날아가요. 초당 60장이면 그 길이 30~60장에 담겨 물리 궤적을 정확히 맞춰요. 초당 30장이면 장수가 반이라 덜 정확해요(값에 알림이 붙어요). 120 · 240장으로 찍혀도 60장 남짓으로 솎아 재요. 해상도는 1080p 이상. 낮으면 그물 쪽 먼 공이 몇 픽셀로 줄어 끝까지 못 따라가요.',
      art: <ArtFps />,
    },
  ];
}

export function TipsStep({
  choices,
  onNext,
  onBack,
}: {
  choices: Choices;
  onNext: () => void;
  onBack: () => void;
}) {
  const tips = tipsFor(choices);
  const [i, setI] = useState(0);
  const [detail, setDetail] = useState(false);
  const tip = tips[i];
  const last = i === tips.length - 1;

  return (
    <StepShell
      step={3}
      total={6}
      title="정확하게 재려면"
      subtitle="카드를 넘기며 확인하세요. 자세한 까닭은 '자세히'에."
      footer={
        <>
          <button
            type="button"
            onClick={() => (i === 0 ? onBack() : setI(i - 1))}
            aria-label="이전"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-surface-2 text-ink transition-colors hover:border-sky hover:text-sky"
          >
            <ChevronLeft aria-hidden className="h-5 w-5" />
          </button>
          <PrimaryButton onClick={() => (last ? onNext() : setI(i + 1))}>
            {last ? '카메라 켜기' : '다음'}
            {!last && <ChevronRight aria-hidden className="h-4 w-4" />}
          </PrimaryButton>
        </>
      }
    >
      <div
        key={tip.key}
        className="motion-safe:animate-fade-in overflow-hidden rounded-2xl border border-line bg-surface"
      >
        <div className="flex aspect-[4/3] items-center justify-center bg-sky-tint/60 px-6 text-sky short:aspect-auto short:h-32">
          {tip.art}
        </div>
        <div className="px-5 pb-5 pt-4 short:pb-4 short:pt-3">
          <p className="text-heading text-lg">{tip.title}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{tip.short}</p>
          <button
            type="button"
            onClick={() => setDetail(true)}
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-sky"
          >
            <Info aria-hidden className="h-4 w-4" />
            자세히
          </button>
        </div>
      </div>

      <div
        className="mt-2 flex items-center justify-center"
        aria-label={`${i + 1} / ${tips.length}`}
      >
        {tips.map((t, k) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setI(k)}
            aria-label={`${k + 1}번째 카드`}
            aria-current={k === i}
            className="flex h-8 items-center px-[3px]"
          >
            <span
              className={`block h-2 rounded-full transition-[width,background-color] ${k === i ? 'w-5 bg-sky' : 'w-2 bg-line-strong'}`}
            />
          </button>
        ))}
      </div>

      <BottomSheet open={detail} onClose={() => setDetail(false)} title="자세한 설명">
        <ol className="space-y-4">
          {tips.map((t, k) => (
            <li
              key={t.key}
              className={k === i ? 'rounded-2xl bg-sky-tint/60 p-3' : 'px-3'}
            >
              <p className="text-sm font-bold">
                {k + 1}. {t.title}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{t.long}</p>
            </li>
          ))}
        </ol>
      </BottomSheet>
    </StepShell>
  );
}

/* ───────────────────────── 그림 ───────────────────────── */

const ART = 'h-full max-h-40 w-auto';

function ArtTripod() {
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
      <rect x="82" y="22" width="36" height="62" rx="6" fill="white" />
      <circle cx="100" cy="46" r="7" />
      <path d="M100 84v14M100 98L62 140M100 98l38 42M100 98v42" />
      <path d="M30 60l-8 8M22 60l8 8" stroke="#b45309" />
      <path d="M170 60l-8 8M162 60l8 8" stroke="#b45309" />
      <path d="M150 40c8-6 16-6 24 0" strokeDasharray="4 6" />
    </svg>
  );
}

function ArtDistance({ behind }: { behind: boolean }) {
  return (
    <svg
      viewBox="0 0 220 150"
      className={ART}
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* 카메라 */}
      <rect x="14" y="60" width="28" height="44" rx="5" fill="white" />
      <circle cx="28" cy="76" r="5" />
      {/* 사람 */}
      <circle cx={behind ? 78 : 160} cy="50" r="10" />
      <path
        d={
          behind
            ? 'M78 60v36M78 74l-16 12M78 74l18 -10M78 96l-12 30M78 96l12 30'
            : 'M160 60v36M160 74l-16 12M160 74l18 -10M160 96l-12 30M160 96l12 30'
        }
      />
      {/* 공 궤적 */}
      <path d={behind ? 'M98 62h100' : 'M200 62H60'} strokeDasharray="3 7" />
      <circle cx={behind ? 200 : 60} cy="62" r="5" fill="white" />
      {/* 거리 표시 */}
      <path
        d={
          behind ? 'M28 118h50M28 112v12M78 112v12' : 'M28 118h132M28 112v12M160 112v12'
        }
        stroke="#b45309"
      />
      <text
        x={behind ? 53 : 94}
        y="138"
        textAnchor="middle"
        fontSize="14"
        fill="#b45309"
        stroke="none"
        fontWeight="700"
      >
        {behind ? '1m 이내' : '1~3m'}
      </text>
    </svg>
  );
}

function ArtTarget() {
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
      <circle cx="100" cy="66" r="24" />
      <path d="M100 34v10M100 88v10M68 66h10M122 66h10" />
      <circle cx="100" cy="66" r="4" fill="currentColor" />
      <path d="M62 132c14-30 20-52 30-64" stroke="#94a3b8" />
      <circle cx="92" cy="68" r="4" fill="#b45309" stroke="none" />
    </svg>
  );
}

function ArtLevel() {
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
      <rect x="30" y="66" width="140" height="22" rx="11" fill="white" />
      <path d="M100 58v38" stroke="#94a3b8" strokeDasharray="3 5" />
      <circle cx="100" cy="77" r="8" fill="#047857" stroke="none" />
      <rect
        x="60"
        y="22"
        width="80"
        height="26"
        rx="8"
        fill="white"
        transform="rotate(-8 100 35)"
      />
      <path d="M150 30l10-6M150 30l6 10" stroke="#b45309" />
      <rect x="60" y="106" width="80" height="26" rx="8" fill="white" />
      <path d="M150 119l10 0" stroke="#047857" />
    </svg>
  );
}

function ArtLight() {
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
      <circle cx="46" cy="40" r="16" fill="white" />
      <path d="M46 12v8M46 60v8M18 40h8M66 40h8M26 20l6 6M60 54l6 6M26 60l6-6M60 26l6-6" />
      <rect
        x="104"
        y="30"
        width="80"
        height="100"
        rx="8"
        fill="#1e293b"
        stroke="#1e293b"
      />
      <path
        d="M112 38v84M124 38v84M136 38v84M148 38v84M160 38v84M172 38v84M104 50h80M104 66h80M104 82h80M104 98h80M104 114h80"
        stroke="#475569"
        strokeWidth="2"
      />
      <circle cx="144" cy="80" r="9" fill="white" stroke="white" />
    </svg>
  );
}

function ArtFps() {
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
      <rect x="16" y="26" width="168" height="98" rx="10" fill="white" />
      <path d="M16 46h168M16 104h168" />
      <path d="M32 26v20M56 26v20M80 26v20M104 26v20M128 26v20M152 26v20M176 26v20M32 104v20M56 104v20M80 104v20M104 104v20M128 104v20M152 104v20M176 104v20" />
      <circle cx="44" cy="75" r="9" fill="white" />
      <circle cx="78" cy="75" r="7" fill="white" />
      <circle cx="108" cy="75" r="5.5" fill="white" />
      <circle cx="134" cy="75" r="4" fill="white" />
      <circle cx="156" cy="75" r="3" fill="white" />
      <text
        x="100"
        y="142"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fill="#b45309"
        stroke="none"
      >
        120~240 fps
      </text>
    </svg>
  );
}

/** 렌즈 보정 — 줄자 끝의 공과 화면의 원 */
function ArtLens() {
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
      <rect x="14" y="30" width="60" height="100" rx="10" fill="white" />
      <circle cx="44" cy="80" r="17" strokeDasharray="5 5" />
      <circle cx="44" cy="80" r="11" fill="white" />
      <path d="M74 80h56" />
      <path d="M80 72v16M96 74v12M112 72v16M128 74v12" />
      <circle cx="160" cy="80" r="20" fill="white" />
      <path d="M148 68c6 6 6 18 0 24M172 68c-6 6-6 18 0 24" strokeWidth="3" />
      <text
        x="100"
        y="142"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fill="#b45309"
        stroke="none"
      >
        1m
      </text>
    </svg>
  );
}

/** 카메라 설정 — 투수 뒤(엔진 2.0)는 2배 줌, 포수 뒤는 1배. 손떨림 보정은 끈다 */
function ArtCamera({ zoom2 = false }: { zoom2?: boolean }) {
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
      <rect x="28" y="24" width="144" height="102" rx="12" fill="white" />
      <circle cx="56" cy="102" r="16" fill="white" strokeWidth="3" />
      {zoom2 ? (
        <>
          <circle cx="100" cy="102" r="16" fill="white" strokeWidth="3" />
          <circle cx="144" cy="102" r="20" fill="#0ea5e9" stroke="#0ea5e9" />
        </>
      ) : (
        <>
          <circle cx="100" cy="102" r="20" fill="#0ea5e9" stroke="#0ea5e9" />
          <circle cx="144" cy="102" r="16" fill="white" strokeWidth="3" />
        </>
      )}
      <text
        x="56"
        y="107"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        .5
      </text>
      <text
        x="100"
        y={zoom2 ? 107 : 108}
        textAnchor="middle"
        fontSize={zoom2 ? 13 : 16}
        fontWeight={zoom2 ? 700 : 800}
        fill={zoom2 ? 'currentColor' : 'white'}
        stroke="none"
      >
        {zoom2 ? '1' : '1x'}
      </text>
      <text
        x="144"
        y={zoom2 ? 108 : 107}
        textAnchor="middle"
        fontSize={zoom2 ? 16 : 13}
        fontWeight={zoom2 ? 800 : 700}
        fill={zoom2 ? 'white' : 'currentColor'}
        stroke="none"
      >
        {zoom2 ? '2x' : '2'}
      </text>
      <path d="M44 52h44" strokeWidth="6" />
      <path d="M112 52h44" strokeWidth="6" opacity="0.3" />
      <text
        x="66"
        y="42"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        {zoom2 ? '줌 2.0' : '줌 1.0'}
      </text>
      <text
        x="134"
        y="42"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill="#b45309"
        stroke="none"
      >
        손떨림 보정 끔
      </text>
    </svg>
  );
}

/* ───────────────────────── 4. 수평계 ───────────────────────── */

/*
 * 카메라 위(늘 어두운 영상 위)에 얹는 것이라 테마를 따라 뒤집히는 색 토큰(ok · sky-soft)을 쓰지 않고 밝은 초록을 못박는다 —
 * 다크 테마의 ok(#34d399) 위 흰 글자 · 라이트 테마의 진한 ok(#047857) 선은 검은 영상 위에서 잘 안 보였다.
 */
const LEVEL_GREEN = 'bg-emerald-400';

/**
 * 수평계 — 카메라 화면 왼쪽 위의 작은 알약. 둥근 창 안의 선이 실제 수평선이다: 폰을 기울이면 선이 반대로 돌고(좌우),
 * 카메라가 위아래를 보면 선이 오르내린다(앞뒤). 양쪽 눈금과 나란해지면 초록 '수평'. 아니면 돌릴 방향과 각도 하나만
 * 보인다(예전에는 좌우 · 앞뒤 숫자를 둘 다 적어 어지러웠다). 값은 lib/use-device-level.ts 가 부드럽게 해 준다.
 */
export function LevelBubble({
  level,
  onRequest,
}: {
  level: DeviceLevel;
  /** 아이폰에서 아직 허락이 없을 때 — 누르면 허락을 청한다 */
  onRequest?: () => void;
}) {
  if (level.needsPermission && onRequest) {
    return (
      <button
        type="button"
        onClick={onRequest}
        className="pointer-events-auto inline-flex h-10 items-center gap-1.5 rounded-full bg-black/55 pl-2 pr-3 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-black/60"
      >
        <span className="relative h-5 w-5 rounded-full ring-1 ring-white/40">
          <span className="absolute inset-x-1 top-1/2 h-px bg-white/70" />
        </span>
        수평계 켜기
      </button>
    );
  }
  if (!level.supported) return null;
  const roll = level.roll ?? 0;
  const pitch = level.pitch ?? 0;
  const ok = level.ok;
  const rollOff = level.cause === 'roll';
  /* 글자 각도 — 벗어난 축만, 정수로(훅이 경계에서 깜박이지 않게 붙들어 준다). 벗어났으면 문턱보다 작게 보이지 않게 */
  const deg = rollOff
    ? Math.max(2, Math.abs(level.rollDeg ?? 0))
    : Math.max(PITCH_OK_DEG + 1, Math.abs(level.pitchDeg ?? 0));
  /* 앞뒤는 선의 높이로 — 창 반지름(10px) 안에서 10° 가 5px 쯤 */
  const lift = Math.max(-7, Math.min(7, pitch * 0.5));
  return (
    <>
      <div
        role="img"
        aria-label={
          ok
            ? '수평'
            : rollOff
              ? `좌우로 ${deg}도 기울어짐`
              : `앞뒤로 ${deg}도 기울어짐`
        }
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-black/55 pl-1 pr-2.5 text-xs font-semibold text-white backdrop-blur motion-safe:animate-fade-in"
      >
        <span
          aria-hidden
          className={`relative h-5 w-5 overflow-hidden rounded-full ring-1 transition-colors duration-200 ${
            ok ? 'bg-emerald-400/15 ring-emerald-300/80' : 'bg-white/5 ring-white/35'
          }`}
        >
          {/* 폰의 수평 — 양쪽 눈금(수평이면 선과 같이 초록) */}
          <span
            className={`absolute left-0 top-1/2 h-px w-1 -translate-y-1/2 transition-colors duration-200 ${ok ? 'bg-emerald-300' : 'bg-white/60'}`}
          />
          <span
            className={`absolute right-0 top-1/2 h-px w-1 -translate-y-1/2 transition-colors duration-200 ${ok ? 'bg-emerald-300' : 'bg-white/60'}`}
          />
          {/*
           * 실제 수평선 — 눈금과 틈을 두고. 16px 선이 3° 기울면 거의 안 보여 세 배로 기울여 그린다(30° 까지). 숫자는 그대로다.
           */}
          <span
            className={`absolute inset-x-1.5 top-1/2 -mt-px h-0.5 rounded-full transition-[transform,background-color] duration-200 ease-out motion-reduce:transition-none ${
              ok ? LEVEL_GREEN : 'bg-white'
            }`}
            style={{
              transform: `translateY(${lift}px) rotate(${-Math.max(-30, Math.min(30, roll * 3))}deg)`,
            }}
          />
        </span>
        <span
          className={`min-w-[2.25rem] tabular-nums transition-colors duration-200 ${ok ? 'text-emerald-300' : ''}`}
        >
          {ok ? (
            '수평'
          ) : rollOff ? (
            <span className="inline-flex items-center gap-0.5">
              {roll > 0 ? (
                <RotateCcw aria-hidden className="h-3 w-3" />
              ) : (
                <RotateCw aria-hidden className="h-3 w-3" />
              )}
              {deg}°
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5">
              {/* 카메라가 위를 보면(+) 아래로 숙이라고 */}
              {pitch > 0 ? (
                <ArrowDown aria-hidden className="h-3 w-3" />
              ) : (
                <ArrowUp aria-hidden className="h-3 w-3" />
              )}
              {deg}°
            </span>
          )}
        </span>
      </div>
      {/* 화면 읽기 — 수평이 되거나 벗어날 때만 말한다(각도가 바뀔 때마다 읽으면 시끄럽다). role=img 밖에 둬야 읽힌다 */}
      <span className="sr-only" aria-live="polite">
        {ok ? '수평이에요' : '기울어 있어요'}
      </span>
    </>
  );
}

/* ───────────────────────── 5. 스트라이크 존 ───────────────────────── */

/**
 * 반투명 스트라이크 존 — 뒤(카메라)가 비쳐 보인다. 좌표는 부모(뷰파인더 · 영상) 기준 0~1 비율이라 폰 크기가 달라도 같은
 * 자리다.
 *
 * 모양은 스트라이크 존 그대로 지킨다(aspect = 세로 ÷ 가로, 이 좌표 기준), 크기는 minW ~ maxW 안에서만
 * (lib/velocity-setup.ts ZONE_WIDTH_RANGE). 예전에는 가로 · 세로를 따로 끌어 화면을 덮는 띠도 만들 수 있었다(2026-09-30
 * 사용자: "너무 자유롭다").
 *
 * 놓는 법(editable) — 투수 뒤 존은 폰에서 10~40px 라 존 자체를 잡기 어려웠다(사용자: "크기 · 위치 변경이 잘 안 된다").
 * 그래서 뷰파인더 전체가 손을 받는다: 한 손가락으로 어디를 끌든 존이 따라 옮겨지고, 두 손가락으로 벌리거나 오므리면 가운데를
 * 두고 커지고 작아진다. 모서리 손잡이로도 크기를 바꾼다. 뷰파인더 전체가 touch-none 이라 끄는 동안 화면이 굴러가지 않는다.
 */

/** 존 둘레의 이름표 · 손잡이가 차지하는 자리(px) — 옮길 때 이만큼 안쪽으로 묶는다 */
const CHROME_LABEL_PX = 30;
const CHROME_HALF_LABEL_PX = 40;
const CHROME_KNOB_PX = 36;

type ZoneStart = {
  startX: number;
  startY: number;
  rect: ZoneRect;
  w: number;
  h: number;
};
type ZoneDrag =
  | ({ kind: 'move' } & ZoneStart)
  | ({ kind: 'resize' } & ZoneStart)
  | { kind: 'pinch'; dist: number; rect: ZoneRect; w: number; h: number };

export function ZoneOverlay({
  rect,
  onChange,
  editable,
  aspect,
  minW = 0,
  maxW = 1,
  highlight = null,
  topInset,
  centerLocked = false,
}: {
  rect: ZoneRect;
  onChange?: (next: ZoneRect) => void;
  editable: boolean;
  /** 자리는 붙박고 크기만 — 한 손가락 끌기는 안 옮기고, 크기는 가운데를 두고 바꾼다(구속 측정: 존은 릴리스 표적 바로 밑에 고정) */
  centerLocked?: boolean;
  /** 세로 ÷ 가로 — 이 좌표(0~1) 기준. 없으면 rect 의 비율을 지킨다 */
  aspect?: number;
  /** 가로의 범위 — 이 좌표 기준 */
  minW?: number;
  maxW?: number;
  /** 칸 하나를 밝힌다 — 0~8, 화면의 왼쪽 위부터(영상에서 짐작한 코스) */
  highlight?: number | null;
  /**
   * 위에서 비울 높이(px) — 부모 위에 떠 있는 위 줄 · 수평계 줄 밑으로 존이 들어가면 손잡이를 못 잡는다. 끌 때마다 잰다
   * (그리는 동안에는 부르지 않는다).
   */
  topInset?: () => number;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<'move' | 'resize' | 'pinch' | null>(null);
  /* 누르고 있는 손가락(포인터 id → 자리) · 지금 하는 손동작 — 이벤트 안에서만 만진다 */
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<ZoneDrag | null>(null);
  /*
   * 손동작 중 마지막으로 알린 자리 — 손가락을 더하거나 뗄 때 여기서 이어 간다. 그리기(rect)는 끄는 동안 한 박자 늦을 수
   * 있어 그것으로 이으면 몇 px 뒤로 튀었다.
   */
  const last = useRef<ZoneRect | null>(null);
  const emit = (next: ZoneRect) => {
    last.current = next;
    onChange?.(next);
  };
  /*
   * 뷰파인더 층이 붙고 떨어질 때 — 손가락을 댄 채 놓기가 끝나면(완료를 눌러 층이 떨어짐) 남은 손동작을 버린다(다음에 한
   * 손가락이 두 손가락으로 읽혔다). 한 번만 만든다 — 그릴 때마다 새 함수면 React 가 그때마다 떼었다 붙여 손동작이 지워졌다.
   */
  const attachLayer = useCallback((el: HTMLDivElement | null) => {
    layer.current = el;
    if (!el) return;
    return () => {
      layer.current = null;
      fingers.current.clear();
      drag.current = null;
      last.current = null;
    };
  }, []);
  /* 존을 놓는 동안만 손동작 모양을 보인다(놓기를 마친 뒤 남은 상태가 측정 화면에 새지 않게) */
  const shown = editable ? active : null;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const size = () => {
    const r = layer.current?.getBoundingClientRect();
    return r && r.width > 0 && r.height > 0 ? { w: r.width, h: r.height } : null;
  };

  /*
   * 이름표(위 28px) · 손잡이(오른쪽 아래 바깥 26px, 누르는 자리까지 34px)가 뷰파인더에 잘리지 않게 그만큼 안쪽 여백(이 좌표). 이름표는 가운데
   * 정렬이라 존이 작으면 옆으로도 여백이 든다. 실제 존은 화면 끝에 오지 않는다.
   */
  const pads = (wRect: number, w: number, h: number) => {
    const l = Math.max(0, CHROME_HALF_LABEL_PX - (wRect * w) / 2) / w;
    return {
      l,
      r: Math.max(l, CHROME_KNOB_PX / w),
      t: ((topInset?.() ?? 0) + CHROME_LABEL_PX) / h,
      b: CHROME_KNOB_PX / h,
    };
  };

  /* 가운데(cx, cy)를 두고 가로 wNew 로 — 모양 · 범위 · 여백을 지켜 알린다 */
  const place = (
    cx: number,
    cy: number,
    wNew: number,
    base: ZoneRect,
    w: number,
    h: number
  ) => {
    const k = aspect ?? base.h / base.w;
    const p = pads(wNew, w, h);
    const hi = Math.max(
      Math.min(minW, base.w),
      Math.min(maxW, 1 - p.l - p.r, (1 - p.t - p.b) / k)
    );
    const wz = clamp(wNew, Math.min(minW, hi), hi);
    const hz = wz * k;
    emit({
      x: clamp(cx - wz / 2, p.l, Math.max(p.l, 1 - wz - p.r)),
      y: clamp(cy - hz / 2, p.t, Math.max(p.t, 1 - hz - p.b)),
      w: wz,
      h: hz,
    });
  };

  /* ── 뷰파인더 전체: 한 손가락 = 옮기기, 두 손가락 = 벌려 크기 ── */
  const startFrom = () => {
    const sz = size();
    const pts = [...fingers.current.values()];
    /* 손동작 도중이면 마지막으로 알린 자리에서, 처음이면 그려진 자리에서 */
    const from = drag.current && last.current ? last.current : rect;
    if (!sz || pts.length === 0) {
      drag.current = null;
      last.current = null;
      setActive(null);
      return;
    }
    if (pts.length >= 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      drag.current = {
        kind: 'pinch',
        dist: Math.max(dist, 1),
        rect: from,
        w: sz.w,
        h: sz.h,
      };
      setActive('pinch');
    } else {
      drag.current = {
        kind: 'move',
        startX: pts[0].x,
        startY: pts[0].y,
        rect: from,
        w: sz.w,
        h: sz.h,
      };
      setActive('move');
    }
  };

  const onLayerDown = (e: ReactPointerEvent) => {
    if (!editable || !onChange) return;
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
    startFrom();
  };

  const onLayerMove = (e: ReactPointerEvent) => {
    if (!fingers.current.has(e.pointerId)) return;
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (!d || d.kind === 'resize') return;
    const cx = d.rect.x + d.rect.w / 2;
    const cy = d.rect.y + d.rect.h / 2;
    if (d.kind === 'move') {
      if (centerLocked) return;
      place(
        cx + (e.clientX - d.startX) / d.w,
        cy + (e.clientY - d.startY) / d.h,
        d.rect.w,
        d.rect,
        d.w,
        d.h
      );
      return;
    }
    const pts = [...fingers.current.values()];
    if (pts.length < 2) return;
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    place(cx, cy, d.rect.w * (dist / d.dist), d.rect, d.w, d.h);
  };

  const onLayerUp = (e: ReactPointerEvent) => {
    if (!fingers.current.delete(e.pointerId)) return;
    /* 두 손가락 중 하나를 떼면 남은 손가락으로 이어서 옮긴다(튀지 않게 지금 자리에서) */
    startFrom();
  };

  /* ── 모서리 손잡이: 왼쪽 위를 붙박고 대각선으로 크기 ── */
  const beginResize = (e: ReactPointerEvent) => {
    if (!editable || !onChange) return;
    const sz = size();
    if (!sz) return;
    drag.current = {
      kind: 'resize',
      startX: e.clientX,
      startY: e.clientY,
      rect,
      w: sz.w,
      h: sz.h,
    };
    setActive('resize');
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  };

  const onResizeMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.kind !== 'resize') return;
    /* 끈 거리를 존의 대각선(픽셀) 방향으로 내려 가로를 정한다. 세로는 모양(aspect)대로 따라온다 */
    const k = aspect ?? d.rect.h / d.rect.w;
    const kPx = (k * d.h) / d.w; // 존의 세로 ÷ 가로(픽셀)
    const grow =
      (e.clientX - d.startX + (e.clientY - d.startY) * kPx) / (1 + kPx * kPx);
    const p = pads(d.rect.w, d.w, d.h);
    const hi = Math.max(
      d.rect.w,
      Math.min(maxW, 1 - d.rect.x - p.r, (1 - d.rect.y - p.b) / k)
    );
    if (centerLocked) {
      /* 가운데를 두고 — 끈 거리만큼 양쪽으로 */
      const cx = d.rect.x + d.rect.w / 2,
        cy = d.rect.y + d.rect.h / 2;
      place(cx, cy, d.rect.w + (2 * grow) / d.w, d.rect, d.w, d.h);
      return;
    }
    const w = clamp(d.rect.w + grow / d.w, Math.min(minW, hi), hi);
    emit({ ...d.rect, w, h: w * k });
  };

  const onResizeEnd = () => {
    if (drag.current?.kind !== 'resize') return;
    drag.current = null;
    last.current = null;
    setActive(null);
  };

  return (
    <>
      {editable && (
        <div
          ref={attachLayer}
          aria-hidden
          onPointerDown={onLayerDown}
          onPointerMove={onLayerMove}
          onPointerUp={onLayerUp}
          onPointerCancel={onLayerUp}
          onLostPointerCapture={onLayerUp}
          className={`absolute inset-0 touch-none ${centerLocked ? '' : 'cursor-move'}`}
        />
      )}
      <div
        role="img"
        aria-label="스트라이크 존"
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
        style={{
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.w * 100}%`,
          height: `${rect.h * 100}%`,
        }}
        className={`pointer-events-none absolute rounded-[3px] border-[1.5px] transition-[background-color,border-color,box-shadow] duration-150 ${
          shown
            ? /* 움직이는 동안 — 작은 존(폰에서 15px)도 손가락 옆에서 보이게 둘레에 빛 */
              'border-sky-300 bg-sky/20 shadow-[0_0_0_1px_rgba(0,0,0,0.35),0_0_0_6px_rgba(56,189,248,0.35)]'
            : editable
              ? 'border-white/90 bg-white/10 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]'
              : 'border-white/80 bg-transparent shadow-[0_0_0_1px_rgba(0,0,0,0.35)]'
        }`}
      >
        {highlight != null && highlight >= 0 && highlight <= 8 && (
          <span
            aria-hidden
            className="absolute bg-sky/45"
            style={{
              left: `${(highlight % 3) * (100 / 3)}%`,
              top: `${Math.floor(highlight / 3) * (100 / 3)}%`,
              width: `${100 / 3}%`,
              height: `${100 / 3}%`,
            }}
          />
        )}
        {/* 격자 — 흰 과녁 천 · 미트 위에서도 보이게 어두운 그림자를 두른다(흐림 거름은 이 묶음에만 — 이름표의 흐림을 살린다) */}
        <span
          aria-hidden
          className="absolute inset-0 drop-shadow-[0_0_1px_rgba(0,0,0,0.7)]"
        >
          <span className="absolute inset-y-0 left-1/3 w-px bg-white/70" />
          <span className="absolute inset-y-0 left-2/3 w-px bg-white/70" />
          <span className="absolute inset-x-0 top-1/3 h-px bg-white/70" />
          <span className="absolute inset-x-0 top-2/3 h-px bg-white/70" />
        </span>
        {editable && (
          <>
            <span
              className={`absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold text-white backdrop-blur transition-[opacity,background-color] duration-150 ${
                shown ? 'bg-sky' : 'bg-black/55'
              } ${shown === 'pinch' || shown === 'resize' ? 'opacity-0' : 'opacity-100'}`}
            >
              스트라이크 존
            </span>
            {/*
             * 손잡이 — 24px 를 모서리 바깥 대각선에 떼어 둔다. 누르는 자리(44px)도 바깥 · 아래로만 넓힌다 — 존 쪽으로 넓히면
             * 투수 뒤의 작은 존(15×21px)을 86% 덮어, 존을 끌면 옮겨지지 않고 크기가 바뀌었다(2026-09-30 코드 검토). 존 틀은 손을
             * 받지 않고(pointer-events-none) 손잡이만 받는다 — 존 위를 누르면 뒤의 뷰파인더 전체 층이 받아 옮긴다.
             */}
            <button
              type="button"
              aria-label="크기 바꾸기"
              onPointerDown={beginResize}
              className={`pointer-events-auto absolute left-full top-full ml-0.5 mt-0.5 flex h-6 w-6 cursor-nwse-resize touch-none items-center justify-center rounded-full border-2 border-white bg-sky text-white shadow-md before:absolute before:-bottom-4 before:-left-1 before:-right-4 before:-top-1 before:content-[''] transition-transform duration-150 ${
                shown === 'resize' ? 'scale-110' : ''
              }`}
            >
              <MoveDiagonal2 aria-hidden className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </>
  );
}
