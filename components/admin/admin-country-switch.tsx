'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setMyCountry } from '@/app/actions/app';
import { Segmented } from '@/components/segmented';
import { toast } from '@/components/toast';
import { orOffline } from '@/lib/action-offline';
import { COUNTRIES, COUNTRY_LABEL, type Country } from '@/lib/country';

/**
 * 나라 바꾸기(시험용 — 대표관리자 내 계정만, 2026-10-31 금윤호: PC 웹에서도). 앱 관리자 화면(native/src/app/admin CountryRow)과 같은 서버 동작
 * app.setMyCountry. 바꾸면 화면 틀을 다시 받아 탭 · 메뉴가 그 나라 것이 된다 — 미국 · 일본은 투수 전용이라 타격 · 영양이 빠진다.
 * 앱스토어 나라 따르기는 앱에만 있다(웹은 앱스토어를 모른다).
 */
export function AdminCountrySwitch({ initial }: { initial: Country }) {
  const router = useRouter();
  const [country, setCountry] = useState<Country>(initial);
  const [pending, start] = useTransition();

  const pick = (to: Country) => {
    if (to === country || pending) return;
    const prev = country;
    setCountry(to);
    start(async () => {
      const r = await orOffline(setMyCountry(to), { ok: false as const, error: '인터넷 연결을 확인한 뒤 다시 해 주세요.' });
      if (!r.ok) {
        setCountry(prev);
        toast(`바꾸지 못했어요. ${r.error}`, 'error');
        return;
      }
      toast(`${COUNTRY_LABEL[to]} 싱커로 바꿨어요`);
      router.refresh();
    });
  };

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-(--block-pad)">
      <div>
        <h2 className="text-sm font-bold text-ink">나라 바꾸기 (시험용)</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          내 계정만 바뀌어요. 미국 · 일본은 투수 전용이라 타격 · 영양이 빠져요. 일반 사용자는 앱스토어 계정 나라를 따라요.
        </p>
      </div>
      <Segmented<Country>
        label="나라"
        value={country}
        onChange={pick}
        options={COUNTRIES.map((k) => ({ value: k, label: `${COUNTRY_LABEL[k]} 싱커` }))}
        className="max-w-md"
      />
    </section>
  );
}
