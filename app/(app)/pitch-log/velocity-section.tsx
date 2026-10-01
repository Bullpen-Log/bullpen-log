'use client';

import { useState, useTransition } from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { Camera, ChevronRight, Loader2, Trash2 } from 'lucide-react';
import { quietRefresh } from '@/lib/quiet-refresh';
import { ConfirmDialog } from '@/components/confirm-delete';
import { formatSpeed, speedLabel, toSpeed } from '@/lib/units';
import { useSpeedUnit } from '@/components/use-units';
import { calibrationText } from '@/lib/velocity-calibration';
import {
  CONFIDENCE_TEXT,
  pitchTypeLabel,
  sessionSetupText,
  summarize,
  zoneLabel,
  type PitchEdit,
  type VelocityPitchView,
  type VelocitySessionView,
} from '@/lib/velocity-meta';
import {
  BottomSheet,
  PitchEditorFields,
  ZoneGrid,
} from '@/components/velocity/pitch-editor';
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
  const [draft, setDraft] = useState<PitchEdit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  /* 지우기 전에 묻는 창(앱에서 window.confirm 은 영어 'Cancel/OK') — 무엇을 지우는지 */
  const [ask, setAsk] = useState<
    { kind: 'pitch' } | { kind: 'session'; session: VelocitySessionView } | null
  >(null);
  const speedNum = (kmh: number) => Math.round(toSpeed(kmh, unit) * 10) / 10;

  if (sessions.length === 0) return null;

  /* 신호가 끊겨 서버 액션이 던지면 — 전환 안의 오류가 오류 화면으로 넘어가지 않게 실패로 바꾼다 */
  const offline = (err: unknown) => {
    unstable_rethrow(err);
    return {
      ok: false as const,
      error: '신호가 약해 서버에 닿지 못했어요. 신호가 잡히면 다시 눌러 주세요.',
    };
  };

  const open = (p: VelocityPitchView) => {
    setEditing(p);
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

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="inline-flex items-center gap-1.5 font-bold text-ink">
          <Camera aria-hidden className="h-4 w-4 text-sky" />
          구속 측정
        </h2>
        <span className="text-xs text-muted">
          카메라로 잰 공 — 누르면 구종 · 코스 · 결과를 고쳐요
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
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => open(p)}
                    className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-2"
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
                          ` · 릴리스 추정 ${speedNum(p.releaseKmh)}`}
                        {p.gunKmh != null && ` · 건 ${p.gunKmh}`}
                      </span>
                    </span>
                    <ZoneGrid value={p.zone} size="sm" />
                    <ChevronRight aria-hidden className="h-4 w-4 text-line-strong" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <BottomSheet
        open={editing != null}
        onClose={close}
        title={
          editing ? `${editing.seq}번째 공 · ${formatSpeed(editing.kmh, unit)}` : '공'
        }
      >
        {editing && draft && (
          <div className="space-y-5">
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
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-2xl bg-surface-2 px-4 py-3 text-xs">
              <Row label="카메라 값(보정 전)" value={`${editing.rawKmh} km/h`} />
              <Row
                label="릴리스 구속 추정"
                value={
                  editing.releaseKmh != null
                    ? `${speedNum(editing.releaseKmh)} ${speedLabel(unit)}`
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
              <Row label="오차" value={`± ${editing.errorKmh} km/h`} />
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
