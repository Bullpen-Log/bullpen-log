'use client';

import { useState } from 'react';
import { CircleCheck, CircleAlert } from '@/components/icon';
import { Modal } from '@/components/modal';
import { Segmented } from '@/components/segmented';
import { LAB_GUIDE_CAMERA, LAB_GUIDE_CAMERA_NOTE, LAB_GUIDE_CHECKS, LAB_GUIDE_CLOTHES, LAB_GUIDE_FRAME, LAB_GUIDE_MOVE_NOTES, LAB_GUIDE_SHOOT } from '@/lib/pitch-lab-guide';
import { ClothesArt, PlacementMap, RearFrame, SideFrame } from '@/components/intake/illustrations';

/*
 * 3D 동작 분석 촬영 안내(lib/pitch-lab-guide.ts)의 글을 그대로 빌려 쓴다 — 두 안내가 다른 말을 하지 않게.
 * 2026-11-08 안내가 카드 넷으로 바뀌며 한 묶음 표(LAB_GUIDE_POINTS)가 없어져 여기서 다시 묶는다.
 */
const GUIDE = {
  /* 첫 줄(옆 폰 자리)은 던지는 손에 따라 화면이 따로 쓴다 */
  place: LAB_GUIDE_FRAME.slice(1, 3),
  frame: [`${LAB_GUIDE_CLOTHES.title}. ${LAB_GUIDE_CLOTHES.text}`, LAB_GUIDE_FRAME[3], LAB_GUIDE_SHOOT[0], LAB_GUIDE_SHOOT[3]],
  phone: [...LAB_GUIDE_CAMERA.map((s) => s.text), LAB_GUIDE_CAMERA_NOTE],
  steps: LAB_GUIDE_SHOOT.slice(1, 3),
};

/**
 * 꼭 지킬 것과 되면 좋은 것 — 섞어 쓰면 '240fps 가 아니면 못 보낸다'로 읽힌다. 240fps 는 되는 폰에서만 고른다.
 * 찍힌 영상의 재생 fps 로 촬영 fps 를 짐작하지 않는다(파일에 적힌 값과 찍은 방식이 다를 수 있다) — 여기서도 그런 말을 안 한다.
 */
export const CAPTURE_REQUIRED = [
  '폰 두 대로 같은 투구 한 번을 동시에 찍어요',
  '한 대는 옆에서, 한 대는 투수 뒤에서 찍어요',
  '삼각대나 받침에 세워 흔들리지 않게, 수평으로 둬요',
  '밝은 곳에서 찍어요',
  '발끝부터 머리, 던지는 손까지 화면 안에 들어오게 해요',
  '몸에 붙는 옷을 입어요. 헐렁한 겉옷은 벗어요',
] as const;
export const CAPTURE_PREFERRED = ['슬로 모션 1080p 240fps(그 폰에서 고를 수 있을 때)', '배율 1× 그대로'] as const;

/** 찍기 전에 볼 두 묶음 — 첫 화면 · 촬영 방법에 같이 둔다 */
export function CaptureNeeds() {
  return (
    <div className="space-y-3 rounded-2xl bg-surface p-(--block-pad)">
      <section className="space-y-2">
        <h3 className="text-sm font-bold text-ink">꼭 지켜 주세요</h3>
        <ul className="space-y-1.5 text-sm leading-relaxed break-keep text-ink">
          {CAPTURE_REQUIRED.map((t) => (
            <li key={t} className="flex gap-2">
              <CircleCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2 border-t border-line pt-3">
        <h3 className="text-sm font-bold text-ink">되면 더 좋아요</h3>
        <ul className="space-y-1.5 text-sm leading-relaxed break-keep text-muted">
          {CAPTURE_PREFERRED.map((t) => (
            <li key={t} className="flex gap-2">
              <span aria-hidden className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
        <p className="text-footnote leading-5 break-keep text-muted">240fps 를 고를 수 없는 폰이면 그 폰의 기본 설정으로 찍어도 보낼 수 있어요.</p>
      </section>
    </div>
  );
}

/** 보내면 안 되는 파일 — 메신저로 받은 것 · 화면 녹화 · 자르거나 고친 것. 원본 고르기 안내 · 고르기 화면이 같이 쓴다 */
const NOT_ORIGINAL = '메신저나 메일로 받은 영상, 화면 녹화, 자르거나 고친 영상은 원본이 아니에요. 찍은 폰에 있는 원본을 골라 주세요.';
/** 메뉴 이름은 기기 · 버전마다 다르다 — 모든 기기로 확인한 말이 아니다 */
const MENU_NOTE = '메뉴 이름과 자리는 기기와 운영체제 버전에 따라 다를 수 있어요.';

/** 고르기 곁의 짧은 안내 — 자세한 것은 '원본 영상을 고르는 방법' 창이 맡는다 */
export function OriginalTips() {
  return (
    <section aria-label="원본 고르기" className="space-y-2 rounded-2xl bg-ink/5 px-4 py-3">
      <ul className="space-y-1.5 text-footnote leading-5 break-keep text-ink">
        <li className="flex gap-2">
          <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />
          <span>아이폰은 사진 앱에서 ‘수정되지 않은 원본 내보내기’로 파일 앱에 저장한 뒤 그 파일을 골라요.</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />
          <span>iCloud에 있는 영상은 내려받기가 끝날 때까지 기다려요.</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />
          <span>안드로이드는 내 파일이나 갤러리에서 찍은 원본을 골라요.</span>
        </li>
      </ul>
      <p className="flex items-start gap-1.5 text-footnote leading-5 break-keep text-warn">
        <CircleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{NOT_ORIGINAL}</span>
      </p>
      <p className="text-footnote leading-5 break-keep text-muted">{MENU_NOTE}</p>
    </section>
  );
}

/**
 * 보내기 직전의 마지막 확인 — 고를 칸이 아니라 그림이 있는 목록이다(같은 투구 확인 체크는 아래에 따로 있다).
 * 3D 동작 분석 안내의 찍기 전 확인(LAB_GUIDE_CHECKS)에서 보내는 사람이 파일을 보고 확인할 수 있는 것만 가져온다.
 */
const FINAL_CHECKS: readonly string[] = [
  '두 영상이 같은 투구 한 번을 동시에 찍은 것',
  '옆 영상과 뒤 영상이 하나씩',
  LAB_GUIDE_CHECKS.find((c) => c.id === 'frame')?.title ?? '발끝부터 머리, 손까지 화면 안에',
  '자르거나 고치지 않은 원본 파일',
];

export function FinalChecklist({ hand }: { hand: 'R' | 'L' | null }) {
  const flip = hand === 'L';
  return (
    <section aria-labelledby="final-check-title" className="space-y-3 rounded-2xl bg-surface p-(--block-pad)">
      <h2 id="final-check-title" className="text-sm font-bold text-ink">
        보내기 전에 한 번 더 봐 주세요
      </h2>
      <div aria-hidden className="flex items-end justify-center gap-3">
        <SideFrame flip={flip} className="w-[46%]" />
        <RearFrame flip={flip} className="w-[22%]" />
      </div>
      <ul className="space-y-1.5 text-sm leading-relaxed break-keep text-ink">
        {FINAL_CHECKS.map((t) => (
          <li key={t} className="flex gap-2">
            <CircleCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Points({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-1.5 text-sm leading-relaxed break-keep text-ink">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <span aria-hidden className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Steps({ items }: { items: readonly string[] }) {
  return (
    <ol className="space-y-2 text-sm leading-relaxed break-keep text-ink">
      {items.map((t, i) => (
        <li key={t} className="flex gap-2.5">
          <span aria-hidden className="text-numeric mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky/15 text-[0.6875rem] text-sky-strong">
            {i + 1}
          </span>
          <span>{t}</span>
        </li>
      ))}
    </ol>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      {children}
    </section>
  );
}

/** 촬영 방법 — 같은 공을 두 대로 동시에. 옆 폰 자리는 던지는 손에 따라 다르다 */
export function CaptureGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [hand, setHand] = useState<'R' | 'L'>('R');
  return (
    <Modal open={open} onClose={onClose} title="촬영 방법">
      <div className="space-y-6 pb-2">
        <Section title="같은 공을 두 대로 동시에 찍어요">
          <p className="text-sm leading-relaxed break-keep text-muted">
            3D 분석은 한 번의 투구를 옆과 뒤에서 동시에 찍은 영상 두 개로 해요. 따로 찍은 두 영상으로는 분석할 수 없어요.
          </p>
          <Segmented
            label="던지는 손"
            value={hand}
            onChange={setHand}
            options={[
              { value: 'R', label: '오른손 투수' },
              { value: 'L', label: '왼손 투수' },
            ]}
          />
          <div className="flex items-end justify-center gap-4">
            <figure className="w-[56%]">
              <SideFrame flip={hand === 'L'} className="w-full" />
              <figcaption className="mt-1 text-center text-footnote text-muted">옆 영상(가로)</figcaption>
            </figure>
            <figure className="w-[32%]">
              <RearFrame flip={hand === 'L'} className="w-full" />
              <figcaption className="mt-1 text-center text-footnote text-muted">뒤 영상(세로)</figcaption>
            </figure>
          </div>
        </Section>

        <Section title="찍기 전에 볼 것">
          <CaptureNeeds />
        </Section>

        <Section title="폰 놓는 자리">
          <PlacementMap hand={hand} className="mx-auto w-full max-w-[17.5rem]" />
          <Points
            items={[
              hand === 'R'
                ? '옆 폰: 오른손 투수는 3루 쪽에서 찍어요. 투구 방향과 직각으로 3.5~5m 떨어져요.'
                : '옆 폰: 왼손 투수는 1루 쪽에서 찍어요. 투구 방향과 직각으로 3.5~5m 떨어져요.',
              ...GUIDE.place,
            ]}
          />
        </Section>

        <Section title="화면에 담기">
          <Points items={GUIDE.frame} />
        </Section>
        <Section title={LAB_GUIDE_CLOTHES.title}>
          <ClothesArt className="mx-auto max-w-[18rem]" />
        </Section>
        <Section title="폰 설정">
          <Points items={GUIDE.phone} />
        </Section>
        <Section title="찍는 순서">
          <Steps items={GUIDE.steps} />
        </Section>
      </div>
    </Modal>
  );
}

/**
 * 원본 고르기 — 웹페이지가 사진 선택 창에 원본을 강제로 내게 할 수는 없다. 그래서 '어떻게 고르면 되는지'만 말하고, 된다고 약속하지 않는다.
 * 메뉴 이름은 iOS 판 · 언어에 따라 다르다. 실제 기기로 확인 전이라 이름을 단정하지 않고 영어 이름을 같이 적는다.
 */
export function OriginalGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="원본 영상을 고르는 방법">
      <div className="space-y-6 pb-2">
        <p className="text-sm leading-relaxed break-keep text-muted">
          기기나 메신저를 거치면 영상이 줄어들거나 다시 만들어질 수 있어요. 이 화면은 고른 파일을 바꾸지 않고 그대로 보내지만, 사진 선택 창이 어떤 파일을 주는지는 정할 수 없어요.
        </p>

        <Section title="아이폰">
          <Steps
            items={[
              '사진 앱에서 영상을 열어요.',
              '공유 단추를 누르고 메뉴에서 ‘수정되지 않은 원본 내보내기’(Export Unmodified Original)를 골라요.',
              '파일 앱의 폴더를 골라 저장해요.',
              '이 화면의 영상 선택에서 ‘파일 선택’을 눌러 그 파일을 골라요.',
            ]}
          />
          <p className="text-footnote leading-5 break-keep text-muted">
            메뉴 이름과 자리는 iOS 버전과 언어에 따라 달라요. 메뉴가 안 보이면 컴퓨터로 옮긴 뒤 컴퓨터 브라우저에서 이 링크를 열어 보내 주세요.
          </p>
        </Section>

        <Section title="iCloud에 있는 영상">
          <p className="text-sm leading-relaxed break-keep text-ink">
            기기에 내려받는 시간이 걸려요. 고른 뒤 한참 멈춰 있으면 내려받기가 끝난 뒤 다시 골라 주세요.
          </p>
        </Section>

        <Section title="안드로이드 · 컴퓨터">
          <Points items={['갤러리나 내 파일에서 찍은 원본 영상을 바로 골라요.', MENU_NOTE]} />
        </Section>

        <Section title="다른 폰으로 옮길 때">
          <Points items={LAB_GUIDE_MOVE_NOTES.slice(0, 2)} />
        </Section>

        <Section title="이런 파일은 보내지 마세요">
          <Points items={['메신저나 메일로 주고받은 영상(줄어들거나 다시 만들어져요)', '화면 녹화로 다시 찍은 영상', '자르거나 고친 영상', '원본을 줄이거나 바꾼 영상']} />
          <p className="text-footnote leading-5 break-keep text-muted">영상이 너무 커서 못 보내면 줄이지 말고 링크를 보내 준 분에게 알려 주세요. 따로 받는 방법을 안내해 드려요.</p>
        </Section>

        <Section title="화면에 보이는 말의 뜻">
          <Points
            items={[
              '‘240fps 감지’는 파일에 적힌 정보예요. 카메라 원본이라는 증명은 아니에요.',
              '‘선택한 파일 그대로 전송됨’은 고른 파일이 한 글자도 바뀌지 않고 도착했다는 뜻이에요. 서버가 전체를 비교한 뒤에만 보여요.',
            ]}
          />
        </Section>
      </div>
    </Modal>
  );
}
