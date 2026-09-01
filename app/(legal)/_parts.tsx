import type { ReactNode } from 'react';

/**
 * 약관 글에 쓰는 조각들.
 *
 * 두 문서가 같은 모양이어야 해서 여기 모아 둔다. 법 문서는 읽기 싫은 글이라,
 * 적어도 눈이 어디를 보는지는 분명해야 한다 — 조 제목이 굵고, 본문이 넉넉하고,
 * 목록이 들여쓰기된다.
 */

export function LegalHeading({
  title,
  updatedAt,
  summary,
}: {
  title: string;
  /** 시행일 */
  updatedAt: string;
  /** 이 문서가 무슨 이야기인지 한 문단으로 */
  summary: ReactNode;
}) {
  return (
    <header className="mb-10 border-b border-line pb-8">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
        Bullpen Log
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">{title}</h1>
      <p className="mt-1.5 text-xs tabular-nums text-muted">시행일 {updatedAt}</p>
      <div className="mt-5 rounded-xl border border-sky-soft/60 bg-sky-tint px-5 py-4 text-sm leading-relaxed text-ink/85">
        {summary}
      </div>
    </header>
  );
}

export function Article({
  no,
  title,
  children,
}: {
  no: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-2.5 text-base font-bold text-ink">
        <span className="mr-2 tabular-nums text-muted">제{no}조</span>
        {title}
      </h2>
      <div className="space-y-2.5 text-sm leading-relaxed text-ink/85">{children}</div>
    </section>
  );
}

/** 번호 매긴 항. 법 문서의 ①②③ 자리다. */
export function Items({ children }: { children: ReactNode }) {
  return <ol className="ml-1 space-y-2 [counter-reset:item]">{children}</ol>;
}

export function Item({ children }: { children: ReactNode }) {
  return (
    <li className="relative pl-6 [counter-increment:item] before:absolute before:left-0 before:top-0 before:tabular-nums before:text-muted before:content-[counter(item)_'.']">
      {children}
    </li>
  );
}

/** 표 — 개인정보 항목처럼 무엇을 왜 얼마나 두는지 나란히 볼 것에 쓴다. */
export function DataTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="my-3 overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
        <thead>
          <tr className="bg-surface-2">
            {head.map((h) => (
              <th
                key={h}
                className="border-b border-line px-4 py-2.5 text-xs font-semibold text-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="align-top">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="border-b border-line px-4 py-3 leading-relaxed text-ink/85 last:border-r-0"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 아직 못 채운 자리.
 *
 * 사업자 정보나 연락처처럼 운영자만 아는 것이 있다. 비워두고 넘어가면
 * "OO"이 그대로 배포되므로, 눈에 띄게 표시해 둔다.
 */
export function Blank({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded bg-warn-bg px-1.5 py-0.5 font-medium text-warn">
      {children}
    </mark>
  );
}
