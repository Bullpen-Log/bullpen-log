import { ExternalLink, Lock } from '@/components/icon';
import type { OriginalStatus } from '@/lib/admin-references/load';
import type { ExternalVideo } from '@/lib/admin-references/schema';
import { TABLE_CELL_REM, tableMinRem } from '@/lib/admin-references/view';

/**
 * 참고자료 한 건의 표 · 원본 상태 한 줄(EX-REF02) · 원본 영상 링크(EX-REF03). 서버 컴포넌트로만 그린다(브라우저 컴포넌트 표시 없음).
 */

const cellBox = { minWidth: `${TABLE_CELL_REM.min}rem`, maxWidth: `${TABLE_CELL_REM.max}rem` } as const;
/* 칸 안쪽 여백도 rem 으로 — PC 에서 간격 단위가 바뀌어도 표 최소 폭 계산(tableMinRem)이 맞게 */
const cellPad = { padding: `0.375rem ${TABLE_CELL_REM.padX}rem` } as const;
/* 낱말 중간에서 끊지 않되(break-keep), 띄어쓰기 없는 긴 글(주소 등)은 어디서든 줄을 바꾼다 — 칸이 글 길이만큼 늘어나지 않게 */
const cellText = 'break-keep [overflow-wrap:anywhere] whitespace-pre-line';

/**
 * 원문 표 — 긴 문장 칸은 줄을 바꾸고(칸 최대 폭), 칸은 최소 폭 아래로 줄지 않는다.
 * 표 전체 최소 폭 = 칸 수 × (칸 최소 폭 + 좌우 여백)이라, 화면이 그보다 좁을 때만 옆으로 민다(넓으면 밀 것이 없다).
 */
export function SourceTable({ label, columns, rows }: { label: string; columns: readonly string[]; rows: readonly (readonly string[])[] }) {
  return (
    <div className="mt-2 overflow-x-auto" role="region" aria-label={`${label} 표`} tabIndex={0}>
      <table className="w-full border-collapse text-left text-xs leading-relaxed" style={{ minWidth: `${tableMinRem(columns.length)}rem` }}>
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i} scope="col" style={cellPad} className="border-b border-line-strong align-bottom font-semibold text-ink">
                <div style={cellBox} className={cellText}>
                  {col}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, i) => (
                <td key={i} style={cellPad} className="border-b border-line align-top text-ink">
                  <div style={cellBox} className={cellText}>
                    {cell}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const WHERE_NOTE = '쪽 · 시간 표시는 원본 위치를 가리켜요.';

/**
 * 원본 상태 한 줄 — 허락 확인 중 · 허락은 됐지만 파일이 아직 연결 안 됨 · 원본 파일 제공 안 함(옮긴 글 · 해설 · 요약은 보임) · 열 수 있음을 서로 다른 말로.
 * 열 수 있을 때도 쪽 · 시각으로 바로 가는지는 보는 프로그램(브라우저 · 앱의 PDF · 영상 보기)에 달려 있어 그렇다고 단정하지 않는다.
 */
export function OriginalNotice({ status, href }: { status: OriginalStatus; href: string | null }) {
  if (status === 'eligible' && href) {
    return (
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-line bg-surface px-(--block-pad) py-3 text-sm leading-relaxed text-muted">
        <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-sky hover:underline">
          원본 열기
          <ExternalLink aria-hidden className="h-3.5 w-3.5" />
        </a>
        <span>
          저자 허락을 받은 원본이에요. 대표관리자만 볼 수 있어요. 쪽 · 시간 표시를 누르면 원본을 열어요. 그 쪽 · 시각으로 바로 가는지는 원본을 여는
          프로그램에 따라 달라요.
        </span>
      </p>
    );
  }
  const text =
    status === 'not-linked'
      ? `이용 허락은 확인됐지만 원본 파일이 아직 연결되지 않았어요. 연결되면 여기서 열 수 있어요. ${WHERE_NOTE}`
      : status === 'original-not-offered'
        ? `이 자료는 비공개로 정리한 내용(옮긴 글 · 해설 · 요약)을 보여 줘요. 원본 파일은 이 화면에서 제공하지 않아요. ${WHERE_NOTE}`
        : `원본 이용 허락을 확인하는 중이에요. 허락이 확인되기 전에는 원본을 이 화면에서 열지 않아요. ${WHERE_NOTE}`;
  return (
    <p className="flex items-start gap-2 rounded-2xl border border-line bg-surface-2 px-(--block-pad) py-3 text-sm leading-relaxed text-muted">
      <Lock aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      {text}
    </p>
  );
}

const dateText = (iso: string) =>
  new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso));

/**
 * 영상 자료의 원본 — 원래 올라온 곳(지금은 YouTube)으로 가는 링크 하나(EX-REF03). 우리 서버는 영상을 두지도 · 받지도 · 틀지도 않는다
 * (플레이어 · iframe · 썸네일 · 통로 없음). 링크가 없으면 '링크 확인 중'만 — 찾기 결과 같은 링크를 만들어 넣지 않는다.
 * 링크가 연결됐다는 것이 영상 · 음성을 다 확인했다는 뜻이 아님을 같이 적는다(확인한 범위는 위 칸의 기록 그대로).
 */
export function ExternalVideoNotice({ video }: { video: ExternalVideo | null }) {
  if (!video) {
    return (
      <p className="flex items-start gap-2 rounded-2xl border border-line bg-surface-2 px-(--block-pad) py-3 text-sm leading-relaxed text-muted">
        <Lock aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        원본 링크 확인 중이에요. 확인된 원본 영상 링크가 연결되면 여기서 원래 사이트로 열 수 있어요. 영상 파일은 우리 서버에 두지 않아요.
      </p>
    );
  }
  return (
    <div className="rounded-2xl border border-line bg-surface px-(--block-pad) py-3 text-sm leading-relaxed text-muted">
      <a href={video.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-sky hover:underline">
        원본 영상 보기
        <ExternalLink aria-hidden className="h-3.5 w-3.5" />
      </a>
      <p className="mt-1 break-words text-ink">
        {video.title} <span className="text-muted">· {video.author}</span>
      </p>
      <p className="mt-1 text-xs">
        원래 올라온 사이트(YouTube)에서 열려요. 영상 파일은 우리 서버에 두지 않아요. 링크가 연결됐다고 영상 · 음성을 다 확인했다는 뜻은 아니에요. 확인한
        범위는 위 기록 그대로예요. 링크 확인 {dateText(video.checkedAt)}.
      </p>
    </div>
  );
}
