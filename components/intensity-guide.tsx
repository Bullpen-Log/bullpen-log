'use client';

import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';

/**
 * 체감 강도 기준표.
 *
 * 강도는 이 앱에서 가장 중요한 입력값 중 하나다. 부하 지수도, 필요한 휴식일도
 * 여기서 나온다. 그런데 "오늘 몇 정도로 던졌나요"는 기준이 없으면 감으로
 * 찍게 되고, 사람마다 같은 7이 다른 뜻이 된다.
 *
 * 그래서 두 가지를 보여준다.
 *   1) 각 단계가 어떤 느낌인지 — 고를 때 견줄 기준
 *   2) 느낌보다 팔에 가는 부담이 크다는 사실 — 낮게 적고 싶은 마음을 막는다
 *
 * 2번이 특히 중요하다. 연구에 따르면 절반 힘으로 던져도 구속은 최고의 80%가
 * 나오고 팔꿈치에 걸리는 힘은 75%다. 이걸 모르면 "살살 던졌으니 3쯤"이라고
 * 적게 되는데, 그 숫자로 휴식일이 정해진다.
 */

const LEVELS = [
  {
    range: '1 – 2',
    label: '몸 푸는 정도',
    detail: '가까운 거리 캐치볼. 숨이 차지 않고 팔에 힘을 거의 안 씁니다.',
  },
  {
    range: '3 – 4',
    label: '편하게',
    detail: '롱토스 워밍업, 가벼운 플랫. 폼을 확인하는 정도로 던집니다.',
  },
  {
    range: '5 – 6',
    label: '절반쯤 힘',
    detail: '불펜 초반이나 폼 점검. 여유 있게 던지지만 제대로 된 투구 동작입니다.',
  },
  {
    range: '7 – 8',
    label: '세게',
    detail: '불펜 본 세션, 라이브. 경기와 비슷하지만 아직 여유가 남아 있습니다.',
  },
  {
    range: '9 – 10',
    label: '전력',
    detail: '경기, 최고 구속 측정. 더 세게는 못 던집니다.',
  },
] as const;

export function IntensityGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-line bg-surface-2/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <Info className="h-3.5 w-3.5 shrink-0 text-sky" />
        <span className="flex-1 text-xs text-muted">강도를 어떻게 정하나요?</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-line px-3 py-3">
          <ul className="space-y-2">
            {LEVELS.map((l) => (
              <li key={l.range} className="flex gap-3">
                <span className="w-12 shrink-0 text-xs font-bold tabular-nums text-sky">
                  {l.range}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-ink">
                    {l.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
                    {l.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {/*
            낮게 적고 싶은 마음을 막는 한 줄. 이 숫자로 휴식일이 정해지므로
            "살살 던졌다"고 낮춰 적으면 덜 쉬라는 답이 돌아온다.
          */}
          <p className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-[11px] leading-relaxed text-warn">
            <strong>느낌보다 팔에 가는 부담은 큽니다.</strong> 연구에 따르면 절반 힘으로
            던져도 구속은 최고의 80%가 나오고, 팔꿈치에 걸리는 힘은 75%나 됩니다. 가볍게
            느껴져도 실제로 던진 만큼 적어주세요.
          </p>
        </div>
      )}
    </div>
  );
}
