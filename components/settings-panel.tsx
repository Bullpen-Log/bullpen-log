import { Monitor, Ruler, SlidersHorizontal } from 'lucide-react';
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
    <div className="space-y-6">
      {/* ── 화면 ────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHead
          icon={<Monitor className="h-4 w-4" />}
          title="화면"
          desc="밝게 볼지 어둡게 볼지 고릅니다. 이 기기에만 적용됩니다."
        />
        <ThemeToggle />
      </section>

      {/* ── 단위 ────────────────────────────────── */}
      <section className="space-y-3 border-t border-line pt-6">
        <SectionHead
          icon={<Ruler className="h-4 w-4" />}
          title="단위"
          desc="보여주는 방식만 바뀝니다. 저장은 늘 cm·kg 으로 하므로 지난 기록도 그대로입니다."
        />
        <UnitToggle />
      </section>

      {/* ── 트레이닝 ────────────────────────────── */}
      <section className="space-y-4 border-t border-line pt-6">
        <SectionHead
          icon={<SlidersHorizontal className="h-4 w-4" />}
          title="트레이닝"
          desc="운동을 고를 때 쓰는 기준입니다. 오늘 쓸 장비는 일정을 만들 때 따로 고릅니다."
        />
        <TrainingSettingsForm
          trainingLevel={data.trainingLevel}
          ownedEquipment={data.ownedEquipment}
          returnTo={returnTo}
        />
      </section>

    </div>
  );
}

/** 칸마다 붙는 제목 한 줄 — 아이콘 · 이름 · 설명 */
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
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line-strong text-muted">
        {icon}
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed break-keep text-muted">{desc}</p>
      </div>
    </div>
  );
}
