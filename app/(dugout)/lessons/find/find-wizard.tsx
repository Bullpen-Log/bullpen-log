'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RoundBack } from '@/components/round-icon';
import { Button } from '@/components/ui';
import {
  AUDIENCES,
  PREFS,
  SPECIALTIES,
  TIME_BANDS,
  WHEN_OPTIONS,
  listHref,
  type AudienceKey,
  type PrefKey,
  type SpecialtyKey,
  type TimeBandKey,
  type WhenKey,
} from '@/lib/market/lessons';
import { REGIONS } from '@/lib/market/specs';

/**
 * 맞춤 코치 찾기 흐름 — 한 화면에 한 질문(토스식), 다섯 질문: 무엇을 → 누가 받나 → 언제 → 어디서 → 선호 조건.
 * 어느 질문이든 건너뛸 수 있고, 끝나면 답이 목록 주소가 된다(거르기는 전문 · 지역, 나머지는 추천 점수 · 까닭).
 * PC(lg, 2026-10-24): 왼쪽에 다섯 단계와 지금까지의 답(누르면 그 질문으로), 오른쪽 가운데 카드에 질문 하나.
 */
const STEPS = ['what', 'who', 'when', 'where', 'prefs'] as const;
type Step = (typeof STEPS)[number];
const SHORT: Record<Step, string> = { what: '무엇을', who: '누가', when: '언제', where: '어디서', prefs: '선호' };
const TITLES: Record<Step, { q: string; hint: string }> = {
  what: { q: '무엇을 배우고 싶어요?', hint: '한 가지를 고르면 그 전문 코치부터 보여요' },
  who: { q: '누가 레슨을 받나요?', hint: '코치가 요청을 볼 때 참고해요' },
  when: { q: '언제가 좋아요?', hint: '그 때 레슨 시간이 열린 코치를 앞에 둬요' },
  where: { q: '어디서 받고 싶어요?', hint: '지역을 고르면 그 지역 코치만 보여요' },
  prefs: { q: '어떤 코치를 선호해요?', hint: '여러 개 골라도 돼요. 추천 차례에 반영해요' },
};

export function FindWizard() {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [specialty, setSpecialty] = useState<SpecialtyKey | null>(null);
  const [audience, setAudience] = useState<AudienceKey | null>(null);
  const [when, setWhen] = useState<WhenKey | null>(null);
  const [band, setBand] = useState<TimeBandKey | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<PrefKey[]>([]);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const finish = () =>
    router.push(
      listHref({
        specialty: specialty ?? undefined,
        audience: audience ?? undefined,
        when: when && when !== 'any' ? when : undefined,
        band: band ?? undefined,
        region: region ?? undefined,
        prefs: prefs.length ? prefs.join(',') : undefined,
        from: 'find',
      })
    );
  const next = () => (last ? finish() : setI(i + 1));
  const back = () => (i === 0 ? router.push('/lessons') : setI(i - 1));

  /* PC 왼쪽 단계 판의 답 한 줄 */
  const answers: Record<Step, string | null> = {
    what: SPECIALTIES.find((x) => x.key === specialty)?.label ?? null,
    who: AUDIENCES.find((x) => x.key === audience)?.label ?? null,
    when:
      [WHEN_OPTIONS.find((x) => x.key === when)?.label, TIME_BANDS.find((x) => x.key === band)?.label]
        .filter(Boolean)
        .join(' · ') || null,
    where: region,
    prefs: prefs.length ? prefs.map((k) => PREFS.find((p) => p.key === k)?.label).join(' · ') : null,
  };

  const chip = (on: boolean) =>
    `flex min-h-12 items-center justify-between gap-2 rounded-2xl border px-4 text-left text-sm font-semibold transition-colors ${
      on ? 'border-sky bg-sky/10 text-sky-strong' : 'border-line bg-surface text-ink hover:border-sky-soft'
    }`;

  return (
    <div className="mx-auto max-w-2xl lg:grid lg:max-w-5xl lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-10">
      {/* PC 단계 판 */}
      <nav aria-label="찾기 단계" className="hidden lg:sticky lg:top-28 lg:block">
        <p className="mb-1 text-xs text-muted">나에게 맞는 코치 찾기</p>
        <p className="mb-5 text-xl font-black tracking-tight text-ink">다섯 질문이면 돼요</p>
        <ol className="space-y-1">
          {STEPS.map((s, k) => {
            const now = k === i;
            const done = k < i;
            return (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => setI(k)}
                  aria-current={now ? 'step' : undefined}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${now ? 'bg-sky/10' : 'hover:bg-ink/4'}`}
                >
                  <span
                    className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-colors ${
                      now ? 'bg-sky text-white' : done ? 'bg-ink text-page' : 'bg-ink/8 text-muted'
                    }`}
                  >
                    {done ? '✓' : k + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm font-semibold ${now ? 'text-sky-strong' : 'text-ink'}`}>{SHORT[s]}</span>
                    <span className="block truncate text-xs text-muted">{answers[s] ?? (done ? '건너뜀' : '아직')}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="space-y-6 lg:rounded-3xl lg:border lg:border-line lg:bg-surface lg:p-8 lg:shadow-[0_10px_30px_-18px_rgba(0,0,0,0.2)]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={back}
          aria-label="이전"
          className="grid h-10 w-10 place-items-center rounded-full text-ink hover:bg-ink/6"
        >
          <RoundBack className="h-5 w-5" />
        </button>
        <div className="flex flex-1 gap-1" aria-label={`${i + 1} / ${STEPS.length}`}>
          {STEPS.map((s, k) => (
            <span key={s} className={`h-1 flex-1 rounded-full ${k <= i ? 'bg-sky' : 'bg-line'}`} />
          ))}
        </div>
        <span className="text-xs text-muted">
          {i + 1}/{STEPS.length}
        </span>
      </div>

      <div key={step} className="space-y-1 motion-safe:animate-fade-in">
        <h1 className="text-xl font-bold text-ink">{TITLES[step].q}</h1>
        <p className="text-sm text-muted">{TITLES[step].hint}</p>
      </div>

      {step === 'what' && (
        <div className="grid grid-cols-2 gap-2">
          {SPECIALTIES.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={specialty === s.key}
              onClick={() => setSpecialty(specialty === s.key ? null : s.key)}
              className={chip(specialty === s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {step === 'who' && (
        <div className="grid gap-2">
          {AUDIENCES.map((a) => (
            <button
              key={a.key}
              type="button"
              aria-pressed={audience === a.key}
              onClick={() => setAudience(audience === a.key ? null : a.key)}
              className={chip(audience === a.key)}
            >
              <span>{a.label}</span>
              <span className="text-xs font-normal text-muted">{a.hint}</span>
            </button>
          ))}
        </div>
      )}

      {step === 'when' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2">
            {WHEN_OPTIONS.map((w) => (
              <button
                key={w.key}
                type="button"
                aria-pressed={when === w.key}
                onClick={() => setWhen(when === w.key ? null : w.key)}
                className={chip(when === w.key)}
              >
                {w.label}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted">시간대</p>
            <div className="grid grid-cols-3 gap-2">
              {TIME_BANDS.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  aria-pressed={band === b.key}
                  onClick={() => setBand(band === b.key ? null : b.key)}
                  className={chip(band === b.key)}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 'where' && (
        <div className="grid grid-cols-3 gap-2">
          {REGIONS.filter((r) => r !== '전국(택배)').map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={region === r}
              onClick={() => setRegion(region === r ? null : r)}
              className={chip(region === r)}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {step === 'prefs' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {PREFS.map((p) => {
            const on = prefs.includes(p.key);
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={on}
                onClick={() => setPrefs(on ? prefs.filter((k) => k !== p.key) : [...prefs, p.key])}
                className={chip(on)}
              >
                <span>{p.label}</span>
                <span className="text-xs font-normal text-muted">{p.hint}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="button" onClick={next} className="text-sm font-semibold text-muted hover:text-ink">
          {last ? '건너뛰고 전체 보기' : '건너뛰기'}
        </button>
        <Button type="button" size="lg" onClick={next} className="ml-auto min-w-40">
          {last ? '맞는 코치 보기' : '다음'}
        </Button>
      </div>
      </div>
    </div>
  );
}
