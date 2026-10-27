'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LibraryVideo } from '@/components/library-video';
import styles from './video-deck.module.css';

type Video = {
  id: string;
  title: string;
  category: string;
  videoPath: string | null;
  referenceVideoId: string | null;
  thumbUrl: string | null;
  aspectRatio: number | null;
};

export function HittingVideoDeck({ videos }: { videos: Video[] }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<'next' | 'previous' | null>(null);
  const video = videos[index];
  const move = (delta: number) => {
    const next = Math.max(0, Math.min(videos.length - 1, index + delta));
    if (next === index) return;
    setDirection(delta > 0 ? 'next' : 'previous');
    setIndex(next);
  };
  return (
    <section className={styles.deck} aria-label="운동 영상 카드">
      <p className="text-sm text-muted">카드를 넘기며 운동을 둘러보세요.</p>
      {video ? (
        <>
          <div className={styles.stack}>
            {videos.length > 1 && <div className={styles.backCard} aria-hidden="true" />}
            <article key={video.id} className={`${styles.card} ${direction === 'next' ? styles.next : direction === 'previous' ? styles.previous : ''}`}>
              <div className={styles.cardHeader}>
                <span>{video.category}</span><span>{index + 1} / {videos.length}</span>
              </div>
              <div className={styles.player}>
                <LibraryVideo title={video.title} path={video.videoPath} referenceVideoId={video.referenceVideoId} thumbUrl={video.thumbUrl} aspectRatio={video.aspectRatio} />
              </div>
              <div className={styles.cardTitle} aria-live="polite">
                <span>운동 영상</span><h2>{video.title}</h2>
              </div>
            </article>
          </div>
          <div className={styles.controls}>
            <button type="button" onClick={() => move(-1)} disabled={index === 0}>← 이전</button>
            <span aria-hidden="true">{index + 1} / {videos.length}</span>
            <button type="button" onClick={() => move(1)} disabled={index === videos.length - 1}>다음 →</button>
          </div>
        </>
      ) : <p className="rounded-2xl bg-surface p-5 text-sm text-muted">지금 둘러볼 수 있는 영상이 없어요.</p>}
      <Link href="/library/training" className={styles.library}>운동 영상 전체 보기 <span aria-hidden="true">›</span></Link>
    </section>
  );
}
