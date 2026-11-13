import { LAB_CLOTHES_ART, LAB_GUIDE_CLOTHES } from '@/lib/pitch-lab-guide';

/**
 * 촬영 안내 그림 — 색은 currentColor · 토큰만 쓴다(어두운 테마에서도 그대로). 글은 곁의 설명이 맡고, 그림은 화면 읽기에서 뺀다.
 */

const LIMB = { fill: 'none', stroke: 'currentColor', strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** 옆에서 본 투수 — 내딛는 순간 */
function PitcherSide({ flip = false }: { flip?: boolean }) {
  return (
    <g transform={flip ? 'translate(200 0) scale(-1 1)' : undefined}>
      <circle cx="100" cy="24" r="8" fill="currentColor" />
      <path {...LIMB} d="M100 36 L94 66" />
      <path {...LIMB} d="M94 66 L120 80 L128 102" />
      <path {...LIMB} d="M94 66 L74 84 L62 102" />
      <path {...LIMB} d="M99 40 L78 34 L72 18" />
      <path {...LIMB} d="M99 40 L120 46" />
    </g>
  );
}

/**
 * 옆 영상 — 가로 화면에 전신이 들어온 모습. 오른손 투수를 3루 쪽에서 본 모양이다.
 * flip 이면 좌우를 뒤집는다 — 왼손 투수는 1루 쪽에서 찍어 투구 방향이 반대로 보인다.
 */
export function SideFrame({ className = '', flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 200 124" className={className}>
      <rect x="3" y="3" width="194" height="118" rx="14" className="fill-surface stroke-line-strong" strokeWidth="2" />
      <path d="M16 104 H184" className="stroke-line-strong" strokeWidth="2" strokeLinecap="round" />
      <g className="text-sky">
        <PitcherSide flip={flip} />
      </g>
    </svg>
  );
}

/** 뒤 영상 — 세로 화면, 투수 등 쪽에서 홈을 본다. flip 이면 던지는 팔이 왼쪽(왼손 투수) */
export function RearFrame({ className = '', flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 124 200" className={className}>
      <rect x="3" y="3" width="118" height="194" rx="14" className="fill-surface stroke-line-strong" strokeWidth="2" />
      <path d="M16 170 H108" className="stroke-line-strong" strokeWidth="2" strokeLinecap="round" />
      <path d="M56 36 h12 l-6 7 z" className="fill-line-strong" />
      <g className="text-sky" transform={flip ? 'translate(124 0) scale(-1 1)' : undefined}>
        <circle cx="62" cy="74" r="8" fill="currentColor" />
        <path {...LIMB} d="M62 86 L62 122" />
        <path {...LIMB} d="M62 122 L46 146 L42 168" />
        <path {...LIMB} d="M62 122 L78 146 L82 168" />
        <path {...LIMB} d="M62 92 L40 102" />
        <path {...LIMB} d="M62 92 L84 84 L92 68" />
      </g>
    </svg>
  );
}

/** 위에서 본 자리 — 위가 홈. 오른손 투수는 3루 쪽(그림 오른쪽), 왼손 투수는 1루 쪽(그림 왼쪽)이 가슴이 보이는 쪽이다 */
export function PlacementMap({ hand, className = '' }: { hand: 'R' | 'L'; className?: string }) {
  const sideX = hand === 'R' ? 244 : 36;
  const label = hand === 'R' ? '3루 쪽' : '1루 쪽';
  return (
    <svg aria-hidden viewBox="0 0 280 210" className={className}>
      <path d="M140 12 l10 8 v8 h-20 v-8 z" className="fill-line-strong" />
      <text x="140" y="46" textAnchor="middle" className="fill-muted" fontSize="12">
        홈
      </text>
      <path d="M140 54 V96" className="stroke-line-strong" strokeWidth="2" strokeDasharray="5 6" />
      <circle cx="140" cy="112" r="13" className="fill-sky" />
      <text x="140" y="116" textAnchor="middle" className="fill-white" fontSize="11" fontWeight="700">
        투수
      </text>

      {/* 옆 폰 */}
      <path d={`M${hand === 'R' ? 224 : 56} 112 H${hand === 'R' ? 160 : 120}`} className="stroke-sky" strokeWidth="2" strokeDasharray="5 6" />
      <rect x={sideX - 15} y="102" width="30" height="20" rx="4" className="fill-surface stroke-ink" strokeWidth="2" />
      <text x={sideX} y="90" textAnchor="middle" className="fill-ink" fontSize="12" fontWeight="700">
        옆 폰
      </text>
      <text x={sideX} y="140" textAnchor="middle" className="fill-muted" fontSize="11">
        {label}
      </text>

      {/* 뒤 폰 */}
      <path d="M140 168 V130" className="stroke-sky" strokeWidth="2" strokeDasharray="5 6" />
      <rect x="130" y="170" width="20" height="30" rx="4" className="fill-surface stroke-ink" strokeWidth="2" />
      <text x="162" y="190" className="fill-ink" fontSize="12" fontWeight="700">
        뒤 폰
      </text>
    </svg>
  );
}

/**
 * 옷 — 몸에 붙는 옷은 관절 점이 제자리, 헐렁한 옷은 점이 옷 가장자리로 밀린다. 좌표 · 글은 3D 동작 분석 안내와 같다(lib/pitch-lab-guide.ts).
 * 색만으로 말하지 않게 이름표에 표시 글자를 같이 둔다.
 */
export function ClothesArt({ className = '' }: { className?: string }) {
  const A = LAB_CLOTHES_ART;
  const cases = [
    { ok: true, label: LAB_GUIDE_CLOTHES.ok },
    { ok: false, label: LAB_GUIDE_CLOTHES.bad },
  ];
  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`}>
      {cases.map((k) => (
        <figure key={k.label} className="space-y-1.5">
          <svg aria-hidden viewBox={A.viewBox} className="w-full rounded-xl bg-surface">
            {k.ok ? (
              <path d={A.bones} stroke="var(--color-sky)" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            ) : (
              <>
                <path d={A.pants} fill="var(--color-muted)" opacity={0.75} />
                <path d={A.hoodie} fill="var(--color-sky)" opacity={0.85} />
              </>
            )}
            <circle cx={A.head.cx} cy={A.head.cy} r={A.head.r} fill="var(--color-line-strong)" />
            {(k.ok ? A.joints : A.slipped).map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r={3.2} fill={k.ok ? 'var(--color-ok)' : 'var(--color-danger)'} stroke="var(--color-surface)" strokeWidth={1.2} />
            ))}
          </svg>
          <figcaption className={`text-center text-footnote font-semibold ${k.ok ? 'text-ok' : 'text-danger'}`}>
            {k.ok ? '✓ ' : '✕ '}
            {k.label}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
