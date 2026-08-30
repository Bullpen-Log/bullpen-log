'use client';

import { useRef, useState } from 'react';
import { Card } from '@/components/ui';
import { Modal } from '@/components/modal';
import {
  LegendSwatch,
  MonthCalendar,
  type DayMark,
} from '@/components/month-calendar';
import { toDateKey } from '@/lib/pitch-stats';
import type {
  TrainingDayDetail,
  TrainingDaySummary,
} from '@/lib/report/training-history';

/**
 * 지난 운동 기록 — 달력 하나.
 *
 * 투구 일지와 같은 모양이다. 둘 다 "언제 무엇을 했는지 보고, 날짜를 눌러 그날을
 * 연다"가 하는 일이라 같은 달력을 쓴다.
 *
 * 달력은 요약(몇 개 했나·강도 몇)만 들고 있다가, 날짜를 눌렀을 때 자세한 것을
 * 부른다. 하루 열 개씩 한 해를 쌓으면 삼천 줄인데, 그걸 화면 열 때마다
 * 내려받게 할 수는 없다.
 *
 * 지난 날짜는 보기만 한다. 고치는 것은 오늘 것뿐이다 — 사흘 전 세트 수를
 * 지금 기억해서 고치는 일은 거의 없고, 있다 해도 그 숫자를 믿기 어렵다.
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 2026-08-24 → 8월 24일 (월) */
function spokenDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`;
}

/**
 * 실제로 적은 만큼을 사람 말로. 아무것도 안 적었으면 null.
 *
 * 무게는 '×'로 잇지 않고 뒤에 따로 붙인다 — '3세트 × 10회 × 40kg'은 곱셈처럼
 * 읽히는데 무게는 곱하는 값이 아니다.
 */
function amountText(ex: TrainingDayDetail['exercises'][number]): string | null {
  const parts: string[] = [];
  if (ex.setsDone != null) parts.push(`${ex.setsDone}세트`);
  if (ex.repsDone != null) parts.push(`${ex.repsDone}회`);
  if (ex.holdSecondsDone != null) parts.push(`${ex.holdSecondsDone}초`);
  const amount = parts.join(' × ');
  const weight = ex.weightKg != null ? `${ex.weightKg}kg` : null;
  if (!amount && !weight) return null;
  return [amount, weight].filter(Boolean).join(' · ');
}

export function TrainingHistory({
  summaries,
}: {
  summaries: Record<string, TrainingDaySummary>;
}) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<TrainingDayDetail | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  /**
   * 몇 번째 요청인지.
   *
   * 4일을 눌렀다가 곧바로 8일을 누르면, 4일 것이 늦게 도착해 8일 자리에 들어갈
   * 수 있다. 마지막으로 보낸 것만 받아들인다.
   */
  const latest = useRef(0);

  /*
   * 누를 때 바로 부른다.
   *
   * 예전에는 고른 날짜가 바뀌는 것을 지켜보다가(effect) 불렀는데, 이 저장소는
   * effect 안에서 상태를 바꾸는 것을 막아 두었다. 무엇 때문에 부르는지가
   * 누르는 자리에 그대로 보이므로 이쪽이 읽기도 쉽다.
   */
  const openDay = (date: string) => {
    const id = ++latest.current;
    setSelected(date);
    setDetail(null);
    setError(undefined);
    setLoading(true);
    fetch(`/api/training/day?date=${date}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data: TrainingDayDetail) => {
        if (latest.current === id) setDetail(data);
      })
      .catch(() => {
        if (latest.current === id) setError('기록을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (latest.current === id) setLoading(false);
      });
  };

  const marks: Record<string, DayMark> = {};
  for (const [key, s] of Object.entries(summaries)) {
    marks[key] = {
      /*
       * 강도를 안 적은 날은 색을 안 채운다. 운동은 했는데 얼마나 힘들었는지는
       * 모르는 날이라, 색으로 세기를 말하면 없는 것을 지어내는 셈이 된다.
       */
      intensity: s.intensity,
      label: s.count > 0 ? `${s.count}개` : '기록',
      dot: s.hasMemo,
      spoken: [
        s.count > 0 ? `운동 ${s.count}개` : '운동 기록 없음',
        s.intensity != null ? `강도 ${s.intensity}` : null,
        s.hasMemo ? '메모 있음' : null,
      ]
        .filter(Boolean)
        .join(', '),
    };
  }

  const todayKey = toDateKey(new Date());

  return (
    <>
      <Card>
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          selected={selected}
          onSelect={openDay}
          marks={marks}
        >
          <span>강도</span>
          <LegendSwatch className="h-3 w-5 rounded bg-sky/15">낮음</LegendSwatch>
          <LegendSwatch className="h-3 w-5 rounded bg-sky/40">보통</LegendSwatch>
          <LegendSwatch className="h-3 w-5 rounded bg-sky/70">높음</LegendSwatch>
          <LegendSwatch className="h-3 w-5 rounded border border-dashed border-line-strong">
            강도 안 적음
          </LegendSwatch>
          <LegendSwatch className="h-1.5 w-1.5 rounded-full bg-sky-strong">
            메모
          </LegendSwatch>
        </MonthCalendar>
      </Card>

      <Modal
        open={selected != null}
        onClose={() => setSelected(null)}
        title={selected ? spokenDate(selected) : ''}
        description={
          detail && detail.exercises.length > 0
            ? `운동 ${detail.exercises.length}개`
            : undefined
        }
      >
        <div className="space-y-4">
          {loading && <p className="text-sm text-muted">불러오는 중…</p>}
          {error && (
            <p className="rounded-lg border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          {detail && detail.exercises.length === 0 && detail.intensity == null && (
            <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm leading-relaxed text-muted">
              이 날은 운동 기록이 없습니다.
              {selected === todayKey && ' 오늘 탭에서 남길 수 있습니다.'}
            </p>
          )}

          {detail && detail.intensity != null && (
            <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
              <p className="text-sm font-semibold text-ink">
                운동 강도 {detail.intensity}/10
              </p>
              {detail.memo && (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/90">
                  {detail.memo}
                </p>
              )}
            </div>
          )}

          {detail && detail.exercises.length > 0 && (
            <ul className="space-y-2">
              {detail.exercises.map((ex) => {
                const done = amountText(ex);
                return (
                  <li
                    key={ex.id}
                    className="rounded-xl border border-line bg-surface px-4 py-3"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold text-ink">{ex.title}</span>
                      <span className="text-[11px] text-muted">{ex.category}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {done ? (
                        <>
                          <span className="font-semibold text-sky-strong">{done}</span>
                          {ex.planned && ` · 계획 ${ex.planned}`}
                        </>
                      ) : (
                        <>
                          마친 것으로 표시함
                          {ex.planned && ` · 계획 ${ex.planned}`}
                        </>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>
    </>
  );
}
