'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui';
import { FileFacts, VideoPreview } from '@/components/intake/file-summary';
import { FILE_FIRST_NOTE, GUIDE_OPEN_LABEL, PICK_LABEL, REPICK_LABEL } from '@/components/intake/file-picker';
import { RearFrame, SideFrame } from '@/components/intake/illustrations';
import { SIZE_HELP_TEXT, createDiagHashRun, type DiagHashState, type Picked, type RejectedPick } from '@/components/intake/pick';
import { FieldError, HelpButton, NoteBox, Paras, PrimaryButton, Screen } from '@/components/intake/shell';
import { FILL_BUTTON, FileButton, LINK_BUTTON, PickStatus, useFocusOnPick } from '@/components/intake/slots';
import { formatBytes, type IntakeLimits } from '@/lib/intake/limits';
import { pickDiagnostics } from '@/lib/intake/media';
import type { IntakeView } from '@/lib/intake/state';

/* ── 1 환영 ── */
export function WelcomeStep({
  onStart,
  onCapture,
  onOriginal,
  inKakao,
}: {
  onStart: () => void;
  onCapture: () => void;
  onOriginal: () => void;
  inKakao: boolean;
}) {
  return (
    <Screen
      screenKey="welcome"
      title="투구 영상 보내기"
      desc="3D 동작 결과를 만들기 위한 원본 영상을 접수합니다."
      actions={<PrimaryButton onClick={onStart}>시작하기</PrimaryButton>}
    >
      <div className="flex items-end justify-center gap-4 rounded-2xl bg-surface px-4 py-5">
        <figure className="w-[58%]">
          <SideFrame className="w-full" />
          <figcaption className="mt-1.5 text-center text-footnote text-muted">
            옆에서
          </figcaption>
        </figure>
        <figure className="w-[30%]">
          <RearFrame className="w-full" />
          <figcaption className="mt-1.5 text-center text-footnote text-muted">
            뒤에서
          </figcaption>
        </figure>
      </div>
      <ul className="space-y-2 text-[15px] leading-6 text-ink">
        <li>
          <strong className="font-semibold">같은 투구 1회</strong>를 옆과 뒤에서
          촬영합니다.
        </li>
        <li>
          <strong className="font-semibold">휴대폰 2대</strong>로 동시에 촬영합니다.
        </li>
        <li>
          두 영상 모두{' '}
          <strong className="font-semibold">120fps 이상 슬로 모션 원본</strong>이
          필요합니다.
        </li>
      </ul>
      <div className="flex flex-wrap items-center gap-x-4">
        <HelpButton onClick={onCapture}>촬영 방법 보기</HelpButton>
        <HelpButton onClick={onOriginal}>{GUIDE_OPEN_LABEL}</HelpButton>
      </div>
      {inKakao && (
        <NoteBox>
          {
            '카카오톡 안에서도 보낼 수 있습니다.\n영상이 선택되지 않으면 Safari나 Chrome에서 이 링크를 여십시오.'
          }
        </NoteBox>
      )}
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
        desc="접수된 영상을 선수별로 정리하는 데 사용됩니다."
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
          <label
            htmlFor="athlete-name"
            className="block text-sm font-semibold text-ink"
          >
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
          {prefilled && !shown && (
            <Paras
              text={
                '보내는 분과 선수가 다르면 선수 이름으로 변경합니다.\n접속할 때 사용하는 이름과 비밀번호는 바뀌지 않습니다.'
              }
              gap="mt-1"
              className="text-footnote leading-5 text-muted"
            />
          )}
        </div>
      </Screen>
    </form>
  );
}

/* ── 3 · 4 영상 ── */
/* 고르기 단추 이름은 file-picker.ts(R08) — 이미 고른 영상이 남아 있으면 REPICK_LABEL */
export { PICK_LABEL, REPICK_LABEL };

/** 막힌 뒤 다시 고르는 차례 — 지금 화면의 단추 이름을 그대로 넣는다(아이폰은 이 단추가 곧바로 파일 선택기를 연다) */
export const recoveryPickStep = (pickLabel: string) => `‘${pickLabel}’을 누르고 파일 앱에 저장한 영상(.MOV)을 고릅니다.`;

const VIDEO_COPY: Record<
  IntakeView,
  { title: string; desc: string; pick: string; tips: string[] }
> = {
  side: {
    title: '옆 영상 선택',
    desc: '옆에서 촬영한 120fps 이상 슬로 모션 원본을 선택합니다.',
    pick: PICK_LABEL,
    tips: ['폰을 가로로 두고 촬영한 영상', '발끝부터 머리, 손까지 보이는 영상'],
  },
  rear: {
    title: '뒤 영상 선택',
    desc: '같은 투구를 뒤에서 동시에 촬영한 120fps 이상 원본을 선택합니다.',
    pick: PICK_LABEL,
    tips: [
      '옆 영상과 같은 투구를 동시에 촬영한 영상',
      '폰을 세로로 두고 투수 뒤에서 촬영한 영상',
    ],
  },
};

export function VideoStep({
  view,
  picked,
  inspecting,
  error,
  errorCode = null,
  rejected = null,
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
  /** 막힌 까닭 — 촬영 속도(capture_rate_*)면 원본 준비 · 다시 고르기 · 파일 진단을 바로 보인다 */
  errorCode?: string | null;
  rejected?: RejectedPick | null;
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
  /* 지금 화면에 실제로 있는 고르기 단추의 이름 — 안내 글이 이 이름을 그대로 쓴다(이미 고른 영상이 있으면 REPICK_LABEL) */
  const pickLabel = picked ? REPICK_LABEL : copy.pick;
  const rateBlocked = error != null && (errorCode === 'capture_rate_low' || errorCode === 'capture_rate_unknown');
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
              다음
            </PrimaryButton>
          </>
        ) : (
          <FileButton
            buttonRef={pickButton}
            label={inspecting ? '영상을 살펴보는 중' : copy.pick}
            onFile={onPick}
            className={FILL_BUTTON}
            disabled={inspecting}
            describedBy={error ? errorId : undefined}
          />
        )
      }
    >
      <PickStatus picked={picked} />
      {picked ? (
        <div className="space-y-3">
          <VideoPreview url={picked.url} />
          <FileFacts
            name={picked.file.name}
            size={picked.file.size}
            facts={picked.facts}
          />
          <FileButton
            buttonRef={pickButton}
            label={pickLabel}
            onFile={onPick}
            className={`-ml-2 ${LINK_BUTTON}`}
            disabled={inspecting}
            describedBy={error ? errorId : undefined}
          />
        </div>
      ) : (
        <>
          <div className="flex h-32 justify-center rounded-2xl bg-surface px-4 py-3">
            {view === 'side' ? (
              <SideFrame flip={hand === 'L'} className="h-full w-auto max-w-full" />
            ) : (
              <RearFrame flip={hand === 'L'} className="h-full w-auto max-w-full" />
            )}
          </div>
          <ul className="space-y-1.5 text-sm leading-relaxed break-keep text-ink">
            {copy.tips.map((t) => (
              <li key={t} className="flex gap-2">
                <span
                  aria-hidden
                  className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-muted"
                />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-1 rounded-2xl bg-surface p-(--block-pad)">
            <p className="text-sm leading-relaxed break-keep text-ink">{FILE_FIRST_NOTE}</p>
            <HelpButton onClick={onOriginal} className="-ml-1">
              {GUIDE_OPEN_LABEL}
            </HelpButton>
          </div>
          <details className="text-footnote leading-5 text-muted">
            <summary className="font-medium">파일 용량 안내</summary>
            <div className="space-y-1 pb-2">
              <p>
                영상 하나는 {formatBytes(limits.maxFileBytes)}까지, 두 영상을 합쳐{' '}
                {formatBytes(limits.maxTotalBytes)}까지 보낼 수 있습니다.
              </p>
              <p>한도보다 커도 {SIZE_HELP_TEXT}</p>
            </div>
          </details>
        </>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
      {rateBlocked && (
        <RateRecovery
          view={view}
          rejected={rejected}
          pickLabel={pickLabel}
          onOriginal={onOriginal}
        />
      )}
      {!rateBlocked && picked && <HelpButton onClick={onOriginal}>{GUIDE_OPEN_LABEL}</HelpButton>}
      {extra}
    </Screen>
  );
}

/**
 * 촬영 속도로 막힌 뒤 바로 할 일(INTAKE-ORIGINAL-R07) — 원본 준비 방법 · 준비한 원본 다시 고르기, 그리고 이 파일에서 잰 사실(파일 진단).
 * 진단은 이 기기 화면에만 보이고 어디로도 보내지 않는다. 파일 이름 · 촬영 시각 · 기종은 넣지 않는다.
 * SHA-256 은 누를 때만 잰다(큰 파일을 그릴 때마다 읽지 않는다) — Mac 등에서 내보낸 원본의 값과 견줘 같은 파일인지 볼 때 쓴다.
 */
function RateRecovery({
  view,
  rejected,
  pickLabel,
  onOriginal,
}: {
  view: IntakeView;
  rejected: RejectedPick | null;
  /** 지금 보이는 고르기 단추의 이름 */
  pickLabel: string;
  onOriginal: () => void;
}) {
  return (
    <div className="space-y-2 rounded-2xl bg-surface p-(--block-pad)">
      <p className="text-sm font-bold text-ink">이렇게 다시 선택합니다</p>
      <ol className="list-decimal space-y-1 pl-5 text-footnote leading-5 break-keep text-ink">
        <li>사진 앱에서 이 영상을 ‘무수정 원본 내보내기’로 파일 앱에 저장합니다.</li>
        <li>{recoveryPickStep(pickLabel)}</li>
      </ol>
      <HelpButton onClick={onOriginal}>{GUIDE_OPEN_LABEL}</HelpButton>
      <p className="text-footnote leading-5 break-keep text-muted">
        다시 선택해도 다른 칸에서 고른 영상과 입력한 내용은 그대로 남습니다.
      </p>
      {rejected && <PickDiagnosis key={view} rejected={rejected} />}
    </div>
  );
}

function PickDiagnosis({ rejected }: { rejected: RejectedPick }) {
  const file = rejected.file;
  /* 재기 상태는 파일 객체에 묶는다 — 크기 · 날짜가 같은 다른 파일로 바뀌면 앞 값을 그리지 않고, 앞 재기는 멈춰 늦은 결과를 버린다 */
  const [run] = useState(() => createDiagHashRun());
  const [shaState, setShaState] = useState<DiagHashState | null>(null);
  useEffect(() => () => run.cancel(), [file, run]);
  const sha = shaState?.file === file ? shaState : null;
  const lines = pickDiagnostics(rejected.facts, file.size);
  return (
    <details className="text-footnote leading-5 text-muted">
      <summary className="py-2 font-medium">파일 진단</summary>
      <ul className="space-y-1 pb-2 break-keep">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="break-keep">
        이 값은 선택 창이 넘겨준 파일에서 읽은 것입니다. 카메라가 촬영한 속도를 직접 보여 주지는 않습니다.
      </p>
      {sha?.state === 'done' ? (
        <p className="mt-1 font-mono break-all text-ink">SHA-256 {sha.value}</p>
      ) : (
        <button
          type="button"
          className={`-ml-2 ${LINK_BUTTON}`}
          disabled={sha?.state === 'busy'}
          onClick={() => run.start(file, setShaState)}
        >
          {sha?.state === 'busy' ? `파일 지문 계산 중 ${sha.pct ?? 0}%` : '파일 지문(SHA-256) 계산'}
        </button>
      )}
      {sha?.state === 'error' && <p>파일을 읽지 못했습니다.</p>}
    </details>
  );
}
