'use client';

import { useState } from 'react';
import { Check } from '@/components/icon';
import { Modal } from '@/components/modal';
import { HelpButton, Paras, SecondaryButton } from '@/components/intake/shell';
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

/** '보내는 것: …' 처럼 짧은 머리말로 시작하는 줄 — 머리말만 진하게 보인다(글자는 그대로) */
const LEAD = /^([^:：\n]{1,14})([:：] )([\s\S]+)$/;

/**
 * 동의 글 — 서버가 준 글자 그대로 보인다. 본문 해시를 되돌려 보내므로 글자는 다듬지 않고, 줄마다 한 문단으로 띄워 보이기만 한다(R05).
 * 머리말(보내는 것 · 쓰는 곳 …)이 있는 줄은 머리말을 진하게 — 화면 읽기에는 같은 한 문단이다.
 */
export function ConsentText({ body }: { body: string }) {
  const lines = body.split('\n').filter((t) => t.trim() !== '');
  return (
    <div className="space-y-4 text-[15px] leading-[1.75] break-keep text-muted">
      {lines.map((line, i) => {
        const m = LEAD.exec(line);
        return (
          <p key={i}>
            {m ? (
              <>
                <span className="font-semibold text-ink">{m[1]}</span>
                {m[2]}
                {m[3]}
              </>
            ) : (
              line
            )}
          </p>
        );
      })}
    </div>
  );
}

/**
 * 동의마다 짧은 요약 — 전문(해시를 맞추는 글)은 바꾸지 않고 '약관 보기' 창에서 그대로 보인다. 요약은 전문보다 넓게 말하지 않는다.
 * 보내기 전 결정 화면(review-wizard)과 고침 · 다시 동의 화면(RequiredConsents)이 같은 글을 쓴다.
 */
const CONSENT_SUMMARY: Record<string, { question: string; summary: string }> = {
  submission: {
    question: '영상 제출·처리 동의',
    summary:
      '원본 영상과 선수 정보를 접수하고, 팀이 원본을 내려받아 3D 동작 결과를 만듭니다.\n검토·승인한 결과만 이 링크에 공개됩니다.',
  },
  overseas: {
    question: '국외 자동 분석 동의',
    summary:
      '원본 영상을 국외 자동 분석 서버로 보내 분석하는 데 동의합니다.\n미동의 시에도 접수와 팀의 직접 결과 제작은 진행됩니다.',
  },
  model: {
    question: '모델 개발 이용 동의',
    summary:
      '접수한 영상과 결과를 투구 분석 모델의 개발·개선에 사용합니다.\n미동의 시에도 접수와 결과 제작은 진행됩니다.',
  },
};
export const consentCopyOf = (d: Pick<PublicConsentDoc, 'kind' | 'title'>) => CONSENT_SUMMARY[d.kind] ?? { question: `${d.title}에 동의하시나요?`, summary: '' };

/** 동의 요약 — 문장마다 한 줄로(R05). 화면 글자 크기는 R04 그대로 */
export function ConsentSummary({ text }: { text: string }) {
  return <Paras text={text} gap="mt-1" className="text-[15px] leading-6 text-muted" />;
}

/**
 * 약관 전문 창 — 열기만 해서는 동의가 기록되지 않는다(체크 칸은 창 밖에 있다). 닫으면 브라우저가 초점을 연 단추로 돌려준다(<dialog>).
 */
export function TermsDialog({
  doc,
  onClose,
}: {
  doc: PublicConsentDoc | null;
  onClose: () => void;
}) {
  return (
    <Modal open={doc != null} onClose={onClose} title={doc?.title ?? '약관'}>
      {doc && (
        <div className="space-y-4 pb-2">
          <ConsentText body={doc.body} />
          <Paras
            text={
              '약관을 열람해도 동의는 기록되지 않습니다.\n닫은 뒤 체크 칸에서 직접 선택합니다.'
            }
            className="border-t border-line pt-3 text-footnote leading-5 text-muted"
          />
          <SecondaryButton onClick={onClose}>닫기</SecondaryButton>
        </div>
      )}
    </Modal>
  );
}

/**
 * 필수 동의(고침 · 다시 동의 화면, R04) — 짧은 요약 · 필수 표시 · '약관 보기' · 꺼진 체크 칸. 전문은 창에서만 보인다.
 * 체크 값은 부르는 쪽이 쥐고(처음에 꺼짐), 판 · 해시 검사는 서버가 그대로 한다. 대리인이 보내면 체크 글이 달라진다(proxy).
 */
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
  const [terms, setTerms] = useState<PublicConsentDoc | null>(null);
  return (
    <>
      {docs
        .filter((d) => d.required)
        .map((d) => {
          const summary = consentCopyOf(d).summary;
          return (
            <section key={d.kind} aria-label={d.title} className="space-y-1.5 rounded-2xl bg-surface p-(--block-pad)">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-ink">
                  {d.title} <span className="text-footnote font-semibold text-muted">(필수)</span>
                </h2>
                <HelpButton onClick={() => setTerms(d)} aria-haspopup="dialog" className="-mr-1 shrink-0">
                  약관 보기
                </HelpButton>
              </div>
              {summary && <ConsentSummary text={summary} />}
              <CheckRow
                id={`consent-${d.kind}`}
                checked={agreed[d.kind] === true}
                onChange={(next) => onChange(d.kind, next)}
                label={consentCheckLabel(proxy)}
                invalid={invalid && agreed[d.kind] !== true}
                describedBy={describedBy}
              />
            </section>
          );
        })}
      <TermsDialog doc={terms} onClose={() => setTerms(null)} />
    </>
  );
}

export function consentAnswers(docs: readonly PublicConsentDoc[], agreed: Record<string, boolean>) {
  return docs.map((d) => ({ kind: d.kind, version: d.version, textHash: d.textHash, granted: agreed[d.kind] === true }));
}
