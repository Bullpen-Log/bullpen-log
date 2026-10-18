import type { ReactNode } from 'react';
import {
  ArrowLeftRight,
  Camera,
  ChevronDown,
  Film,
  ListOrdered,
  Smartphone,
  TriangleAlert,
  Upload,
} from '@/components/icon';
import { BackLink, ButtonLink, Card, PageHeading } from '@/components/ui';
import { V2_FAIL_TEXT, type V2FailCode } from '@/lib/pitch-3d/v2/contract';
import {
  LAB_FAIL_FIX,
  LAB_GUIDE_LENS_NOTE,
  LAB_GUIDE_MOVE_NOTE,
  LAB_GUIDE_POINTS,
  LAB_GUIDE_SECTION_NAME as SECTION_NAME,
  LAB_LENS_DISTANCES,
  labGuideUploadPoints,
  type LabGuideSection,
} from '@/lib/pitch-lab-guide';
import { forHand, type LabHand } from '@/lib/pitch-lab-meta';
import { LAB_MAX_VIDEO_MB } from '@/lib/pitch-lab-meta';
import { FramingArt, PlacementArt } from './guide-art';
import { GuideChecklist } from './guide-checklist';
import { GuideJump } from './guide-jump';

/** 촬영 안내 본문(page.tsx 가 로그인을 확인하고 그린다) — 글 · 근거는 lib/pitch-lab-guide.ts */
/** hand — 가입 때 고른 던지는 손. 옆 폰 자리가 우투는 3루, 좌투는 1루(글은 우투 기준으로 적고 forHand 로 바꾼다) */
export function LabGuideView({ hand }: { hand: LabHand }) {
  return (
    <div className="stack-page">
      <div className="space-y-2">
        <BackLink href="/videos/lab">3D 동작 분석</BackLink>
        <PageHeading
          kicker="3D 동작 분석"
          title="촬영 안내"
          description="이대로 찍으면 3D 가 가장 정확해요."
        />
      </div>

      <Section id="checklist" icon={<Camera />} title="찍기 전 확인">
        <GuideChecklist hand={hand} />
      </Section>

      <Section id="place" icon={<Smartphone />} title="폰 두 대 놓는 자리">
        <PlacementArt hand={hand} />
        <Points items={LAB_GUIDE_POINTS.place.map((t) => forHand(t, hand))} />
        <Fold title="렌즈별 참고 거리">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-medium">1배 렌즈</th>
                <th className="py-1 font-medium">옆(가로)</th>
                <th className="py-1 font-medium">뒤(세로)</th>
              </tr>
            </thead>
            <tbody>
              {LAB_LENS_DISTANCES.map((r) => (
                <tr key={r.lens} className="border-t border-line align-top">
                  <td className="py-1.5 pr-2 break-keep">
                    <span className="text-numeric font-semibold text-ink">{r.lens}</span>
                    <span className="block text-xs text-muted">{r.phones}</span>
                  </td>
                  <td className="text-numeric py-1.5 text-ink">{r.side}</td>
                  <td className="text-numeric py-1.5 text-ink">{r.back}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs leading-relaxed break-keep text-muted">
            {LAB_GUIDE_LENS_NOTE}
          </p>
        </Fold>
      </Section>

      <Section id="frame" icon={<Film />} title="화면에 담기">
        <FramingArt />
        <Points items={LAB_GUIDE_POINTS.frame} />
      </Section>

      <Section id="phone" icon={<Smartphone />} title="폰 설정">
        <Points items={LAB_GUIDE_POINTS.phone} />
      </Section>

      <Section id="steps" icon={<ListOrdered />} title="찍는 순서">
        <ol className="space-y-2.5">
          {LAB_GUIDE_POINTS.steps.map((text, i) => (
            <li key={text} className="flex gap-3">
              <span className="text-numeric grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sky text-xs font-bold text-white">
                {i + 1}
              </span>
              <span className="pt-0.5 text-sm leading-relaxed break-keep text-ink">
                {text}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="move" icon={<ArrowLeftRight />} title="영상 옮기기">
        <Points items={LAB_GUIDE_POINTS.move} />
        <p className="rounded-xl bg-sky-tint px-3 py-2.5 text-sm leading-relaxed break-keep text-ink">
          {LAB_GUIDE_MOVE_NOTE}
        </p>
      </Section>

      <Section id="upload" icon={<Upload />} title="올리기">
        <Points items={labGuideUploadPoints(LAB_MAX_VIDEO_MB)} />
      </Section>

      <Section id="fail" icon={<TriangleAlert />} title="분석이 안 됐다면">
        <Fold title="까닭별로 고칠 것">
          <ul className="space-y-3">
            {(Object.keys(LAB_FAIL_FIX) as V2FailCode[]).map((code) => {
              const fix = LAB_FAIL_FIX[code];
              if (!fix) return null;
              return (
                <li key={code} className="space-y-0.5">
                  <p className="text-sm font-semibold break-keep text-ink">
                    {V2_FAIL_TEXT[code]}
                  </p>
                  <p className="text-xs leading-relaxed break-keep text-muted">
                    {forHand(fix.fix, hand)}{' '}
                    <GuideJump section={fix.section}>{SECTION_NAME[fix.section]} ›</GuideJump>
                  </p>
                </li>
              );
            })}
          </ul>
        </Fold>
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
  title,
  children,
}: {
  id: LabGuideSection;
  icon: ReactNode;
  title: string;
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
          {title}
        </h2>
        {children}
      </Card>
    </section>
  );
}

/** 접어 둔 자세한 것 — 처음엔 제목 한 줄만 */
function Fold({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl bg-surface-2 px-3 py-1">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown aria-hidden className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 pb-2">{children}</div>
    </details>
  );
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
