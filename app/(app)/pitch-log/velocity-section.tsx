'use client';

import { addTransitionType, useState, useTransition, type ComponentProps } from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { Camera, ChevronRight, Loader2, Play, RotateCw, Trash2 } from 'lucide-react';
import { quietRefresh } from '@/lib/quiet-refresh';
import { QUIET_REFRESH } from '@/lib/transition-types';
import { ConfirmDialog } from '@/components/confirm-delete';
import { formatSpeed, speedLabel, toSpeed } from '@/lib/units';
import { useSpeedUnit } from '@/components/use-units';
import { applyCalibration, calibrationText } from '@/lib/velocity-calibration';
import {
  CONFIDENCE_TEXT,
  pitchTypeLabel,
  sessionSetupText,
  summarize,
  zoneLabel,
  type PitchClipView,
  type PitchEdit,
  type VelocityPitchView,
  type VelocitySessionView,
} from '@/lib/velocity-meta';
import {
  BottomSheet,
  PitchEditorFields,
  ZoneGrid,
} from '@/components/velocity/pitch-editor';
import { ClipPlayer } from '@/components/velocity/clip-player';
import { PitchResultDialog } from '@/components/velocity/pitch-result';
import { useStoredSetup } from '@/components/velocity/velocity-settings';
import { DEFAULT_SETUP, type CameraPos } from '@/lib/velocity-setup';
import {
  deleteVelocityPitch,
  deleteVelocitySession,
  updateVelocityPitch,
} from '@/app/actions/velocity';

/**
 * 그날 화면의 '구속 측정' — 카메라로 잰 세션과 공들을 보고, 고치고, 지운다.
 *
 * 투구 기록 한 건(투구수 · 최고 · 평균)은 위의 기록 카드에 있고, 여기는 그 안의 공 하나하나다.
 * 공을 지우면 서버가 그 기록의 투구수 · 구속도 다시 맞춘다(app/actions/velocity.ts).
 *
 * 공(줄 · ▶)을 누르면 잰 직후의 결과 화면처럼 연다 — 그 공의 영상을 되풀이하며 공 길을 파란 관으로 따라 그리고 구속 · 구종을 보인다
 * (사용자 2026-10-07: "결과 목록에서 측정 직후처럼"). 고치기(구종 · 코스 · 결과 · 스피드건 · 메모)는 그 화면 오른쪽 위 연필 → 아래 시트.
 * 시트에서는 설정 '영상에 스트라이크 존 표시'(기기별)가 켜져 있으면 잰 순간의 존과 고르는 중인 코스 칸을 겹친다.
 */
/*
 * 세션 시각 — 한국 시간으로 적는다. 이 칸은 서버(UTC)에서도 그려져, 기기 시각(getHours)을 쓰면 서버 글자와 폰 글자가
 * 달라 맞추기(hydration)가 어긋났다.
 */
const TIME_KST = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function VelocitySection({ sessions }: { sessions: VelocitySessionView[] }) {
  const router = useRouter();
  const unit = useSpeedUnit();
  const [editing, setEditing] = useState<VelocityPitchView | null>(null);
  /* 잰 직후처럼 보는 공 — 구종을 바꾸면 화면에 바로(서버는 뒤에서) */
  const [viewing, setViewing] = useState<VelocityPitchView | null>(null);
  /* ▶ 로 열었으면 영상을 바로 돌린다 */
  const [autoPlay, setAutoPlay] = useState(false);
  /*
   * 못 불러온 영상 주소(서명 주소는 한 시간짜리 — 화면을 오래 켜 두면 만료된다). 공이 아니라 주소로 쥔다 — '다시 불러오기'가
   * 새 주소를 받아 오면 저절로 풀려 새 주소로 붙는다(공으로 쥐면 옛 주소로 먼저 다시 붙어 곧바로 또 실패했다).
   */
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  /* 같은 주소가 다시 오면(잠깐 끊긴 것) 재생기를 새로 붙이려고 — 영상 key 에 섞는다 */
  const [retry, setRetry] = useState(0);
  const [reloading, startReload] = useTransition();
  /* 광각 영상은 펼쳤을 때만 그린다 — 접혀 있어도 video 가 붙어 있으면 받기 시작한다 */
  const [wideOpen, setWideOpen] = useState(false);
  const clipZone = useStoredSetup()?.clipZone ?? DEFAULT_SETUP.clipZone;
  const [draft, setDraft] = useState<PitchEdit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  /* 지우기 전에 묻는 창(앱에서 window.confirm 은 영어 'Cancel/OK') — 무엇을 지우는지 */
  const [ask, setAsk] = useState<
    { kind: 'pitch' } | { kind: 'session'; session: VelocitySessionView } | null
  >(null);
  const speedNum = (kmh: number) => Math.round(toSpeed(kmh, unit) * 10) / 10;
  /*
   * 릴리스 추정도 구속과 같은 보정식으로(그 세션에 박힌 식 — 보정을 껐던 세션은 ×1 +0). 예전에는 구속만 보정되고 릴리스는
   * 보정 전 값이라 둘을 견줄 수 없었다(김민 2026-09-30).
   */
  const releaseOf =
    (s: { calScale: number; calOffset: number; calPairs: number }) => (kmh: number) =>
      s.calPairs > 0
        ? applyCalibration(kmh, {
            scale: s.calScale,
            offset: s.calOffset,
            n: s.calPairs,
          })
        : kmh;
  const editingSession = editing
    ? sessions.find((s) => s.pitches.some((p) => p.id === editing.id))
    : undefined;
  /* 영상은 지금 자료에서 읽는다 — 주소가 만료돼 다시 받으면 새 주소로 바뀐다(editing 은 연 때의 사본) */
  const editingClip = editing
    ? (editingSession?.pitches.find((p) => p.id === editing.id) ?? editing)
    : null;
  const editingCameraPos: CameraPos =
    editingSession?.cameraPos === 'behind-catcher'
      ? 'behind-catcher'
      : 'behind-pitcher';
  const hasClips = sessions.some((s) => s.pitches.some((p) => p.clip));
  const editingRelease = editingSession
    ? releaseOf(editingSession)
    : (kmh: number) => kmh;

  if (sessions.length === 0) return null;

  /* 신호가 끊겨 서버 액션이 던지면 — 전환 안의 오류가 오류 화면으로 넘어가지 않게 실패로 바꾼다 */
  const offline = (err: unknown) => {
    unstable_rethrow(err);
    return {
      ok: false as const,
      error: '신호가 약해 서버에 닿지 못했어요. 신호가 잡히면 다시 눌러 주세요.',
    };
  };

  const open = (p: VelocityPitchView, play = false) => {
    setEditing(p);
    setAutoPlay(play);
    setWideOpen(false);
    setDraft({
      pitchType: p.pitchType,
      zone: p.zone,
      result: p.result,
      gunKmh: p.gunKmh,
      memo: p.memo,
    });
    setError(null);
  };
  const close = () => {
    setEditing(null);
    setDraft(null);
  };

  const save = () => {
    if (!editing || !draft) return;
    start(async () => {
      const res = await updateVelocityPitch(editing.id, draft).catch(offline);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      close();
      quietRefresh(router);
    });
  };

  const removePitch = () => {
    if (!editing) return;
    setAsk({ kind: 'pitch' });
  };
  const doRemovePitch = () => {
    if (!editing) return;
    setAsk(null);
    start(async () => {
      const res = await deleteVelocityPitch(editing.id).catch(offline);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      close();
      quietRefresh(router);
    });
  };

  const removeSession = (s: VelocitySessionView) => {
    setAsk({ kind: 'session', session: s });
  };
  const doRemoveSession = (s: VelocitySessionView) => {
    setAsk(null);
    start(async () => {
      const res = await deleteVelocitySession(s.id).catch(offline);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      quietRefresh(router);
    });
  };

  /*
   * 영상 주소를 다시 받는다 — 화면 자료를 조용히 새로 받으며, 같은 전환 안에서 실패 표시를 지워 새 주소와 함께 한 번에 그린다.
   * 받는 동안 단추가 돈다.
   */
  const reloadClips = () => {
    startReload(() => {
      addTransitionType(QUIET_REFRESH);
      router.refresh();
      setFailedUrls([]);
      setRetry((n) => n + 1);
    });
  };

  /* 영상 하나 — 못 불러왔으면 그 자리에 '다시 불러오기' */
  const clipBox = (
    clip: PitchClipView,
    player: Omit<ComponentProps<typeof ClipPlayer>, 'src' | 'eventSec' | 'onError'>
  ) =>
    failedUrls.includes(clip.url) ? (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface-2 px-4 py-6 text-center">
        <p role="status" className="text-xs leading-relaxed text-muted">
          영상을 불러오지 못했어요. 화면을 오래 켜 두면 영상 주소가 만료돼요.
        </p>
        <button
          type="button"
          onClick={reloadClips}
          disabled={reloading}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-line disabled:opacity-60"
        >
          {reloading ? (
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCw aria-hidden className="h-4 w-4" />
          )}
          다시 불러오기
        </button>
      </div>
    ) : (
      <ClipPlayer
        key={`${clip.url}#${retry}`}
        src={clip.url}
        eventSec={clip.eventSec}
        onError={() =>
          setFailedUrls((u) => (u.includes(clip.url) ? u : [...u, clip.url]))
        }
        {...player}
      />
    );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="inline-flex items-center gap-1.5 font-bold text-ink">
          <Camera aria-hidden className="h-4 w-4 text-sky" />
          구속 측정
        </h2>
        <span className="text-xs text-muted">
          {hasClips
            ? '공을 누르면 잰 직후처럼 영상으로 봐요. 연필로 고쳐요'
            : '줄을 누르면 구종 · 코스 · 결과를 고쳐요'}
        </span>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-danger-line bg-danger-bg px-4 py-2 text-xs text-danger"
        >
          {error}
        </p>
      )}

      {sessions.map((s) => {
        const stats = summarize(s.pitches);
        const release = releaseOf(s);
        const at = new Date(s.createdAt);
        const cal = calibrationText({
          scale: s.calScale,
          offset: s.calOffset,
          n: s.calPairs,
        });
        return (
          <div
            key={s.id}
            className="overflow-hidden rounded-2xl border border-line bg-surface"
          >
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2.5 text-xs text-muted">
              <span className="font-semibold text-ink tabular-nums">
                {TIME_KST.format(at)}
              </span>
              <span>
                {s.source === 'file' ? '영상 파일' : '카메라'} · {sessionSetupText(s)}
              </span>
              {stats && (
                <span>
                  {stats.n}구 · 최고{' '}
                  <b className="text-ink">{formatSpeed(stats.max, unit)}</b> · 평균{' '}
                  <b className="text-ink">{formatSpeed(stats.avg, unit)}</b>
                  {stats.strikeRate != null && ` · 스트라이크 ${stats.strikeRate}%`}
                  {stats.spreadCm != null && ` · 릴리스 흩어짐 ${stats.spreadCm}cm`}
                </span>
              )}
              <span className="ml-auto">
                화각 {s.fovDeg}° · {cal ? `보정 ${cal}` : '보정 없음'}
              </span>
              <button
                type="button"
                onClick={() => removeSession(s)}
                disabled={pending}
                aria-label="이 세션 지우기"
                className="-mr-1 rounded-lg p-1.5 text-muted transition-colors hover:bg-danger-bg hover:text-danger disabled:opacity-50"
              >
                <Trash2 aria-hidden className="h-3.5 w-3.5" />
              </button>
            </header>

            <ul className="divide-y divide-line">
              {s.pitches.map((p) => (
                <li key={p.id} className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => (p.clip ? setViewing(p) : open(p))}
                    className={`flex min-h-12 min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left transition-colors hover:bg-surface-2 ${
                      p.clip ? 'pr-2' : 'pr-4'
                    }`}
                  >
                    <span className="w-5 text-xs text-muted tabular-nums">{p.seq}</span>
                    <span className="text-display w-16 text-xl leading-none tabular-nums text-ink">
                      {speedNum(p.kmh)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {pitchTypeLabel(p.pitchType) ?? (
                          <span className="text-muted">구종 —</span>
                        )}
                        {p.result === 'strike' && (
                          <span className="ml-1.5 text-ok">S</span>
                        )}
                        {p.result === 'ball' && (
                          <span className="ml-1.5 text-warn">B</span>
                        )}
                        {p.memo && (
                          <span className="ml-2 font-normal text-muted">{p.memo}</span>
                        )}
                      </span>
                      <span className="block break-keep text-xs leading-snug text-muted">
                        {zoneLabel(p.zone) ?? '코스 —'} ·{' '}
                        {CONFIDENCE_TEXT[p.confidence]}
                        {p.releaseKmh != null &&
                          ` · 릴리스 추정 ${speedNum(release(p.releaseKmh))}`}
                        {p.gunKmh != null && ` · 건 ${speedNum(p.gunKmh)}`}
                      </span>
                    </span>
                    <ZoneGrid value={p.zone} size="sm" />
                    {/* 영상이 있는 줄은 › 대신 ▶ 가 그 자리 — 휴대폰에서 글 칸이 좁아지지 않게 */}
                    {!p.clip && (
                      <ChevronRight aria-hidden className="h-4 w-4 text-line-strong" />
                    )}
                  </button>
                  {p.clip && (
                    <button
                      type="button"
                      onClick={() => setViewing(p)}
                      aria-label={`${p.seq}번째 공 영상 보기`}
                      className="group flex w-13 shrink-0 items-center justify-center pr-1 transition-colors hover:bg-surface-2"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky/10 text-sky transition-colors group-hover:bg-sky group-hover:text-white">
                        <Play aria-hidden className="ml-0.5 h-4 w-4 fill-current" />
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {viewing &&
        (() => {
          const v = viewing;
          const vs = sessions.find((x) => x.pitches.some((q) => q.id === v.id));
          /* 영상 주소는 지금 자료에서 — 만료돼 다시 받으면 새 주소 */
          const clip = vs?.pitches.find((q) => q.id === v.id)?.clip ?? v.clip;
          const rel = vs ? releaseOf(vs) : (kmh: number) => kmh;
          const setType = (pitchType: string | null) => {
            setViewing({ ...v, pitchType });
            start(async () => {
              const res = await updateVelocityPitch(v.id, {
                pitchType,
                zone: v.zone,
                result: v.result,
                gunKmh: v.gunKmh,
                memo: v.memo,
              }).catch(offline);
              if (!res.ok) setError(res.error);
              else quietRefresh(router);
            });
          };
          return (
            <PitchResultDialog
              pitchKey={v.id}
              index={v.seq}
              speed={speedNum(v.kmh)}
              unit={speedLabel(unit)}
              sub={`± ${speedNum(v.errorKmh)} · ${CONFIDENCE_TEXT[v.confidence]}${
                v.releaseKmh != null ? ` · 릴리스 ${speedNum(rel(v.releaseKmh))}` : ''
              }${v.gunKmh != null ? ` · 건 ${speedNum(v.gunKmh)}` : ''}`}
              notes={error ? [error] : []}
              clip={
                clip
                  ? {
                      url: clip.url,
                      offset: v.replay?.offset ?? 0,
                      alignRange: v.replay?.alignRange ?? 0.15,
                    }
                  : null
              }
              trail={v.replay?.points ?? null}
              frame={v.replay?.frame ?? null}
              cameraPos={
                vs?.cameraPos === 'behind-catcher' ? 'behind-catcher' : 'behind-pitcher'
              }
              pitchType={v.pitchType}
              onPitchType={setType}
              onClose={() => setViewing(null)}
              onNext={() => setViewing(null)}
              nextLabel="닫기"
              onEdit={() => {
                setViewing(null);
                open(v);
              }}
            />
          );
        })()}

      <BottomSheet
        open={editing != null}
        onClose={close}
        title={
          editing ? `${editing.seq}번째 공 · ${formatSpeed(editing.kmh, unit)}` : '공'
        }
      >
        {editing && draft && (
          <div className="space-y-5">
            {/* 영상 — 고르는 중인 코스 칸이 바로 밝아진다 */}
            {editingClip?.clip &&
              clipBox(editingClip.clip, {
                zoneRect: editingClip.zoneRect,
                zone: draft.zone,
                cameraPos: editingCameraPos,
                showZone: clipZone,
                autoPlay,
                maxHeight: '40dvh',
              })}
            <PitchEditorFields value={draft} onChange={setDraft} />
            {/* 저장 · 지우기 실패 — 시트가 위의 오류 줄을 덮으니 여기에도 */}
            {error && (
              <p
                role="alert"
                className="rounded-xl border border-danger-line bg-danger-bg px-4 py-2 text-xs text-danger"
              >
                {error}
              </p>
            )}
            {/* 광각 — 같은 공을 앱이 광각 카메라로 함께 찍은 것. 화각이 달라 존은 안 겹친다. 펼칠 때 받는다 */}
            {editingClip?.wideClip && (
              <details
                open={wideOpen}
                onToggle={(e) => setWideOpen(e.currentTarget.open)}
                className="group rounded-2xl bg-surface-2"
              >
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  <Play aria-hidden className="h-3.5 w-3.5 fill-current text-sky" />
                  광각 영상
                  <ChevronRight
                    aria-hidden
                    className="ml-auto h-4 w-4 text-muted transition-transform duration-200 motion-safe:group-open:rotate-90"
                  />
                </summary>
                {wideOpen && (
                  <div className="px-3 pb-3">
                    {clipBox(editingClip.wideClip, {
                      zoneRect: null,
                      cameraPos: editingCameraPos,
                      showZone: false,
                      maxHeight: '40dvh',
                    })}
                  </div>
                )}
              </details>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-2xl bg-surface-2 px-4 py-3 text-xs">
              <Row
                label="카메라 값(보정 전)"
                value={`${speedNum(editing.rawKmh)} ${speedLabel(unit)}`}
              />
              <Row
                label="릴리스 구속 추정"
                value={
                  editing.releaseKmh != null
                    ? `${speedNum(editingRelease(editing.releaseKmh))} ${speedLabel(unit)}`
                    : '—'
                }
              />
              <Row
                label="릴리스 포인트"
                value={
                  editing.releaseDxCm != null && editing.releaseDyCm != null
                    ? `${editing.releaseDxCm > 0 ? '오른쪽' : '왼쪽'} ${Math.abs(editing.releaseDxCm)}cm · ${
                        editing.releaseDyCm > 0 ? '위' : '아래'
                      } ${Math.abs(editing.releaseDyCm)}cm`
                    : '—'
                }
              />
              <Row
                label="날아간 구간"
                value={
                  editing.travelM != null
                    ? `${editing.travelM}m · ${editing.durationSec ?? '?'}초`
                    : '—'
                }
              />
              <Row
                label="프레임"
                value={`${editing.frames ?? '?'}장${editing.fps != null ? ` · ${Math.round(editing.fps)}fps` : ''}`}
              />
              <Row
                label="오차"
                value={`± ${speedNum(editing.errorKmh)} ${speedLabel(unit)}`}
              />
            </dl>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={removePitch}
                disabled={pending}
                aria-label="이 공 지우기"
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-danger-bg text-danger transition-colors hover:bg-danger-line/60 disabled:opacity-50"
              >
                <Trash2 aria-hidden className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-sky text-[15px] font-bold text-white transition-colors hover:bg-sky-strong disabled:opacity-50"
              >
                {pending && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
                저장
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      <ConfirmDialog
        open={ask !== null}
        onClose={() => setAsk(null)}
        onConfirm={() => {
          if (ask?.kind === 'pitch') doRemovePitch();
          else if (ask?.kind === 'session') doRemoveSession(ask.session);
        }}
        title={
          ask?.kind === 'session' ? '이 측정 세션을 지울까요?' : '이 공을 지울까요?'
        }
        detail={
          ask?.kind === 'session'
            ? `${ask.session.pitches.length}구를 통째로 지워요. 같이 만든 투구 기록도 지워지고 되돌릴 수 없어요.`
            : '투구 기록의 투구수와 구속도 다시 맞춰져요. 되돌릴 수 없어요.'
        }
        confirmLabel={ask?.kind === 'session' ? '세션 지우기' : '공 지우기'}
        pending={pending}
      />
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="text-right tabular-nums text-ink">{value}</dd>
    </>
  );
}
