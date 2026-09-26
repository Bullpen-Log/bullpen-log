/**
 * 3D 모델 출처 — CC BY-SA 4.0 이라 3D 가 보이는 곳마다 밝힌다(public/models/ATTRIBUTION.txt).
 *
 * 한때 3D 지도 칸과 전신 부위 창에만 있고, 루틴·내 루틴 만들기·라이브러리에서 뜨는 근육 창에는
 * 빠져 있었다(2026-09-26 검토). 한 곳에서 만들어 모든 3D 가 같이 쓴다.
 */
export function ModelCredit({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[11px] text-muted ${className}`}>
      3D: Z-Anatomy · BodyParts3D ·{' '}
      <a
        href="https://creativecommons.org/licenses/by-sa/4.0/deed.ko"
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2"
      >
        CC BY-SA 4.0
      </a>{' '}
      ·{' '}
      <a
        href="/models/ATTRIBUTION.txt"
        target="_blank"
        className="underline underline-offset-2"
      >
        출처
      </a>
    </p>
  );
}
