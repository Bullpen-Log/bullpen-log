import { Download } from '@/components/icon';

/**
 * 원본 짝 매니페스트(JSON) 받기 — 평범한 내려받기 링크다(미리 받기 · 화면 이동 없이). 서버 경로는 manifest/route.ts.
 * 매니페스트에는 원본 바이트 · PIN · 초대 링크 · 서명 주소가 없다. 받을 때마다 감사 기록에 남는다.
 * submissionId 를 주면 그 접수 하나만(그 접수의 결과 묶음 틀이 같이 든다).
 */
export function ManifestLink({ submissionId, label = '접수 정보 JSON 받기' }: { submissionId?: string; label?: string }) {
  const href = submissionId ? `/admin/intake/manifest?submission=${submissionId}` : '/admin/intake/manifest';
  return (
    <a
      href={href}
      download
      title="접수·파일 정보와 결과 양식을 받습니다. 원본 영상은 별도로 다운로드합니다."
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-transparent bg-ink/6 px-4 py-2 text-sm text-ink transition-colors hover:text-sky desk:rounded-xl desk:border-line-strong desk:bg-surface-2 desk:hover:border-sky"
    >
      <Download aria-hidden className="h-4 w-4" />
      {label}
    </a>
  );
}
