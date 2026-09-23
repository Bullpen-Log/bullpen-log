'use client';

import Link from 'next/link';
import { formatSpeed } from '@/lib/units';
import { useSpeedUnit } from '@/components/use-units';
import { ArrowRight, Dumbbell, Film, StickyNote, Target, X } from 'lucide-react';
import { Card } from '@/components/ui';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import type { Log } from '@/app/(app)/pitch-log/types';
import type { TrainingDaySummary } from '@/lib/report/training-history';

/**
 * 달력에서 고른 날의 요약.
 *
 * 예전에는 날짜를 누르면 곧바로 그날 화면으로 넘어갔다. 그런데 달력은 이 칸
 * 저 칸 눌러보며 훑는 물건이라, 무엇이 있었는지 잠깐 보려던 것뿐인데 매번
 * 화면이 통째로 바뀌고 다시 뒤로 와야 했다. 며칠을 견주려면 그 왕복을 반복한다.
 *
 * 그래서 누르면 여기 요약만 펴 보인다. 자세히 볼 때만 넘어간다.
 *
 * 투구와 운동을 나란히 둔다. 하루를 돌아볼 때 궁금한 것은 '그날 뭐 했더라'
 * 하나인데 그것이 두 화면에 갈라져 있으면 두 번 찾아야 한다.
 */
export function DaySummary({
  date,
  logs,
  training,
  onClose,
}: {
  /** YYYY-MM-DD */
  date: string;
  /** 그날 투구 기록. 하루에 여러 번 던진 날도 있다. */
  logs: Log[];
  /** 그날 운동 요약. 아무것도 안 했으면 undefined */
  training: TrainingDaySummary | undefined;
  onClose: () => void;
}) {
  /* 구속을 보여줄 단위. 저장은 늘 km/h 다(lib/units.ts). */
  const speedUnit = useSpeedUnit();
  /*
   * 하루에 여러 건이면 합쳐서 본다.
   *
   * 오전 불펜 30구 · 오후 캐치볼 20구처럼 나뉜 날이 있다. 요약은 '그날 얼마나
   * 던졌나'를 보는 자리라 합이 먼저다. 건별 내역은 자세히 보기에 있다.
   */
  const thrown = logs.filter((l) => l.sessionType !== REST_SESSION_TYPE);
  const rested = logs.length > 0 && thrown.length === 0;

  const pitches = thrown.reduce((sum, l) => sum + l.pitchCount, 0);
  const intensity = thrown.reduce((max, l) => Math.max(max, l.intensity), 0);
  const velocities = thrown.map((l) => l.maxVelocity).filter((v): v is number => v != null);
  const topVelocity = velocities.length > 0 ? Math.max(...velocities) : null;
  const videoCount = logs.reduce((sum, l) => sum + l.videoPaths.length, 0);
  const hasPitchMemo = logs.some((l) => l.memo?.trim());

  /* 종류는 중복을 걷어내고 적는다 — '불펜 · 불펜'은 알려주는 것이 없다 */
  const kinds = [...new Set(thrown.map((l) => l.sessionType))];

  const hasTraining = Boolean(training && (training.count > 0 || training.intensity != null));
  const nothing = logs.length === 0 && !hasTraining;

  return (
    <Card className="border-sky-soft/50 bg-sky-tint/30">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-heading text-base text-ink">{spokenDay(date)}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="요약 닫기"
          className="-mr-1 -mt-1 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {nothing ? (
        /*
         * 기록이 없는 날에도 갈 곳을 준다. 달력에서 빈칸을 누르는 것은 대개
         * '여기 뭐 있었지'가 아니라 '여기 남겨야지'다 — 화요일 것을 깜빡한 날.
         */
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted">이 날 남긴 기록이 없습니다.</p>
          <Link
            href={`/pitch-log/${date}`}
            className="inline-flex items-center gap-1 text-sm font-semibold text-sky transition-colors hover:text-sky-strong"
          >
            이 날 기록하기
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <div className="mt-3 space-y-2.5">
          {/* ── 투구 ───────────────────────────────── */}
          {logs.length > 0 && (
            <SummaryRow
              icon={<Target className="h-4 w-4" />}
              label="투구"
              href={`/pitch-log/${date}`}
              facts={
                rested
                  ? ['쉬는 날로 남김']
                  : [
                      kinds.join(' · '),
                      `${pitches}구`,
                      intensity > 0 ? `강도 ${intensity}` : null,
                      topVelocity != null ? `최고 ${formatSpeed(topVelocity, speedUnit)}` : null,
                    ]
              }
              extras={[
                videoCount > 0
                  ? { icon: <Film className="h-3 w-3" />, text: `영상 ${videoCount}개` }
                  : null,
                hasPitchMemo
                  ? { icon: <StickyNote className="h-3 w-3" />, text: '메모' }
                  : null,
              ]}
            />
          )}

          {/* ── 운동 ───────────────────────────────── */}
          {hasTraining && training && (
            <SummaryRow
              icon={<Dumbbell className="h-4 w-4" />}
              label="운동"
              href={`/training/day/${date}`}
              facts={[
                training.count > 0 ? `${training.count}개 완료` : '강도만 남김',
                training.intensity != null ? `강도 ${training.intensity}` : null,
              ]}
              extras={[
                training.hasMemo
                  ? { icon: <StickyNote className="h-3 w-3" />, text: '메모' }
                  : null,
              ]}
            />
          )}

          {/*
            한쪽만 있는 날에는 없는 쪽을 조용히 알려준다. 빈칸으로 두면 '안 했다'와
            '이 화면이 안 보여준다'가 구별되지 않는다.
          */}
          {logs.length === 0 && (
            <p className="text-xs text-muted/70">투구 기록은 없습니다.</p>
          )}
          {!hasTraining && <p className="text-xs text-muted/70">운동 기록은 없습니다.</p>}
        </div>
      )}
    </Card>
  );
}

/** 요약 한 줄 — 아이콘 · 이름 · 사실들 · 자세히 보기 */
function SummaryRow({
  icon,
  label,
  href,
  facts,
  extras,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  /** null 은 걸러낸다 — 없는 값은 아예 안 적는다 */
  facts: (string | null)[];
  extras: ({ icon: React.ReactNode; text: string } | null)[];
}) {
  const shown = facts.filter(Boolean);
  const shownExtras = extras.filter(Boolean) as { icon: React.ReactNode; text: string }[];

  return (
    <div className="flex items-start gap-3 rounded-xl bg-surface px-3.5 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line-strong text-muted">
        {icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-muted">{label}</p>
        <p className="mt-0.5 text-sm font-bold break-keep text-ink">{shown.join(' · ')}</p>

        {shownExtras.length > 0 && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted">
            {shownExtras.map((e) => (
              <span key={e.text} className="inline-flex items-center gap-1">
                {e.icon}
                {e.text}
              </span>
            ))}
          </p>
        )}
      </div>

      <Link
        href={href}
        className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-sky transition-colors hover:text-sky-strong"
      >
        자세히
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * '9월 24일 (수)'.
 *
 * UTC 로 읽는 이유: 날짜 키는 그냥 달력의 칸 이름이지 시각이 아니다. 지역
 * 시간으로 새 Date 를 만들면 시간대에 따라 하루 밀려 요일이 틀어진다.
 */
function spokenDay(dateKey: string) {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}
