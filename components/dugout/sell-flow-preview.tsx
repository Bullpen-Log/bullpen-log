'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { chipClass } from '@/components/dugout/ui';
import { buyerQuote, sellerNet } from '@/lib/market/detail';
import { CATEGORIES, CONDITIONS, categoryOf, formatPrice, parsePrice } from '@/lib/market/specs';

/**
 * 판매 등록 새 흐름 미리보기(2026-10-25 Phase 1, docs/designs/dugout-market-commerce-plan.md 7절) — 네 단계: 사진 → 장비 · 상태 → 가격 · 배송 → 미리보기.
 * **저장하지 않는다.** 서버 · 저장소에 아무것도 안 보낸다(DB 변경은 Phase 2). 사진은 고른 파일을 이 탭 안에서만 보여 주고, 답은 이 부품의 상태뿐이다.
 * 화면 맨 위 띠가 '미리보기 · 저장되지 않아요'를 늘 말한다. 실제 올리기는 지금처럼 /market/new 의 폼.
 * 정해지지 않은 것은 정하지 않는다: 하자 없음을 미리 고르지 않고, 적정가 추천 없음(실거래 표본이 없다), 판매자 수수료는 '아직 정해지지 않음'.
 */
type Step = 0 | 1 | 2 | 3;
const STEPS = ['사진', '장비 · 상태', '가격 · 배송', '미리보기'] as const;

/** 품목별 권하는 사진 — 흠집이 보이게 */
const SHOT_HINTS: Record<string, string[]> = {
  glove: ['손바닥(포켓)', '손등', '라벨 · 사이즈 표기', '많이 쓴 자리 확대'],
  bat: ['배럴 전체', '엔드캡', '그립', '각인 · 인증 표시'],
  spikes: ['옆면', '밑창 · 징', '안쪽 라벨', '닳은 자리'],
  protector: ['앞면', '안쪽', '끈 · 버클', '사이즈 표기'],
  uniform: ['앞', '뒤', '라벨', '얼룩 · 해진 자리'],
  ball: ['전체', '실밥 · 표면'],
  bag: ['전체', '안쪽', '지퍼 · 끈'],
  training: ['전체', '닳은 자리'],
  other: ['전체', '자세히'],
};

const DEFECTS = ['흠집 · 긁힘', '변색 · 얼룩', '끈 늘어남 · 해짐', '수리 · 교체 이력', '찢어짐 · 갈라짐', '냄새'] as const;
const DISPATCH = ['결제 다음 날', '2일 안', '3일 안', '주말 지나서'] as const;

type Draft = {
  photos: { url: string; name: string }[];
  category: string;
  brand: string;
  specs: Record<string, string>;
  condition: string;
  defects: string[];
  defectNote: string;
  history: 'know' | 'unknown';
  price: string;
  shipping: 'included' | 'buyer' | 'meet';
  shippingFee: string;
  dispatch: string;
};

const INITIAL: Draft = {
  photos: [],
  category: 'glove',
  brand: '',
  specs: {},
  condition: '',
  defects: [],
  defectNote: '',
  history: 'unknown',
  price: '',
  shipping: 'buyer',
  shippingFee: '4000',
  dispatch: '',
};

export function SellFlowPreview() {
  const [step, setStep] = useState<Step>(0);
  const [d, setD] = useState<Draft>(INITIAL);
  const cat = categoryOf(d.category);
  const price = parsePrice(d.price) ?? 0;
  const quote = buyerQuote(price);
  const net = sellerNet(price);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  /* 입력한 사실만으로 설명 초안을 짠다 — 판매자가 고친다 */
  const draftBody = useMemo(() => {
    const parts: string[] = [];
    const label = cat?.label ?? '';
    const specText = cat?.fields
      .map((f) => {
        const v = d.specs[f.key];
        if (!v) return null;
        if (f.type === 'select') return f.options.find((o) => o.value === v)?.label ?? null;
        return `${v}${f.unit}`;
      })
      .filter(Boolean)
      .join(' · ');
    parts.push([d.brand, label, specText].filter(Boolean).join(' '));
    if (d.condition) parts.push(CONDITIONS.find((c) => c.key === d.condition)?.label ?? '');
    if (d.defects.length) parts.push(`알려진 하자: ${d.defects.join(', ')}${d.defectNote ? ` (${d.defectNote})` : ''}`);
    else parts.push('하자는 사진으로 확인해 주세요.');
    parts.push(
      d.shipping === 'meet' ? '직거래해요.' : d.shipping === 'included' ? '배송비 포함이에요.' : `배송비 ${formatPrice(parsePrice(d.shippingFee) ?? 0)} 별도예요.`
    );
    if (d.dispatch) parts.push(`${d.dispatch} 발송해요.`);
    return parts.filter(Boolean).join('\n');
  }, [d, cat]);

  const canNext =
    step === 0 ? d.photos.length > 0 : step === 1 ? !!d.condition && !!cat : step === 2 ? parsePrice(d.price) != null && !!d.dispatch : true;

  return (
    <div className="space-y-6">
      {/* 미리보기 띠 — 늘 보인다 */}
      <p role="status" className="rounded-xl border border-warn-line bg-warn-bg px-4 py-3 text-sm text-warn">
        <strong>미리보기 · 저장되지 않아요.</strong> 새 등록 흐름의 모양만 보는 화면이에요. 사진 · 답은 서버로 가지 않아요. 실제로 올리려면{' '}
        <Link href="/market/new" className="font-semibold underline">
          물건 올리기
        </Link>
        로.
      </p>

      {/* 단계 */}
      <ol className="flex gap-2 text-xs" aria-label="단계">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 flex-col gap-1">
            <span className={`h-1 rounded-full ${i <= step ? 'bg-sky' : 'bg-line'}`} />
            <span className={i === step ? 'font-semibold text-ink' : 'text-muted'}>
              {i + 1}. {s}
            </span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-ink">사진을 골라 주세요</h2>
          <p className="text-sm text-muted">첫 장이 대표예요. 흠집 · 많이 쓴 자리를 꼭 찍어 주세요. 8장까지(제안값).</p>
          <ul className="flex flex-wrap gap-1.5">
            {(SHOT_HINTS[d.category] ?? SHOT_HINTS.other).map((h) => (
              <li key={h} className={chipClass(false)}>
                {h}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {d.photos.map((p, i) => (
              <div key={p.url} className="relative h-24 w-24 overflow-hidden rounded-xl bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- 이 탭 안 임시 주소 */}
                <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
                {i === 0 && <span className="absolute bottom-1 left-1 rounded-md bg-ink/70 px-1.5 text-[10px] font-bold text-white">대표</span>}
                <div className="absolute top-1 right-1 flex gap-1">
                  {i > 0 && (
                    <button
                      type="button"
                      aria-label="대표로"
                      onClick={() => set('photos', [p, ...d.photos.filter((x) => x !== p)])}
                      className="grid h-6 min-w-6 place-items-center rounded-full bg-ink/70 px-1 text-[10px] text-white"
                    >
                      대표
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="사진 빼기"
                    onClick={() => set('photos', d.photos.filter((x) => x !== p))}
                    className="grid h-6 w-6 place-items-center rounded-full bg-ink/70 text-white"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
            {d.photos.length < 8 && (
              <label className="grid h-24 w-24 cursor-pointer place-items-center rounded-xl border border-dashed border-line-strong text-xs text-muted hover:border-sky hover:text-sky">
                + 사진
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []).slice(0, 8 - d.photos.length);
                    set('photos', [...d.photos, ...files.map((f) => ({ url: URL.createObjectURL(f), name: f.name }))]);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
          <p className="text-xs text-muted">실제 흐름에서는 고르는 즉시 한 장씩 올라가고, 실패한 장만 다시 시도해요(Phase 2).</p>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-5">
          <h2 className="text-lg font-bold text-ink">무엇이고 어떤 상태인가요</h2>
          <Group label="품목">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button key={c.key} type="button" onClick={() => setD((x) => ({ ...x, category: c.key, specs: {} }))} className={chipClass(d.category === c.key, 'md')}>
                  {c.label}
                </button>
              ))}
            </div>
          </Group>
          <Group label="브랜드 · 모델 (선택)">
            <input value={d.brand} onChange={(e) => set('brand', e.target.value)} placeholder="예: 윌슨 A2000" className={inputCls} />
          </Group>
          {cat && cat.fields.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-3">
              {cat.fields.map((f) => (
                <Group key={f.key} label={`${f.label}${f.required ? '' : ' (선택)'}`}>
                  {f.type === 'select' ? (
                    <select value={d.specs[f.key] ?? ''} onChange={(e) => set('specs', { ...d.specs, [f.key]: e.target.value })} className={inputCls}>
                      <option value="">{f.required ? '골라 주세요' : '모르겠어요'}</option>
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      inputMode="decimal"
                      min={f.min}
                      max={f.max}
                      step={f.step ?? 1}
                      value={d.specs[f.key] ?? ''}
                      onChange={(e) => set('specs', { ...d.specs, [f.key]: e.target.value })}
                      placeholder={`${f.min}~${f.max} ${f.unit}`}
                      className={inputCls}
                    />
                  )}
                </Group>
              ))}
            </div>
          )}
          <Group label="상태">
            <div className="flex flex-wrap gap-2">
              {CONDITIONS.map((c) => (
                <button key={c.key} type="button" onClick={() => set('condition', c.key)} className={chipClass(d.condition === c.key, 'md')}>
                  {c.label}
                </button>
              ))}
            </div>
          </Group>
          <Group label="알려진 하자 (해당하는 것 모두)">
            <div className="flex flex-wrap gap-2">
              {DEFECTS.map((x) => {
                const on = d.defects.includes(x);
                return (
                  <button key={x} type="button" aria-pressed={on} onClick={() => set('defects', on ? d.defects.filter((y) => y !== x) : [...d.defects, x])} className={chipClass(on)}>
                    {x}
                  </button>
                );
              })}
            </div>
            <input value={d.defectNote} onChange={(e) => set('defectNote', e.target.value)} placeholder="어디가 어떻게 (예: 포켓 안쪽 가죽 벗겨짐)" className={`${inputCls} mt-2`} />
            <p className="mt-1 text-xs text-muted">‘하자 없음’은 미리 골라 두지 않아요. 안 고르면 ‘사진으로 확인해 주세요’로 나가요.</p>
          </Group>
          <Group label="구매 · 사용 이력">
            <div className="flex gap-2">
              <button type="button" onClick={() => set('history', 'know')} className={chipClass(d.history === 'know')}>
                알아요 (설명에 적을게요)
              </button>
              <button type="button" onClick={() => set('history', 'unknown')} className={chipClass(d.history === 'unknown')}>
                모르겠어요
              </button>
            </div>
          </Group>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-5">
          <h2 className="text-lg font-bold text-ink">가격과 배송</h2>
          <Group label="판매 가격" hint="실거래 표본이 아직 없어 적정가 추천은 안 해요.">
            <input value={d.price} onChange={(e) => set('price', e.target.value)} inputMode="numeric" placeholder="80,000" className={inputCls} />
          </Group>
          <Group label="배송비">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['buyer', '구매자 부담'],
                  ['included', '배송비 포함'],
                  ['meet', '직거래만'],
                ] as const
              ).map(([k, l]) => (
                <button key={k} type="button" onClick={() => set('shipping', k)} className={chipClass(d.shipping === k, 'md')}>
                  {l}
                </button>
              ))}
            </div>
            {d.shipping === 'buyer' && (
              <input value={d.shippingFee} onChange={(e) => set('shippingFee', e.target.value)} inputMode="numeric" placeholder="4,000" className={`${inputCls} mt-2 max-w-40`} />
            )}
          </Group>
          <Group label="발송 약속">
            <div className="flex flex-wrap gap-2">
              {DISPATCH.map((x) => (
                <button key={x} type="button" onClick={() => set('dispatch', x)} className={chipClass(d.dispatch === x, 'md')}>
                  {x}
                </button>
              ))}
            </div>
          </Group>
          <dl className="divide-y divide-line border-y border-line text-sm">
            <Row label="구매자가 내는 금액" value={price > 0 ? `${formatPrice(quote.total + (d.shipping === 'buyer' ? (parsePrice(d.shippingFee) ?? 0) : 0))}` : '—'} sub={price > 0 ? `물건값 + ${quote.feeLabel}${d.shipping === 'buyer' ? ' + 배송비' : ''}` : undefined} />
            <Row label="판매자가 받는 금액" value={price > 0 ? formatPrice(net.net) : '—'} sub={net.note} />
          </dl>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-5">
          <h2 className="text-lg font-bold text-ink">구매자에게 이렇게 보여요</h2>
          <div className="grid gap-6 md:grid-cols-[3fr_2fr]">
            <div className="space-y-3">
              {d.photos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element -- 이 탭 안 임시 주소
                <img src={d.photos[0].url} alt="대표 사진" className="aspect-[4/3] w-full rounded-2xl bg-surface-2 object-contain" />
              ) : (
                <div className="grid aspect-[4/3] place-items-center rounded-2xl bg-surface-2 text-sm text-muted">사진 없음</div>
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{draftBody}</p>
              <p className="text-xs text-muted">위 설명은 입력한 사실로 짠 초안이에요. 실제 흐름에서는 올리기 전에 고칠 수 있어요.</p>
            </div>
            <div className="space-y-3">
              <p className="text-lg font-bold text-ink">{[d.brand, cat?.label].filter(Boolean).join(' ') || '제목'}</p>
              <p className="text-[26px] font-black text-ink">{formatPrice(price)}</p>
              <dl className="divide-y divide-line border-y border-line text-sm">
                {price > 0 && <Row label={quote.feeLabel} value={`+${formatPrice(quote.fee)}`} />}
                <Row label="배송비" value={d.shipping === 'meet' ? '직거래' : d.shipping === 'included' ? '포함' : formatPrice(parsePrice(d.shippingFee) ?? 0)} />
                <Row label="발송" value={d.dispatch || '—'} />
                <Row label="본인 확인" value="아직 안 됨" muted />
                <Row label="정산 계좌 확인" value="아직 안 됨" muted />
              </dl>
              <Button type="button" disabled className="w-full" size="lg">
                올리기 · 본인 확인 뒤 (Phase 2)
              </Button>
              <p className="text-xs text-muted">실제 흐름에서는 여기서 본인 확인 · 정산 계좌 확인을 거친 뒤에 공개돼요. 미리보기라 올라가지 않아요.</p>
            </div>
          </div>
        </section>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1) as Step)}>
          이전
        </Button>
        {step < 3 ? (
          <Button type="button" disabled={!canNext} onClick={() => setStep((s) => Math.min(3, s + 1) as Step)}>
            다음
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={() => { setD(INITIAL); setStep(0); }}>
            처음부터
          </Button>
        )}
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-xl border border-transparent bg-ink/5 px-4 py-3 text-sm text-ink focus:border-sky focus:bg-surface focus:outline-none desk:border-line desk:bg-surface-2';

function Group({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted">{label}</p>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Row({ label, value, sub, muted = false }: { label: string; value: string; sub?: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-right">
        <span className={`font-semibold ${muted ? 'text-muted' : 'text-ink'}`}>{value}</span>
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </dd>
    </div>
  );
}
