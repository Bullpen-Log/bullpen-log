import type { LabHand } from '@/lib/pitch-lab-meta';

/**
 * 폰 두 대 자리(위에서 본 그림) — 위가 투수, 아래가 포수 뒤. 우타는 타자가 홈 왼쪽(3루 쪽) 타석, 정면 폰은 오른쪽(1루 쪽). 좌타는 좌우를 뒤집는다.
 * 앱 native/src/swing/parts.tsx SwingPlaceArt 와 같은 좌표.
 */
export function SwingPlaceArt({ hand }: { hand: LabHand }) {
  const flip = (x: number) => (hand === 'L' ? 320 - x : x);
  const batterX = flip(122);
  const frontX = flip(270);
  return (
    <svg viewBox="0 0 320 210" className="w-full rounded-xl bg-ink/4" role="img" aria-label="폰 두 대 자리 그림">
      <line x1={160} y1={28} x2={160} y2={118} className="stroke-line" strokeWidth={2} strokeDasharray="4 5" />
      <circle cx={160} cy={22} r={7} className="fill-muted" />
      <text x={160} y={46} fontSize={11} className="fill-muted" textAnchor="middle">
        투수
      </text>
      <path d="M150 124 L170 124 L170 132 L160 140 L150 132 Z" className="fill-surface stroke-muted" strokeWidth={1.5} />
      <rect x={batterX - 14} y={110} width={28} height={42} fill="none" className="stroke-line" strokeWidth={1.5} />
      <circle cx={batterX} cy={131} r={9} className="fill-sky" />
      <text x={batterX} y={168} fontSize={11} className="fill-ink" textAnchor="middle">
        {hand === 'L' ? '좌타' : '우타'}
      </text>
      <line x1={frontX} y1={131} x2={batterX} y2={131} className="stroke-sky" strokeWidth={1.5} strokeDasharray="3 4" />
      <rect x={frontX - 7} y={119} width={14} height={24} rx={3} className="fill-ink" />
      <text x={frontX} y={108} fontSize={11} className="fill-ink" textAnchor="middle">
        정면 폰
      </text>
      <line x1={160} y1={188} x2={batterX} y2={131} className="stroke-sky" strokeWidth={1.5} strokeDasharray="3 4" />
      <rect x={153} y={182} width={14} height={24} rx={3} className="fill-ink" />
      <text x={flip(196)} y={200} fontSize={11} className="fill-ink" textAnchor="middle">
        포수 뒤 폰
      </text>
      <line x1={frontX - 18} y1={112} x2={frontX - 18} y2={150} className="stroke-muted" strokeWidth={2} />
      <line x1={140} y1={175} x2={180} y2={175} className="stroke-muted" strokeWidth={2} />
    </svg>
  );
}
