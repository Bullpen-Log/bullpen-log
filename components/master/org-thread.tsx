'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addCoachComment,
  addNoteVideo,
  coachVideoUpload,
  coachVideoUrls,
  loadCoachThread,
  removeNoteVideo,
  type CommentView,
} from '@/app/actions/app-lesson';
import { Button, Textarea } from '@/components/ui';
import { toast } from '@/components/toast';
import { putToSignedUrl } from '@/components/video-upload';
import { COMMENT_KIND_LABEL, COMMENT_MAX, NOTE_VIDEOS_MAX, ORG_VIDEO_MAX_BYTES } from '@/lib/org/comments';

/**
 * 웹 /manage 회원 카드의 일지 · 숙제 말 칸(2단계) — 앱 native/src/org/thread.tsx 와 같은 동작(app/actions/app-lesson.ts).
 * 접힌 채 '영상 N · 말 N', 펴면 영상(일지 영상 · 숙제 영상)과 말. '지금 보는 순간에 말 달기'로 그 초에, ▶ 0:12 를 누르면 그 순간으로.
 * 일지에는 영상 붙이기(두 개) · 빼기.
 */
const secText = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const dayText = (key: string) => {
  const [, m, d] = key.split('-');
  return `${Number(m)}/${Number(d)}`;
};

export function OrgThread({
  orgId,
  kind,
  id,
  talk,
  videos = 0,
}: {
  orgId: string;
  kind: 'note' | 'homework';
  id: string;
  talk: { total: number; open: number };
  videos?: number;
}) {
  const [open, setOpen] = useState(false);
  const parts = [videos ? `영상 ${videos}` : '', talk.total ? `말 ${talk.total}` : ''].filter(Boolean);
  return (
    <div className="mt-1.5 space-y-2">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="text-xs font-semibold text-sky-strong">
        {open ? '접기' : parts.length ? parts.join(' · ') : kind === 'note' ? '영상 · 말 남기기' : '말 남기기'}
        {!open && talk.open ? <span className="text-danger"> · 답 기다림 {talk.open}</span> : null}
      </button>
      {open ? <Thread orgId={orgId} kind={kind} id={id} /> : null}
    </div>
  );
}

function Thread({ orgId, kind, id }: { orgId: string; kind: 'note' | 'homework'; id: string }) {
  const [data, setData] = useState<{ comments: CommentView[]; videos: string[] } | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [pick, setPick] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [atNow, setAtNow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* 다시 읽기는 번호를 올려 아래 effect 가 받게 — effect 안에서 바로 상태를 바꾸지 않는다(react-hooks/set-state-in-effect) */
  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let alive = true;
    void loadCoachThread(orgId, kind, id).then(async (r) => {
      if (!alive) return;
      if (!r.ok) return setError('불러오지 못했어요.');
      setData({ comments: r.comments, videos: r.videos });
      if (r.videos.length) {
        const u = await coachVideoUrls(orgId, r.videos);
        if (alive && u.ok) setUrls(u.urls);
      }
    });
    return () => {
      alive = false;
    };
  }, [orgId, kind, id, version]);

  const videos = data?.videos ?? [];
  const shown = pick && videos.includes(pick) ? pick : (videos[0] ?? null);

  const send = async () => {
    if (!body.trim()) return setError('할 말을 적어 주세요.');
    setBusy('보내는 중');
    setError(null);
    const at = atNow && shown && video.current ? Math.round(video.current.currentTime * 10) / 10 : null;
    const r = await addCoachComment(orgId, kind, id, body, at != null ? shown : null, at);
    setBusy(null);
    if (!r.ok) return setError(r.error ?? '남기지 못했어요.');
    setBody('');
    load();
  };
  const jump = (path: string, sec: number) => {
    if (path !== shown) setPick(path);
    setTimeout(
      () => {
        if (!video.current) return;
        video.current.pause();
        video.current.currentTime = sec;
      },
      path !== shown ? 400 : 0
    );
  };
  const attach = async (file: File) => {
    if (file.size > ORG_VIDEO_MAX_BYTES) return setError(`영상은 ${ORG_VIDEO_MAX_BYTES / 1024 / 1024}MB 이하만 올릴 수 있어요.`);
    setError(null);
    setBusy('올릴 준비 중');
    try {
      const t = await coachVideoUpload(orgId, { fileName: file.name, fileSize: file.size, fileType: file.type || 'video/mp4' });
      if (!t.ok) throw new Error(t.error);
      await putToSignedUrl(t.signedUrl, file, (p) => setBusy(`올리는 중 ${p}%`));
      const r = await addNoteVideo(orgId, id, t.path);
      if (!r.ok) throw new Error(r.error);
      toast('영상을 붙였어요');
      setPick(t.path);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '영상을 올리지 못했어요.');
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const remove = async (path: string) => {
    if (!window.confirm('이 영상을 뺄까요? 저장소에서도 지워져요.')) return;
    const r = await removeNoteVideo(orgId, id, path);
    if (!r.ok) return setError(r.error ?? '빼지 못했어요.');
    load();
  };

  if (!data) return <p className="text-xs text-muted">{error ?? '불러오는 중…'}</p>;
  return (
    <div className="space-y-3 border-l-2 border-line pl-3">
      {shown ? (
        <div className="space-y-2">
          {videos.length > 1 ? (
            <div className="flex gap-2">
              {videos.map((v, i) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPick(v)}
                  className={`rounded-full px-3 py-1 text-xs ${v === shown ? 'bg-sky text-white' : 'bg-ink/6 text-ink'}`}
                >
                  영상 {i + 1}
                </button>
              ))}
            </div>
          ) : null}
          {urls[shown] ? (
            <video key={shown} ref={video} src={urls[shown]} controls muted playsInline className="aspect-video w-full rounded-lg bg-black" />
          ) : (
            <div className="aspect-video w-full rounded-lg bg-ink/6" />
          )}
        </div>
      ) : null}
      {kind === 'note' ? (
        <div className="flex flex-wrap gap-3 text-xs">
          {videos.length < NOTE_VIDEOS_MAX ? (
            <>
              <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && void attach(e.target.files[0])} />
              <button type="button" disabled={!!busy} onClick={() => fileRef.current?.click()} className="font-semibold text-sky-strong">
                영상 붙이기
              </button>
            </>
          ) : null}
          {shown ? (
            <button type="button" onClick={() => void remove(shown)} className="font-semibold text-muted">
              이 영상 빼기
            </button>
          ) : null}
        </div>
      ) : null}
      {data.comments.map((m) => (
        <div key={m.id} className="space-y-0.5 text-sm">
          <p className={`text-xs font-semibold ${m.byCoach ? 'text-sky-strong' : m.kind === 'fix' ? 'text-warn' : 'text-muted'}`}>
            {m.byCoach ? (m.author ?? '코치') : COMMENT_KIND_LABEL[m.kind]} · {dayText(m.key)}
            {!m.byCoach && !m.resolved ? ' · 답 기다림' : ''}
          </p>
          {m.videoPath && m.atSec != null ? (
            <button type="button" onClick={() => jump(m.videoPath!, m.atSec!)} className="text-xs font-bold text-sky-strong">
              ▶ {videos.length > 1 ? `영상 ${videos.indexOf(m.videoPath) + 1} · ` : ''}
              {secText(m.atSec)}
            </button>
          ) : null}
          <p className="whitespace-pre-wrap text-ink">{m.body}</p>
        </div>
      ))}
      {shown ? (
        <label className="flex items-center gap-2 text-xs text-ink">
          <input type="checkbox" checked={atNow} onChange={(e) => setAtNow(e.target.checked)} />
          지금 보는 순간에 말 달기
        </label>
      ) : null}
      <Textarea rows={2} maxLength={COMMENT_MAX} value={body} onChange={(e) => setBody(e.target.value)} placeholder={atNow ? '이 순간에 볼 것' : '답 남기기'} />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex items-center justify-end gap-3">
        {busy ? <span className="text-xs text-muted">{busy}</span> : null}
        <Button type="button" size="sm" variant="secondary" disabled={!!busy} onClick={() => void send()}>
          보내기
        </Button>
      </div>
    </div>
  );
}
