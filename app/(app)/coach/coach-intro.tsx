import { Card, PageHeading } from '@/components/ui';
import { COACH_POINTS } from '@/lib/coach-intro';

/**
 * 코치 소개 — 유료가 아닌 사람이 /coach 를 열면(PC 웹 · 옛 앱이 분석 화면에서 떠나 온 웹뷰, docs/designs/ai-coach.md U13 · U14).
 * 결제 안내 · 밖 링크는 두지 않는다(애플 심사 — 앱 웹뷰에서도 이 화면이 뜬다). 앱 화면은 native/src/coach/tab.tsx 같은 글.
 */
export function CoachIntro() {
  return (
    <div className="stack-page">
      <PageHeading title="코치" />
      <Card className="p-(--block-pad)">
        <p className="text-base font-semibold text-ink">내 상태에 맞춰 한 주 운동을 짜고 매일 고쳐 주는 코치예요.</p>
        <ul className="mt-3 space-y-1.5 text-sm text-muted">
          {COACH_POINTS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm font-semibold text-ink">유료 요금제 전용이에요.</p>
      </Card>
    </div>
  );
}
