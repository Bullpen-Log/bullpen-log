'use client';

import { useState, useSyncExternalStore } from 'react';
import { RotateCw } from 'lucide-react';
import { formatSpeed } from '@/lib/units';
import { useSpeedUnit } from '@/components/use-units';
import { ClipPlayer } from '@/components/velocity/clip-player';
import { pitchTypeLabel, type DayClip } from '@/lib/velocity-meta';
import {
  DEFAULT_SETUP,
  SETUP_CHANGE_EVENT,
  loadSetup,
  type CameraPos,
} from '@/lib/velocity-setup';

/**
 * 캘린더 정보의 영상 칸 — 그날 카메라로 잰 공의 클립을 공마다 그 자리에서 튼다.
 *
 * 홈은 가장 자주 여는 화면이라 이 파일은 클립이 있는 날에만 불러온다(day-detail.tsx 의 dynamic). 재생기가 스트라이크
 * 존 그림(setup-steps.tsx)까지 끌고 오기 때문이다. 클립은 한 번에 하나 — 고른 공의 영상이 위에, 밑에 공 칩.
 * 공을 고치거나 지우는 것은 그날 화면(/pitch-log/<날짜>)에서 한다.
 */

/* 설정 '영상에 스트라이크 존 표시'(기기별 localStorage) — 설정 시트와 같은 신호로 다시 그린다 */
const subscribe = (cb: () => void) => {
  window.addEventListener('storage', cb);
  window.addEventListener(SETUP_CHANGE_EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(SETUP_CHANGE_EVENT, cb);
  };
};
const readClipZone = () => loadSetup()?.clipZone ?? DEFAULT_SETUP.clipZone;
const serverClipZone = () => DEFAULT_SETUP.clipZone;

export default function VelocityClips({
  clips,
  pickedId,
  onPick,
  onReload,
}: {
  clips: DayClip[];
  /** 고른 공 — 바깥(상세 칸)이 쥔다. 영상 주소를 다시 받느라 이 칸이 새로 그려져도 그 공에 머문다 */
  pickedId: string | null;
  onPick: (id: string) => void;
  /** 영상 주소가 만료됐을 때 — 그날 요약을 새로 받는다(새 서명 주소가 온다) */
  onReload: () => void;
}) {
  const unit = useSpeedUnit();
  const clipZone = useSyncExternalStore(subscribe, readClipZone, serverClipZone);
  const items = clips.map((c) => ({
    p: c,
    clip: c.clip,
    cameraPos: (c.cameraPos === 'behind-catcher'
      ? 'behind-catcher'
      : 'behind-pitcher') as CameraPos,
  }));
  /* 고른 칩으로 바꿨을 때만 저절로 튼다 — 칸을 열자마자 소리 없이 돌면 놀란다 */
  const [played, setPlayed] = useState(false);
  /* 못 불러온 주소 — 다시 받아 새 주소가 오면 저절로 풀린다 */
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const picked = items.find((it) => it.p.id === pickedId) ?? items[0];
  /* 캘린더는 클립이 있다는데 주소가 하나도 안 왔다(저장소 서명 실패 · 그새 지움) — 빈 칸 대신 다시 받기 */
  if (!picked) return <ReloadBox onReload={onReload} />;
  const many = items.length > 1;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted">
        구속 측정 영상 {items.length}개
      </p>

      {failedUrl === picked.clip.url ? (
        <ReloadBox onReload={onReload} />
      ) : (
        <figure className="space-y-1.5">
          <ClipPlayer
            src={picked.clip.url}
            eventSec={picked.clip.eventSec}
            zoneRect={picked.p.zoneRect}
            zone={picked.p.zone}
            cameraPos={picked.cameraPos}
            showZone={clipZone}
            autoPlay={played}
            maxHeight="50dvh"
            className="rounded-xl bg-shade"
            onError={() => setFailedUrl(picked.clip.url)}
          />
          <figcaption className="text-center text-xs text-muted tabular-nums">
            {picked.p.seq}번째 공 · {formatSpeed(picked.p.kmh, unit)}
            {pitchTypeLabel(picked.p.pitchType) &&
              ` · ${pitchTypeLabel(picked.p.pitchType)}`}
          </figcaption>
        </figure>
      )}

      {many && (
        /* 공 칩 — 휴대폰에서는 옆으로 밀어 본다 */
        <div
          role="group"
          aria-label="볼 공 고르기"
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]"
        >
          {items.map((it) => {
            const on = it === picked;
            return (
              <button
                key={it.p.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  onPick(it.p.id);
                  setPlayed(true);
                }}
                className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm tabular-nums transition-colors ${
                  on
                    ? 'border-sky bg-sky-tint font-bold text-sky'
                    : 'border-line bg-surface text-ink hover:bg-surface-2'
                }`}
              >
                <span className="text-xs text-muted">{it.p.seq}</span>
                {formatSpeed(it.p.kmh, unit)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 영상을 못 불러왔을 때 — 서명 주소가 만료됐거나 안 왔다. 그날 요약을 다시 받는다 */
function ReloadBox({ onReload }: { onReload: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-2 px-4 py-6 text-center">
      <p role="status" className="text-xs leading-relaxed text-muted">
        영상을 불러오지 못했어요. 화면을 오래 켜 두면 영상 주소가 만료돼요.
      </p>
      <button
        type="button"
        onClick={onReload}
        className="inline-flex h-10 items-center gap-1.5 rounded-full bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-line"
      >
        <RotateCw aria-hidden className="h-4 w-4" />
        다시 불러오기
      </button>
    </div>
  );
}
