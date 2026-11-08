import type { ReactNode } from 'react';
import { ArrowLeftRight, Camera, ClipboardCheck, Film, Smartphone, TriangleAlert } from '@/components/icon';
import { BackLink, ButtonLink, Card, PageHeading } from '@/components/ui';
import { V2_FAIL_TEXT, type V2FailCode } from '@/lib/pitch-3d/v2/contract';
import {
  LAB_FAIL_FIX,
  LAB_GUIDE_CAMERA,
  LAB_GUIDE_CAMERA_NOTE,
  LAB_GUIDE_FRAME,
  LAB_GUIDE_MOVE,
  LAB_GUIDE_MOVE_NOTES,
  LAB_GUIDE_SECTION_NAME as SECTION_NAME,
  LAB_GUIDE_SHOOT,
  type LabGuideSection,
} from '@/lib/pitch-lab-guide';
import { forHand, type LabHand } from '@/lib/pitch-lab-meta';
import { FramingArt, PlacementArt } from './guide-art';
import { GuideChecklist } from './guide-checklist';
import { GuideJump } from './guide-jump';
import { GuideShots } from './guide-shots';

/**
 * 촬영 안내 본문(page.tsx 가 로그인을 확인하고 그린다) — 글 · 근거는 lib/pitch-lab-guide.ts.
 * 2026-11-08 김민: "중복 많고 복잡하다" → 카메라 설정 · 촬영 구도 · 영상 조건 · 영상 옮기기 + 찍기 전 확인 + 실패(앱은 카드로 넘긴다).
 * hand — 가입 때 고른 던지는 손. 옆 폰 자리가 우투는 3루, 좌투는 1루(글은 우투 기준으로 적고 forHand 로 바꾼다)
 */
export function LabGuideView({ hand }: { hand: LabHand }) {
  return (
    <div className="stack-page">
      <div className="space-y-2">
        <BackLink href="/videos/lab">3D 동작 분석</BackLink>
        <PageHeading kicker="3D 동작 분석" title="촬영 안내" description="이대로 찍으면 3D 가 가장 정확해요." />
      </div>

      <Section id="camera" icon={<Smartphone />}>
        <GuideShots shots={LAB_GUIDE_CAMERA} hand={hand} />
        <Note text={LAB_GUIDE_CAMERA_NOTE} />
      </Section>

      <Section id="frame" icon={<Camera />}>
        <PlacementArt hand={hand} />
        <FramingArt />
        <Points items={LAB_GUIDE_FRAME.map((t) => forHand(t, hand))} />
      </Section>

      <Section id="shoot" icon={<Film />}>
        <Points items={LAB_GUIDE_SHOOT} />
      </Section>

      <Section id="move" icon={<ArrowLeftRight />}>
        <GuideShots shots={LAB_GUIDE_MOVE} hand={hand} />
        {LAB_GUIDE_MOVE_NOTES.map((t) => (
          <Note key={t} text={t} />
        ))}
      </Section>

      <Section id="checklist" icon={<ClipboardCheck />}>
        <GuideChecklist hand={hand} />
      </Section>

      <Section id="fail" icon={<TriangleAlert />}>
        <ul className="space-y-3">
          {(Object.keys(LAB_FAIL_FIX) as V2FailCode[]).map((code) => {
            const fix = LAB_FAIL_FIX[code];
            if (!fix) return null;
            return (
              <li key={code} className="space-y-0.5">
                <p className="text-sm font-semibold break-keep text-ink">{V2_FAIL_TEXT[code]}</p>
                <p className="text-xs leading-relaxed break-keep text-muted">
                  {forHand(fix.fix, hand)} <GuideJump section={fix.section}>{SECTION_NAME[fix.section]} ›</GuideJump>
                </p>
              </li>
            );
          })}
        </ul>
      </Section>

      <ButtonLink href="/videos/lab" className="w-full">
        영상 올리러 가기
      </ButtonLink>
    </div>
  );
}

/* 주소 # 로 왔을 때 위 막대에 가리지 않게 — 휴대폰은 시계 자리 + 막대 */
function Section({
  id,
  icon,
  children,
}: {
  id: LabGuideSection;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-[calc(env(safe-area-inset-top)+5rem)]"
    >
      <Card className="space-y-4">
        <h2
          id={`${id}-title`}
          className="flex items-center gap-2 text-base font-semibold text-ink"
        >
          <span aria-hidden className="text-sky [&_svg]:h-5 [&_svg]:w-5">
            {icon}
          </span>
          {SECTION_NAME[id]}
        </h2>
        {children}
      </Card>
    </section>
  );
}

function Note({ text }: { text: string }) {
  return <p className="rounded-xl bg-sky-tint px-3 py-2.5 text-sm leading-relaxed break-keep text-ink">{text}</p>;
}

function Points({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((text) => (
        <li
          key={text}
          className="flex gap-2.5 text-sm leading-relaxed break-keep text-ink"
        >
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky" />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}
