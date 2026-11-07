'use client';

import { Check } from '@/components/icon';
import { consentCheckLabel } from '@/lib/intake/consent';
import type { PublicConsentDoc } from '@/lib/intake/public-client';

/** 네모 고르기 — 칸 전체를 누를 수 있고, 켜짐은 색이 아니라 체크 표시로도 보인다 */
export function CheckRow({
  id,
  checked,
  onChange,
  label,
  invalid,
  describedBy,
}: {
  id?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5">
      <span className="relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.currentTarget.checked)}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className="peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-md border-2 border-line-strong bg-surface checked:border-sky checked:bg-sky focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky aria-invalid:border-danger"
        />
        <Check aria-hidden className="pointer-events-none relative h-4 w-4 text-white opacity-0 peer-checked:opacity-100" />
      </span>
      <span className="text-sm leading-6 font-semibold break-keep text-ink">{label}</span>
    </label>
  );
}

/** 동의 글 — 서버가 준 글자 그대로 보인다. 본문 해시를 되돌려 보내므로 여기서 다듬지 않는다 */
export function ConsentText({ body }: { body: string }) {
  return <p className="text-footnote leading-5 break-keep whitespace-pre-line text-muted">{body}</p>;
}

/** 필수 동의 — 접지 않고 글을 그대로 보인다. 대리인이 보내면 체크 글이 달라진다(proxy) */
export function RequiredConsents({
  docs,
  agreed,
  onChange,
  invalid,
  describedBy,
  proxy = false,
}: {
  docs: readonly PublicConsentDoc[];
  agreed: Record<string, boolean>;
  onChange: (kind: string, next: boolean) => void;
  invalid: boolean;
  describedBy?: string;
  proxy?: boolean;
}) {
  return (
    <>
      {docs
        .filter((d) => d.required)
        .map((d) => (
          <section key={d.kind} aria-label={d.title} className="rounded-2xl bg-surface p-(--block-pad)">
            <h2 className="text-sm font-bold text-ink">{d.title}</h2>
            <div className="mt-2">
              <ConsentText body={d.body} />
            </div>
            <div className="mt-2">
              <CheckRow
                id={`consent-${d.kind}`}
                checked={agreed[d.kind] === true}
                onChange={(next) => onChange(d.kind, next)}
                label={consentCheckLabel(proxy)}
                invalid={invalid && agreed[d.kind] !== true}
                describedBy={describedBy}
              />
            </div>
          </section>
        ))}
    </>
  );
}

export function consentAnswers(docs: readonly PublicConsentDoc[], agreed: Record<string, boolean>) {
  return docs.map((d) => ({ kind: d.kind, version: d.version, textHash: d.textHash, granted: agreed[d.kind] === true }));
}
