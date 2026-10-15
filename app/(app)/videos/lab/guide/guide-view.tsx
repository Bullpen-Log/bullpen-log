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
import { LAB_FAIL_FIX, LAB_LENS_DISTANCES, type LabGuideSection } from '@/lib/pitch-lab-guide';
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
        <Points
          items={[
            forHand('옆 폰: 3루 쪽에서 투구 방향과 직각으로 3.5~5m.', hand),
            '뒤 폰: 투수 바로 뒤(2루 쪽) 3~4m 에서 홈을 겨눠요. 좌우로 15° 안 비켜도 괜찮아요.',
            '두 폰 사이는 90°쯤. 뒤 폰을 비켰다면 옆 폰도 같이 옮겨요.',
            '높이는 허리에서 가슴(1~1.3m), 수평으로.',
          ]}
        />
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
            키 1.8m 기준이에요. 거리보다 아래 화면에 담기를 먼저 맞춰요.
          </p>
        </Fold>
      </Section>

      <Section id="frame" icon={<Film />} title="화면에 담기">
        <FramingArt />
        <Points
          items={[
            '옆 폰은 가로, 투수 키가 화면 높이의 절반~2/3.',
            '뒤 폰은 세로, 화면 높이의 1/3~절반.',
            '다리를 들어도, 내딛어도 발끝 · 머리 · 손이 화면 밖으로 나가지 않게.',
            '찍는 동안 투수 앞을 아무도 지나가지 않게.',
          ]}
        />
      </Section>

      <Section id="phone" icon={<Smartphone />} title="폰 설정">
        <Points
          items={[
            '아이폰: 설정 › 카메라 › 슬로 모션 녹화 › 1080p 240fps.',
            '아이폰: 배율 1×. Pro 는 1.2× · 1.5× 로 바뀌어 있지 않은지 봐요.',
            '아이폰: 투수를 길게 눌러 AE/AF 잠금.',
            '갤럭시: 카메라 › 더보기 › 슬로우 모션, 배율 1배.',
          ]}
        />
      </Section>

      <Section id="steps" icon={<ListOrdered />} title="찍는 순서">
        <ol className="space-y-2.5">
          {[
            '던지기 2초 전에 두 폰 모두 녹화를 켜요.',
            '한 공을 던져요.',
            '팔로스루 1초 뒤에 두 폰 모두 멈춰요.',
            '다음 공은 새로 녹화해요.',
          ].map((text, i) => (
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
        <Points
          items={[
            'AirDrop 은 옵션에서 모든 사진 데이터를 켜고 보내요.',
            '같은 Apple ID 의 iCloud 사진이면 옮기지 않아도 돼요.',
            '갤럭시는 퀵 셰어, 기기가 다르면 케이블로 PC 에 옮겨 PC 에서 올려요.',
          ]}
        />
        <p className="rounded-xl bg-sky-tint px-3 py-2.5 text-sm leading-relaxed break-keep text-ink">
          메신저 · 메일 · 화면 녹화 · 자른 영상은 안 돼요. 올릴 때 초당 장수가 30 이나 60 으로 보이면 원본이 바뀐 거예요.
        </p>
      </Section>

      <Section id="upload" icon={<Upload />} title="올리기">
        <Points
          items={[
            '옆 칸에 옆 폰 영상, 뒤 칸에 뒤 폰 영상을 골라요.',
            `영상 하나에 ${LAB_MAX_VIDEO_MB}MB 까지예요(240fps 6초면 20MB 남짓).`,
          ]}
        />
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

const SECTION_NAME: Record<LabGuideSection, string> = {
  checklist: '찍기 전 확인',
  place: '폰 두 대 놓는 자리',
  frame: '화면에 담기',
  phone: '폰 설정',
  steps: '찍는 순서',
  move: '영상 옮기기',
  upload: '올리기',
  fail: '분석이 안 됐다면',
};

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

function Points({ items }: { items: string[] }) {
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
