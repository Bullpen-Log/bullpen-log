'use client';

import { isPhoneVideoPath, phoneVideoElsewhereText } from '@/lib/local-video';
import { formatSpeed, round1, speedLabel, toSpeed } from '@/lib/units';
import { useSpeedUnit } from '@/components/use-units';
import { useState } from 'react';
import { Ellipsis, Pencil, Trash2 } from '@/components/icon';
import { Badge, Card } from '@/components/ui';
import { Modal } from '@/components/modal';
import { PitchVideoPlayer } from '@/components/pitch-video-player';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import { effortText } from '@/lib/pitch-effort';
import { ConfirmDialog } from '@/components/confirm-delete';
import type { Log } from './types';

/**
 * 기록 한 건을 통째로 보여준다 — 수치, 느낀점, 영상. 읽을 것을 먼저 둔다(수치 · 느낀점 · 그다음 영상).
 *
 * 영상마다 붙던 '폼 분석'(관절 추출 · 지표)은 2026-10-10 뺐다 — 사용자: "투구 분석 기능을 추가해서 폼 분석은 없애".
 * 예전에 저장돼 있던 분석(PoseAnalysis 표)은 2026-10-16 에 표째 지웠다(쓰는 곳이 없었다).
 */
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 2026-08-28 → 8월 28일 (금) */
function spokenDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`;
}

export function DayRecord({
  log,
  date,
  playbackUrls,
  urlsPending,
  onEdit,
  onDelete,
}: {
  log: Log;
  date: string;
  playbackUrls: Record<string, string>;
  /** 재생 주소를 아직 받아오는 중인가 */
  urlsPending: boolean;
  onEdit: (log: Log) => void;
  onDelete: (id: string) => void | Promise<void>;
}) {
  /* 구속을 보여줄 단위. 저장은 늘 km/h 다(lib/units.ts). */
  const speedUnit = useSpeedUnit();
  /*
   * 안 던진 날로 남긴 기록.
   *
   * 투구수도 강도도 0인데 그대로 그리면 "0구 · 강도 0/10"이 되어, 형편없는
   * 훈련을 한 날처럼 보인다. 쉰 것은 아무것도 안 한 것이 아니라 계획의 일부다.
   */
  const rested = log.sessionType === REST_SESSION_TYPE;

  /*
   * 넓은 화면에서 영상이 있으면 두 칸 — 왼쪽에 수치와 느낀점, 오른쪽에 영상.
   * 한 줄로 쌓으면 폭 가득 커진 영상(16:9) 하나가 500px 넘게 차지해, 수치를 보고 영상을
   * 보려면 굴려야 했다. 나란히 두면 한 화면에 다 들어온다.
   */
  const split = log.videoPaths.length > 0;
  /* 고치기 · 지우기는 ⋯ 한 단추 → 동작 시트(2026-10-15 사용자 "투구 파트도 우리 시스템에 맞게") — 예전 연필 · 휴지통 원 둘이 카드 머리를 차지했다 */
  const [menuOpen, setMenuOpen] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const cues = (
    [
      ['좋았던 것', log.cuesGood],
      ['아쉬웠던 것', log.cuesBad],
    ] as const
  ).filter(([, c]) => c.length > 0);

  return (
    <>
    <Card
      className={
        split
          ? 'space-y-5 lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start lg:gap-6 lg:space-y-0'
          : 'space-y-5'
      }
    >
      <div className="space-y-5">
        {/* 그날의 수치 */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/*
            구속을 안 적은 기록도 있다(스피드건이 없는 경우). 그때는 빈칸을
            내지 말고 투구수를 대신 크게 보여준다 — 그날 한 일이 없어 보이면
            기록을 남길 마음이 안 든다.
          */}
            <p className="text-numeric text-2xl leading-none text-sky">
              {rested ? (
                <span className="text-muted">쉬는 날</span>
              ) : log.maxVelocity != null ? (
                <>
                  {round1(toSpeed(log.maxVelocity, speedUnit))}
                  <span className="ml-1 text-sm text-muted">{speedLabel(speedUnit)} 최고</span>
                </>
              ) : (
                <>
                  {log.pitchCount}
                  <span className="ml-1 text-sm text-muted">구</span>
                </>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {rested ? (
                <Badge>던지지 않았어요</Badge>
              ) : (
                <>
                  <Badge className="border-sky-soft/60 font-semibold text-sky-strong">
                    {log.sessionType}
                  </Badge>
                  <Badge>{log.pitchCount}구</Badge>
                  {effortText(log) && <Badge>강도 {effortText(log)}</Badge>}
                  {log.satisfaction != null && <Badge>만족도 {log.satisfaction}/5</Badge>}
                  {log.avgVelocity != null && (
                    <Badge>평균 {formatSpeed(log.avgVelocity, speedUnit)}</Badge>
                  )}
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="기록 고치기 · 지우기"
            className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-ink/6 hover:text-ink active:bg-ink/10 desk:h-8 desk:w-8 desk:rounded-lg"
          >
            <Ellipsis aria-hidden className="h-5 w-5 desk:h-4 desk:w-4" />
          </button>
        </div>

        {/*
        그날의 느낀점 — 영상보다 위에 둔다.

        지난 기록을 다시 열어 보는 이유는 대개 "그날 뭐라고 적어놨더라"이지
        영상을 다시 보려는 것이 아니다. 그런데 영상이 사이에 있어
        화면을 세 판쯤 내려야 닿았다.
      */}
        {/* 남긴 것이 없으면 빈 상자를 그리지 않는다 — 예전 '남긴 메모가 없어요' 상자가 기록마다 한 칸을 썼다 */}
        {(log.memo || cues.length > 0) && (
          <div className="rounded-xl bg-sky/[0.05] p-4 desk:border desk:border-sky-soft/40">
            <p className="text-xs font-medium tracking-normal text-sky">그날의 느낀점</p>
            {log.memo && (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/90">
                {log.memo}
              </p>
            )}
            {/* 투구 만족도와 같이 고른 감각(lib/pitch-satisfaction.ts) */}
            {cues.map(([title, list]) => (
              <p key={title} className="mt-2 text-xs text-muted">
                {title} <span className="text-ink/80">{list.join(' · ')}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* 영상 */}
      {log.videoPaths.length > 0 ? (
        <div className="grid gap-5">
          {log.videoPaths.map((path, i) => (
            <div key={path} className="space-y-2">
              {log.videoPaths.length > 1 && (
                <p className="text-xs font-medium text-muted">영상 {i + 1}</p>
              )}
              {playbackUrls[path] ? (
                <PitchVideoPlayer
                  src={playbackUrls[path]}
                  label={`${date} 투구 영상 ${i + 1}`}
                />
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-xl border border-line bg-surface-2 text-xs text-muted">
                  {urlsPending
                    ? '불러오는 중…'
                    : isPhoneVideoPath(path)
                      ? phoneVideoElsewhereText()
                      : '영상을 불러올 수 없어요'}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </Card>

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title={rested ? '쉬는 날' : `${log.sessionType} ${log.pitchCount}구`}>
        <div className="overflow-hidden rounded-2xl bg-ink/5 desk:border desk:border-line desk:bg-transparent">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onEdit(log);
            }}
            className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-base font-medium text-ink transition-colors active:bg-ink/8 desk:min-h-11 desk:text-sm desk:hover:bg-surface-2"
          >
            <Pencil aria-hidden className="h-5 w-5 text-sky desk:h-4 desk:w-4" />
            기록 고치기
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setAskDelete(true);
            }}
            className="flex min-h-14 w-full items-center gap-3 border-t border-line px-4 text-left text-base font-medium text-danger transition-colors active:bg-ink/8 desk:min-h-11 desk:text-sm desk:hover:bg-danger-bg"
          >
            <Trash2 aria-hidden className="h-5 w-5 desk:h-4 desk:w-4" />
            기록 지우기
          </button>
        </div>
      </Modal>

      {/*
        올려둔 영상까지 저장소에서 영구히 사라진다. 무엇이 없어지는지 이름을 대고 한 번 묻는다.
      */}
      <ConfirmDialog
        open={askDelete}
        onClose={() => setAskDelete(false)}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await onDelete(log.id);
            setAskDelete(false);
          } finally {
            setDeleting(false);
          }
        }}
        title="이 기록을 지울까요?"
        detail={
          <div className="space-y-2">
            <p>
              <strong className="text-ink">
                {spokenDate(date)} ·{' '}
                {rested ? '쉬는 날' : `${log.sessionType} ${log.pitchCount}구`}
              </strong>
            </p>
            {log.videoPaths.length > 0 && (
              <p className="text-warn">
                올려둔 영상 {log.videoPaths.length}개도 함께 지워져요.
              </p>
            )}
            <p className="text-muted">되돌릴 수 없어요. 수치만 고치려면 기록 고치기를 눌러주세요.</p>
          </div>
        }
        confirmLabel="지우기"
        pending={deleting}
      />
    </>
  );
}

