'use client';

import { useCallback, useMemo, useState } from 'react';
import { Trash2, Video } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormError,
  Input,
  PageHeading,
  Textarea,
} from '@/components/ui';
import { VideoUpload, type UploadedVideo } from '@/components/video-upload';
import { FilmingGuide } from '@/components/filming-guide';
import { toDateKey } from '@/lib/pitch-stats';
import { PitchCalendar, type DaySummary } from './calendar';

export type Log = {
  id: string;
  date: string;
  pitchCount: number;
  intensity: number;
  maxVelocity: number;
  avgVelocity: number | null;
  memo: string | null;
  videoPaths: string[];
};

const EMPTY_FORM = {
  pitchCount: '',
  intensity: '5',
  maxVelocity: '',
  avgVelocity: '',
  memo: '',
};

export function PitchLogClient({ initialLogs }: { initialLogs: Log[] }) {
  const [logs, setLogs] = useState<Log[]>(initialLogs);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [form, setForm] = useState(EMPTY_FORM);
  const [videos, setVideos] = useState<UploadedVideo[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/pitch-log');
      if (!res.ok) throw new Error();
      setLogs(await res.json());
      setError(undefined);
    } catch {
      setError('기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
  }, []);

  const summaries = useMemo(() => {
    return logs.reduce<Record<string, DaySummary>>((acc, log) => {
      const key = log.date.slice(0, 10);
      const prev = acc[key] ?? { pitches: 0, maxIntensity: 0, hasVideo: false };
      acc[key] = {
        pitches: prev.pitches + log.pitchCount,
        maxIntensity: Math.max(prev.maxIntensity, log.intensity),
        hasVideo: prev.hasVideo || log.videoPaths.length > 0,
      };
      return acc;
    }, {});
  }, [logs]);

  const selectedLogs = useMemo(
    () => logs.filter((l) => l.date.slice(0, 10) === selectedDate),
    [logs, selectedDate]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(undefined);

    try {
      const res = await fetch('/api/pitch-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
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
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch('/api/pitch-log', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) refresh();
  };

  return (
    <div className="space-y-10">
      <PageHeading
        eyebrow="Pitch Log"
        title="투구 기록"
        description="던진 날의 기록을 남기는 곳입니다. 기간별 정리는 '리포트'에서, 영상 되돌아보기는 '영상분석'에서 볼 수 있습니다."
      />

      <FormError>{error}</FormError>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        <Card>
          <PitchCalendar
            month={month}
            onMonthChange={setMonth}
            selected={selectedDate}
            onSelect={setSelectedDate}
            summaries={summaries}
          />
        </Card>

        <Card className="space-y-5">
          <div>
            <h2 className="font-bold text-ink">기록 추가</h2>
            <p className="mt-1 text-sm text-muted">{selectedDate}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
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
              {saving ? '저장 중…' : '기록 저장'}
            </Button>
          </form>
        </Card>
      </div>

      <Card className="space-y-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold text-ink">{selectedDate} 기록</h2>
          <span className="text-xs text-muted">{selectedLogs.length}건</span>
        </div>

        {selectedLogs.length === 0 ? (
          <EmptyState
            title="이 날짜에는 기록이 없습니다"
            description="위 폼에서 그날의 투구를 남겨보세요."
          />
        ) : (
          <ul className="space-y-3">
            {selectedLogs.map((log) => (
              <li key={log.id} className="rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-display text-2xl leading-none text-sky">
                      {log.maxVelocity}
                      <span className="ml-1 text-sm text-muted">km/h 최고</span>
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Badge>{log.pitchCount}구</Badge>
                      <Badge>강도 {log.intensity}/10</Badge>
                      {log.avgVelocity != null && (
                        <Badge>평균 {log.avgVelocity} km/h</Badge>
                      )}
                      {log.videoPaths.length > 0 && (
                        <Badge className="border-sky-soft/60 text-sky">
                          <Video className="mr-1 h-3 w-3" />
                          영상 {log.videoPaths.length}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(log.id)}
                    aria-label="기록 삭제"
                    className="rounded-lg p-2 text-muted transition-colors hover:bg-red-950/40 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {log.memo && (
                  <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-sm leading-relaxed text-muted">
                    {log.memo}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
