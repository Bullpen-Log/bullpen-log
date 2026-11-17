'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GUIDE_CHAPTERS, PICK_LABEL, isAppleTouch } from './file-picker';
import { VideoStep } from './guided-steps';
import { GuidePlayer } from './guide-player';
import { IntakeDialog } from './intake-dialog';
import { FieldError, HelpButton, PrimaryButton, Screen } from './shell';
import { FileButton, FILL_BUTTON, VIEW_LABEL } from './slots';
import {
  nativeOriginalAvailable,
  originalRequest,
  pickNativeOriginal,
} from './native-original';
import { type Preparation, type PreparationStage } from './preparation-state';
import type { Picked, RejectedPick } from './pick';
import type { IntakeLimits } from '@/lib/intake/limits';
import styles from './experience.module.css';

/** Add the new recordings here after capture. Absent assets never generate video requests. */
export const GALLERY_GUIDES: readonly {
  title: string;
  body: string;
  video?: string;
  poster?: string;
}[] = [
  {
    title: '사진 접근 허용',
    body: '‘다음’을 눌러 사진 접근을 허용합니다. ‘선택한 사진’만 허용한다면 보낼 영상을 포함합니다.',
  },
  {
    title: '갤러리에서 원본 선택',
    body: '120fps 이상으로 촬영한 영상을 고릅니다. iCloud에 있는 원본은 내려받기가 끝날 때까지 기다립니다.',
  },
];
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
      reserveShareCorner={index === 0}
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
  const [help, setHelp] = useState(false);
  const [opening, setOpening] = useState(false);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const selection = useRef({ generation: 0, pending: false });
  useEffect(() => {
    const current = selection.current;
    current.generation++;
    return () => {
      current.generation++;
      if (current.pending) {
        current.pending = false;
        void originalRequest('cancel').catch(() => undefined);
      }
    };
  }, []);
  const label = VIEW_LABEL[p.view];
  const gallery = p.route === 'gallery';
  const available = nativeOriginalAvailable();
  const busy = inspecting || opening;
  const authorizeAndNext = async () => {
    if (busy) return;
    const generation = selection.current.generation;
    setNativeError(null);
    setOpening(true);
    try {
      const allowed = await originalRequest('authorize');
      if (selection.current.generation !== generation) return;
      if (allowed !== true)
        setNativeError(
          '사진 접근이 허용되지 않았습니다. 설정에서 허용하거나 도움말에서 파일 방식으로 변경합니다.'
        );
      else onStage('select');
    } catch {
      if (selection.current.generation === generation)
        setNativeError(
          '사진 접근을 확인하지 못했습니다. 파일 방식으로 변경하거나 다시 시도합니다.'
        );
    } finally {
      if (selection.current.generation === generation) setOpening(false);
    }
  };
  const chooseOriginal = async () => {
    if (busy) return;
    setNativeError(null);
    setOpening(true);
    const generation = selection.current.generation;
    selection.current.pending = true;
    try {
      const file = await pickNativeOriginal();
      if (file && selection.current.generation === generation) onPick(file);
    } catch (e) {
      if (selection.current.generation === generation)
        setNativeError(
          e instanceof Error
            ? e.message
            : '원본을 선택하지 못했습니다. 다시 시도합니다.'
        );
    } finally {
      if (selection.current.generation === generation) {
        selection.current.pending = false;
        setOpening(false);
      }
    }
  };
  const fileRoute = () =>
    onRoute(
      isAppleTouch({
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
      })
        ? 'apple'
        : 'other'
    );
  if (p.stage === 'method')
    return (
      <Screen
        screenKey={`prepare-${p.view}-method`}
        title="어떤 방법으로 영상을 보낼까요?"
        progress={`${label} 준비`}
        onBack={onBack}
      >
        <p className="text-sm leading-6 text-muted">
          두 방법 모두 촬영한 원본을 보냅니다.
          <br />
          120fps 이상의 영상이 필요합니다.
        </p>
        <div className="space-y-3">
          <button
            type="button"
            onClick={fileRoute}
            className="w-full rounded-2xl border border-line p-5 text-left focus-visible:outline-2 focus-visible:outline-sky"
          >
            <span className="block text-base font-semibold">파일에서 보내기</span>
            <span className="mt-2 block text-sm leading-6 text-muted">
              원본을 파일 앱에 저장한 뒤 선택합니다.
              <br />앱 설치 없이 진행할 수 있습니다.
            </span>
          </button>
          <button
            type="button"
            onClick={() => onRoute('gallery')}
            className="w-full rounded-2xl border border-line p-5 text-left focus-visible:outline-2 focus-visible:outline-sky"
          >
            <span className="block text-base font-semibold">
              앱에서 갤러리 원본 보내기
            </span>
            <span className="mt-2 block text-sm leading-6 text-muted">
              아이폰 사진 보관함에서 직접 선택합니다.
              <br />
              원본 선택을 지원하는 싱커 앱이 필요합니다.
            </span>
          </button>
        </div>
      </Screen>
    );
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
        onOriginal={() => onStage('method')}
        onPrepare={() => onStage('select')}
        hand={hand}
        preparationProgress={`${label} 준비 · 3/3`}
        replacementLabel={gallery ? '갤러리에서 다른 원본 선택' : undefined}
        extra={extra}
      />
    );

  const selecting = p.stage === 'select' || p.route === 'other';
  const chapter = gallery
    ? GALLERY_GUIDES[selecting ? 1 : 0]
    : GUIDE_CHAPTERS[selecting ? 1 : 0];
  const appNeeded = gallery && !available;
  const token = typeof window === 'undefined' ? '' : window.location.hash.slice(1);
  const appLink = /^[A-Za-z0-9_-]{43}$/.test(token) ? `sinker://intake#${token}` : null;
  const shownError = error ?? nativeError;
  const title = appNeeded
    ? '앱에서 갤러리 원본 보내기'
    : selecting && !gallery
      ? `저장한 ${label} 선택`
      : chapter.title;
  return (
    <>
      <Screen
        screenKey={`prepare-${p.view}-${p.route}-${p.stage}`}
        title={title}
        guideHeader={!appNeeded}
        progress={`${label} 준비 · ${selecting ? 2 : 1}/3`}
        onBack={onBack}
        fill
        headerAction={<HelpButton onClick={() => setHelp(true)}>도움말</HelpButton>}
        actions={
          <div className={appNeeded || gallery ? 'space-y-2' : styles.guideFooter}>
            <p className={styles.guideTask}>
              {appNeeded
                ? '앱으로 이동한 뒤 같은 이름과 비밀번호를 입력합니다.'
                : chapter.body}
            </p>
            {appNeeded ? (
              <>
                {appLink && (
                  <a
                    href={appLink}
                    className={`${FILL_BUTTON} flex min-h-12 items-center justify-center`}
                  >
                    앱에서 계속
                  </a>
                )}
                <HelpButton onClick={fileRoute}>파일에서 보내기</HelpButton>
              </>
            ) : selecting ? (
              gallery ? (
                <PrimaryButton onClick={() => void chooseOriginal()} disabled={busy}>
                  {opening
                    ? '원본을 준비하는 중'
                    : inspecting
                      ? '파일을 확인하는 중'
                      : '갤러리에서 원본 선택'}
                </PrimaryButton>
              ) : (
                <FileButton
                  label={inspecting ? '파일을 확인하는 중' : PICK_LABEL}
                  onFile={onPick}
                  className={FILL_BUTTON}
                  disabled={busy}
                  describedBy={shownError ? 'preparation-error' : undefined}
                />
              )
            ) : (
              <PrimaryButton
                onClick={() => (gallery ? void authorizeAndNext() : onStage('select'))}
                disabled={busy}
              >
                {opening ? '사진 접근 확인 중' : '다음'}
              </PrimaryButton>
            )}
          </div>
        }
      >
        {appNeeded ? (
          <div className="flex min-h-0 flex-1 items-center rounded-xl bg-ink/3 p-5 text-sm leading-7 text-muted">
            <p>
              이 방법은 원본 선택 기능이 포함된 아이폰 앱에서 진행합니다.
              <br />
              <br />
              앱이 열리지 않거나 업데이트가 필요하면 파일 방식을 사용합니다.
              <br />
              이미 선택한 파일은 앱으로 자동 이동하지 않습니다.
            </p>
          </div>
        ) : !gallery && p.route === 'apple' ? (
          <div className={styles.guideStage}>
            <PreparationVideo
              key={`${p.view}-${p.stage}`}
              index={selecting ? 1 : 0}
              paused={help}
            />
          </div>
        ) : gallery && chapter.video ? (
          <div className={styles.guideStage}>
            <GuidePlayer
              key={`${p.view}-${p.stage}`}
              src={chapter.video}
              poster={chapter.poster}
              title={chapter.title}
              paused={help}
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center whitespace-pre-line rounded-xl bg-ink/3 p-5 text-sm leading-7 text-muted">
            <p>
              {gallery
                ? selecting
                  ? '‘갤러리에서 원본 선택’을 누릅니다.\n보낼 영상 한 개를 선택한 뒤 추가합니다.'
                  : '사진 보관함의 촬영 원본을 직접 가져옵니다.\n편집 내용은 적용하지 않고 원본 파일을 사용합니다.'
                : '120fps 이상으로 촬영한 원본 파일을 준비합니다.'}
            </p>
          </div>
        )}
        {shownError && <FieldError id="preparation-error">{shownError}</FieldError>}
        {selecting && picked && (
          <div className={styles.guideNote}>
            <p className="truncate">선택한 원본: {picked.file.name}</p>
            <HelpButton onClick={() => onStage('confirm')}>
              이전 파일 계속 사용
            </HelpButton>
          </div>
        )}
        {busy && (
          <p role="status" className={styles.guideNote}>
            {opening
              ? '사진 선택 또는 iCloud 원본 준비를 기다리고 있습니다.'
              : '파일의 프레임과 크기를 확인하고 있습니다.'}
          </p>
        )}
      </Screen>
      <IntakeDialog open={help} onClose={() => setHelp(false)} title="원본 준비 도움말">
        <HelpButton
          onClick={() => {
            onStage('method');
            setHelp(false);
          }}
        >
          보내는 방법 다시 선택
        </HelpButton>
        {gallery ? (
          <>
            <p>
              사진 접근을 거부했거나 원본을 가져올 수 없으면 아이폰 설정에서 이 앱의
              사진 접근을 확인합니다. 제한된 접근에서는 보낼 영상을 포함해야 합니다.
            </p>
            <p>
              앱은 사진 보관함의 원본 영상 파일을 가져옵니다. 메신저 등에서 받은
              저프레임 파일을 선택해도 촬영 원본으로 복구되지는 않습니다.
            </p>
            <HelpButton
              onClick={() => {
                fileRoute();
                setHelp(false);
              }}
            >
              파일 방식으로 변경
            </HelpButton>
          </>
        ) : (
          <>
            <HelpButton
              onClick={() => {
                onRoute('apple');
                setHelp(false);
              }}
            >
              아이폰 원본 저장 안내
            </HelpButton>
            <p>
              사진 앱의 공유 → 옵션에서 ‘모든 사진 데이터’를 켭니다. ‘무수정 원본
              내보내기’로 파일 앱에 저장한 뒤 선택합니다.
            </p>
            <h3 className="font-semibold">Mac으로 원본 옮기기</h3>
            <p>
              공유 → 옵션에서 ‘모든 사진 데이터’를 켭니다. 형식 선택이 있으면 ‘현재’를
              고른 뒤 AirDrop으로 전송합니다. Mac에서 같은 링크를 열고 받은 영상 파일을
              선택합니다.
            </p>
            <HelpButton
              onClick={() => {
                onRoute('other');
                setHelp(false);
              }}
            >
              안드로이드·컴퓨터에서 보내기
            </HelpButton>
          </>
        )}
        {extra}
      </IntakeDialog>
    </>
  );
}
