'use client';

import { useState } from 'react';
import { Button, Field, Input, Textarea } from '@/components/ui';
import { VideoUpload, type UploadedVideo } from '@/components/video-upload';
import { FilmingGuide } from '@/components/filming-guide';
import { IntensityGuide } from '@/components/intensity-guide';
import {
  DEFAULT_SESSION_TYPE,
  SESSION_TYPES,
  isRestSession,
} from '@/lib/session-type';

/**
 * 하루치 투구를 남기는 입력 폼. 새로 남길 때와 고칠 때 모두 쓴다.
 *
 * 일지 화면에서 접었다 펼 수 있게 따로 뒀다. 지난 기록을 돌아볼 때는
 * 폼이 자리만 차지하고, 오늘 던진 걸 남길 때는 바로 열려 있어야 한다.
 */

const EMPTY_FORM = {
  sessionType: DEFAULT_SESSION_TYPE as string,
  pitchCount: '',
  intensity: '5',
  maxVelocity: '',
  avgVelocity: '',
  memo: '',
};

/** 고칠 기록. 주어지면 수정 모드가 된다. */
export type EntryDraft = {
  id: string;
  sessionType: string;
  pitchCount: number;
  intensity: number;
  maxVelocity: number | null;
  avgVelocity: number | null;
  memo: string | null;
};

export function EntryForm({
  date,
  initial,
  onSaved,
  onError,
  onCancel,
}: {
  date: string;
  /** 주어지면 등록이 아니라 수정 폼이 된다. */
  initial?: EntryDraft;
  onSaved: () => Promise<void> | void;
  onError: (message?: string) => void;
  onCancel?: () => void;
}) {
  const editing = Boolean(initial);

  const [form, setForm] = useState(() =>
    initial
      ? {
          sessionType: initial.sessionType,
          pitchCount: String(initial.pitchCount),
          intensity: String(initial.intensity),
          maxVelocity: initial.maxVelocity == null ? '' : String(initial.maxVelocity),
          avgVelocity: initial.avgVelocity == null ? '' : String(initial.avgVelocity),
          memo: initial.memo ?? '',
        }
      : EMPTY_FORM
  );
  const [videos, setVideos] = useState<UploadedVideo[]>([]);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    onError(undefined);

    try {
      const res = await fetch('/api/pitch-log', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editing ? { id: initial!.id } : { date, videoPaths: videos.map((v) => v.path) }),
          sessionType: form.sessionType,
          pitchCount: form.pitchCount,
          intensity: form.intensity,
          maxVelocity: form.maxVelocity,
          avgVelocity: form.avgVelocity,
          memo: form.memo,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? (editing ? '수정에 실패했습니다.' : '저장에 실패했습니다.'));
      }

      // 수정은 폼을 비우지 않는다. 저장하면 폼 자체가 닫히기 때문이다.
      if (!editing) {
        setForm(EMPTY_FORM);
        videos.forEach((v) => URL.revokeObjectURL(v.previewUrl));
        setVideos([]);
      }
      await onSaved();
    } catch (err) {
      const fallback = editing ? '수정에 실패했습니다.' : '저장에 실패했습니다.';
      onError(err instanceof Error ? err.message : fallback);
    } finally {
      setSaving(false);
    }
  };

  const resting = isRestSession(form.sessionType);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Field
        label="투구 종류"
        hint={SESSION_TYPES.find((t) => t.name === form.sessionType)?.hint}
      >
        <div className="mt-1 flex flex-wrap gap-2">
          {SESSION_TYPES.map((t) => {
            const active = form.sessionType === t.name;
            return (
              <button
                key={t.name}
                type="button"
                onClick={() => setForm({ ...form, sessionType: t.name })}
                aria-pressed={active}
                className={`rounded-xl border px-4 py-2 text-sm transition-colors ${
                  active
                    ? 'border-sky bg-sky/10 font-semibold text-sky-strong'
                    : 'border-line bg-surface-2 text-muted hover:border-sky-soft hover:text-ink'
                }`}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      </Field>

      {/*
        쉰 날에는 투구수·강도·구속 칸을 감춘다.
        안 던졌는데 "투구수를 입력하세요"라고 하면 남길 수가 없다.
      */}
      {!resting && (
      <>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="투구수">
          <Input
            type="number"
            min="1"
            value={form.pitchCount}
            onChange={(e) => setForm({ ...form, pitchCount: e.target.value })}
            placeholder="45"
            required
          />
        </Field>
        <Field label={`투구 강도 — ${form.intensity} / 10`}>
          <input
            type="range"
            min="1"
            max="10"
            value={form.intensity}
            onChange={(e) => setForm({ ...form, intensity: e.target.value })}
            className="mt-3 w-full accent-[#0ea5e9]"
          />
          {/*
            강도는 부하 지수와 필요한 휴식일을 정하는 값이라, 감으로 찍으면
            그 뒤 계산이 전부 흔들린다. 고르는 자리 바로 옆에 기준을 둔다.
          */}
          <div className="mt-3">
            <IntensityGuide />
          </div>
        </Field>
      </div>

      {/*
        구속은 둘 다 선택 항목이다.

        예전에는 최고 구속이 필수였는데, 스피드건이 없는 선수는 그것 때문에
        기록을 아예 못 남겼다. 기록이 없으면 부하 지수도 트레이닝도 돌지
        않으니 앱이 통째로 멈추는 셈이었다. 부하는 투구수 × 강도로 내므로
        구속이 없어도 계산은 그대로 된다.
      */}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="최고 구속 (km/h)" hint="스피드건이 없으면 비워두세요.">
          <Input
            type="number"
            step="0.1"
            min="1"
            value={form.maxVelocity}
            onChange={(e) => setForm({ ...form, maxVelocity: e.target.value })}
            placeholder="138"
          />
        </Field>
        <Field label="평균 구속 (km/h)" hint="비워두셔도 됩니다.">
          <Input
            type="number"
            step="0.1"
            min="1"
            value={form.avgVelocity}
            onChange={(e) => setForm({ ...form, avgVelocity: e.target.value })}
            placeholder="132"
          />
        </Field>
      </div>
      </>
      )}

      {/*
        영상은 새로 남길 때만 올린다. 고칠 때 영상을 빼면 그 영상에 붙은
        폼 분석이 주인 없이 남으므로, 영상을 바꿔야 하면 지우고 다시 남긴다.
      */}
      {!editing && !resting && (
        <Field
          label="투구 영상"
          hint="폰이나 컴퓨터에 있는 영상을 바로 올릴 수 있습니다."
        >
          <div className="space-y-3">
            {/* 올리기 전에 촬영 조건을 한 번 보고 가도록 바로 위에 둔다. */}
            <FilmingGuide />
            <VideoUpload videos={videos} onChange={setVideos} max={2} />
          </div>
        </Field>
      )}

      <Field label={resting ? '메모' : '특이사항 · 느낀점'}>
        <Textarea
          rows={4}
          value={form.memo}
          onChange={(e) => setForm({ ...form, memo: e.target.value })}
          placeholder={
            resting
              ? '어깨가 뻐근해서 쉼'
              : '릴리즈 포인트가 일정했고 5회부터 팔이 무거워짐'
          }
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving} className="w-full sm:w-auto">
          {saving
            ? '저장 중…'
            : editing
              ? '수정 저장'
              : `${date} 기록 저장`}
        </Button>
        {editing && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-muted transition-colors hover:text-ink"
          >
            취소
          </button>
        )}
      </div>
    </form>
  );
}
