import type { CommunityCard } from '@/lib/community-cards';

const dateText = (d: string) => {
  const [, m, day] = d.split('-').map(Number);
  return `${m}월 ${day}일`;
};

/**
 * 글에 붙은 싱커 기록 카드(lib/community-cards.ts) — 구속 측정 · 투구 기록 · 3D 동작 분석. 숫자 숨기기(hide)면 km/h · 투구 수를 안 보인다.
 * 서버 · 브라우저 어디서나 그린다(글 화면 · 글쓰기 미리보기).
 */
export function CommunityRecordCard({
  card,
  videoUrl,
}: {
  card: CommunityCard;
  videoUrl?: string | null;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-sky-soft/60 bg-sky-tint/40 p-(--block-pad)">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-sky-strong">
          {card.kind === 'velocity' ? '구속 측정' : card.kind === 'pitch' ? '투구 기록' : '3D 동작 분석'}
          <span className="ml-1.5 font-normal text-muted">{dateText(card.date)}</span>
        </span>
        <span className="text-muted">싱커 기록</span>
      </div>

      {card.kind === 'velocity' && (
        <div className="space-y-1">
          {card.pr && (
            <span className="inline-flex rounded-full bg-ok/15 px-2.5 py-0.5 text-xs font-semibold text-ok">
              최고 기록 갱신
            </span>
          )}
          {card.hide ? (
            <p className="text-base font-semibold text-ink">
              구속을 쟀어요{card.sessionType ? ` · ${card.sessionType}` : ''}
            </p>
          ) : (
            <>
              <p className="text-numeric text-3xl font-bold text-ink tabular-nums">
                {card.maxKmh.toFixed(1)}
                <span className="ml-1 text-base font-semibold text-muted">km/h</span>
              </p>
              <p className="text-sm text-muted tabular-nums">
                평균 {card.avgKmh.toFixed(1)} · {card.n}구{card.sessionType ? ` · ${card.sessionType}` : ''}
              </p>
            </>
          )}
        </div>
      )}

      {card.kind === 'pitch' && (
        <div className="space-y-2">
          <p className="text-base font-semibold text-ink tabular-nums">
            {card.sessionType}
            {!card.hide && ` ${card.pitchCount}구`}
          </p>
          {videoUrl && (
            <video
              src={`${videoUrl}#t=0.001`}
              controls
              playsInline
              preload="metadata"
              className="w-full rounded-xl bg-black"
            />
          )}
        </div>
      )}

      {card.kind === 'lab' && (
        <p className="text-base font-semibold text-ink">
          {card.primary ? `먼저 볼 것: ${card.primary}` : card.judged ? '평가한 지표에 고칠 점이 없었어요' : '분석을 마쳤어요'}
        </p>
      )}
    </div>
  );
}
