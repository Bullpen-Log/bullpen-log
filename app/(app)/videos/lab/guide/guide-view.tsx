import type { ReactNode } from 'react';
import {
  ArrowLeftRight,
  Camera,
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
          description="이대로 찍으면 3D 가 가장 정확해요. 찍기 전에 한 번 읽고, 현장에서는 아래 확인 목록을 하나씩 눌러 주세요."
        />
      </div>

      <Section id="checklist" icon={<Camera />} title="찍기 전 확인">
        <GuideChecklist hand={hand} />
      </Section>

      <Section id="place" icon={<Smartphone />} title="폰 두 대 놓는 자리">
        <PlacementArt hand={hand} />
        <Points
          items={[
            forHand(
              '옆 폰은 3루 쪽에서 투구 방향과 직각으로, 투구판과 내딛는 발 사이를 가운데에 두고 3.5~5m 떨어져요.',
              hand
            ),
            '뒤 폰은 투수 바로 뒤(2루 쪽) 3~4m 에서 홈을 똑바로 겨눠요. 분석이 이 폰이 보는 쪽을 홈 방향으로 잡아요. 3m 보다 가까우면 내딛는 동안 투수 크기가 크게 바뀌어 덜 정확해요.',
            '거리는 참고예요. 폰마다 1배 렌즈가 조금 달라서, 아래 화면에 담기 기준에 맞춰 앞뒤로 옮겨요.',
            '두 폰 사이는 투수를 사이에 두고 90°쯤이 가장 좋아요. 60~120° 를 벗어나면 폰의 자리를 찾지 못해요.',
            '두 폰 모두 투수의 허리에서 가슴 높이(1~1.3m)에 두고, 옆으로 기울지 않게 수평을 맞춰요.',
          ]}
        />
        <details className="group rounded-xl bg-surface-2 px-3 py-2.5">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-sm font-semibold text-ink">
            렌즈별 참고 거리
            <span className="text-xs font-normal text-muted group-open:hidden">펼치기</span>
          </summary>
          <table className="mt-2 w-full text-sm">
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
          <p className="mt-2 text-xs leading-relaxed break-keep text-muted">
            키 1.8m 투수 기준이에요. 키가 작으면 조금 가까이, 크면 조금 멀리 서요.
          </p>
        </details>
      </Section>

      <Section id="frame" icon={<Film />} title="화면에 담기">
        <FramingArt />
        <Points
          items={[
            '옆 폰은 가로로 눕혀 찍어요. 투수가 화면 옆으로 내딛어서 세로면 발이나 팔이 잘려요. 투수 키가 화면 높이의 절반~2/3 이 되게 해요.',
            '뒤 폰은 세로로 세워 찍어요. 투수가 폰에서 멀어지는 쪽으로 던져 옆으로는 거의 안 움직이니, 세로가 투수를 더 크게 담아요. 투수 키가 화면 높이의 1/3~절반쯤이 알맞아요.',
            '이보다 작으면 관절을 놓쳐요.',
            '다리를 들 때부터 팔로스루가 끝날 때까지 발끝, 머리, 공 놓는 손이 늘 화면 안에 있어야 해요. 던지는 쪽에 여유를 남겨요.',
            '찍는 동안 투수와 폰 사이를 아무도 지나가지 않게 해요. 분석이 그 사람을 따라갈 수 있어요.',
            '해를 등진 투수(역광)는 몸이 어두워져요. 해나 조명이 투수를 비추는 쪽에서 찍어요.',
            '몸에 붙는 옷이 좋아요. 헐렁한 점퍼나 후드는 팔꿈치와 엉덩이 자리를 가려요.',
          ]}
        />
      </Section>

      <Section id="phone" icon={<Smartphone />} title="폰 설정">
        <div className="space-y-3">
          <SubHead>아이폰</SubHead>
          <Points
            items={[
              '설정 › 카메라 › 슬로 모션 녹화에서 1080p 240fps 를 골라요.',
              '설정 › 카메라 › 포맷에서 높은 효율성을 골라요. 파일이 작아 한 영상 150MB 안에 들어가요.',
              '설정 › 카메라에서 수평을 켜면 화면에 수평선이 떠서 폰을 똑바로 세우기 쉬워요.',
              '카메라 앱을 슬로 모션으로 넘기고 아래 배율이 1× 인지 봐요. 0.5× 나 2× 는 안 돼요. Pro 아이폰은 1× 를 누르면 1.2× · 1.5× 로 바뀌니 1× 로 돌려 둬요.',
              '찍기 전에 화면에서 투수를 길게 눌러 AE/AF 잠금을 켜요. 찍는 동안 초점과 밝기가 바뀌지 않아요.',
            ]}
          />
          <SubHead>갤럭시</SubHead>
          <Points
            items={[
              '카메라 › 더보기 › 슬로우 모션으로 찍어요. 슈퍼 슬로우 모션은 쓰지 않아요.',
              '배율은 1배 그대로, 화질을 고를 수 있으면 1080p 로 해요.',
            ]}
          />
          <p className="text-xs leading-relaxed break-keep text-muted">
            두 폰은 같은 설정으로 찍어요. 초당 장수가 서로 다르면 3D 가 덜 정확해요.
          </p>
        </div>
      </Section>

      <Section id="steps" icon={<ListOrdered />} title="찍는 순서">
        <ol className="space-y-2.5">
          {[
            '두 폰을 삼각대에 세우고 옆 폰은 가로, 뒤 폰은 세로로 두고 수평을 맞춰요.',
            '투수가 한 번 섀도 피칭을 하며 두 폰 화면에 몸 전체가 다 들어오는지 봐요.',
            '던지기 2초쯤 전에 두 폰 모두 녹화를 켜요. 같은 공 하나를 두 폰이 같이 찍어야 해요.',
            '한 공을 던져요.',
            '팔로스루가 끝나고 1초쯤 뒤에 두 폰 모두 멈춰요. 5~6초면 충분해요.',
            '다음 공은 새로 녹화해요. 한 영상에 한 공이에요.',
            '한쪽 폰의 영상을 올릴 폰이나 PC 로 옮겨요. 원본이 바뀌지 않게 옮기는 법은 아래 영상 옮기기에 있어요.',
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

      <Section id="move" icon={<ArrowLeftRight />} title="영상 옮기기(원본 그대로)">
        <p className="text-sm leading-relaxed break-keep text-muted">
          폰 두 대로 찍으니 한쪽 영상을 올릴 폰(또는 PC)으로 옮겨야 해요. 옮기는 방법에 따라 슬로 모션이 보통 영상(초당 30장)으로
          바뀌거나 화질이 줄어요. 그러면 3D 가 정확하지 않아요.
        </p>
        <SubHead>이렇게 옮겨요</SubHead>
        <Points
          items={[
            '아이폰끼리는 AirDrop: 사진 앱에서 영상을 열고 공유를 누른 뒤, 위쪽 옵션에서 모든 사진 데이터를 켜고 보내요. 끄고 보내면 슬로 모션이 보통 영상으로 바뀔 수 있어요.',
            '두 아이폰이 같은 Apple ID 로 iCloud 사진을 쓰면 옮기지 않아도 올릴 폰의 사진 앱에 원본이 와요.',
            '갤럭시끼리는 퀵 셰어(Quick Share)로 보내요.',
            '아이폰과 갤럭시처럼 기기가 다르면 두 폰의 영상을 케이블로 컴퓨터에 옮겨 PC 에서 올려요. 3D 동작 분석은 PC 에서도 열려요.',
          ]}
        />
        <SubHead>이렇게는 옮기지 않아요</SubHead>
        <Points
          items={[
            '카카오톡 같은 메신저, 메일, 문자로 보내기. 화질과 초당 장수가 줄어요.',
            '화면 녹화로 다시 찍기. 화면 녹화는 올릴 수 없어요.',
            '사진 앱에서 자르거나 슬로 모션 구간을 바꾼 뒤 보내기. 두 영상의 시간이 어긋나요.',
          ]}
        />
        <p className="rounded-xl bg-sky-tint px-3 py-2.5 text-sm leading-relaxed break-keep text-ink">
          올리기 칸에서 영상을 고르면 밑에 초당 장수가 떠요. 240fps 로 찍었는데 30 이나 60 이 보이면 옮기며 원본이 바뀐 거예요.
          위 방법으로 다시 옮겨 주세요.
        </p>
      </Section>

      <Section id="upload" icon={<Upload />} title="올리기">
        <Points
          items={[
            '3D 동작 분석의 영상 올리기에서 옆 칸에 옆 폰 영상, 뒤 칸에 뒤 폰 영상을 골라요.',
            '두 영상의 찍은 시각을 봐서 같은 공을 동시에 찍은 짝이 아니면 올리지 않아요. 같은 영상을 두 칸에 골라도 안 돼요.',
            '화면 녹화한 영상은 올릴 수 없어요. 자르기, 슬로 모션 구간 바꾸기, 내보내기를 한 영상은 시간이 어긋나요.',
            `영상 하나에 ${LAB_MAX_VIDEO_MB}MB 까지예요. 240fps 1080p 높은 효율성 6초면 20MB 남짓이에요.`,
          ]}
        />
      </Section>

      <Section id="fail" icon={<TriangleAlert />} title="분석이 안 됐다면">
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

function SubHead({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold text-muted">{children}</p>;
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
