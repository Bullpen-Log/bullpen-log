'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GUIDE_CHAPTERS, PICK_LABEL } from './file-picker';
import { VideoStep } from './guided-steps';
import { Modal } from '@/components/modal';
import { FieldError, HelpButton, NoteBox, PrimaryButton, Screen } from './shell';
import { FileButton, FILL_BUTTON, VIEW_LABEL } from './slots';
import {
  PREPARATION_STAGES,
  type Preparation,
  type PreparationStage,
} from './preparation-state';
import type { Picked, RejectedPick } from './pick';
import type { IntakeLimits } from '@/lib/intake/limits';

/** One active instruction video. Hidden/page-away videos never resume automatically. */
export function PreparationVideo({
  index,
  paused = false,
}: {
  index: number;
  paused?: boolean;
}) {
  const chapter = GUIDE_CHAPTERS[index];
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = video.current;
    const pause = () => video.current?.pause();
    const visibility = () => {
      if (document.visibilityState !== 'visible') pause();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pause);
    return () => {
      el?.pause();
      pause();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pause);
    };
  }, []);
  useEffect(() => {
    if (paused) video.current?.pause();
  }, [paused]);
  return (
    <div className="flex items-center gap-4">
      {failed ? (
        <div className="rounded-xl bg-ink/5 p-4 text-sm text-muted">
          <p>안내 영상을 불러오지 못했습니다. 아래 글을 따라 진행합니다.</p>
          <HelpButton onClick={() => setFailed(false)}>영상 다시 불러오기</HelpButton>
        </div>
      ) : (
        <video
          ref={video}
          src={chapter.video}
          poster={chapter.poster}
          controls
          muted
          playsInline
          preload="none"
          aria-label={`${chapter.title} 안내 영상`}
          onError={() => setFailed(true)}
          className={
            chapter.shape === 'wide'
              ? 'aspect-[590/328] w-full rounded-xl bg-black object-contain'
              : 'mx-auto h-[min(39dvh,19rem)] max-w-full rounded-xl bg-black object-contain'
          }
        />
      )}
    </div>
  );
}

export function PreparationStep({
  preparation: p,
  picked,
  inspecting,
  error,
  errorCode,
  rejected,
  limits,
  onStage,
  onRoute,
  onBack,
  onPick,
  onNext,
  hand,
  extra,
}: {
  preparation: Preparation;
  picked: Picked | null;
  inspecting: boolean;
  error: string | null;
  errorCode?: string | null;
  rejected?: RejectedPick | null;
  limits: IntakeLimits;
  onStage: (stage: PreparationStage) => void;
  onRoute: (route: Preparation['route']) => void;
  onBack: () => void;
  onPick: (file: File) => void;
  onNext: () => void;
  hand?: 'R' | 'L' | null;
  extra?: ReactNode;
}) {
  const [alternative, setAlternative] = useState(false);
  const index = PREPARATION_STAGES.indexOf(p.stage);
  const label = VIEW_LABEL[p.view];
  if (p.stage === 'confirm' && picked)
    return (
      <VideoStep
        view={p.view}
        picked={picked}
        inspecting={inspecting}
        error={error}
        errorCode={errorCode}
        rejected={rejected}
        limits={limits}
        onPick={onPick}
        onBack={onBack}
        onNext={onNext}
        onOriginal={() => onStage('share')}
        onPrepare={() => onStage('select')}
        hand={hand}
        preparationProgress={`${label} 준비 · 5/5`}
        extra={extra}
      />
    );
  const selecting = p.stage === 'select' || p.route === 'other';
  const title = selecting
    ? `저장한 ${label} 선택`
    : index === 0
      ? `${label}에서 공유 열기`
      : GUIDE_CHAPTERS[index].title;
  const task = selecting
    ? '이 화면에서 파일 선택을 열고 저장한 원본을 고릅니다.'
    : GUIDE_CHAPTERS[index].body;
  return (
    <>
      <Screen
        screenKey={`prepare-${p.view}-${p.route}-${p.stage}`}
        title={title}
        desc={
          selecting
            ? '120fps 이상 슬로 모션 원본 파일을 선택합니다.'
            : '사진 앱에서 해당 작업을 마친 뒤 다음을 누릅니다.'
        }
        progress={`${label} 준비 · ${selecting ? 4 : index + 1}/5`}
        step={selecting ? 4 : index + 1}
        onBack={onBack}
        actions={
          selecting ? (
            <FileButton
              label={inspecting ? '파일을 확인하는 중' : PICK_LABEL}
              onFile={onPick}
              className={FILL_BUTTON}
              disabled={inspecting}
              describedBy={error ? 'preparation-error' : undefined}
            />
          ) : (
            <PrimaryButton onClick={() => onStage(PREPARATION_STAGES[index + 1])}>
              다음
            </PrimaryButton>
          )
        }
      >
        {p.route === 'apple' && (
          <PreparationVideo
            key={`${p.view}-${p.stage}`}
            index={selecting ? 3 : index}
            paused={alternative}
          />
        )}
        <p className="text-[15px] leading-6 break-keep text-ink">{task}</p>
        {!selecting && GUIDE_CHAPTERS[index].note && (
          <p className="text-footnote leading-5 text-muted">
            {GUIDE_CHAPTERS[index].note}
          </p>
        )}
        {error && <FieldError id="preparation-error">{error}</FieldError>}
        {selecting && picked && (
          <NoteBox>
            {error
              ? '이전에 선택한 파일이 유지됩니다. 새 파일은 선택되지 않았습니다.'
              : `선택한 원본: ${picked.file.name}`}
            <HelpButton onClick={() => onStage('confirm')}>
              이전 파일 계속 사용
            </HelpButton>
          </NoteBox>
        )}
        {inspecting && (
          <p role="status" className="text-sm text-muted">
            파일의 프레임과 크기를 확인하고 있습니다.
          </p>
        )}
        <div className="flex flex-wrap gap-x-4">
          {!selecting && (
            <HelpButton onClick={() => onStage('select')}>
              원본을 이미 저장했습니다
            </HelpButton>
          )}
          {selecting && p.route === 'apple' && (
            <HelpButton onClick={() => onStage('share')}>
              원본 저장부터 다시 따라 하기
            </HelpButton>
          )}
          <HelpButton onClick={() => setAlternative(true)}>
            {p.stage === 'export' ? '이 메뉴가 보이지 않음' : '다른 전송 방법'}
          </HelpButton>
          <HelpButton onClick={() => onRoute(p.route === 'apple' ? 'other' : 'apple')}>
            {p.route === 'apple'
              ? '안드로이드·컴퓨터에서 보내기'
              : '아이폰 안내 보며 준비하기'}
          </HelpButton>
        </div>
        {extra}
      </Screen>
      <Modal
        open={alternative}
        onClose={() => setAlternative(false)}
        title="다른 원본 전송 방법"
      >
        <div className="space-y-4 text-sm leading-6 text-ink">
          <p>
            아이폰에 원본 내보내기 메뉴가 없다면 Mac으로 옮겨 이 링크에서 선택할 수
            있습니다.
          </p>
          <ol className="list-decimal space-y-3 pl-5">
            <li>사진 앱에서 원본 영상을 선택하고 공유 → 옵션을 엽니다.</li>
            <li>
              목록 아래쪽의 ‘모든 사진 데이터’를 켭니다. 형식 선택이 있으면 ‘현재’를
              고릅니다.
            </li>
            <li>
              AirDrop으로 Mac에 전송하고 받은 원본 영상 파일을 확인합니다. .AAE 편집
              정보 파일은 선택하지 않습니다.
            </li>
            <li>
              Mac에서 같은 접수 링크를 열어 설정한 이름·비밀번호로 들어간 뒤 원본을
              선택합니다.
            </li>
          </ol>
          <p className="text-footnote leading-5 text-muted">
            메뉴는 기기·버전·공유 대상에 따라 다를 수 있습니다. 이 설정이 다른 앱이나 웹
            선택 창의 원본 제공을 보장하지는 않습니다.
          </p>
          <p>
            안드로이드·컴퓨터에서는 촬영한 원본 파일을 선택합니다. 압축·편집·메신저
            전송으로 바뀐 파일은 사용하지 않습니다.
          </p>
          <HelpButton onClick={() => setAlternative(false)}>
            안내 단계로 돌아가기
          </HelpButton>
        </div>
      </Modal>
    </>
  );
}
