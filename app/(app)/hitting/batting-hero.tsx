'use client';

import { useEffect, useRef } from 'react';
import styles from './batting-home.module.css';

/** 화면에 나타날 때만 장면을 불러온다. 탭 판은 다른 탭에서도 살아 있기 때문이다. */
export function BattingHero({ today, types, count, onRecord }: { today: string; types: string[]; count: number; onRecord: () => void }) {
  const host = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let cancelled = false;
    let started = false;
    let dispose: (() => void) | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || started) return;
      started = true;
      observer.disconnect();
      void import('./bat-scene').then(({ mountBat }) => {
        if (!cancelled) dispose = mountBat(node);
      }).catch(() => { /* WebGL 을 쓸 수 없으면 정적 배트를 둔다. */ });
    });
    observer.observe(node);
    return () => { cancelled = true; observer.disconnect(); dispose?.(); };
  }, []);

  const date = new Date(`${today}T12:00:00Z`);
  const dateText = `${date.getUTCMonth() + 1}.${String(date.getUTCDate()).padStart(2, '0')} · ${['일','월','화','수','목','금','토'][date.getUTCDay()]}요일`;
  return (
    <section className={styles.hero} aria-label="오늘의 타격">
      <div className={styles.heroTop}><strong>연습 기록</strong><span>{dateText}</span></div>
      <div className={styles.stage}>
        <div className={styles.heroTitle}><strong>오늘의<br />타격</strong><span>MY BATTING</span></div>
        <button ref={host} className={styles.scene} type="button" aria-label="배트와 공 돌려보기">
          <span className={`hb-fallback-bat ${styles.fallback}`} aria-hidden="true" />
        </button>
        <span className={styles.hint} aria-hidden="true">↔ 배트 돌려보기</span>
      </div>
      <p className={styles.summary}>{count > 0 ? `기록 ${count}건 · ${types.join(' · ')}` : '오늘 어떤 연습을 했나요?'}</p>
      <button className={styles.record} type="button" onClick={onRecord}>＋ 연습 기록하기</button>
    </section>
  );
}
