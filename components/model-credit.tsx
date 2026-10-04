/**
 * 3D 모델 출처 — CC BY-SA 4.0 이라 3D 가 보이는 곳마다 밝힌다(public/models/ATTRIBUTION.txt).
 *
 * 한때 3D 지도 칸과 전신 부위 창에만 있고, 루틴·내 루틴 만들기·라이브러리에서 뜨는 근육 창에는
 * 빠져 있었다(2026-09-26 검토). 한 곳에서 만들어 모든 3D 가 같이 쓴다.
 *
 * 휴대폰에서는 숨긴다 — 지도 밑의 밑줄 링크가 웹페이지 같았고 누르면 앱 밖(사파리)으로 나갔다. 휴대폰의 출처는
 * 아이폰 앱의 '법적 고지'처럼 설정 › 정보 › 3D 모델 출처에 원저작자가 정한 문구 그대로 있다
 * (components/settings-info.tsx, 2026-10-04 '앱 안에 머물기'). PC 는 그대로.
 */
export function ModelCredit({ className = '' }: { className?: string }) {
  return (
    <p className={`hidden text-[11px] text-muted desk:block ${className}`}>
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
