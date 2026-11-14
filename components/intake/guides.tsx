'use client';

import { useState } from 'react';
import { CircleCheck } from '@/components/icon';
import { Modal } from '@/components/modal';
import { Segmented } from '@/components/segmented';
import { ClothesArt, PlacementMap, RearFrame, SideFrame } from '@/components/intake/illustrations';
import { Paras } from '@/components/intake/shell';

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
export const RATE_CANNOT_FIX = '120fps 미만으로 촬영한 영상은 재생 속도를 바꾸거나 다른 형식으로 내보내도 촬영되지 않은 장면이 생기지 않습니다.\n카메라 원본을 선택하거나 120fps 이상으로 다시 촬영하십시오.';

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
/**
 * 목록 한 칸의 글 — '\n' 마다 한 문단. 차례 칸(note)은 첫 줄이 할 일이고 뒤는 그 칸의 덧붙임이라 조금 흐리게 · 작게,
 * 점 목록 칸은 뒤 문단도 같은 크기로 띄우기만 한다. 칸 사이는 목록 간격이 띄운다.
 */
function ItemText({ text, note = false }: { text: string; note?: boolean }) {
  const [main, ...more] = text.split('\n');
  return (
    <div className="min-w-0">
      <p>{main}</p>
      {more.map((m) => (
        <p key={m} className={note ? 'mt-0.5 text-footnote leading-5 text-muted' : 'mt-1'}>
          {m}
        </p>
      ))}
    </div>
  );
}

function Points({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-2 text-sm leading-relaxed break-keep text-ink">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <span aria-hidden className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
          <ItemText text={t} />
        </li>
      ))}
    </ul>
  );
}

/** 차례대로 하는 일 — 실제 번호 목록(<ol>), 칸마다 한 동작. small 은 고르기 곁의 짧은 상자에서 */
function Steps({ items, small = false }: { items: readonly string[]; small?: boolean }) {
  return (
    <ol className={`${small ? 'space-y-1 text-footnote leading-5' : 'space-y-2.5 text-sm leading-relaxed'} break-keep text-ink`}>
      {items.map((t, i) => (
        <li key={t} className="flex gap-2.5">
          <span aria-hidden className="text-numeric mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky/15 text-xs text-sky-strong">
            {i + 1}
          </span>
          <ItemText text={t} note />
        </li>
      ))}
    </ol>
  );
}

/** 섹션 안의 설명 문단 — '\n' 마다 한 문단 */
function Note({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'ink' }) {
  return <Paras text={text} gap="mt-1.5" className={`text-footnote leading-5 ${tone === 'ink' ? 'text-ink' : 'text-muted'}`} />;
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
export function CaptureGuide({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [hand, setHand] = useState<'R' | 'L'>('R');
  const [device, setDevice] = useState<'iphone' | 'android'>('iphone');
  return (
    <Modal open={open} onClose={onClose} title="촬영 방법">
      <div className="space-y-6 pb-2">
        <Section title="같은 투구를 두 대로 동시에 촬영합니다">
          <Paras
            text={
              '3D 동작 결과는 한 번의 투구를 옆과 뒤에서 동시에 촬영한 영상 두 개로 만듭니다.\n따로 촬영한 두 영상으로는 만들 수 없습니다.'
            }
            className="text-sm leading-relaxed text-muted"
          />
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
              <figcaption className="mt-1 text-center text-footnote text-muted">
                옆 영상(가로)
              </figcaption>
            </figure>
            <figure className="w-[32%]">
              <RearFrame flip={hand === 'L'} className="w-full" />
              <figcaption className="mt-1 text-center text-footnote text-muted">
                뒤 영상(세로)
              </figcaption>
            </figure>
          </div>
        </Section>

        <Section title="1. 슬로 모션 설정">
          <p className="text-sm leading-6 text-ink">
            두 폰 모두 120fps 이상이 필수입니다. 일반 동영상(30·60fps)은 사용할 수
            없습니다.
          </p>
          <Segmented
            label="촬영 기기"
            value={device}
            onChange={setDevice}
            options={[
              { value: 'iphone', label: '아이폰' },
              { value: 'android', label: '안드로이드' },
            ]}
          />
          {device === 'iphone' ? (
            <Steps
              items={[
                '설정 › 카메라 › 슬로 모션 녹화에서 1080p 240fps(없으면 120fps)를 고릅니다.',
                '카메라 앱을 ‘슬로 모션’으로 넘깁니다.\n일반 ‘비디오’ 모드는 30 · 60fps 라 받지 않습니다.',
                '배율은 1× 그대로 둡니다.',
                '화면에서 투수를 길게 눌러 밝기 · 초점을 고정합니다.',
              ]}
            />
          ) : (
            <Steps
              items={[
                '카메라에서 슬로우 모션 모드를 선택합니다. 갤럭시는 카메라 › 더보기에서 찾을 수 있습니다.',
                '촬영 설정이 120fps 이상인지 확인합니다. 기기별 지원 모드와 해상도는 다릅니다.',
                '배율 1×로 촬영합니다.',
              ]}
            />
          )}
          <details className="text-footnote leading-5 text-muted">
            <summary className="py-2">
              120fps 미만 영상을 바꿔서 보낼 수 없는 이유
            </summary>
            <Note text={RATE_CANNOT_FIX} />
          </details>
        </Section>

        <Section title="2. 폰 배치">
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

        <Section title="3. 화면·복장 확인">
          <Points
            items={[
              '발끝·머리·던지는 손이 동작 내내 화면 안에 들어오게 합니다.',
              '밝은 곳에서 촬영하고 투수 앞을 가리지 않습니다.',
              '몸에 붙는 옷을 입고 헐렁한 겉옷은 벗습니다.',
            ]}
          />
          <details className="text-footnote text-muted">
            <summary className="py-2">복장 예시</summary>
            <ClothesArt className="mx-auto max-w-[18rem]" />
          </details>
        </Section>
        <Section title="4. 동시 촬영">
          <Steps
            items={[
              '두 폰 모두 던지기 2초 전에 녹화를 시작합니다.',
              '팔로스루 1초 뒤에 두 폰 모두 녹화를 멈춥니다.',
              '한 투구에 영상 하나씩, 두 폰이 같은 투구를 촬영합니다.',
            ]}
          />
        </Section>
      </div>
    </Modal>
  );
}

/* 원본 저장 안내는 original-file-guide.tsx(R08) — 파일 앱에 무수정 원본을 저장하는 한 길만 말한다 */
