'use client';

import { useState } from 'react';
import { FileVideo } from '@/components/icon';
import { formatBytes } from '@/lib/intake/limits';
import { fpsLabel, timingNote, type IntakeMediaFacts } from '@/lib/intake/media';

/** 사람이 읽는 영상 사실 — 파일에 적힌 값이다. 원본이라는 증명으로 쓰지 않는다 */
export function factLines(facts: IntakeMediaFacts | null): string[] {
  if (!facts) return ['영상 정보 확인 필요'];
  const out = [fpsLabel(facts)];
  if (facts.width && facts.height) {
    const turned = facts.rotation === 90 || facts.rotation === 270;
    out.push(turned ? `${facts.height}×${facts.width}` : `${facts.width}×${facts.height}`);
  }
  if (facts.sampleDurationSec != null) out.push(`표본 시간 ${facts.sampleDurationSec.toFixed(1)}초`);
  return out;
}

/**
 * 고른 영상 미리보기. 소리 없이 멈춘 채로 뜨고, 저절로 안 돈다.
 * 브라우저가 못 푸는 영상(HEVC · MOV 일부)은 안내만 한다 — 파일은 그대로 보낼 수 있다.
 */
export function VideoPreview({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-ink/5 px-4 py-5 text-footnote leading-5 text-muted">
        <FileVideo aria-hidden className="h-6 w-6 shrink-0" />
        <p className="break-keep">이 브라우저에서는 미리 볼 수 없습니다. 영상은 그대로 보낼 수 있습니다.</p>
      </div>
    );
  }
  return (
    <video
      key={url}
      src={`${url}#t=0.001`}
      controls
      muted
      playsInline
      preload="metadata"
      aria-label="고른 영상 미리보기"
      onError={() => setFailed(true)}
      onLoadedMetadata={(e) => {
        /* 소리만 풀리고 그림은 못 푸는 브라우저가 있다 */
        if (e.currentTarget.videoWidth === 0) setFailed(true);
      }}
      className="max-h-[42dvh] w-full rounded-2xl bg-black object-contain"
    />
  );
}

/** 파일 이름 · 크기 · 사실 */
export function FileFacts({ name, size, facts }: { name: string; size: number; facts: IntakeMediaFacts | null }) {
  const note = facts ? timingNote(facts) : null;
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-ink">{name}</p>
      <p className="mt-0.5 text-footnote text-muted">{[formatBytes(size), ...factLines(facts)].join(' · ')}</p>
      {note && <p className="mt-0.5 text-footnote text-muted">{note}</p>}
    </div>
  );
}
