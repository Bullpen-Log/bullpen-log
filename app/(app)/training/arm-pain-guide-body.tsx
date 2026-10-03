'use client';

import Link from 'next/link';
import { ChevronDown, ChevronRight, Play, TriangleAlert } from 'lucide-react';
import {
  DISCLAIMER,
  RED_FLAGS,
  RED_FLAGS_LINE,
  guideFor,
  levelAdvice,
  type PainGuide,
} from '@/lib/armcare/pain-guide';
import { REHAB_ENABLED } from '@/lib/armcare/rehab';
import type { ArmPainView } from './arm-pain-guide';

/**
 * 팔 통증 안내 시트의 본문 — 시트를 처음 열 때 받아 온다(arm-pain-guide.tsx 의 dynamic).
 *
 * 차례는 설계 그대로(2026-10-03): 자리마다 [제목 · 이럴 수 있어요(참고) · 확인해 볼 증상] → 이런 게 있으면
 * 바로 진료 → 오늘은 → 맺음 한 줄. 겉은 한두 줄만 — 부상 이름을 누르면 설명이, 빨간 상자를 누르면 다섯
 * 줄이 펼쳐진다(사용자분: 글은 한두 줄, 자세한 것은 지우지 말고 눌러서). 위험 신호와 맺음말은 늘 보인다.
 */
export function ArmPainGuideBody({
  pain,
  routineHref,
  onGo,
}: {
  pain: ArmPainView;
  /** [통증 루틴 하기]가 갈 곳. 없으면 단추를 내지 않는다 */
  routineHref?: string;
  /** [통증 루틴 하기]를 눌러 떠날 때 */
  onGo?: () => void;
}) {
  const guides = pain.spots.map(guideFor);
  const advice = levelAdvice(pain.level, { spots: pain.spots, age: pain.age });

  return (
    <div className="space-y-5 text-sm leading-relaxed break-keep text-ink/85">
      {guides.length > 0 ? (
        guides.map((guide) => <SpotGuide key={guide.key} guide={guide} />)
      ) : (
        <p className="text-muted">
          어디가 아픈지 고르면 그 자리에 흔한 부상과 확인해 볼 증상을 알려 드려요.
          체크인의 몸 상태에서 고를 수 있어요.
        </p>
      )}

      <RedFlags />

      <section className="space-y-2.5 rounded-2xl bg-surface-2 px-4 py-3.5">
        <h3 className="text-xs font-bold text-sky-strong">오늘은</h3>
        <p className="text-ink">{advice.text}</p>
        {advice.routine && routineHref && (
          <Link
            href={routineHref}
            onClick={onGo}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-sky px-5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong"
          >
            <Play aria-hidden className="h-4 w-4" />
            통증 루틴 하기
          </Link>
        )}
      </section>

      <p className="border-t border-line pt-3 text-xs text-muted">{DISCLAIMER}</p>

      {/*
        재활 2편 — 몇 주에 걸친 단계별 재활로 가는 줄. 암케어 [루틴] 칸에서 시작 시트가 열린다(?rehab=start —
        재활 중이면 그 카드로). 체크인 창 안에서 열었으면 그 창까지 닫는다(onGo).
      */}
      {REHAB_ENABLED && (
        <Link
          href="/training?view=armcare&rehab=start"
          onClick={onGo}
          className="flex min-h-11 items-center gap-2 rounded-2xl bg-surface-2 px-4 py-2.5 text-sm text-ink transition-colors hover:bg-sky-tint"
        >
          <span className="min-w-0 flex-1">
            <b className="block font-semibold">재활 프로그램</b>
            <span className="block text-xs text-muted">
              아픈 곳과 정도에 맞춰 몇 주에 걸쳐 단계별로 해요
            </span>
          </span>
          <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted" />
        </Link>
      )}
    </div>
  );
}

/** 아픈 자리 하나 — 제목, 흔한 부상(이름만, 누르면 설명), 확인해 볼 증상 */
function SpotGuide({ guide }: { guide: PainGuide }) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-bold text-ink">{guide.title}</h3>
      {guide.injuries.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-sky-strong">이럴 수 있어요 (참고)</p>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {guide.injuries.map((injury) => (
              <li key={injury.name}>
                <details className="group">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3.5 py-2 font-semibold text-ink">
                    <span className="min-w-0 flex-1">{injury.name}</span>
                    <ChevronDown
                      aria-hidden
                      className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <p className="px-3.5 pb-3 text-xs leading-relaxed text-ink/75">
                    {injury.desc}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
      {guide.signs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-sky-strong">확인해 볼 증상</p>
          <ul className="list-disc space-y-1 pl-5 marker:text-muted">
            {guide.signs.map((sign) => (
              <li key={sign}>{sign}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * 이런 게 있으면 바로 진료 — 체크 칸 없이 글로만(2026-10-03 정함). 빨간 상자는 접혀 있어도 다섯을 줄인
 * 한 줄이 보이고, 누르면 한 줄씩 펼쳐진다. 빨강은 이 상자만 쓴다(경고색). 재활 카드 · 시작 시트도 이것을 쓴다(재활 2편).
 */
export function RedFlags() {
  return (
    <details className="group rounded-2xl border border-danger-line bg-danger-bg text-danger">
      <summary className="flex min-h-11 cursor-pointer list-none items-start gap-2 px-4 py-3">
        <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <b className="block font-bold">이런 게 있으면 바로 진료받으세요</b>
          <span className="block text-xs">{RED_FLAGS_LINE}</span>
        </span>
        <ChevronDown
          aria-hidden
          className="mt-0.5 h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>
      <ul className="list-disc space-y-1 pr-4 pb-3.5 pl-10 marker:text-danger/60">
        {RED_FLAGS.map((flag) => (
          <li key={flag}>{flag}</li>
        ))}
      </ul>
    </details>
  );
}
