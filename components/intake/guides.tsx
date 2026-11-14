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
/** 메뉴 이름은 기기 · 버전마다 다르다 — 모든 기기로 확인한 말이 아니다 */
const MENU_NOTE = '메뉴 이름과 위치는 기기, 운영체제 버전, 공유 대상에 따라 다를 수 있습니다.';

/** 기본 화면에는 원본 조건만, 실제 전송 절차는 선택한 경로의 도움말에서 안내한다. */
export function OriginalTips() {
  return (
    <p className="text-footnote leading-5 text-muted">
      촬영한 원본을 선택합니다. 메신저로 받은 파일·화면 녹화·편집본은 사용할 수
      없습니다.
    </p>
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

/**
 * 원본 고르기(R04) — 웹페이지는 사진 선택 창에 원본을 강제로 내게 할 수 없고, ‘모든 사진 데이터’ 스위치도 웹이 켤 수 없다(운영체제 공유 설정이다).
 * 그래서 어떻게 옮기면 원본 파일이 그대로 가는지를 말하고, 어느 고르기 창이든 원본을 준다고 약속하지 않는다.
 * 확인한 출처(GPT05, 2026-11-13): Apple 지원 ‘iPhone에서 사진 및 비디오 공유하기’ · ‘원본 형식으로 공유’ · 108306(수정되지 않은 원본 내보내기).
 * 지금 Apple 안내는 ‘모든 사진 데이터’를 AirDrop 과 함께 쓰는 것으로 적는다 — 다른 공유 대상에서 늘 있다고 말하지 않는다. 실제 기기로 시험한 것이 아니다.
 */
export function OriginalGuide({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [route, setRoute] = useState('iphone');
  return (
    <Modal open={open} onClose={onClose} title="원본 영상 준비">
      <div className="space-y-6 pb-2 text-[15px] leading-[1.65]">
        <p className="text-muted">
          촬영한 120fps 이상 원본 파일을 준비합니다. 파일을 줄이거나 재생 속도를
          변경하지 않습니다.
        </p>
        <div className="space-y-2">
          <label
            htmlFor="original-route"
            className="block text-sm font-semibold text-ink"
          >
            보낼 방법
          </label>
          <select
            id="original-route"
            value={route}
            onChange={(e) => setRoute(e.currentTarget.value)}
            className="min-h-13 w-full rounded-xl border border-line-strong bg-surface px-3 text-base text-ink focus-visible:outline-2 focus-visible:outline-sky"
          >
            <option value="iphone">아이폰에서 직접 보내기</option>
            <option value="airdrop">아이폰 → Mac으로 옮겨 보내기</option>
            <option value="other">안드로이드·컴퓨터에서 보내기</option>
          </select>
        </div>
        {route === 'iphone' && (
          <Section title="수정되지 않은 원본으로 내보내기">
            <Steps
              items={[
                '사진 앱에서 영상을 선택하고 공유를 누릅니다.',
                '‘수정되지 않은 원본 내보내기’가 있으면 선택합니다.',
                '제공되는 저장 위치에 원본을 저장합니다.',
                '이 링크로 돌아와 영상 선택 › 파일 선택에서 저장한 원본을 고릅니다.',
              ]}
            />
            <Note
              text={
                '메뉴와 저장 위치는 iOS 버전·기기에 따라 다릅니다. Apple 안내는 연결한 외장 저장장치를 예로 듭니다.\n메뉴나 저장 위치가 없으면 위의 보낼 방법에서 ‘아이폰 → Mac’을 선택합니다.'
              }
            />
            <p className="rounded-xl bg-warn-bg px-3 py-3 text-footnote leading-5 text-warn">
              사진 보관함의 선택 창은 호환 형식으로 바꾼 파일을 제공할 수 있습니다. 공유
              옵션의 ‘모든 사진 데이터’ 설정은 아래 Mac 전송 방법에서 확인합니다.
            </p>
          </Section>
        )}
        {route === 'airdrop' && (
          <Section title="AirDrop으로 원본 옮기기">
            <Steps
              items={[
                '사진 앱에서 영상을 선택하고 공유를 누릅니다.',
                '위쪽의 ‘옵션’을 누릅니다.',
                '목록 아래쪽의 ‘모든 사진 데이터’를 켭니다.\n원본 파일과 촬영·편집 정보를 함께 전달하는 설정입니다.',
                '형식 선택이 있으면 ‘현재’를 선택한 뒤 ‘완료’를 누릅니다.\n호환 형식으로 변환하는 것을 피합니다.',
                'AirDrop으로 Mac에 보냅니다.',
                'Mac에서 받은 원본 영상 파일(.MOV)을 확인합니다.\n함께 받은 .AAE 편집 정보 파일이나 편집본은 선택하지 않습니다.',
                'Mac에서 이 링크를 열고 설정한 이름과 비밀번호로 접속한 뒤 원본 파일을 선택합니다.',
              ]}
            />
            <Note text={MENU_NOTE} />
            <details className="text-footnote leading-5 text-muted">
              <summary className="py-2">‘모든 사진 데이터’ 설정 안내</summary>
              <p>
                이 설정은 아이폰의 공유 옵션에 있습니다. 웹페이지에서 켤 수 없으며 공유
                대상에 따라 보이지 않거나 적용되지 않을 수 있습니다. 다른 앱이나 웹 선택
                창이 원본을 제공한다는 보장은 아닙니다.
              </p>
            </details>
          </Section>
        )}
        {route === 'other' && (
          <Section title="촬영 원본 파일 선택">
            <Steps
              items={[
                '갤러리·내 파일 또는 컴퓨터에서 120fps 이상으로 촬영한 원본을 찾습니다.',
                '다른 기기로 옮겨야 하면 퀵 셰어·케이블 등으로 원본 파일을 복사합니다.',
                '이 링크의 영상 선택에서 해당 원본 파일을 고릅니다.',
              ]}
            />
            <Note text="메신저로 전송하거나 편집·내보내기 과정에서 압축한 파일은 사용할 수 없습니다." />
          </Section>
        )}
        <Section title="전송 전 확인">
          <Points
            items={[
              'iCloud에 있는 영상은 기기에 내려받기가 끝난 뒤 선택합니다.',
              '파일이 한도보다 크면 압축하지 않고 담당자에게 다른 접수 방법을 문의합니다.',
            ]}
          />
        </Section>
        <details className="border-t border-line pt-2 text-footnote leading-5 text-muted">
          <summary className="py-2 font-semibold text-ink">
            원본과 전송 확인 표시의 차이
          </summary>
          <Points
            items={[
              '프레임 수는 파일에 기록된 정보이며 카메라 원본이라는 증명은 아닙니다.',
              '‘선택한 파일 그대로 전송됨’은 서버가 파일 전체를 비교한 뒤 표시합니다. 선택 창이 처음 제공한 파일이 카메라 원본인지까지 증명하지는 않습니다.',
            ]}
          />
        </details>
      </div>
    </Modal>
  );
}
