'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CircleCheck, Loader2, RotateCw, TriangleAlert } from '@/components/icon';
import {
  DOMAIN_LABEL,
  DOMAINS,
  PURPOSE_LABEL,
  PURPOSES,
  READING,
  READING_LABEL,
  SOURCE_KIND_LABEL,
  SOURCE_KINDS,
  SUMMARY_BASIS,
  SUMMARY_BASIS_LABEL,
} from '@/lib/review-evidence/model';
import { registerResultOf } from '@/lib/review-evidence/view';
import { FIELD, apiFailText, type ApiFailBody } from '../parts';

/**
 * 검수 근거 등록 폼(EX-REF04). 같은 내용을 다시 보내면 같은 요청 번호를 써서 한 번만 저장된다.
 * 칸 하나라도 바꾸면 요청 번호를 새로 만든다. 저장 여부를 모를 때(503 · 신호 끊김)는 같은 번호 · 같은 내용으로 다시 보낸다.
 * 확인 못 한 뒤 칸을 고치면 옛 본문은 버린다('다시 보내기'를 숨긴다) — 화면에 보이는 내용과 다른 것을 '저장했어요'로 알리지 않게.
 * 적은 때(use.notedAt)는 요청 번호를 만들 때 한 번 정하고, 같은 번호로 다시 보낼 때 그대로 쓴다.
 * 이 파일은 브라우저에서 돈다 — hash.ts · store.ts · storage.ts 를 부르지 않는다.
 */

type Values = Record<
  | 'url'
  | 'kind'
  | 'title'
  | 'summaryKo'
  | 'summaryBasis'
  | 'domain'
  | 'reviewId'
  | 'itemId'
  | 'itemName'
  | 'purpose'
  | 'purposeNote'
  | 'consultedOn'
  | 'applicationKo'
  | 'limitationsKo'
  | 'reading'
  | 'readingNote',
  string
>;
type Name = keyof Values;

const EMPTY: Values = {
  url: '',
  kind: '',
  title: '',
  summaryKo: '',
  summaryBasis: '',
  domain: '',
  reviewId: '',
  itemId: '',
  itemName: '',
  purpose: '',
  purposeNote: '',
  consultedOn: '',
  applicationKo: '',
  limitationsKo: '',
  reading: 'unknown',
  readingNote: '',
};

const FIELD_LABEL: Record<string, string> = {
  requestKey: '요청 번호',
  'source.url': '출처 링크',
  'source.kind': '자료 종류',
  'source.title': '제목',
  'source.summaryKo': '요약',
  'source.summaryBasis': '요약 기준',
  'use.domain': '분야',
  'use.reviewId': '검수 번호',
  'use.itemId': '운동 · 드릴 번호',
  'use.itemName': '운동 · 드릴 이름',
  'use.purpose': '쓴 곳',
  'use.purposeNote': '쓴 곳 메모',
  'use.consultedOn': '확인일',
  'use.applicationKo': '적용 내용',
  'use.limitationsKo': '적용 한계',
  'use.reading': '읽은 범위',
  'use.readingNote': '읽은 범위 메모',
};

/** useState 는 R2 서버만 싣는다(더하기만) — 없으면 예전처럼 visible 만 본다 */
type Receipt = { replayed: boolean; visible: boolean; placements: { sourceId: string; useId: string }[]; useState?: 'active' | 'withdrawn' | 'unknown' | null };
type Issue = { field: string; message: string };
type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; receipt: Receipt; local: boolean }
  | { kind: 'invalid'; issues: Issue[] }
  | { kind: 'error'; message: string }
  | { kind: 'unsure'; message: string };

const orNull = (s: string) => (s.trim() ? s.trim() : null);

function newKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return 'rk-ui-' + c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  return 'rk-ui-' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function bodyOf(v: Values, requestKey: string, notedAt: string): string {
  const summaryKo = orNull(v.summaryKo);
  return JSON.stringify({
    requestKey,
    source: {
      url: v.url.trim(),
      kind: orNull(v.kind),
      title: orNull(v.title),
      summaryKo,
      summaryBasis: summaryKo ? orNull(v.summaryBasis) : null,
    },
    use: {
      domain: v.domain,
      reviewId: v.reviewId.trim(),
      itemId: orNull(v.itemId),
      itemName: orNull(v.itemName),
      purpose: v.purpose,
      purposeNote: orNull(v.purposeNote),
      consultedOn: orNull(v.consultedOn),
      notedAt,
      applicationKo: orNull(v.applicationKo),
      limitationsKo: orNull(v.limitationsKo),
      reading: v.reading || 'unknown',
      readingNote: orNull(v.readingNote),
    },
  });
}

const MESSAGE_BY_STATUS: Record<number, string> = {
  401: '로그인이 풀렸어요. 다시 로그인한 뒤 보내 주세요.',
  409: '같은 요청 번호로 다른 내용이 이미 저장돼 있어요. 칸을 고쳐 새 요청으로 보내 주세요.',
  413: '내용이 너무 길어요. 요약 · 적용 내용을 줄여 주세요.',
};
const UNSURE = '저장했는지 확인하지 못했어요. 같은 내용으로 다시 보내면 겹치지 않아요.';

export function RegisterForm({ today }: { today: string }) {
  const [v, setV] = useState<Values>(EMPTY);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  /** 앞서 확인 못 한 요청이 있었는데 칸을 고쳤다 — 그 요청이 이미 저장됐을 수 있다고 알린다 */
  const [earlierUnsure, setEarlierUnsure] = useState(false);
  const keyRef = useRef<{ key: string; notedAt: string } | null>(null);
  const lastSent = useRef<string | null>(null);

  const set = (name: Name) => (e: { target: { value: string } }) => {
    const value = e.target.value;
    setV((prev) => ({ ...prev, [name]: value }));
    keyRef.current = null; // 내용이 바뀌면 새 요청
    if (status.kind === 'unsure') {
      lastSent.current = null; // 옛 본문은 버린다
      setEarlierUnsure(true);
      setStatus({ kind: 'idle' });
    } else if (status.kind === 'saved') {
      lastSent.current = null;
      setStatus({ kind: 'idle' });
    }
  };

  async function send(body: string) {
    if (status.kind === 'saving') return;
    lastSent.current = body;
    setStatus({ kind: 'saving' });
    let res: Response;
    try {
      res = await fetch('/api/admin/review-evidence', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-review-evidence': '1' },
        body,
        credentials: 'same-origin',
        cache: 'no-store',
      });
    } catch {
      setStatus({ kind: 'unsure', message: UNSURE });
      return;
    }
    let data: { receipt?: Receipt; store?: string; issues?: Issue[]; message?: string; error?: string } | null = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (res.ok && data?.receipt) {
      setEarlierUnsure(false);
      setStatus({ kind: 'saved', receipt: data.receipt, local: data.store === 'local-fixture' });
      return;
    }
    if (res.status === 503 || res.status >= 500 || (res.ok && !data?.receipt)) {
      setStatus({ kind: 'unsure', message: UNSURE });
      return;
    }
    if (res.status === 400 && Array.isArray(data?.issues) && data.issues.length) {
      setStatus({ kind: 'invalid', issues: data.issues.slice(0, 30) });
      return;
    }
    setStatus({
      kind: 'error',
      message: apiFailText(res.status, data as ApiFailBody, {
        forbidden: '대표관리자만 등록할 수 있어요.',
        byStatus: MESSAGE_BY_STATUS,
        fallback: '보내지 못했어요. 넣은 값을 확인해 주세요.',
      }),
    });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!keyRef.current) keyRef.current = { key: newKey(), notedAt: new Date().toISOString() };
    void send(bodyOf(v, keyRef.current.key, keyRef.current.notedAt));
  }

  const saving = status.kind === 'saving';
  const hasSummary = Boolean(v.summaryKo.trim());

  return (
    <form onSubmit={onSubmit} className="stack-block">
      <Section title="출처">
        <Labeled label="출처 링크(필수)" hint="https 로 시작하는 공식 페이지 · 논문 주소">
          <input type="url" required inputMode="url" value={v.url} onChange={set('url')} maxLength={2048} className={FIELD} placeholder="https://" />
        </Labeled>
        <Labeled label="자료 종류">
          <select value={v.kind} onChange={set('kind')} className={FIELD}>
            <option value="">모름 · 나중에 확인</option>
            {SOURCE_KINDS.map((k) => (
              <option key={k} value={k}>
                {SOURCE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="제목">
          <input value={v.title} onChange={set('title')} maxLength={400} className={FIELD} />
        </Labeled>
        <Labeled label="한국어 요약" hint="600자까지. 원문을 옮겨 적지 말고 짧게 요약해요.">
          <textarea value={v.summaryKo} onChange={set('summaryKo')} maxLength={600} rows={3} className={`${FIELD} py-2`} />
        </Labeled>
        <Labeled label={hasSummary ? '요약 기준(필수)' : '요약 기준'}>
          <select value={v.summaryBasis} onChange={set('summaryBasis')} required={hasSummary} className={FIELD}>
            <option value="">고르기</option>
            {SUMMARY_BASIS.map((b) => (
              <option key={b} value={b}>
                {SUMMARY_BASIS_LABEL[b]}
              </option>
            ))}
          </select>
        </Labeled>
      </Section>

      <Section title="쓰인 곳">
        <fieldset>
          <legend className="text-xs text-muted">분야(필수)</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {DOMAINS.map((d) => (
              <label key={d} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink/5 px-4 text-sm text-ink">
                <input type="radio" name="domain" value={d} checked={v.domain === d} onChange={set('domain')} required />
                {DOMAIN_LABEL[d]}
              </label>
            ))}
          </div>
        </fieldset>
        <Labeled label="검수 번호(필수)" hint="영문 · 숫자 · . _ : - 로 120자까지">
          <input value={v.reviewId} onChange={set('reviewId')} required maxLength={120} pattern="[A-Za-z0-9][A-Za-z0-9._:\-]{0,119}" className={`${FIELD} font-mono`} />
        </Labeled>
        <Labeled label="운동 · 드릴 번호">
          <input value={v.itemId} onChange={set('itemId')} maxLength={120} pattern="[A-Za-z0-9][A-Za-z0-9._:\-]{0,119}" className={`${FIELD} font-mono`} />
        </Labeled>
        <Labeled label="운동 · 드릴 이름">
          <input value={v.itemName} onChange={set('itemName')} maxLength={120} className={FIELD} />
        </Labeled>
        <Labeled label="쓴 곳(필수)">
          <select value={v.purpose} onChange={set('purpose')} required className={FIELD}>
            <option value="">고르기</option>
            {PURPOSES.map((p) => (
              <option key={p} value={p}>
                {PURPOSE_LABEL[p]}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="쓴 곳 메모">
          <input value={v.purposeNote} onChange={set('purposeNote')} maxLength={120} className={FIELD} />
        </Labeled>
        <Labeled label="확인일" hint="비워 두면 확인일 미상으로 남아요.">
          <input type="date" value={v.consultedOn} onChange={set('consultedOn')} min="2000-01-01" max={today} className={FIELD} />
        </Labeled>
        <Labeled label="적용 내용(필수)" hint="이 출처로 무엇을 정하거나 고쳤는지 한국어로 짧게 적어요.">
          <textarea value={v.applicationKo} onChange={set('applicationKo')} required maxLength={800} rows={3} className={`${FIELD} py-2`} />
        </Labeled>
        <Labeled label="적용 한계">
          <textarea value={v.limitationsKo} onChange={set('limitationsKo')} maxLength={800} rows={2} className={`${FIELD} py-2`} />
        </Labeled>
        <Labeled label="실제로 읽은 범위">
          <select value={v.reading} onChange={set('reading')} className={FIELD}>
            {READING.map((r) => (
              <option key={r} value={r}>
                {READING_LABEL[r]}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="읽은 범위 메모">
          <input value={v.readingNote} onChange={set('readingNote')} maxLength={200} className={FIELD} />
        </Labeled>
      </Section>

      {earlierUnsure && status.kind !== 'saved' && (
        <p role="status" className="rounded-2xl border border-warn-line bg-warn-bg px-(--block-pad) py-3 text-xs leading-relaxed text-ink">
          앞서 확인하지 못한 요청은 이미 저장됐을 수 있어요. 고친 내용으로 다시 등록하면 같은 쓰임의 새 기록으로 남아요. 목록에서 확인해 주세요.
        </p>
      )}

      <Result status={status} onResend={() => lastSent.current && void send(lastSent.current)} />

      <button
        type="submit"
        disabled={saving}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-sky px-5 text-base font-semibold text-white disabled:opacity-50 desk:w-auto desk:rounded-xl"
      >
        {saving && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
        {saving ? '보내는 중' : '등록하기'}
      </button>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-(--block-pad)">
      <h2 className="text-sm font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      {children}
      {hint && <span className="text-xs text-muted/80">{hint}</span>}
    </label>
  );
}

function Result({ status, onResend }: { status: Status; onResend: () => void }) {
  if (status.kind === 'idle' || status.kind === 'saving') return null;
  if (status.kind === 'saved') {
    const r = status.receipt;
    /* 머리 글 · 색은 registerResultOf 가 정한다(셀프테스트가 같은 함수를 본다) */
    const view = registerResultOf(r);
    const sourceId = r.placements[0]?.sourceId;
    return (
      <div role="status" className="rounded-2xl border border-line bg-surface p-(--block-pad) text-sm text-ink">
        <p className="flex items-start gap-2 font-semibold">
          {view.tone === 'warn' ? (
            <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          ) : (
            <CircleCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-sky" />
          )}
          {view.headline}
        </p>
        {view.note && <p className={`mt-1 text-xs ${view.tone === 'warn' ? 'text-warn' : 'text-muted'}`}>{view.note}</p>}
        {status.local && <p className="mt-1 text-xs text-warn">내 컴퓨터 시험 폴더에 저장했어요.</p>}
        {sourceId && (
          <Link href={`/admin/review-evidence/${sourceId}`} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-sky hover:underline desk:min-h-0">
            저장한 출처 보기
          </Link>
        )}
      </div>
    );
  }
  if (status.kind === 'invalid') {
    return (
      <div role="alert" className="rounded-2xl border border-danger-line bg-danger-bg p-(--block-pad) text-sm text-danger">
        <p className="font-semibold">넣은 값을 확인해 주세요.</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {status.issues.map((i, n) => (
            <li key={n}>
              {FIELD_LABEL[i.field] ?? (i.field || '본문')}: {i.message}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (status.kind === 'error') {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-2xl border border-danger-line bg-danger-bg p-(--block-pad) text-sm text-danger">
        <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        {status.message}
      </p>
    );
  }
  return (
    <div role="alert" className="rounded-2xl border border-warn-line bg-warn-bg p-(--block-pad) text-sm text-ink">
      <p className="flex items-start gap-2">
        <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
        {status.message}
      </p>
      <button type="button" onClick={onResend} className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-sky hover:bg-sky/10">
        <RotateCw aria-hidden className="h-4 w-4" />
        다시 보내기
      </button>
    </div>
  );
}
