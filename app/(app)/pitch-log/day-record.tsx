'use client';

import { isPhoneVideoPath, phoneVideoElsewhereText } from '@/lib/local-video';
import { formatSpeed } from '@/lib/units';
import { useSpeedUnit } from '@/components/use-units';
import { Pencil, Trash2, VideoOff } from 'lucide-react';
import { Badge, Card } from '@/components/ui';
import { PitchVideoPlayer } from '@/components/pitch-video-player';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import { ConfirmDelete } from '@/components/confirm-delete';
import type { Log } from './types';

/**
 * 기록 한 건을 통째로 보여준다 — 수치, 느낀점, 영상. 읽을 것을 먼저 둔다(수치 · 느낀점 · 그다음 영상).
 *
 * 영상마다 붙던 '폼 분석'(관절 추출 · 지표)은 2026-10-10 뺐다 — 사용자: "투구 분석 기능을 추가해서 폼 분석은 없애".
 * 저장돼 있던 분석(PoseAnalysis 표)은 DB 에 그대로 남는다.
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
  onDelete: (id: string) => void;
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

  return (
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
                  {log.maxVelocity}
                  <span className="ml-1 text-sm text-muted">km/h 최고</span>
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
                  <Badge>강도 {log.intensity}/10</Badge>
                  {log.satisfaction != null && <Badge>만족도 {log.satisfaction}/5</Badge>}
                  {log.avgVelocity != null && (
                    <Badge>평균 {formatSpeed(log.avgVelocity, speedUnit)}</Badge>
                  )}
                </>
              )}
            </div>
          </div>
          {/* 휴대폰은 두 단추를 44px 로 키우고 사이를 띄운다 — 32px 가 붙어 있어 연필을 누르려다 휴지통을 눌렀다(PC 는 그대로, 2026-10-03) */}
          <div className="flex shrink-0 items-center gap-3 desk:gap-1">
            <button
              type="button"
              onClick={() => onEdit(log)}
              aria-label="기록 수정"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-sky desk:h-8 desk:w-8"
            >
              <Pencil className="h-4 w-4" />
            </button>
            {/*
            휴지통이 연필 바로 옆이라 잘못 누르기 쉽다. 게다가 기록만이 아니라
            올려둔 영상까지 저장소에서 영구히 사라진다. 무엇이 없어지는지
            이름을 대고 한 번 묻는다.
          */}
            <ConfirmDelete
              onConfirm={() => onDelete(log.id)}
              ariaLabel="기록 삭제"
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
                  <p className="text-muted">
                    되돌릴 수 없어요. 수치만 고치실 거라면 옆의 연필을 눌러주세요.
                  </p>
                </div>
              }
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-bg hover:text-danger desk:h-8 desk:w-8"
            >
              <Trash2 className="h-4 w-4" />
            </ConfirmDelete>
          </div>
        </div>

        {/*
        그날의 느낀점 — 영상보다 위에 둔다.

        지난 기록을 다시 열어 보는 이유는 대개 "그날 뭐라고 적어놨더라"이지
        영상을 다시 보려는 것이 아니다. 그런데 영상이 사이에 있어
        화면을 세 판쯤 내려야 닿았다.
      */}
        <div
          className={`rounded-xl border p-4 ${
            log.memo ? 'border-sky-soft/40 bg-sky/[0.04]' : 'border-line bg-surface-2'
          }`}
        >
          <p className="text-xs font-medium tracking-normal text-sky">그날의 느낀점</p>
          {log.memo ? (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/90">
              {log.memo}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">남긴 메모가 없어요.</p>
          )}
          {/* 투구 만족도와 같이 고른 감각(lib/pitch-satisfaction.ts) */}
          {(
            [
              ['좋았던 것', log.cuesGood],
              ['아쉬웠던 것', log.cuesBad],
            ] as const
          ).map(
            ([title, cues]) =>
              cues.length > 0 && (
                <p key={title} className="mt-2 text-xs text-muted">
                  {title} <span className="text-ink/80">{cues.join(' · ')}</span>
                </p>
              )
          )}
        </div>
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
      ) : rested ? null : (
        <p className="flex items-center gap-2 rounded-xl empty-well px-4 py-5 text-sm text-muted">
          <VideoOff className="h-4 w-4" />이 기록에는 영상이 없어요
        </p>
      )}
    </Card>
  );
}

