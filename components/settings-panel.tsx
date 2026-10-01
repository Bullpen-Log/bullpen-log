import Link from 'next/link';
import { ChevronRight, Info, Monitor, Ruler, SlidersHorizontal } from 'lucide-react';
import { CONTACT, MEDICAL_NOTICE } from '@/components/site-footer';
import { ThemeToggle } from '@/components/theme-toggle';
import { UnitToggle } from '@/components/unit-toggle';
import { TrainingSettingsForm } from '@/components/training-forms';

export type SettingsData = {
  trainingLevel: string | null;
  ownedEquipment: string[];
};

/**
 * 설정 — 톱니를 누르면 뜨는 창의 알맹이.
 *
 * 어쩌다 한 번 고치는 것만 둔다. 화면을 밝게 볼지 어둡게 볼지, 그리고 운동을
 * 고를 때 쓰는 기준.
 *
 * 몸에 대한 값(키·생년월일·목표 구속·평소 문진)과 계정은 여기 없다. 그것은
 * '내 정보' 창이 통째로 맡는다 — 성격이 다른 둘을 한 창에 밀어 넣으면 무엇을
 * 고치러 왔는지와 상관없이 매번 전부를 지나야 한다.
 */
export function SettingsPanel({
  data,
  /** 저장하고 나서 돌아올 화면 — 창을 연 그 화면 그대로. */
  returnTo,
}: {
  data: SettingsData;
  returnTo: string;
}) {
  return (
    <div className="space-y-8 desk:space-y-6">
      {/* ── 화면 ────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHead
          icon={<Monitor className="h-4 w-4" />}
          title="화면"
          desc="밝게 볼지 어둡게 볼지 골라요. 이 기기에만 적용돼요."
        />
        <ThemeToggle />
      </section>

      {/* ── 단위 ────────────────────────────────── */}
      <section className={SECTION}>
        <SectionHead
          icon={<Ruler className="h-4 w-4" />}
          title="단위"
          desc="보여주는 방식만 바뀌어요. 저장은 늘 cm · kg 이라 지난 기록도 그대로예요."
        />
        <UnitToggle />
      </section>

      {/* ── 트레이닝 ────────────────────────────── */}
      <section className={`${SECTION} space-y-4`}>
        <SectionHead
          icon={<SlidersHorizontal className="h-4 w-4" />}
          title="트레이닝"
          desc="운동을 고를 때 쓰는 기준이에요. 오늘 쓸 장비는 일정을 만들 때 따로 골라요."
        />
        <TrainingSettingsForm
          trainingLevel={data.trainingLevel}
          ownedEquipment={data.ownedEquipment}
          returnTo={returnTo}
        />
      </section>

      {/*
        ── 정보 ── 휴대폰은 화면마다 붙던 꼬리말을 뺐으므로(components/site-footer.tsx) 약관 · 문의 · 의료 안내가
        여기 있다 — 아이폰 앱의 '설정 › 정보'처럼(2026-10-01 사용자 '애플처럼'). 묶은 줄은 아이폰 설정 목록 모양.
      */}
      <section className={SECTION}>
        <SectionHead
          icon={<Info className="h-4 w-4" />}
          title="정보"
          desc="약관과 문의는 여기에 있어요."
        />
        <div className="divide-y divide-line overflow-hidden rounded-xl bg-surface-2">
          {[
            { href: '/terms', label: '이용약관' },
            { href: '/privacy', label: '개인정보 처리방침' },
            { href: `mailto:${CONTACT}`, label: '문의하기' },
          ].map((row) => (
            <Link
              key={row.href}
              href={row.href}
              className="flex min-h-11 items-center justify-between gap-3 px-4 text-sm text-ink transition-colors active:bg-ink/6"
            >
              {row.label}
              <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted/70" />
            </Link>
          ))}
        </div>
        <p className="break-keep text-xs leading-relaxed text-muted">
          {MEDICAL_NOTICE}
        </p>
      </section>
    </div>
  );
}

/**
 * 칸 하나 — 휴대폰은 선 없이 넉넉한 틈으로 가른다(아이폰 설정처럼), PC 는 예전 위 선.
 * 첫 칸(화면)은 위 선이 없다.
 */
const SECTION = 'space-y-3 desk:border-t desk:border-line desk:pt-6';

/**
 * 칸마다 붙는 제목 한 줄 — 아이콘 · 이름 · 설명. 휴대폰의 아이콘은 아이폰 설정처럼 칠한 둥근 네모(색은 하나),
 * PC 는 예전 테두리 네모.
 */
function SectionHead({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-sky text-white desk:rounded-lg desk:border desk:border-line-strong desk:bg-transparent desk:text-muted">
        {icon}
      </span>
      <div className="min-w-0">
        <h3 className="text-base font-bold text-ink desk:text-sm">{title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed break-keep text-muted">{desc}</p>
      </div>
    </div>
  );
}
