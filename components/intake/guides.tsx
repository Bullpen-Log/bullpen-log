'use client';

import { useState } from 'react';
import { CircleCheck, CircleAlert } from '@/components/icon';
import { Modal } from '@/components/modal';
import { Segmented } from '@/components/segmented';
import { ClothesArt, PlacementMap, RearFrame, SideFrame } from '@/components/intake/illustrations';

/*
 * 접수 전용 안내(INTAKE-MAIN/R04). 3D 동작 분석 안내(lib/pitch-lab-guide.ts)의 그림은 빌려 쓰지만 글은 여기 따로 둔다 —
 * 그쪽은 다른 화면(투구 실험실)의 말투 · 권장(240fps)이고, 접수는 120fps 이상이 필수라 기준이 다르다. 그쪽 글은 바꾸지 않는다.
 * 안내 글은 '합니다'체, 질문 제목만 '요'(사용자 지정).
 */

/**
 * 꼭 지킬 것 — 120fps 이상 슬로 모션은 두 영상 모두 필수다(서버가 파일을 읽어 다시 본다: lib/intake/media.ts captureRateCode).
 * 240fps 는 그 안의 권장이다. 기본 동영상(30 · 60fps)은 받지 않는다.
 */
export const CAPTURE_REQUIRED = [
  '두 영상 모두 슬로 모션 120fps 이상으로 촬영합니다. 일반 동영상(30 · 60fps)은 받지 않습니다.',
  '폰 두 대로 같은 투구 한 번을 동시에 촬영합니다.',
  '한 대는 옆에서, 한 대는 투수 뒤에서 촬영합니다.',
  '삼각대나 받침에 세워 흔들리지 않게, 수평으로 둡니다.',
  '밝은 곳에서 촬영합니다.',
  '발끝부터 머리, 던지는 손까지 화면 안에 들어오게 합니다.',
  '몸에 붙는 옷을 입습니다. 헐렁한 겉옷은 벗습니다.',
] as const;
export const CAPTURE_PREFERRED = ['슬로 모션 1080p 240fps(그 폰에서 고를 수 있을 때)', '배율 1× 그대로'] as const;

/** 120fps 를 지키지 못한 파일을 고치는 방법이 없다는 말 — 고르기 전 · 고를 때 같은 글을 쓴다 */
export const RATE_CANNOT_FIX = '120fps 미만으로 촬영한 영상은 재생 속도를 바꾸거나 다른 형식으로 내보내도 촬영되지 않은 장면이 생기지 않습니다. 카메라 원본을 선택하거나 120fps 이상으로 다시 촬영하십시오.';

/** 찍기 전에 볼 두 묶음 — 첫 화면 · 촬영 방법에 같이 둔다 */
export function CaptureNeeds() {
  return (
    <div className="space-y-3 rounded-2xl bg-surface p-(--block-pad)">
      <section className="space-y-2">
        <h3 className="text-sm font-bold text-ink">꼭 지킬 것</h3>
        <ul className="space-y-1.5 text-sm leading-relaxed break-keep text-ink">
          {CAPTURE_REQUIRED.map((t, i) => (
            <li key={t} className={`flex gap-2 ${i === 0 ? 'font-bold' : ''}`}>
              <CircleCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2 border-t border-line pt-3">
        <h3 className="text-sm font-bold text-ink">권장</h3>
        <ul className="space-y-1.5 text-sm leading-relaxed break-keep text-muted">
          {CAPTURE_PREFERRED.map((t) => (
            <li key={t} className="flex gap-2">
              <span aria-hidden className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
        <p className="text-footnote leading-5 break-keep text-muted">240fps 를 고를 수 없는 폰이면 120fps 슬로 모션으로 촬영합니다.</p>
      </section>
    </div>
  );
}

/** 보내면 안 되는 파일 — 메신저로 받은 것 · 화면 녹화 · 자르거나 고친 것. 원본 고르기 안내 · 고르기 화면이 같이 쓴다 */
const NOT_ORIGINAL = '메신저나 메일로 받은 영상, 화면 녹화, 자르거나 고친 영상은 원본이 아닙니다. 촬영한 폰에 있는 원본을 선택하십시오.';
/** 메뉴 이름은 기기 · 버전마다 다르다 — 모든 기기로 확인한 말이 아니다 */
const MENU_NOTE = '메뉴 이름과 위치는 기기, 운영체제 버전, 공유 대상에 따라 다를 수 있습니다.';

/** 고르기 곁의 짧은 안내 — 자세한 것은 '원본 영상 선택 방법' 창이 맡는다 */
export function OriginalTips() {
  return (
    <section aria-label="원본 선택" className="space-y-2 rounded-2xl bg-ink/5 px-4 py-3">
      <ul className="space-y-1.5 text-footnote leading-5 break-keep text-ink">
        <li className="flex gap-2">
          <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />
          <span>슬로 모션 120fps 이상으로 촬영한 원본만 받습니다.</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />
          <span>아이폰: 사진 앱 › 영상 선택 › 공유 › 옵션 › ‘모든 사진 데이터’를 켜고 컴퓨터로 AirDrop 한 뒤, 컴퓨터에서 이 링크로 원본 영상 파일을 선택합니다.</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />
          <span>iCloud에 있는 영상은 내려받기가 끝난 뒤 선택합니다.</span>
        </li>
      </ul>
      <p className="flex items-start gap-1.5 text-footnote leading-5 break-keep text-warn">
        <CircleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{NOT_ORIGINAL}</span>
      </p>
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
        <Section title="같은 투구를 두 대로 동시에 촬영합니다">
          <p className="text-sm leading-relaxed break-keep text-muted">
            3D 동작 결과는 한 번의 투구를 옆과 뒤에서 동시에 촬영한 영상 두 개로 만듭니다. 따로 촬영한 두 영상으로는 만들 수 없습니다.
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

        <Section title="촬영 전 확인">
          <CaptureNeeds />
        </Section>

        <Section title="폰 설정 — 슬로 모션 120fps 이상">
          <Steps
            items={[
              '아이폰: 설정 › 카메라 › 슬로 모션 녹화에서 1080p 240fps(없으면 120fps)를 고릅니다.',
              '카메라 앱을 ‘슬로 모션’으로 넘깁니다. 일반 ‘비디오’ 모드는 30 · 60fps 라 받지 않습니다.',
              '배율은 1× 그대로 둡니다. 화면에서 투수를 길게 눌러 밝기 · 초점을 고정합니다.',
              '갤럭시: 카메라 › 더보기 › 슬로우 모션을 고르고 배율 1배로 촬영합니다.',
            ]}
          />
          <p className="text-footnote leading-5 break-keep text-muted">{RATE_CANNOT_FIX}</p>
        </Section>

        <Section title="폰 놓는 자리">
          <PlacementMap hand={hand} className="mx-auto w-full max-w-[17.5rem]" />
          <Points
            items={[
              hand === 'R'
                ? '옆 폰: 오른손 투수는 3루 쪽에서 투구 방향과 직각으로 3.5~5m 떨어져 가로로 촬영합니다.'
                : '옆 폰: 왼손 투수는 1루 쪽에서 투구 방향과 직각으로 3.5~5m 떨어져 가로로 촬영합니다.',
              '뒤 폰: 투수 바로 뒤(2루 쪽) 3~4m 에서 홈을 향해 세로로 촬영합니다.',
              '두 폰 모두 삼각대에, 허리~가슴 높이(1~1.3m)로 수평을 맞춥니다.',
            ]}
          />
        </Section>

        <Section title="화면에 담기">
          <Points
            items={[
              '다리를 들 때와 내디딜 때도 발끝 · 머리 · 손이 화면 밖으로 나가지 않게 합니다.',
              '밝은 곳에서 촬영합니다. 어두우면 팔이 번집니다.',
              '촬영하는 동안 투수 앞을 아무도 지나가지 않게 합니다.',
            ]}
          />
        </Section>
        <Section title="헐렁한 옷은 쓸 수 없습니다">
          <p className="text-sm leading-relaxed break-keep text-muted">후드 · 바람막이 · 통 넓은 바지는 관절을 가려 3D 결과가 어긋납니다. 몸에 붙는 옷을 입고 겉옷은 벗습니다.</p>
          <ClothesArt className="mx-auto max-w-[18rem]" />
        </Section>
        <Section title="촬영 순서">
          <Steps items={['두 폰 모두 던지기 2초 전에 녹화를 시작하고, 팔로스루 1초 뒤에 멈춥니다.', '한 투구에 영상 하나씩, 두 폰이 같은 투구를 촬영합니다.']} />
        </Section>
      </div>
    </Modal>
  );
}

/**
 * 원본 고르기(R04) — 웹페이지는 사진 선택 창에 원본을 강제로 내게 할 수 없고, ‘모든 사진 데이터’ 스위치도 웹이 켤 수 없다(운영체제 공유 설정이다).
 * 그래서 어떻게 옮기면 원본 파일이 그대로 가는지를 말하고, 어느 고르기 창이든 원본을 준다고 약속하지 않는다.
 * 확인한 출처(GPT05, 2026-11-13): Apple 지원 ‘iPhone에서 사진 및 비디오 공유하기’ · ‘원본 형식으로 공유’ · 108306(수정되지 않은 원본 내보내기).
 * 지금 Apple 안내는 ‘모든 사진 데이터’를 AirDrop 과 함께 쓰는 것으로 적는다 — 다른 공유 대상에서 늘 있다고 말하지 않는다. 실제 기기로 시험한 것이 아니다.
 */
export function OriginalGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="원본 영상 선택 방법">
      <div className="space-y-6 pb-2">
        <p className="text-sm leading-relaxed break-keep text-muted">
          이 화면은 선택한 파일을 바꾸지 않고 그대로 보냅니다. 다만 사진 선택 창이 어떤 파일을 내주는지는 이 화면이 정할 수 없습니다. 아래 방법으로 원본 파일을 준비하십시오.
        </p>

        <Section title="아이폰 → 컴퓨터(AirDrop) — 권장">
          <Steps
            items={[
              '사진 앱에서 영상을 선택합니다.',
              '공유를 누르고, 위쪽의 ‘옵션’을 누릅니다.',
              '‘모든 사진 데이터’(All Photos Data)를 켭니다. 목록 아래쪽에 있습니다. 형식을 고르는 칸이 있으면 ‘현재’(Current)를 고릅니다.',
              '‘완료’를 누른 뒤 AirDrop 으로 Mac 에 보냅니다.',
              'Mac 의 다운로드 폴더에 받은 파일 가운데 원본 영상 파일(.MOV)을 확인합니다. 함께 받은 편집 정보 파일(.AAE)이나 편집본은 보내지 않습니다.',
              'Mac 의 브라우저에서 이 링크를 열고 같은 이름과 PIN 으로 들어가 그 원본 파일을 선택합니다.',
            ]}
          />
          <p className="text-footnote leading-5 break-keep text-muted">
            ‘모든 사진 데이터’를 켜면 원본 파일과 촬영 정보 · 편집 정보가 함께 전달됩니다. ‘현재’ 형식을 고르면 호환 형식으로 바꾸지 않고 지금 형식 그대로 전달됩니다.
          </p>
        </Section>

        <Section title="아이폰에서 바로 보내기">
          <Steps
            items={[
              '사진 앱에서 영상을 선택하고 공유를 누릅니다.',
              '목록에 ‘수정되지 않은 원본 내보내기’(Export Unmodified Original)가 있으면 누르고, ‘위치’에서 저장할 곳을 골라 저장합니다.',
              '이 화면의 영상 선택에서 사진 보관함이 아니라 ‘파일 선택’으로 저장한 파일을 고릅니다.',
            ]}
          />
          <p className="text-footnote leading-5 break-keep text-muted">
            Apple 안내는 저장할 곳으로 연결한 외장 저장장치를 예로 듭니다. 아이폰 안의 파일 앱 위치가 보이는지, 이 메뉴가 있는지는 iOS 버전과 기기에 따라 다를 수 있습니다. 보이지 않으면 위의 컴퓨터 방법을 사용하십시오. 사진 보관함에서 바로 고르면 아이폰이 호환 형식으로 바꾼 파일을 줄 수 있습니다.
          </p>
        </Section>

        <Section title="‘모든 사진 데이터’에 대해">
          <Points
            items={[
              '이 설정은 아이폰의 공유 메뉴에 있으며, 이 웹페이지가 켜거나 끌 수 없습니다.',
              '공유 대상에 따라 설정이 보이지 않거나 적용되지 않을 수 있습니다. 이 설정을 켰다고 해서 다른 앱이나 웹페이지의 선택 창이 늘 원본을 내준다는 뜻은 아닙니다.',
              MENU_NOTE,
            ]}
          />
        </Section>

        <Section title="iCloud에 있는 영상">
          <p className="text-sm leading-relaxed break-keep text-ink">기기에 내려받는 데 시간이 걸립니다. 선택 후 오래 멈춰 있으면 내려받기가 끝난 뒤 다시 선택하십시오.</p>
        </Section>

        <Section title="안드로이드 · 컴퓨터">
          <Points items={['갤러리나 내 파일에서 슬로우 모션으로 촬영한 원본 영상을 바로 선택합니다.', '다른 기기로 옮길 때는 퀵 셰어나 케이블을 사용합니다. 메신저로 옮기면 영상이 줄어듭니다.']} />
        </Section>

        <Section title="보내면 안 되는 파일">
          <Points items={['메신저나 메일로 주고받은 영상(줄어들거나 다시 만들어집니다)', '화면 녹화로 다시 촬영한 영상', '자르거나 고친 영상, 30 · 60fps 로 내보낸 슬로 모션', '원본을 줄이거나 형식을 바꾼 영상']} />
          <p className="text-footnote leading-5 break-keep text-muted">영상이 커서 보낼 수 없으면 줄이지 말고 링크를 보내 준 담당자에게 알리십시오. 따로 받는 방법을 안내합니다.</p>
        </Section>

        <Section title="화면에 보이는 말의 뜻">
          <Points
            items={[
              '‘240fps 감지’는 파일에 기록된 정보입니다. 카메라 원본이라는 증명은 아닙니다.',
              '‘선택한 파일 그대로 전송됨’은 선택한 파일이 한 바이트도 바뀌지 않고 도착했다는 뜻입니다. 서버가 전체를 비교한 뒤에만 표시됩니다. 사진 선택 창이 처음에 어떤 파일을 내주었는지는 이 표시로 알 수 없습니다.',
            ]}
          />
        </Section>
      </div>
    </Modal>
  );
}
