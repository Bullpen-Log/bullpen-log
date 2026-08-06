'use client';

import { useState } from 'react';
import { Button, Field, Input, Textarea } from '@/components/ui';
import { VideoUpload, type UploadedVideo } from '@/components/video-upload';
import { FilmingGuide } from '@/components/filming-guide';
import { DEFAULT_SESSION_TYPE, SESSION_TYPES } from '@/lib/session-type';

/**
 * 하루치 투구를 남기는 입력 폼.
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

export function EntryForm({
  date,
  onSaved,
  onError,
}: {
  date: string;
  onSaved: () => Promise<void> | void;
  onError: (message?: string) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [videos, setVideos] = useState<UploadedVideo[]>([]);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    onError(undefined);

    try {
      const res = await fetch('/api/pitch-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          sessionType: form.sessionType,
          pitchCount: form.pitchCount,
          intensity: form.intensity,
          maxVelocity: form.maxVelocity,
          avgVelocity: form.avgVelocity,
          memo: form.memo,
          videoPaths: videos.map((v) => v.path),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? '저장에 실패했습니다.');
      }

      setForm(EMPTY_FORM);
      videos.forEach((v) => URL.revokeObjectURL(v.previewUrl));
      setVideos([]);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

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
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="최고 구속 (km/h)">
          <Input
            type="number"
            step="0.1"
            min="1"
            value={form.maxVelocity}
            onChange={(e) => setForm({ ...form, maxVelocity: e.target.value })}
            placeholder="138"
            required
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

      <Field label="특이사항 · 느낀점">
        <Textarea
          rows={4}
          value={form.memo}
          onChange={(e) => setForm({ ...form, memo: e.target.value })}
          placeholder="릴리즈 포인트가 일정했고 5회부터 팔이 무거워짐"
        />
      </Field>

      <Button type="submit" disabled={saving} className="w-full">
        {saving ? '저장 중…' : `${date} 기록 저장`}
      </Button>
    </form>
  );
}
