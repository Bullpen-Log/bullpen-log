/*
 * 체크인 흐름을 여는 동안 — 예전엔 이 자리가 없어 앞 화면이 서버가 답할 때까지 얼어 있었다(2026-10-24 전체 검토). 흐름과 같은 바탕만 깐다.
 */
export default function Loading() {
  return (
    <div className="min-h-dvh bg-page" aria-busy="true" aria-live="polite">
      <span className="sr-only">불러오는 중이에요</span>
    </div>
  );
}
