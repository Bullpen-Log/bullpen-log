'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui';
import { FileFacts, VideoPreview } from '@/components/intake/file-summary';
import { CaptureNeeds, OriginalTips } from '@/components/intake/guides';
import { RearFrame, SideFrame } from '@/components/intake/illustrations';
import { SIZE_HELP_TEXT, type Picked } from '@/components/intake/pick';
import { FieldError, HelpButton, NoteBox, PrimaryButton, Screen } from '@/components/intake/shell';
import { FILL_BUTTON, FileButton, LINK_BUTTON, PickStatus, useFocusOnPick } from '@/components/intake/slots';
import { formatBytes, type IntakeLimits } from '@/lib/intake/limits';
import type { IntakeView } from '@/lib/intake/state';

/* ── 1 환영 ── */
export function WelcomeStep({ onStart, onCapture, onOriginal, inKakao }: { onStart: () => void; onCapture: () => void; onOriginal: () => void; inKakao: boolean }) {
  return (
    <Screen
      screenKey="welcome"
      title="투구 영상 두 개를 보내시겠어요?"
      desc={'옆과 뒤에서 동시에 촬영한 슬로 모션 원본 영상 두 개를 받습니다.\n앱 설치나 회원가입은 필요하지 않습니다.'}
      actions={<PrimaryButton onClick={onStart}>시작하기</PrimaryButton>}
    >
      <div className="flex items-end justify-center gap-4 rounded-2xl bg-surface px-4 py-5">
        <figure className="w-[58%]">
          <SideFrame className="w-full" />
          <figcaption className="mt-1.5 text-center text-footnote text-muted">옆에서</figcaption>
        </figure>
        <figure className="w-[30%]">
          <RearFrame className="w-full" />
          <figcaption className="mt-1.5 text-center text-footnote text-muted">뒤에서</figcaption>
        </figure>
      </div>
      <p className="text-sm leading-relaxed break-keep text-ink">같은 투구 한 번을 두 대의 폰으로 동시에, 슬로 모션 120fps 이상으로 촬영한 영상이 필요합니다.</p>
      <CaptureNeeds />
      <div className="flex flex-col items-start">
        <HelpButton onClick={onCapture}>촬영 방법 보기</HelpButton>
        <HelpButton onClick={onOriginal}>원본 영상 선택 방법</HelpButton>
      </div>
      {inKakao && <NoteBox>카카오톡 안에서도 보낼 수 있습니다. 영상이 선택되지 않으면 Safari나 Chrome에서 이 링크를 여십시오.</NoteBox>}
    </Screen>
  );
}

/* ── 2 이름 ── */
export function NameStep({
  initial,
  prefilled = false,
  busy,
  error,
  onBack,
  onNext,
}: {
  initial: string;
  /** 처음 입력한 내 이름으로 채워 둔 칸 — 보내는 분과 선수가 다를 수 있어 고치라고 말한다 */
  prefilled?: boolean;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onNext: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  const [local, setLocal] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus({ preventScroll: true }), []);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return setLocal('선수 이름을 입력하십시오.');
    if ([...trimmed].length > 40) return setLocal('이름은 40자 이하로 입력하십시오.');
    setLocal(null);
    onNext(trimmed);
  };
  const shown = local ?? error;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Screen
        screenKey="name"
        title="영상 속 선수의 이름은 무엇인가요?"
        desc="접수된 영상의 선수별 영상 이름 정리에 사용됩니다."
        step={1}
        onBack={onBack}
        focusTitle={false}
        actions={
          <PrimaryButton type="submit" busy={busy}>
            다음
          </PrimaryButton>
        }
      >
        <div className="space-y-2">
          <label htmlFor="athlete-name" className="sr-only">
            선수 이름
          </label>
          <Input
            ref={input}
            id="athlete-name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="next"
            placeholder="이름"
            maxLength={80}
            aria-invalid={shown ? true : undefined}
            aria-describedby={shown ? 'athlete-name-error' : undefined}
            className="py-3.5 text-subhead aria-invalid:border-danger"
          />
          {shown && <FieldError id="athlete-name-error">{shown}</FieldError>}
          {prefilled && !shown && <p className="text-footnote leading-5 break-keep text-muted">이 링크에 들어올 때 입력한 이름을 넣어 두었습니다. 보내는 분과 선수가 다르면 선수 이름으로 고치십시오. 선수 이름을 고쳐도 이 링크에 들어올 때 쓰는 이름과 PIN 은 바뀌지 않습니다.</p>}
        </div>
      </Screen>
    </form>
  );
}

/* ── 3 · 4 영상 ── */
const VIDEO_COPY: Record<IntakeView, { title: string; desc: string; pick: string; tips: string[] }> = {
  side: {
    title: '옆에서 촬영한 영상은 어느 것인가요?',
    desc: '투수의 옆모습과 전신이 보이는 슬로 모션 120fps 이상 원본을 선택하십시오.',
    pick: '옆 영상 선택',
    tips: ['폰을 가로로 두고 촬영한 영상', '발끝부터 머리, 손까지 보이는 영상'],
  },
  rear: {
    title: '뒤에서 촬영한 영상은 어느 것인가요?',
    desc: '같은 투구를 뒤에서 동시에 촬영한 슬로 모션 120fps 이상 원본을 선택하십시오.',
    pick: '뒤 영상 선택',
    tips: ['옆 영상과 같은 투구를 동시에 촬영한 영상', '폰을 세로로 두고 투수 뒤에서 촬영한 영상'],
  },
};

export function VideoStep({
  view,
  picked,
  inspecting,
  error,
  limits,
  onPick,
  onBack,
  onNext,
  onOriginal,
  hand = null,
  extra,
}: {
  view: IntakeView;
  picked: Picked | null;
  inspecting: boolean;
  error: string | null;
  limits: IntakeLimits;
  /** 던지는 손을 이미 알면 그림을 그쪽으로 — 왼손이면 좌우를 뒤집는다 */
  hand?: 'R' | 'L' | null;
  onPick: (file: File) => void;
  onBack: () => void;
  onNext: () => void;
  onOriginal: () => void;
  extra?: ReactNode;
}) {
  const copy = VIDEO_COPY[view];
  const errorId = `pick-error-${view}`;
  /* 고르기 단추가 사라지므로 다음 단추로 옮긴다. 막혔으면 다시 고를 수 있게 고르기 단추로 */
  const next = useRef<HTMLButtonElement>(null);
  const pickButton = useRef<HTMLButtonElement>(null);
  useFocusOnPick(picked, next);
  useEffect(() => {
    if (error) pickButton.current?.focus({ preventScroll: true });
  }, [error]);
  return (
    <Screen
      screenKey={`video-${view}`}
      title={copy.title}
      desc={copy.desc}
      step={view === 'side' ? 2 : 3}
      onBack={onBack}
      actions={
        picked ? (
          <>
            <PrimaryButton ref={next} onClick={onNext} disabled={inspecting}>
              이 영상으로 계속
            </PrimaryButton>
          </>
        ) : (
          <FileButton buttonRef={pickButton} label={inspecting ? '영상을 살펴보는 중' : copy.pick} onFile={onPick} className={FILL_BUTTON} disabled={inspecting} describedBy={error ? errorId : undefined} />
        )
      }
    >
      <PickStatus picked={picked} />
      {picked ? (
        <div className="space-y-3">
          <VideoPreview url={picked.url} />
          <FileFacts name={picked.file.name} size={picked.file.size} facts={picked.facts} />
          <FileButton buttonRef={pickButton} label="다른 영상 선택" onFile={onPick} className={`-ml-2 ${LINK_BUTTON}`} disabled={inspecting} describedBy={error ? errorId : undefined} />
        </div>
      ) : (
        <>
          <div className="flex justify-center rounded-2xl bg-surface px-4 py-5">
            {view === 'side' ? <SideFrame flip={hand === 'L'} className="w-[70%]" /> : <RearFrame flip={hand === 'L'} className="w-[38%]" />}
          </div>
          <ul className="space-y-1.5 text-sm leading-relaxed break-keep text-ink">
            {copy.tips.map((t) => (
              <li key={t} className="flex gap-2">
                <span aria-hidden className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <OriginalTips />
          <div className="space-y-1 text-footnote leading-5 break-keep text-muted">
            <p>
              영상 하나는 {formatBytes(limits.maxFileBytes)}까지, 두 영상을 합쳐 {formatBytes(limits.maxTotalBytes)}까지 보낼 수 있습니다.
            </p>
            <p>한도보다 커도 {SIZE_HELP_TEXT}</p>
          </div>
        </>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
      <HelpButton onClick={onOriginal}>원본 영상 선택 방법</HelpButton>
      {extra}
    </Screen>
  );
}
