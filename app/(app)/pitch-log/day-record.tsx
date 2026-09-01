'use client';

import { useState } from 'react';
import { Activity, ChevronDown, Pencil, Trash2, VideoOff } from 'lucide-react';
import { Badge, Card } from '@/components/ui';
import { PitchVideoPlayer } from '@/components/pitch-video-player';
import { PoseAnalysis } from '@/components/pose-analysis';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import { ConfirmDelete } from '@/components/confirm-delete';
import type { SavedAnalysisView } from '@/lib/pose/saved';
import type { Log } from './pitch-log-client';

/**
 * 기록 한 건을 통째로 보여준다 — 수치, 느낀점, 영상, 폼 분석.
 *
 * 예전에는 수치·느낀점이 '투구기록'에, 영상·폼 분석이 '영상분석'에
 * 나뉘어 있었다. 그날 무슨 일이 있었는지 알려면 두 화면을 오가야 했는데,
 * 원래 한 기록이므로 여기서 한 번에 본다.
 *
 * 순서가 한 번 더 바뀌었다. 수치 다음에 바로 영상, 그 밑에 느낀점이었는데
 * 영상 하나에 폼 분석까지 붙으면 화면 몇 판을 잡아먹는다. 그래서 정작 그날
 * 무슨 생각을 했는지는 한참 내려가야 나왔다.
 *
 * 지금은 읽을 것을 먼저 둔다 — 수치 · 느낀점 · 그다음 영상.
 * 폼 분석은 접어 두고 누를 때 편다. 영상을 보러 온 사람은 한 번 더 누르면
 * 되지만, 기록을 되돌아보러 온 사람은 아무것도 안 눌러도 다 읽을 수 있다.
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
  heightCm,
  playbackUrls,
  urlsPending,
  savedFor,
  previousFor,
  onEdit,
  onDelete,
}: {
  log: Log;
  date: string;
  heightCm: number | null;
  playbackUrls: Record<string, string>;
  /** 재생 주소를 아직 받아오는 중인가 */
  urlsPending: boolean;
  savedFor: (videoPath: string) => SavedAnalysisView | null;
  previousFor: (date: string, videoPath: string) => SavedAnalysisView | null;
  onEdit: (log: Log) => void;
  onDelete: (id: string) => void;
}) {
  /*
   * 안 던진 날로 남긴 기록.
   *
   * 투구수도 강도도 0인데 그대로 그리면 "0구 · 강도 0/10"이 되어, 형편없는
   * 훈련을 한 날처럼 보인다. 쉰 것은 아무것도 안 한 것이 아니라 계획의 일부다.
   */
  const rested = log.sessionType === REST_SESSION_TYPE;

  /** 어느 영상의 폼 분석을 펴 두었는가. 한 번에 하나만 편다. */
  const [openPose, setOpenPose] = useState<string | null>(null);

  return (
    <Card className="space-y-5">
      {/* 그날의 수치 */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/*
            구속을 안 적은 기록도 있다(스피드건이 없는 경우). 그때는 빈칸을
            내지 말고 투구수를 대신 크게 보여준다 — 그날 한 일이 없어 보이면
            기록을 남길 마음이 안 든다.
          */}
          <p className="text-display text-2xl leading-none text-sky">
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
              <Badge>던지지 않았습니다</Badge>
            ) : (
              <>
                <Badge className="border-sky-soft/60 font-semibold text-sky-strong">
                  {log.sessionType}
                </Badge>
                <Badge>{log.pitchCount}구</Badge>
                <Badge>강도 {log.intensity}/10</Badge>
                {log.avgVelocity != null && <Badge>평균 {log.avgVelocity} km/h</Badge>}
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(log)}
            aria-label="기록 수정"
            className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-sky"
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
                    올려둔 영상 {log.videoPaths.length}개와 그 영상의 폼 분석도 함께
                    지워집니다.
                  </p>
                )}
                <p className="text-muted">
                  되돌릴 수 없습니다. 수치만 고치실 거라면 옆의 연필을 눌러주세요.
                </p>
              </div>
            }
            className="rounded-lg p-2 text-muted transition-colors hover:bg-danger-bg hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </ConfirmDelete>
        </div>
      </div>

      {/*
        그날의 느낀점 — 영상보다 위에 둔다.

        지난 기록을 다시 열어 보는 이유는 대개 "그날 뭐라고 적어놨더라"이지
        영상을 다시 보려는 것이 아니다. 그런데 영상과 폼 분석이 사이에 있어
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
          <p className="mt-2 text-sm text-muted">남긴 메모가 없습니다.</p>
        )}
      </div>

      {/* 영상과 폼 분석 */}
      {log.videoPaths.length > 0 ? (
        <div className="grid gap-5">
          {log.videoPaths.map((path, i) => (
            <div key={path} className="space-y-2">
              {log.videoPaths.length > 1 && (
                <p className="text-xs font-medium text-muted">영상 {i + 1}</p>
              )}
              {playbackUrls[path] ? (
                <>
                  <PitchVideoPlayer
                    src={playbackUrls[path]}
                    label={`${date} 투구 영상 ${i + 1}`}
                  />
                  {/*
                    폼 분석은 접어 둔다. 관절 추출·구간 지정·지표 표까지
                    펼쳐지면 영상 하나가 화면 두 판을 더 잡아먹는다.
                  */}
                  <PoseSection
                    open={openPose === path}
                    onToggle={() => setOpenPose(openPose === path ? null : path)}
                    saved={savedFor(path) != null}
                  >
                    <PoseAnalysis
                      src={playbackUrls[path]}
                      label={`${date} 투구 영상 ${i + 1}`}
                      heightCm={heightCm}
                      pitchLogId={log.id}
                      videoPath={path}
                      saved={savedFor(path)}
                      previous={previousFor(date, path)}
                    />
                  </PoseSection>
                </>
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-xl border border-line bg-surface-2 text-xs text-muted">
                  {urlsPending ? '불러오는 중…' : '영상을 불러올 수 없습니다'}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : rested ? null : (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-line px-4 py-5 text-sm text-muted">
          <VideoOff className="h-4 w-4" />이 기록에는 영상이 없습니다
        </p>
      )}
    </Card>
  );
}

/**
 * 폼 분석을 감싸는 접이식 껍데기.
 *
 * 열기 전까지는 PoseAnalysis 를 아예 그리지 않는다. 붙어만 있어도 캔버스와
 * 상태가 따라오는 무거운 화면이라, 영상 두 개짜리 기록을 열면 그것만으로
 * 화면이 버벅였다.
 */
function PoseSection({
  open,
  onToggle,
  saved,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  /** 저장해 둔 분석이 있는가 — 있으면 열어볼 값어치가 있다고 알려준다 */
  saved: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-muted transition-colors hover:text-ink"
      >
        <Activity className="h-4 w-4 shrink-0" />
        <span className="font-medium">폼 분석</span>
        {saved && (
          <span className="rounded-md bg-sky/10 px-1.5 py-0.5 text-[11px] font-medium text-sky-strong">
            저장됨
          </span>
        )}
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180 text-sky' : ''}`}
        />
      </button>
      {open && <div className="border-t border-line p-4">{children}</div>}
    </div>
  );
}
