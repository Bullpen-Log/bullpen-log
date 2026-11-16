'use client';

import { useState } from 'react';
import { IntakeDialog } from './intake-dialog';
import { GuidePlayer } from './guide-player';
import { GUIDE_CHAPTERS } from './file-picker';
import styles from './experience.module.css';

export function OriginalFileGuide({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <IntakeDialog open={open} onClose={onClose} title="원본 저장 방법" fill>
      {open && <GuideBody onClose={onClose} />}
    </IntakeDialog>
  );
}

/** 시작 전 도움말도 실제 준비 화면과 같은 플레이어를 쓴다. */
export function GuideBody({
  onClose,
  initial = 0,
}: {
  onClose: () => void;
  initial?: number;
}) {
  const [at, setAt] = useState(initial);
  const chapter = GUIDE_CHAPTERS[at];
  return (
    <div className={styles.guideBody}>
      <h3 className="text-sm font-semibold">
        {at + 1} / {GUIDE_CHAPTERS.length} · {chapter.title}
      </h3>
      <div className={styles.guideStage}>
        <GuidePlayer
          key={chapter.id}
          src={chapter.video}
          poster={chapter.poster}
          title={chapter.title}
          reserveShareCorner={at === 0}
        />
      </div>
      <p className={styles.guideTask}>{chapter.body}</p>
      <div className={styles.guideNav}>
        <button type="button" disabled={at === 0} onClick={() => setAt(at - 1)}>
          이전
        </button>
        <button
          type="button"
          onClick={() => (at === GUIDE_CHAPTERS.length - 1 ? onClose() : setAt(at + 1))}
        >
          {at === GUIDE_CHAPTERS.length - 1 ? '닫기' : '다음'}
        </button>
      </div>
    </div>
  );
}
