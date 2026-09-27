'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
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
import { Segmented } from '@/components/segmented';
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
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-4 short:pt-3">
        <StepBar step={step} total={total} />
        <h2 className="text-heading mt-4 text-2xl leading-tight short:mt-3 short:text-xl">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1.5 text-sm leading-relaxed text-muted short:mt-1 short:leading-snug">
            {subtitle}
          </p>
        )}
        <div className="mt-5 short:mt-3">{children}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
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
      className={`inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
        tone === 'sky'
          ? 'bg-sky text-white hover:bg-sky-strong'
          : 'border border-line-strong bg-surface-2 text-ink hover:border-sky hover:text-sky'
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
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
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

export type Choices = { mode: RecordMode; cameraPos: CameraPos; net: boolean };

const NET_VALUES = [
  { value: 'yes', label: '네트 있음' },
  { value: 'no', label: '네트 없음' },
] as const;

export function ChoicesStep({
  value,
  onChange,
  onNext,
}: {
  value: Choices;
  onChange: (next: Choices) => void;
  onNext: () => void;
}) {
  /* 고르는 줄은 앱의 Segmented(캘린더 | 목록과 같은 부품). 고른 것의 설명 한 줄이 밑에 붙는다 */
  return (
    <StepShell
      step={2}
      total={6}
      title="무엇을, 어디서 잴까요?"
      subtitle="고른 대로 계산 방향과 안내가 달라져요."
      footer={
        <PrimaryButton onClick={onNext}>
          다음
          <ChevronRight aria-hidden className="h-4 w-4" />
        </PrimaryButton>
      }
    >
      <div className="space-y-5">
        <ChoiceRow
          label="녹화 종류"
          hint={MODE_OPTIONS.find((o) => o.key === value.mode)?.hint}
        >
          <Segmented
            label="녹화 종류"
            value={value.mode}
            onChange={(mode) => onChange({ ...value, mode })}
            options={MODE_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
            size="md"
            tone="raised"
          />
        </ChoiceRow>
        <ChoiceRow
          label="카메라 위치"
          hint={CAMERA_OPTIONS.find((o) => o.key === value.cameraPos)?.hint}
        >
          <Segmented
            label="카메라 위치"
            value={value.cameraPos}
            onChange={(cameraPos) => onChange({ ...value, cameraPos })}
            options={CAMERA_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
            size="md"
            tone="raised"
          />
        </ChoiceRow>
        <ChoiceRow
          label="네트"
          hint={NET_OPTIONS.find((o) => o.key === value.net)?.hint}
        >
          <Segmented
            label="네트"
            value={value.net ? 'yes' : 'no'}
            onChange={(v) => onChange({ ...value, net: v === 'yes' })}
            options={NET_VALUES}
            size="md"
            tone="raised"
          />
        </ChoiceRow>
      </div>
    </StepShell>
  );
}

function ChoiceRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      {children}
      <p className="mt-2 min-h-4 px-0.5 text-xs leading-relaxed text-muted">{hint}</p>
    </div>
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
      long: '계산은 "배경은 가만히 있고 공만 움직인다"는 전제로 돌아가요. 손으로 들면 화면 전체가 조금씩 밀려서 공이 아닌 것이 움직인 것처럼 보이고, 그 촬영은 숫자를 내지 않고 거부돼요(흔들림 검사). 삼각대가 없으면 가방 위, 펜스 틈 같은 곳에 단단히 기대 두세요. 셔터를 누를 때 폰을 건드리지 않게 소리 안내나 타이머를 쓰면 좋아요.',
      art: <ArtTripod />,
    },
    {
      key: 'lens',
      title: '렌즈 보정을 한 번 하세요',
      short:
        '카메라 유리에서 공 앞면까지 줄자로 1m. 원에 맞춰 재면 이 폰의 초점거리가 나와요.',
      long: '구속은 공이 화면에서 몇 픽셀인지로 거리를 재서 나와요. 그 환산에 렌즈의 초점거리가 곱해지는데, 기종 · 동영상 모드의 크롭 · 손떨림 보정에 따라 5~10% 달라요. 화각을 69° 로 가정했는데 실제가 63° 면 130km/h 가 120 으로 나와요. 렌즈 보정은 공을 카메라 렌즈에서 정확히 잰 거리(카메라 유리에서 공 앞면까지 줄자로 1m 권장)에 두고 화면에서 크기를 재 초점거리를 직접 구해요. 같은 공으로 재니 공 크기 오차도 함께 사라져요. 폰 · 렌즈(1x/0.5x) · 촬영 해상도를 바꾸면 다시 하세요. 설정 → 렌즈 보정.',
      art: <ArtLens />,
    },
    {
      key: 'camera',
      title: '1x 기본 렌즈, 줌 · 손떨림 보정 끄기',
      short: '0.5x · 2x · 디지털 줌은 크기 기준이 달라져요. 보정한 렌즈 그대로 쓰세요.',
      long: '렌즈를 바꾸거나 화면을 확대하면 초점거리가 달라져 보정값이 안 맞아요. 항상 1x 기본(광각 아님) 렌즈로, 줌은 1.0 에 두세요. 동영상 손떨림 보정(안정화)은 화면 가장자리를 잘라 확대하기 때문에 켜고 끌 때 크기 기준이 달라져요 — 삼각대에 올렸으니 끄세요. HDR · 시네마틱 같은 밝기 자동 처리도 끄고, 가능하면 노출과 초점을 고정(AE/AF 잠금)하세요. 촬영 중 밝기가 변하면 공의 경계가 흔들리는데, 엔진이 프레임마다 밝기 치우침을 재 보정하지만 고정하는 편이 안전해요.',
      art: <ArtCamera />,
    },
    {
      key: 'place',
      title: behind ? `${who} 바로 뒤 1m 이내` : '포수 뒤, 네트에서 1~3m',
      short: behind
        ? '던지는 방향을 정면으로 보게 두세요. 옆에서 찍으면 못 재요.'
        : '포수 · 미트 뒤에서 마운드를 정면으로 보게 두세요. 카메라에서 릴리스 지점까지 거리를 설정에 적어요.',
      long: behind
        ? '공의 크기 변화로 거리를 재요. 그래서 공이 카메라에서 멀어지는 방향(뒤에서 정면)으로 날아가야 해요. 옆에서 찍으면 공이 화면을 가로지르며 번져 크기를 잴 수 없어요. 1m 를 넘게 떨어지면 첫 프레임의 공이 작아져 릴리스 지점을 못 잡아요. 공이 날아가는 선과 카메라의 시선이 나란할수록 정확해요 — 카메라를 던지는 팔 쪽으로 30cm 쯤 옮겨 릴리스 포인트가 화면 가운데에 오게 하세요.'
        : '포수 뒤에서는 공이 카메라 쪽으로 다가오며 커져요. 잴 만큼 커지는 것은 마지막 4m 안이라, 거기서 잰 속도는 릴리스보다 8% 쯤 낮아요. 설정의 "카메라에서 릴리스 지점까지" 거리만큼 공기저항을 되돌려 릴리스 구속을 내니, 줄자나 걸음으로 재서 적어 두세요(정규 마운드 · 홈 뒤 1.8m 면 약 18.5m). 네트 바로 뒤에 붙이면 그물코가 공을 가려요 — 조금 떨어져서 초점이 네트가 아니라 마운드에 맞게 하세요.',
      art: <ArtDistance behind={behind} />,
    },
    {
      key: 'target',
      title: behind ? '릴리스 포인트를 표적에' : '미트가 오는 자리를 표적에',
      short: '높이를 맞춰 공을 놓는 지점이 화면 한가운데 표적에 오게 하세요.',
      long: behind
        ? '화면 가운데에서 움직임이 시작되는 순간을 "던졌다"로 봐요. 릴리스 포인트가 가운데에서 많이 벗어나면 던진 것을 못 알아채거나 팔을 공으로 착각해요. 삼각대 높이를 릴리스 높이(어깨 위)에 맞추세요. 가운데에 가까울수록 렌즈 가장자리의 왜곡을 덜 받아 크기도 정확해요.'
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
      short:
        '밝을수록 셔터가 빨라져 공이 덜 번져요. 역광을 피하고, 흰 공 · 어두운 배경이 가장 잘 잡혀요.',
      long:
        '공은 배경보다 밝게 찍혀야 찾을 수 있어요. 해를 마주 보면 공이 검게 찍혀 못 찾고, 흰 벽 · 밝은 하늘이 배경이면 공과 구분이 안 돼요. 그물 · 초록 펜스 · 어두운 실내 벽이 좋은 배경이에요. 어두우면 카메라가 셔터를 길게 열어 공이 길게 번지고 지름을 잘못 재요 — 낮의 야외나 밝은 실내에서 재세요. 형광등 · LED 아래에서는 조명 깜빡임(60Hz)으로 밝기가 프레임마다 흔들릴 수 있어요. 때가 탄 공보다 흰 공이 정확해요.' +
        (c.net
          ? ' 네트가 있으면 초점을 고정해요(수동초점) — 자동초점이면 카메라가 눈앞의 그물코에 초점을 맞춰 공이 흐려져요. 그래도 네트에서 30cm 이상 떨어지세요.'
          : ' 네트가 없으면 자동초점으로 둬요.'),
      art: <ArtLight />,
    },
    {
      key: 'fps',
      title: '고속 촬영 · 1080p 이상',
      short: '앱은 폰의 고속 촬영을 써요. 웹에서는 슬로모션 영상 파일로 재요.',
      long: '공은 손을 떠나 0.3초 안에 작아져 사라져요. 일반 촬영(초당 30장)이면 그 사이가 서너 장뿐이라 숫자를 못 내요. 초당 60장 밑이면 계산이 거부돼요. 장수가 많을수록(120 → 240) 오차가 줄어요. 해상도는 1080p 이상 — 낮으면 멀어진 공이 몇 픽셀로 줄어 잴 수 있는 구간이 짧아져요. 웹 브라우저 카메라는 대개 30~60장이라, 웹에서는 폰 카메라 앱의 슬로모션(초당 120~240장, 1080p 이상)으로 찍은 파일을 골라 재세요.',
      art: <ArtFps />,
    },
    {
      key: 'gun',
      title: '스피드건이 있으면 짝을 맞추세요',
      short:
        '같은 공의 스피드건 값을 적어 두면, 5개 이상 쌓일 때 남은 차이를 보정식이 흡수해요.',
      long: '공을 잰 뒤 공 카드에서 스피드건 값을 적고 저장하면 짝이 쌓여요. 3개까지는 평균 차이만, 그 뒤로는 기울기까지 맞춰요(설정 → 스피드건 보정 적용). 스피드건은 릴리스 직후 최고 속도를 읽으니, 우리 값 중 "릴리스 추정"과 견주세요. 같은 날 · 같은 자리 · 같은 렌즈 보정 상태의 짝이어야 해요 — 렌즈 보정을 다시 했으면 그 뒤의 짝만 믿으세요.',
      art: <ArtGun />,
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
              className={`block h-2 rounded-full transition-all ${k === i ? 'w-5 bg-sky' : 'w-2 bg-line-strong'}`}
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

/** 카메라 설정 — 1x 만 켜고, 줌 · 손떨림 보정은 끈다 */
function ArtCamera() {
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
      <circle cx="100" cy="102" r="20" fill="#0ea5e9" stroke="#0ea5e9" />
      <circle cx="144" cy="102" r="16" fill="white" strokeWidth="3" />
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
        y="108"
        textAnchor="middle"
        fontSize="16"
        fontWeight="800"
        fill="white"
        stroke="none"
      >
        1x
      </text>
      <text
        x="144"
        y="107"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        2
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
        줌 1.0
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

/** 스피드건 짝 — 건 값과 카메라 값이 나란히 */
function ArtGun() {
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
      <rect x="22" y="40" width="64" height="44" rx="8" fill="white" />
      <path d="M46 84v34h18V84" />
      <path d="M86 52h14M86 72h14" />
      <rect x="120" y="30" width="58" height="96" rx="10" fill="white" />
      <text
        x="54"
        y="68"
        textAnchor="middle"
        fontSize="15"
        fontWeight="800"
        fill="currentColor"
        stroke="none"
      >
        132
      </text>
      <text
        x="149"
        y="72"
        textAnchor="middle"
        fontSize="15"
        fontWeight="800"
        fill="#0ea5e9"
        stroke="none"
      >
        131
      </text>
      <path d="M134 94l10 10 18-20" stroke="#16a34a" />
      <text
        x="100"
        y="142"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fill="#b45309"
        stroke="none"
      >
        짝 5개부터
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
      className={`pointer-events-none flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur ${
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
            className="absolute -bottom-3.5 -right-3.5 h-8 w-8 cursor-nwse-resize touch-none rounded-full border-2 border-white bg-sky shadow"
          />
        </>
      )}
    </div>
  );
}
