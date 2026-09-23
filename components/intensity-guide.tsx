'use client';

import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';

/**
 * 체감 강도 기준표. 투구용과 운동용이 따로 있다.
 *
 * 강도는 기준이 없으면 감으로 찍게 되고, 사람마다 같은 7이 다른 뜻이 된다.
 * 그래서 두 가지를 보여준다.
 *   1) 각 단계가 어떤 느낌인지 — 고를 때 견줄 기준
 *   2) 잘못 적기 쉬운 쪽을 한 줄로 — 무엇을 조심해야 하는지
 *
 * ■ 둘을 나눈 이유
 *
 * 처음에는 투구 기준 하나뿐이었고 운동을 마칠 때도 그것을 띄웠다. 그러면
 * 웨이트를 마친 사람에게 '캐치볼·롱토스·불펜'으로 견주라고 하게 된다 —
 * 견줄 것이 없으니 결국 감으로 찍는다.
 *
 * 쓰는 곳도 다르다. 투구 강도는 투구 부하와 휴식일을 정하고, 운동 강도는
 * 운동 부하 지수에만 곱해진다 (lib/training-load.ts 의 intensityFactor).
 * 운동 강도로 휴식일이 정해지지는 않는다.
 *
 * ■ 투구 — 느낌보다 팔에 가는 부담이 크다
 *
 * 연구에 따르면 절반 힘으로 던져도 구속은 최고의 80%가 나오고 팔꿈치에 걸리는
 * 힘은 75%다. 이걸 모르면 "살살 던졌으니 3쯤"이라고 적게 되는데, 그 숫자로
 * 휴식일이 정해진다.
 *
 * ■ 운동 — 한 세트가 아니라 오늘 운동 전체
 *
 * 하루에 숫자 하나를 매기고, 부하 계산에서 그날 전체에 곱해진다(세션 RPE).
 * 그러니 잣대도 운동 전체여야 한다 — 끝났을 때 몸 상태, 후반부가 어땠는지,
 * 끝나고 쉬어야 했는지.
 *
 * 처음에는 단계마다 '세트마다 몇 회를 더 할 수 있었나'를 붙였다. 그건 한
 * 세트를 재는 잣대라, 오늘 전체를 묻는 자리와 맞지 않았다. 세트는 가볍게
 * 끝냈어도 종목이 많아 전체로는 힘든 날이 있고, 그 반대도 있다.
 *
 * 5–6 을 '평소대로 제대로 한 날'로 둔 것은 부하 계산이 6 을 1.0배, 곧
 * '처방대로 했다'로 보기 때문이다 (lib/training-load.ts 의 intensityFactor).
 * 기준표의 가운데와 계산의 가운데가 같아야 고른 숫자가 뜻대로 셈해진다.
 */

export type IntensityKind = 'pitch' | 'training';

const PITCH_LEVELS = [
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

const TRAINING_LEVELS = [
  {
    range: '1 – 2',
    label: '아주 가벼움',
    detail: '몸을 푸는 정도로 끝났습니다. 끝나고도 피로가 거의 없습니다.',
  },
  {
    range: '3 – 4',
    label: '가벼움',
    detail: '땀은 났지만 여유가 많았습니다. 같은 운동을 한 번 더 해도 될 것 같습니다.',
  },
  {
    range: '5 – 6',
    label: '보통',
    detail: '평소대로 제대로 한 날입니다. 끝날 즈음 지쳤지만 무리는 아니었습니다.',
  },
  {
    range: '7 – 8',
    label: '힘듦',
    detail: '후반부는 버티면서 했습니다. 끝나고 한동안 쉬어야 했습니다.',
  },
  {
    range: '9 – 10',
    label: '최대',
    detail: '오늘 쓸 수 있는 힘을 다 썼습니다. 한 세트도 더 못 할 것 같습니다.',
  },
] as const;

export function IntensityGuide({ kind }: { kind: IntensityKind }) {
  const levels = kind === 'pitch' ? PITCH_LEVELS : TRAINING_LEVELS;
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
            {levels.map((l) => (
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

          {kind === 'pitch' ? (
            /*
              낮게 적고 싶은 마음을 막는 한 줄. 이 숫자로 휴식일이 정해지므로
              "살살 던졌다"고 낮춰 적으면 덜 쉬라는 답이 돌아온다.
            */
            <p className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-[11px] leading-relaxed text-warn">
              <strong>느낌보다 팔에 가는 부담은 큽니다.</strong> 연구에 따르면 절반
              힘으로 던져도 구속은 최고의 80%가 나오고, 팔꿈치에 걸리는 힘은 75%나
              됩니다. 가볍게 느껴져도 실제로 던진 만큼 적어주세요.
            </p>
          ) : (
            /*
              끝나자마자 물으면 마지막 운동으로 답하기 쉽다. 안전과 걸린 문제는
              아니라서 경고 색이 아니라 안내 색으로 둔다.
            */
            <p className="rounded-lg border border-sky-soft/60 bg-sky-tint px-3 py-2 text-[11px] leading-relaxed text-sky-strong">
              <strong>오늘 운동 전체를 합쳐서 떠올려 주세요.</strong> 가장 힘들었던 한
              세트나 방금 끝낸 운동이 아니라, 처음부터 끝까지 해 보니 얼마나
              힘들었는지가 기준입니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
