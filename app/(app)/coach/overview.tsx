import { Speed } from '@/components/speed';
import type { AnalysisOverview, StatNote } from '@/lib/report/analysis-overview';
import { LoadPanel } from './load-panel';
import { Delta, StatCard, TONE } from './parts';
import type { CoachView } from './tabs';

/**
 * 분석 화면 윗부분 — 지금 몸이 어떤 상태인지.
 *
 * 예전에는 여기에 프로필 카드(이름·나이·키·최근 7일 막대·누적 건수)와 구속
 * 카드가 따로 있었고, 그 밑에 지표 넷과 차트가 또 있었다. 구속만 세 군데에
 * 나왔다. 볼 것이 많으면 아무것도 안 보이는 셈이라, 하나만 크게 두고 나머지는
 * 뒷받침으로 내렸다.
 *
 *   지금 조심할 것 — 투구·운동 부하 지수 (걱정스러운 쪽이 크게)
 *   뒷받침 셋      — 이번 주 투구 / 마지막 투구 / 최고 구속
 *
 * 28일 추이 그래프 · 지표 설명 · 생년월일 안내는 2026-10-14 걷었다(사용자 "너무 조잡해 · 중요한 내용만") — 추이는 옆의
 * 그래프(투구수 · 최고 구속)가 같은 것을 보인다.
 *
 * 프로필 카드는 뺐다. 이름과 나이는 이 화면을 열 때 알고 싶은 것이 아니다.
 * 구속 카드도 뺐다 — 스피드건이 없는 사용자가 대부분이라 크게 둘 값이 아니다.
 *
 * 아래에 이어지는 리포트와 같은 자료를 쓰므로 두 부분이 서로 다른 말을 하지 않는다.
 */

/** 숫자 칸 밑 한 줄(lib/report/analysis-overview.ts StatNote) */
function Note({ note }: { note: StatNote }) {
  const cls =
    note.tone === 'warn' ? TONE.warn.text : note.tone === 'muted' ? 'text-muted' : 'text-muted/60';
  return <span className={`text-xs ${cls}`}>{note.text}</span>;
}

/**
 * 숫자는 lib/report/analysis-overview.ts 가 셈한다 — 아이폰 앱 분석 화면(native/src/app/analysis.tsx)과 같은 값(2026-10-18).
 * 여기서는 그리기만.
 */
export function StatsOverview({
  overview,
  view,
}: {
  overview: AnalysisOverview;
  /** 어느 칸을 보고 있는가 */
  view: CoachView;
}) {
  const { week, last, best } = overview;
  return (
    <div className="stack-block">
      {/* ── 투구 ────────────────────────────────────────────── */}
      {view === 'pitch' && (
        <>
          <LoadPanel which="pitching" view={overview.pitching} notices={overview.notices} />

          {/* 셋을 늘 한 줄로(휴대폰도 — 세로로 쌓으면 숫자 셋이 화면 한 장을 차지했다, 2026-10-14) */}
          <section className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line">
            <StatCard
              label="이번 주 투구"
              value={week.total}
              unit="구"
              tone={week.tone}
              footer={<Delta delta={week.delta} />}
            />
            <StatCard
              label="마지막 투구"
              value={last.restDays == null ? '—' : last.restDays === 0 ? '오늘' : last.restDays}
              unit={last.restDays == null || last.restDays === 0 ? '' : '일 전'}
              tone={last.tone}
              footer={<Note note={last.note} />}
            />
            {/*
          구속은 크게 두지 않는다. 스피드건이 없어 못 적는 사용자가 대부분이라,
          큰 자리를 주면 대다수 화면에 빈칸이 크게 남는다. 적은 사람에게는
          여기서 개인 최고를 보여주고, 추이는 아래 그래프에서 본다.
        */}
            <StatCard
              label="개인 최고 구속"
              /*
               * 숫자와 단위를 한 조각으로 넘긴다. 단위는 브라우저에만 있는
               * 값이라 서버가 그리는 이 화면은 알 수 없어서, 그 한 조각만
               * 화면 쪽 부품(Speed)에 맡긴다.
               */
              value={best ? <Speed kmh={best.value} /> : '—'}
              unit=""
              footer={<Note note={best ? best.note : overview.bestEmpty} />}
            />
          </section>

        </>
      )}

      {/* ── 트레이닝 ────────────────────────────────────────── */}
      {/*
        나머지는 페이지가 낸다(training-review.tsx).

        예전에는 여기에 '이번 주 운동' 카드와 '이번 주 부위별 세트'가 있었다.
        둘 다 최근 4주 카드와 부위 추이 표에 그대로 들어가 있어서, 남겨 두면
        같은 숫자를 두 번 보여주게 된다.
      */}
      {view === 'training' && <LoadPanel which="training" view={overview.training} />}
    </div>
  );
}
