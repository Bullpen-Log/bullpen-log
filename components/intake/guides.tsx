'use client';

import { useState } from 'react';
import { Modal } from '@/components/modal';
import { Segmented } from '@/components/segmented';
import { LAB_GUIDE_POINTS } from '@/lib/pitch-lab-guide';
import { PlacementMap, RearFrame, SideFrame } from '@/components/intake/illustrations';

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
          <div className="flex items-end justify-center gap-4">
            <figure className="w-[56%]">
              <SideFrame className="w-full" />
              <figcaption className="mt-1 text-center text-footnote text-muted">옆 영상(가로)</figcaption>
            </figure>
            <figure className="w-[32%]">
              <RearFrame className="w-full" />
              <figcaption className="mt-1 text-center text-footnote text-muted">뒤 영상(세로)</figcaption>
            </figure>
          </div>
        </Section>

        <Section title="폰 놓는 자리">
          <Segmented
            label="던지는 손"
            value={hand}
            onChange={setHand}
            options={[
              { value: 'R', label: '오른손 투수' },
              { value: 'L', label: '왼손 투수' },
            ]}
          />
          <PlacementMap hand={hand} className="mx-auto w-full max-w-[17.5rem]" />
          <Points
            items={[
              hand === 'R'
                ? '옆 폰: 오른손 투수는 3루 쪽에서 찍어요. 투구 방향과 직각으로 3.5~5m 떨어져요.'
                : '옆 폰: 왼손 투수는 1루 쪽에서 찍어요. 투구 방향과 직각으로 3.5~5m 떨어져요.',
              ...LAB_GUIDE_POINTS.place.slice(1),
            ]}
          />
        </Section>

        <Section title="화면에 담기">
          <Points items={LAB_GUIDE_POINTS.frame} />
        </Section>
        <Section title="폰 설정">
          <Points items={LAB_GUIDE_POINTS.phone} />
        </Section>
        <Section title="찍는 순서">
          <Steps items={LAB_GUIDE_POINTS.steps} />
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
          <Points items={['갤러리나 내 파일에서 찍은 영상을 바로 골라요.', '메신저로 받은 영상은 줄어든 파일일 수 있어요. 찍은 폰에서 보내 주세요.']} />
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
