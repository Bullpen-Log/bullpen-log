import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { VolumeSummary } from '@/lib/training-volume';
import { TONE } from './parts';

/**
 * 부위별 주당 세트 수.
 *
 * 부하 지수가 "지금 많은가"를 말한다면 여기는 "무엇을 하고 무엇을 안 했나"를
 * 말한다. 지수 하나로는 하체만 잔뜩 하고 암케어를 통째로 건너뛴 주와, 골고루
 * 한 주가 똑같아 보인다.
 *
 * 숫자를 보고 무엇을 할지는 본인이 정한다. 우리가 "암케어를 더 하세요"라고
 * 말하지 않는다 — 부위별 적정 세트 수는 사람마다 다르고, 우리가 정해 줄 근거가
 * 없다. 대신 지난주와 견줘 무엇이 늘고 줄었는지만 보여준다.
 */

/** 막대 길이를 정하는 기준. 이 값이 가로 전체다. */
const FULL_BAR_SETS = 24;

function Delta({ now, before }: { now: number; before: number }) {
  const diff = now - before;

  if (before === 0 && now === 0) {
    return <span className="text-xs text-muted/60">기록 없음</span>;
  }
  if (before === 0) {
    return <span className="text-xs text-muted">지난주 없음</span>;
  }
  if (diff === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted">
        <Minus className="h-3 w-3" />
        지난주와 같음
      </span>
    );
  }

  /*
   * 늘어난 것을 빨갛게, 줄어든 것을 파랗게 칠하지 않는다. 부위별 볼륨은
   * 많다고 나쁘고 적다고 좋은 값이 아니다 — 늘리려고 늘린 주도 있다.
   * 눈에 띄어야 하는 것은 '바뀌었다'는 사실이지 방향이 아니다.
   */
  const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted">
      <Icon className="h-3 w-3" />
      지난주보다 {Math.abs(diff)}세트 {diff > 0 ? '많음' : '적음'}
    </span>
  );
}

export function PartVolumeCard({ volume }: { volume: VolumeSummary }) {
  const parts = volume.byPart;
  const total = parts.reduce((sum, p) => sum + p.sets, 0);

  return (
    <section className="rounded-2xl border border-line bg-surface px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-bold text-ink">이번 주 부위별 세트</h2>
        <p className="text-xs text-muted">최근 7일 · 지난주와 견줌</p>
      </div>

      {total === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm leading-relaxed text-muted">
          이번 주에 마친 운동이 없습니다.
          <br />
          트레이닝에서 운동을 체크하면 여기에 부위별로 쌓입니다.
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-3">
            {parts.map((p) => (
              <li key={p.key} className="space-y-1.5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold text-ink">{p.label}</span>
                  <span className="text-display text-lg leading-none tabular-nums text-ink">
                    {p.sets}
                  </span>
                  <span className="text-xs text-muted">세트</span>
                  <span className="ml-auto">
                    <Delta now={p.sets} before={p.previous} />
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full rounded-full ${
                      p.sets === 0 ? '' : TONE.info.bar
                    }`}
                    style={{
                      width: `${Math.min(100, (p.sets / FULL_BAR_SETS) * 100)}%`,
                    }}
                  />
                </div>

                <p className="text-[11px] leading-relaxed text-muted/70">{p.hint}</p>
              </li>
            ))}
          </ul>

          {/*
            암케어는 부위가 아니라 카테고리로 따로 센다.

            부위로 세면 데드리프트 그립(손목·전완)까지 '팔'에 들어와, 암케어를
            통째로 건너뛴 주에도 그 줄이 찬다. 투수에게 이건 부위 이야기가
            아니라 '했나 안 했나'의 문제다.
          */}
          <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl border border-line bg-surface-2 px-4 py-3">
            <span className="text-sm font-semibold text-ink">암케어</span>
            <span className="text-display text-lg leading-none tabular-nums text-ink">
              {volume.armCare.sets}
            </span>
            <span className="text-xs text-muted">세트</span>
            <span className="ml-auto">
              <Delta now={volume.armCare.sets} before={volume.armCare.previous} />
            </span>
            <p className="w-full text-[11px] leading-relaxed text-muted/70">
              어깨·팔꿈치 관리 운동만 따로 셉니다. 위 &lsquo;팔·전완&rsquo;에는
              무거운 것을 잡는 그립도 들어가 있어, 그 숫자만 보면 암케어를 한
              것으로 착각할 수 있습니다.
            </p>
          </div>

          {/*
            한 운동이 여러 부위에 걸리면 각 부위에 모두 센다. 그래서 합계가
            실제로 한 세트 수보다 크다 — 안 적어두면 숫자가 안 맞는 것으로 보인다.
          */}
          <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-muted/70">
            한 운동이 여러 부위를 쓰면 각 부위에 모두 셉니다. 데드리프트는
            하체이면서 등입니다 — 그래서 위 숫자를 다 더하면 실제로 한 세트 수보다
            큽니다. 부위별 적정 세트 수는 사람마다 달라 목표치를 정해 두지
            않았습니다. 지난주와 견줘 무엇이 늘고 줄었는지 보시면 됩니다.
          </p>
        </>
      )}
    </section>
  );
}
