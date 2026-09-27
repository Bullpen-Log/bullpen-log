'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import {
  CAMERA_OPTIONS,
  MODE_OPTIONS,
  NET_OPTIONS,
  setupSummary,
  type CameraPos,
  type RecordMode,
  type VelocitySetup,
  type ZoneRect,
} from '@/lib/velocity-setup';
import { LEVEL_OK_DEG, type DeviceLevel } from '@/lib/use-device-level';
import { BottomSheet } from './pitch-editor';

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
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-4">
        <p className="text-[11px] font-semibold tracking-wide text-sky">
          {step} / {total}
        </p>
        <h2 className="text-heading mt-1 text-[1.75rem] leading-tight">{title}</h2>
        {subtitle && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{subtitle}</p>
        )}
        <div className="mt-5">{children}</div>
      </div>
      <div className="shrink-0 border-t border-line bg-surface/90 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur">
        {footer}
      </div>
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
      className={`inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-2xl text-[15px] font-bold transition-colors disabled:opacity-50 ${
        tone === 'sky'
          ? 'bg-sky text-white hover:bg-sky-strong'
          : 'bg-surface-2 text-ink hover:bg-line'
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
        <div className="flex gap-2">
          <PrimaryButton tone="quiet" onClick={onFresh}>
            새로 설정
          </PrimaryButton>
          <PrimaryButton onClick={onUse}>그대로 쓰기</PrimaryButton>
        </div>
      }
    >
      <div className="overflow-hidden rounded-2xl bg-surface shadow-sm">
        <div className="px-4 py-3">
          <p className="text-[15px] font-semibold">{setupSummary(setup)}</p>
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

export type Choices = { mode: RecordMode; cameraPos: CameraPos; net: boolean };

export function ChoicesStep({
  value,
  onChange,
  onNext,
}: {
  value: Choices;
  onChange: (next: Choices) => void;
  onNext: () => void;
}) {
  return (
    <StepShell
      step={2}
      total={6}
      title="무엇을, 어디서 잴까요?"
      subtitle="고른 대로 계산 방향과 안내가 달라져요."
      footer={<PrimaryButton onClick={onNext}>다음</PrimaryButton>}
    >
      <div className="space-y-5">
        <ChoiceGroup label="녹화 종류">
          {MODE_OPTIONS.map((o) => (
            <ChoiceCard
              key={o.key}
              on={value.mode === o.key}
              label={o.label}
              hint={o.hint}
              onClick={() => onChange({ ...value, mode: o.key })}
            />
          ))}
        </ChoiceGroup>
        <ChoiceGroup label="카메라 위치">
          {CAMERA_OPTIONS.map((o) => (
            <ChoiceCard
              key={o.key}
              on={value.cameraPos === o.key}
              label={o.label}
              hint={o.hint}
              onClick={() => onChange({ ...value, cameraPos: o.key })}
            />
          ))}
        </ChoiceGroup>
        <ChoiceGroup label="네트">
          {NET_OPTIONS.map((o) => (
            <ChoiceCard
              key={String(o.key)}
              on={value.net === o.key}
              label={o.label}
              hint={o.hint}
              onClick={() => onChange({ ...value, net: o.key })}
            />
          ))}
        </ChoiceGroup>
      </div>
    </StepShell>
  );
}

function ChoiceGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 px-1 text-[13px] font-semibold text-muted">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
        {children}
      </div>
    </div>
  );
}

function ChoiceCard({
  on,
  label,
  hint,
  onClick,
}: {
  on: boolean;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`relative rounded-2xl border-2 px-3.5 py-3 text-left transition-colors ${
        on
          ? 'border-sky bg-sky-tint'
          : 'border-transparent bg-surface shadow-sm hover:bg-surface-2'
      }`}
    >
      <span className="block text-[15px] font-bold">{label}</span>
      <span className="mt-0.5 block text-[11px] leading-snug text-muted">{hint}</span>
      {on && (
        <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-sky text-white">
          <Check aria-hidden className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}

/* ───────────────────────── 3. 주의사항 카드 ───────────────────────── */

type Tip = {
  key: string;
  title: string;
  short: string;
  long: string;
  art: React.ReactNode;
};

function tipsFor(c: Choices): Tip[] {
  const behind = c.cameraPos === 'behind-pitcher';
  const who = c.mode === 'hit' ? '타자' : '투수';
  return [
    {
      key: 'tripod',
      title: '삼각대에 고정하세요',
      short: '손으로 들면 재지 않아요. 흔들리면 배경이 밀려 공을 못 찾아요.',
      long: '계산은 "배경은 가만히 있고 공만 움직인다"는 전제로 돌아가요. 손으로 들면 화면 전체가 조금씩 밀려서 공이 아닌 것이 움직인 것처럼 보이고, 그 촬영은 숫자를 내지 않고 거부돼요(흔들림 검사). 삼각대가 없으면 가방 위, 펜스 틈 같은 곳에 단단히 기대 두세요.',
      art: <ArtTripod />,
    },
    {
      key: 'place',
      title: behind ? `${who} 바로 뒤 1m 이내` : '포수 뒤, 네트에서 1~3m',
      short: behind
        ? '던지는 방향을 정면으로 보게 두세요. 옆에서 찍으면 못 재요.'
        : '포수 · 미트 뒤에서 마운드를 정면으로 보게 두세요.',
      long: behind
        ? '공의 크기 변화로 거리를 재요. 그래서 공이 카메라에서 멀어지는 방향(뒤에서 정면)으로 날아가야 해요. 옆에서 찍으면 공이 화면을 가로지르며 번져 크기를 잴 수 없어요. 1m 를 넘게 떨어지면 첫 프레임의 공이 작아져 릴리스 지점을 못 잡아요.'
        : '포수 뒤에서는 공이 카메라 쪽으로 다가오며 커져요. 마지막에 미트에 닿는 지점이 카메라 앞 4m 안이어야 해요. 네트 바로 뒤에 붙이면 그물코가 공을 가려요 — 조금 떨어져서 초점이 네트가 아니라 마운드에 맞게 하세요.',
      art: <ArtDistance behind={behind} />,
    },
    {
      key: 'target',
      title: behind ? '릴리스 포인트를 표적에' : '미트가 오는 자리를 표적에',
      short: '높이를 맞춰 공을 놓는 지점이 화면 한가운데 표적에 오게 하세요.',
      long: behind
        ? '화면 가운데에서 움직임이 시작되는 순간을 "던졌다"로 봐요. 릴리스 포인트가 가운데에서 많이 벗어나면 던진 것을 못 알아채거나 팔을 공으로 착각해요. 삼각대 높이를 릴리스 높이(어깨 위)에 맞추세요.'
        : '공이 마지막에 오는 자리(미트)가 가운데 근처에 오게 높이를 맞추세요. 스트라이크 존은 다음 단계에서 화면 위에 따로 놓아요.',
      art: <ArtTarget />,
    },
    {
      key: 'level',
      title: '폰을 수평으로',
      short: '다음 단계의 수평계가 초록이 되게 맞추세요.',
      long: '기울면 공이 화면을 비스듬히 지나가고 스트라이크 존 격자도 기울어요. 삼각대 헤드를 돌려 좌우 · 앞뒤 기울기를 1.5° 안으로 맞추세요. 폰이 기울기 값을 주지 않는 기기면 수평계가 안 뜨고, 그때는 눈으로 맞추세요.',
      art: <ArtLevel />,
    },
    {
      key: 'light',
      title: c.net ? '밝은 곳, 네트에 붙이지 않기' : '밝은 곳, 단순한 배경',
      short: '역광을 피하고, 공 뒤 배경이 어두울수록 잘 잡혀요.',
      long:
        '공은 배경보다 밝게 찍혀야 찾을 수 있어요. 해를 마주 보면 공이 검게 찍혀 못 찾고, 흰 벽 · 밝은 하늘이 배경이면 공과 구분이 안 돼요. 그물 · 초록 펜스 · 어두운 실내 벽이 좋은 배경이에요.' +
        (c.net
          ? ' 네트가 있으면 초점을 고정해요(수동초점) — 자동초점이면 카메라가 눈앞의 그물코에 초점을 맞춰 공이 흐려져요. 그래도 네트에서 30cm 이상 떨어지세요.'
          : ' 네트가 없으면 자동초점으로 둬요.'),
      art: <ArtLight />,
    },
    {
      key: 'fps',
      title: '고속 촬영이어야 해요',
      short: '앱은 폰의 고속 촬영을 써요. 웹에서는 슬로모션 영상 파일로 재요.',
      long: '공은 손을 떠나 0.3초 안에 작아져 사라져요. 일반 촬영(초당 30장)이면 그 사이가 서너 장뿐이라 숫자를 못 내요. 초당 60장 밑이면 계산이 거부돼요. 웹 브라우저 카메라는 대개 30~60장이라, 웹에서는 폰 카메라 앱의 슬로모션(초당 120~240장, 1080p 이상)으로 찍은 파일을 골라 재세요.',
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
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => (i === 0 ? onBack() : setI(i - 1))}
            aria-label="이전"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-ink hover:bg-line"
          >
            <ChevronLeft aria-hidden className="h-5 w-5" />
          </button>
          <PrimaryButton onClick={() => (last ? onNext() : setI(i + 1))}>
            {last ? '카메라 켜기' : '다음'}
            {!last && <ChevronRight aria-hidden className="h-4 w-4" />}
          </PrimaryButton>
        </div>
      }
    >
      <div
        key={tip.key}
        className="motion-safe:animate-fade-in overflow-hidden rounded-[1.75rem] bg-surface shadow-sm"
      >
        <div className="flex aspect-[4/3] items-center justify-center bg-sky-tint/60 px-6 text-sky">
          {tip.art}
        </div>
        <div className="px-5 pb-5 pt-4">
          <p className="text-heading text-xl">{tip.title}</p>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{tip.short}</p>
          <button
            type="button"
            onClick={() => setDetail(true)}
            className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-sky"
          >
            <Info aria-hidden className="h-4 w-4" />
            자세히
          </button>
        </div>
      </div>

      <div
        className="mt-4 flex items-center justify-center gap-1.5"
        aria-label={`${i + 1} / ${tips.length}`}
      >
        {tips.map((t, k) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setI(k)}
            aria-label={`${k + 1}번째 카드`}
            aria-current={k === i}
            className={`h-2 rounded-full transition-all ${k === i ? 'w-5 bg-sky' : 'w-2 bg-line-strong'}`}
          />
        ))}
      </div>

      <BottomSheet open={detail} onClose={() => setDetail(false)} title="자세한 설명">
        <ol className="space-y-4">
          {tips.map((t, k) => (
            <li
              key={t.key}
              className={k === i ? 'rounded-2xl bg-sky-tint/60 p-3' : 'px-3'}
            >
              <p className="text-[15px] font-bold">
                {k + 1}. {t.title}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{t.long}</p>
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

/* ───────────────────────── 4. 수평계 ───────────────────────── */

export function LevelBubble({ level }: { level: DeviceLevel }) {
  if (!level.supported) return null;
  const roll = level.roll ?? 0;
  const pitch = level.pitch ?? 0;
  const ok = Math.abs(roll) <= LEVEL_OK_DEG && Math.abs(pitch) <= LEVEL_OK_DEG;
  const clamp = (v: number) => Math.max(-50, Math.min(50, v));
  return (
    <div
      aria-live="polite"
      aria-label={ok ? '수평' : `기울어짐 좌우 ${roll}도 앞뒤 ${pitch}도`}
      className={`pointer-events-none flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold backdrop-blur ${
        ok ? 'bg-ok/85 text-white' : 'bg-black/55 text-white/90'
      }`}
    >
      <span className="relative block h-3 w-24 overflow-hidden rounded-full bg-white/25">
        <span className="absolute left-1/2 top-0 h-full w-px bg-white/70" />
        <span
          className={`absolute top-0.5 h-2 w-2 rounded-full transition-transform ${ok ? 'bg-white' : 'bg-warn-line'}`}
          style={{
            left: 'calc(50% - 0.25rem)',
            transform: `translateX(${clamp(roll * 4)}px)`,
          }}
        />
      </span>
      <span className="tabular-nums">
        {ok
          ? '수평'
          : `좌우 ${roll > 0 ? '+' : ''}${roll}° · 앞뒤 ${pitch > 0 ? '+' : ''}${pitch}°`}
      </span>
    </div>
  );
}

/* ───────────────────────── 5. 스트라이크 존 ───────────────────────── */

/**
 * 반투명 스트라이크 존 — 뒤(카메라)가 비쳐 보인다. 끌어서 옮기고 오른쪽 아래 손잡이로 크기를 바꾼다.
 * 좌표는 부모(뷰파인더) 기준 0~1 비율이라 폰 크기가 달라도 같은 자리다.
 */
export function ZoneOverlay({
  rect,
  onChange,
  editable,
}: {
  rect: ZoneRect;
  onChange?: (next: ZoneRect) => void;
  editable: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    kind: 'move' | 'resize';
    startX: number;
    startY: number;
    rect: ZoneRect;
    w: number;
    h: number;
  } | null>(null);

  /* 누르기 시작 — 손잡이를 누르면 크기, 그 밖은 옮기기. 이벤트 안에서만 ref 를 만진다 */
  const begin = (kind: 'move' | 'resize', e: ReactPointerEvent) => {
    if (!editable || !onChange) return;
    const parent = box.current?.parentElement;
    if (!parent) return;
    const r = parent.getBoundingClientRect();
    drag.current = {
      kind,
      startX: e.clientX,
      startY: e.clientY,
      rect,
      w: r.width,
      h: r.height,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  };

  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || !onChange) return;
    const dx = (e.clientX - d.startX) / d.w;
    const dy = (e.clientY - d.startY) / d.h;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    if (d.kind === 'move') {
      onChange({
        ...d.rect,
        x: clamp(d.rect.x + dx, 0, 1 - d.rect.w),
        y: clamp(d.rect.y + dy, 0, 1 - d.rect.h),
      });
    } else {
      onChange({
        ...d.rect,
        w: clamp(d.rect.w + dx, 0.15, 1 - d.rect.x),
        h: clamp(d.rect.h + dy, 0.12, 1 - d.rect.y),
      });
    }
  };

  const end = () => {
    drag.current = null;
  };

  return (
    <div
      ref={box}
      role={editable ? 'application' : 'img'}
      aria-label="스트라이크 존"
      onPointerDown={(e) => begin('move', e)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      style={{
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.w * 100}%`,
        height: `${rect.h * 100}%`,
      }}
      className={`absolute rounded-lg border-2 border-white/85 bg-white/15 shadow-[0_0_0_1px_rgba(0,0,0,0.25)] backdrop-blur-[1px] ${
        editable ? 'cursor-move touch-none' : 'pointer-events-none'
      }`}
    >
      <span className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/70" />
      <span className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/70" />
      <span className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/70" />
      <span className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/70" />
      {editable && (
        <>
          <span className="pointer-events-none absolute -top-6 left-0 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            끌어서 옮기기
          </span>
          <button
            type="button"
            aria-label="크기 바꾸기"
            onPointerDown={(e) => begin('resize', e)}
            className="absolute -bottom-3 -right-3 h-7 w-7 cursor-nwse-resize touch-none rounded-full border-2 border-white bg-sky shadow"
          />
        </>
      )}
    </div>
  );
}
