import type { ReactNode } from 'react';
import { MEDICAL_NOTICE } from '@/components/site-footer';
import { SettingsInfoRows } from '@/components/settings-info';
import { ThemeToggle } from '@/components/theme-toggle';
import { UnitToggle } from '@/components/unit-toggle';

/**
 * 설정 — 톱니를 누르면 뜨는 창의 알맹이.
 *
 * 어쩌다 한 번 고치는 것만 둔다. 테마 · 단위 · 정보.
 * 웨이트 경력 · 장비는 트레이닝 탭의 '트레이닝 설정'에만 둔다(2026-10-15 김민 — 같은 칸이 두 곳에 있었다).
 *
 * 몸에 대한 값(키·생년월일·목표 구속·평소 문진)과 계정은 여기 없다. 그것은
 * '내 정보' 창이 통째로 맡는다 — 성격이 다른 둘을 한 창에 밀어 넣으면 무엇을
 * 고치러 왔는지와 상관없이 매번 전부를 지나야 한다.
 *
 * 모양(2026-10-22 금윤호: "설명은 없애고 '화면'은 '테마'로, 설정도 우리 UI 에 맞춰") — 덕아웃 레슨 화면처럼
 * 작은 굵은 제목 한 줄 + 흰 카드 하나. 칸 설명 · 색 네모 아이콘은 뺐다.
 */
export function SettingsPanel() {
  return (
    <div className="space-y-6">
      <Section title="테마">
        {/* 고르개 자체가 회색 판이라 카드로 또 두르지 않는다(2026-10-22 금윤호 "두르고 있는 사각형은 없어도 돼") */}
        <ThemeToggle />
      </Section>

      <Section title="단위">
        <div className={CARD}>
          <UnitToggle />
        </div>
      </Section>

      {/*
        정보 — 휴대폰은 화면마다 붙던 꼬리말을 뺐으므로(components/site-footer.tsx) 약관 · 문의 · 의료 안내가 여기 있다.
        약관 · 3D 출처는 넘어가지 않고 창으로 뜬다(components/settings-info.tsx).
      */}
      <Section title="정보">
        <SettingsInfoRows />
        <p className="px-1 break-keep text-xs leading-relaxed text-muted">{MEDICAL_NOTICE}</p>
      </Section>
    </div>
  );
}

/** 흰 카드 — 덕아웃 레슨 화면의 카드와 같은 모양 */
const CARD = 'rounded-2xl border border-line bg-surface p-3';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="px-1 text-sm font-bold text-ink">{title}</h3>
      {children}
    </section>
  );
}
