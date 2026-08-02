'use client';

import { useState } from 'react';
import { Camera, Check, ChevronDown, Smartphone } from 'lucide-react';

/**
 * 투구 영상 촬영 가이드.
 *
 * 나중에 자동 폼 분석을 붙이려면 영상이 일정한 조건으로 찍혀 있어야 한다.
 * 각도가 매번 다르면 지표를 비교할 수 없고, 프레임이 낮으면 팔 동작이 뭉개진다.
 * 그래서 "지금부터 찍는 영상"이 나중에 그대로 쓰일 수 있도록 미리 안내한다.
 */

const CHECKLIST = [
  {
    title: '옆에서 찍기 — 항상 같은 쪽',
    detail:
      '1루 또는 3루 쪽에서 옆모습이 나오게 찍습니다. 매번 같은 쪽에서 찍어야 지난 영상과 비교할 수 있습니다.',
  },
  {
    title: '삼각대로 고정, 허리 높이',
    detail:
      '손으로 들고 찍으면 흔들려서 각도를 잴 수 없습니다. 카메라 높이는 허리쯤이 좋습니다.',
  },
  {
    title: '전신이 다 들어오게',
    detail:
      '머리 끝부터 발끝까지, 그리고 공을 놓는 순간까지 화면 안에 있어야 합니다. 너무 가까이 가지 마세요.',
  },
  {
    title: '슬로우모션으로 (120fps 이상)',
    detail:
      '일반 촬영(30fps)은 팔이 빨라서 뭉개집니다. 팔 동작까지 보려면 슬로우모션이 필요합니다.',
  },
  {
    title: '밝은 곳에서, 배경은 단순하게',
    detail:
      '어둡거나 배경이 복잡하면 몸을 제대로 인식하지 못합니다. 옷은 배경과 다른 색이 좋습니다.',
  },
] as const;

/** 위에서 내려다본 카메라 위치 그림 */
function TopView() {
  return (
    <svg
      viewBox="0 0 260 150"
      className="h-auto w-full"
      role="img"
      aria-label="위에서 본 카메라 위치: 투수 옆 90도 방향"
    >
      {/* 홈플레이트 방향 */}
      <line
        x1="130" y1="30" x2="130" y2="112"
        stroke="currentColor" strokeWidth="1" strokeDasharray="4 4"
        className="text-line-strong"
      />
      <polygon points="130,122 126,112 134,112" className="fill-line-strong" />
      <text x="138" y="120" className="fill-muted text-[9px]">포수</text>

      {/* 투수판 */}
      <rect x="112" y="24" width="36" height="5" rx="1" className="fill-line-strong" />

      {/* 투수 */}
      <circle cx="130" cy="40" r="9" className="fill-gold/25 stroke-gold" strokeWidth="1.5" />
      <text x="130" y="60" textAnchor="middle" className="fill-cream text-[9px]">투수</text>

      {/* 90도 표시 */}
      <path
        d="M 130 40 L 130 70 A 30 30 0 0 0 100 40 Z"
        className="fill-gold/10"
      />
      <text x="104" y="58" className="fill-muted text-[8px]">90°</text>

      {/* 카메라 */}
      <line
        x1="130" y1="40" x2="52" y2="40"
        stroke="currentColor" strokeWidth="1.5"
        className="text-gold/70"
      />
      <rect x="24" y="30" width="26" height="19" rx="3" className="fill-gold/20 stroke-gold" strokeWidth="1.5" />
      <circle cx="37" cy="39.5" r="4.5" className="fill-none stroke-gold" strokeWidth="1.5" />
      <text x="37" y="64" textAnchor="middle" className="fill-gold text-[9px]">카메라</text>

      {/* 반대쪽도 가능하다는 표시 */}
      <line
        x1="130" y1="40" x2="208" y2="40"
        stroke="currentColor" strokeWidth="1" strokeDasharray="3 3"
        className="text-line-strong"
      />
      <rect x="210" y="30" width="26" height="19" rx="3" className="fill-none stroke-line-strong" strokeWidth="1.2" strokeDasharray="3 3" />
      <text x="223" y="64" textAnchor="middle" className="fill-muted/60 text-[8px]">반대쪽도</text>
      <text x="223" y="74" textAnchor="middle" className="fill-muted/60 text-[8px]">가능</text>

      <text x="130" y="140" textAnchor="middle" className="fill-muted/70 text-[9px]">
        위에서 본 모습 · 둘 중 한쪽을 정해 계속 쓰세요
      </text>
    </svg>
  );
}

/** 화면에 얼마나 담아야 하는지 보여주는 그림 */
function FramingView() {
  return (
    <svg
      viewBox="0 0 260 150"
      className="h-auto w-full"
      role="img"
      aria-label="화면 구성: 전신과 릴리스 지점이 모두 들어오도록"
    >
      {/* 화면 테두리 */}
      <rect x="20" y="14" width="220" height="112" rx="4" className="fill-none stroke-gold/60" strokeWidth="1.5" />

      {/* 여백 표시 */}
      <line x1="20" y1="24" x2="240" y2="24" stroke="currentColor" strokeWidth="0.8" strokeDasharray="3 3" className="text-line-strong" />
      <line x1="20" y1="116" x2="240" y2="116" stroke="currentColor" strokeWidth="0.8" strokeDasharray="3 3" className="text-line-strong" />
      <text x="26" y="21" className="fill-muted/70 text-[7px]">머리 위 여백</text>
      <text x="26" y="124" className="fill-muted/70 text-[7px]">발밑 여백</text>

      {/* 투수 실루엣 (옆모습, 릴리스 자세) */}
      <g className="stroke-cream" strokeWidth="2" strokeLinecap="round" fill="none">
        <circle cx="120" cy="40" r="7" className="fill-cream/20" />
        <line x1="120" y1="47" x2="118" y2="76" />
        {/* 던지는 팔 */}
        <line x1="119" y1="54" x2="140" y2="42" />
        <line x1="140" y1="42" x2="158" y2="34" className="stroke-gold" />
        {/* 글러브 팔 */}
        <line x1="119" y1="55" x2="103" y2="66" />
        {/* 다리 */}
        <line x1="118" y1="76" x2="98" y2="106" />
        <line x1="118" y1="76" x2="132" y2="106" />
      </g>

      {/* 릴리스 지점 강조 */}
      <circle cx="160" cy="33" r="4" className="fill-gold" />
      <text x="168" y="30" className="fill-gold text-[8px]">공 놓는 지점</text>
      <text x="168" y="40" className="fill-muted/70 text-[7px]">까지 들어와야 함</text>

      <text x="130" y="141" textAnchor="middle" className="fill-muted/70 text-[9px]">
        머리끝부터 발끝까지 · 팔이 화면 밖으로 나가지 않게
      </text>
    </svg>
  );
}

export function FilmingGuide({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-2"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold-dim/50 bg-gold/10 text-gold">
          <Camera className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-cream">투구 영상 촬영 가이드</span>
          <span className="mt-0.5 block text-xs text-muted">
            이대로 찍어두면 나중에 자동 폼 분석에 그대로 쓸 수 있습니다
          </span>
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted transition-transform ${open ? 'rotate-180 text-gold' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-6 border-t border-line px-5 py-6 sm:px-6">
          {/* 그림 두 장 */}
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { label: '어디서 찍나', view: <TopView /> },
              { label: '어떻게 담나', view: <FramingView /> },
            ].map(({ label, view }) => (
              <div key={label} className="rounded-xl border border-line bg-surface-2 p-4">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
                  {label}
                </p>
                {view}
              </div>
            ))}
          </div>

          {/* 체크리스트 */}
          <ul className="space-y-3">
            {CHECKLIST.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gold-dim/50 bg-gold/10 text-gold">
                  <Check className="h-3 w-3" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-cream">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                    {item.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {/* 아이폰 설정 */}
          <div className="rounded-xl border border-line bg-surface-2 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-cream">
              <Smartphone className="h-4 w-4 text-gold" />
              아이폰 설정
            </p>
            <div className="mt-3 space-y-2.5 text-xs leading-relaxed text-muted">
              <p>
                <span className="text-cream">슬로우모션 프레임</span> — 설정 → 카메라 →
                슬로모 촬영 → <span className="text-gold">1080p / 240fps</span> 권장
              </p>
              <p>
                <span className="text-cream">화질 저하 방지</span> — 설정 → 카메라 → 포맷
                → <span className="text-gold">높은 호환성</span>
                <span className="block text-muted/70">
                  이 설정이 아니면 업로드할 때 영상이 다시 변환되면서 화질과 프레임이
                  떨어집니다.
                </span>
              </p>
            </div>
          </div>

          <p className="rounded-xl border border-dashed border-line px-4 py-3 text-xs leading-relaxed text-muted/80">
            <span className="text-cream">왜 이렇게까지 하냐면</span> — 나중에 영상에서
            몸통 기울기나 보폭 같은 수치를 자동으로 재려고 합니다. 그때 각도와 거리가
            매번 다르면 지난 영상과 비교할 수가 없습니다. 지금부터 조건을 맞춰 찍어두시면
            그 영상들이 그대로 분석 자료가 됩니다.
          </p>
        </div>
      )}
    </section>
  );
}
