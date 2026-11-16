'use client';

import { useState, type ReactNode } from 'react';
import { GUIDE_CHAPTERS, PICK_LABEL } from './file-picker';
import { VideoStep } from './guided-steps';
import { GuidePlayer } from './guide-player';
import { IntakeDialog } from './intake-dialog';
import { FieldError, HelpButton, PrimaryButton, Screen } from './shell';
import { FileButton, FILL_BUTTON, VIEW_LABEL } from './slots';
import {
  PREPARATION_STAGES,
  type Preparation,
  type PreparationStage,
} from './preparation-state';
import type { Picked, RejectedPick } from './pick';
import type { IntakeLimits } from '@/lib/intake/limits';
import styles from './experience.module.css';

export function PreparationVideo({
  index,
  paused = false,
}: {
  index: number;
  paused?: boolean;
}) {
  const chapter = GUIDE_CHAPTERS[index];
  return (
    <GuidePlayer
      src={chapter.video}
      poster={chapter.poster}
      title={chapter.title}
      controlsTopUntil={chapter.controlsTopUntil}
      paused={paused}
    />
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
        progress={`${label} 준비 · ${selecting ? 4 : index + 1}/5`}
        step={selecting ? 4 : index + 1}
        onBack={onBack}
        fill
        headerAction={
          <HelpButton onClick={() => setAlternative(true)}>도움말</HelpButton>
        }
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
        {p.route === 'apple' ? (
          <div className={styles.guideStage}>
            <PreparationVideo
              key={`${p.view}-${p.stage}`}
              index={selecting ? 3 : index}
              paused={alternative}
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl bg-ink/3 px-5 text-sm leading-6 text-muted">
            120fps 이상으로 촬영한 원본 파일을 준비합니다.
          </div>
        )}
        <p className={styles.guideTask}>{task}</p>
        {p.stage === 'save' && GUIDE_CHAPTERS[index].note && (
          <p className={styles.guideNote}>{GUIDE_CHAPTERS[index].note}</p>
        )}
        {error && <FieldError id="preparation-error">{error}</FieldError>}
        {selecting && picked && (
          <div className={styles.guideNote}>
            <p className="truncate">선택한 원본: {picked.file.name}</p>
            <HelpButton onClick={() => onStage('confirm')}>
              이전 파일 계속 사용
            </HelpButton>
          </div>
        )}
        {inspecting && (
          <p role="status" className={styles.guideNote}>
            파일의 프레임과 크기를 확인하고 있습니다.
          </p>
        )}
      </Screen>
      <IntakeDialog
        open={alternative}
        onClose={() => setAlternative(false)}
        title="원본 준비 도움말"
      >
        <HelpButton
          onClick={() => {
            if (p.route === 'other') onRoute('apple');
            else onStage(selecting ? 'share' : 'select');
            setAlternative(false);
          }}
        >
          {p.route === 'other'
            ? '아이폰 저장 안내'
            : selecting
              ? '저장 안내 다시 보기'
              : '이미 저장한 원본 선택'}
        </HelpButton>
        <p>
          아이폰에서는 사진 앱의 ‘무수정 원본 내보내기’로 파일 앱에 저장한 뒤
          선택합니다.
        </p>
        {p.route === 'apple' && (
          <HelpButton
            onClick={() => {
              onRoute('other');
              setAlternative(false);
            }}
          >
            안드로이드·컴퓨터에서 보내기
          </HelpButton>
        )}
        <h3 className="font-semibold">Mac으로 원본 옮기기</h3>
        <ol className="list-decimal space-y-3 pl-5">
          <li>사진 앱에서 원본 영상을 선택하고 공유 → 옵션을 엽니다.</li>
          <li>
            목록 아래쪽의 ‘모든 사진 데이터’를 켭니다. 형식 선택이 있으면 ‘현재’를
            고릅니다.
          </li>
          <li>
            AirDrop으로 Mac에 전송합니다. 받은 원본 영상 파일을 사용하고 .AAE 파일은
            선택하지 않습니다.
          </li>
          <li>Mac에서 같은 접수 링크를 열고 설정한 이름·비밀번호로 들어갑니다.</li>
        </ol>
        <p>
          안드로이드·컴퓨터에서는 촬영한 원본 파일을 선택합니다. 압축·편집·메신저
          전송으로 바뀐 파일은 사용하지 않습니다.
        </p>
        {extra}
      </IntakeDialog>
    </>
  );
}
