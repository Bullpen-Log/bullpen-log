import { ChevronDown } from '@/components/icon';
import { FAQ } from '@/lib/support';

/**
 * 자주 묻는 질문 — 묶음마다 질문 줄, 누르면 답이 펼쳐진다. 브라우저의 <details> 라 스크립트 없이 열리고 닫힌다.
 * 글은 lib/support.ts FAQ 가 쥔다(틀 단계 — DB 없이 코드에서 바꾼다).
 */
export function SupportFaq() {
  return (
    <div className="space-y-5">
      {FAQ.map((group) => (
        <section key={group.group}>
          <h3 className="mb-1 text-xs font-medium text-muted">{group.group}</h3>
          <div className="divide-y divide-line">
            {group.items.map((item) => (
              <details key={item.q} className="group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-medium text-ink transition-colors [&::-webkit-details-marker]:hidden desk:hover:text-sky">
                  <span className="break-keep">{item.q}</span>
                  <ChevronDown
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-muted/70 transition-transform duration-200 group-open:rotate-180"
                  />
                </summary>
                <p className="pb-4 text-sm leading-relaxed break-keep text-muted">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
