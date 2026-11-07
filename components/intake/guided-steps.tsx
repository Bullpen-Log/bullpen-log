'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Pencil } from '@/components/icon';
import { Input } from '@/components/ui';
import { Choice } from '@/components/intake/choice';
import { CheckRow, ConsentText, RequiredConsents } from '@/components/intake/consent-block';
import { FileFacts, VideoPreview } from '@/components/intake/file-summary';
import { RearFrame, SideFrame } from '@/components/intake/illustrations';
import type { Picked } from '@/components/intake/pick';
import { FieldError, HelpButton, NoteBox, PrimaryButton, Screen } from '@/components/intake/shell';
import { firstProblemTarget, type ReviewErrors, type ReviewForm } from '@/components/intake/review-rules';
import { FILL_BUTTON, FileButton, LINK_BUTTON, PickStatus, VIEW_LABEL, useFocusOnPick } from '@/components/intake/slots';
import { PROXY_CONSENT_NOTE, SUBMITTER_RELATIONS, SUBMITTER_RELATION_TEXT, isProxyRelation, modelCheckLabel } from '@/lib/intake/consent';
import { formatBytes, type IntakeLimits } from '@/lib/intake/limits';
import type { PublicConsentDoc } from '@/lib/intake/public-client';
import type { IntakeView } from '@/lib/intake/state';
import { labPairBlock } from '@/lib/pitch-lab-guard';

/* ── 1 환영 ── */
export function WelcomeStep({ onStart, onCapture, onOriginal, inKakao }: { onStart: () => void; onCapture: () => void; onOriginal: () => void; inKakao: boolean }) {
  return (
    <Screen
      screenKey="welcome"
      title="투구 영상 두 개를 보내주세요"
      desc={'옆과 뒤에서 촬영한 영상을 보내면 분석을 준비해요.\n앱 설치나 회원가입은 필요 없어요.'}
      actions={<PrimaryButton onClick={onStart}>시작하기</PrimaryButton>}
    >
      <div className="flex items-end justify-center gap-4 rounded-2xl bg-surface px-4 py-5">
        <figure className="w-[58%]">
          <SideFrame className="w-full" />
          <figcaption className="mt-1.5 text-center text-footnote text-muted">옆에서</figcaption>
        </figure>
        <figure className="w-[30%]">
          <RearFrame className="w-full" />
          <figcaption className="mt-1.5 text-center text-footnote text-muted">뒤에서</figcaption>
        </figure>
      </div>
      <p className="text-sm leading-relaxed break-keep text-ink">같은 투구 한 번을 두 대의 폰으로 동시에 찍은 영상이 필요해요.</p>
      <div className="flex flex-col items-start">
        <HelpButton onClick={onCapture}>촬영 방법 보기</HelpButton>
        <HelpButton onClick={onOriginal}>원본 영상을 고르는 방법</HelpButton>
      </div>
      {inKakao && <NoteBox>카카오톡 안에서도 보낼 수 있어요. 영상이 잘 안 골라지면 Safari나 Chrome에서 이 링크를 열어 주세요.</NoteBox>}
    </Screen>
  );
}

/* ── 2 이름 ── */
export function NameStep({ initial, busy, error, onBack, onNext }: { initial: string; busy: boolean; error: string | null; onBack: () => void; onNext: (name: string) => void }) {
  const [name, setName] = useState(initial);
  const [local, setLocal] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus({ preventScroll: true }), []);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return setLocal('선수 이름을 입력해 주세요.');
    if ([...trimmed].length > 40) return setLocal('이름은 40자 이하로 입력해 주세요.');
    setLocal(null);
    onNext(trimmed);
  };
  const shown = local ?? error;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Screen
        screenKey="name"
        title="영상 속 선수의 이름은 무엇인가요?"
        desc="접수된 영상을 이름별로 정리할 때 사용해요."
        step={1}
        onBack={onBack}
        focusTitle={false}
        actions={
          <PrimaryButton type="submit" busy={busy}>
            다음
          </PrimaryButton>
        }
      >
        <div className="space-y-2">
          <label htmlFor="athlete-name" className="sr-only">
            선수 이름
          </label>
          <Input
            ref={input}
            id="athlete-name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="next"
            placeholder="이름"
            maxLength={80}
            aria-invalid={shown ? true : undefined}
            aria-describedby={shown ? 'athlete-name-error' : undefined}
            className="py-3.5 text-subhead aria-invalid:border-danger"
          />
          {shown && <FieldError id="athlete-name-error">{shown}</FieldError>}
        </div>
      </Screen>
    </form>
  );
}

/* ── 3 · 4 영상 ── */
const VIDEO_COPY: Record<IntakeView, { title: string; desc: string; pick: string; tips: string[] }> = {
  side: {
    title: '먼저, 옆에서 찍은 영상을 골라주세요',
    desc: '투수의 옆모습과 전신이 보이는 영상이에요.',
    pick: '옆 영상 선택',
    tips: ['폰을 가로로 두고 찍은 영상', '발끝부터 머리, 손까지 보이는 영상'],
  },
  rear: {
    title: '이번에는 뒤에서 찍은 영상이에요',
    desc: '같은 투구를 뒤에서 촬영한 영상을 골라주세요.',
    pick: '뒤 영상 선택',
    tips: ['옆 영상과 같은 공을 동시에 찍은 영상', '폰을 세로로 두고 투수 뒤에서 찍은 영상'],
  },
};

export function VideoStep({
  view,
  picked,
  inspecting,
  error,
  limits,
  onPick,
  onBack,
  onNext,
  onOriginal,
  extra,
}: {
  view: IntakeView;
  picked: Picked | null;
  inspecting: boolean;
  error: string | null;
  limits: IntakeLimits;
  onPick: (file: File) => void;
  onBack: () => void;
  onNext: () => void;
  onOriginal: () => void;
  extra?: ReactNode;
}) {
  const copy = VIDEO_COPY[view];
  const errorId = `pick-error-${view}`;
  /* 고르기 단추가 사라지므로 다음 단추로 옮긴다. 막혔으면 다시 고를 수 있게 고르기 단추로 */
  const next = useRef<HTMLButtonElement>(null);
  const pickButton = useRef<HTMLButtonElement>(null);
  useFocusOnPick(picked, next);
  useEffect(() => {
    if (error) pickButton.current?.focus({ preventScroll: true });
  }, [error]);
  return (
    <Screen
      screenKey={`video-${view}`}
      title={copy.title}
      desc={copy.desc}
      step={view === 'side' ? 2 : 3}
      onBack={onBack}
      actions={
        picked ? (
          <>
            <PrimaryButton ref={next} onClick={onNext} disabled={inspecting}>
              이 영상으로 계속
            </PrimaryButton>
          </>
        ) : (
          <FileButton buttonRef={pickButton} label={inspecting ? '영상을 살펴보고 있어요' : copy.pick} onFile={onPick} className={FILL_BUTTON} disabled={inspecting} describedBy={error ? errorId : undefined} />
        )
      }
    >
      <PickStatus picked={picked} />
      {picked ? (
        <div className="space-y-3">
          <VideoPreview url={picked.url} />
          <FileFacts name={picked.file.name} size={picked.file.size} facts={picked.facts} />
          <FileButton buttonRef={pickButton} label="다른 영상 선택" onFile={onPick} className={`-ml-2 ${LINK_BUTTON}`} disabled={inspecting} describedBy={error ? errorId : undefined} />
        </div>
      ) : (
        <>
          <div className="flex justify-center rounded-2xl bg-surface px-4 py-5">
            {view === 'side' ? <SideFrame className="w-[70%]" /> : <RearFrame className="w-[38%]" />}
          </div>
          <ul className="space-y-1.5 text-sm leading-relaxed break-keep text-ink">
            {copy.tips.map((t) => (
              <li key={t} className="flex gap-2">
                <span aria-hidden className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <p className="text-footnote text-muted">영상 하나에 {formatBytes(limits.maxFileBytes)}까지 보낼 수 있어요.</p>
        </>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
      <HelpButton onClick={onOriginal}>원본 영상을 고르는 방법</HelpButton>
      {extra}
    </Screen>
  );
}

/* ── 5 검토 ── */

/** 고른 파일 한 칸 — 다시 고르면 초점을 이 칸으로 옮기고 알린다 */
function ReviewFile({
  view,
  picked,
  failed,
  inspecting,
  locked,
  onPick,
}: {
  view: IntakeView;
  picked: Picked;
  failed: string | null;
  inspecting: boolean;
  locked: boolean;
  onPick: (file: File) => void;
}) {
  const card = useRef<HTMLElement>(null);
  useFocusOnPick(picked, card);
  return (
    <section ref={card} tabIndex={-1} aria-label={VIEW_LABEL[view]} className="rounded-2xl bg-surface p-(--block-pad) outline-none focus-visible:outline-2 focus-visible:outline-sky">
      <PickStatus picked={picked} />
      <h2 className="text-footnote text-muted">{VIEW_LABEL[view]}</h2>
      <div className="mt-1">
        <FileFacts name={picked.file.name} size={picked.file.size} facts={picked.facts} />
      </div>
      {failed && (
        <div className="mt-2">
          <FieldError>{failed}</FieldError>
        </div>
      )}
      <FileButton label={inspecting ? '영상을 살펴보고 있어요' : '다른 영상 선택'} onFile={onPick} className={`-ml-2 ${LINK_BUTTON}`} disabled={locked} />
    </section>
  );
}

export function ReviewStep({
  form,
  setForm,
  docs,
  picked,
  inspecting,
  pickError,
  errors,
  busy,
  onPick,
  onBack,
  onSubmit,
}: {
  form: ReviewForm;
  setForm: (patch: Partial<ReviewForm>) => void;
  docs: readonly PublicConsentDoc[];
  picked: Record<IntakeView, Picked | null>;
  inspecting: IntakeView | null;
  pickError: { view: IntakeView; message: string } | null;
  errors: ReviewErrors;
  busy: boolean;
  onPick: (view: IntakeView, file: File) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  /* 이름이 비었거나 칸에 오류가 있으면 입력칸을 열어 둔다 — 닫힌 채로는 초점을 옮길 곳이 없다 */
  const [editName, setEditName] = useState(!form.name.trim());
  const [seenErrors, setSeenErrors] = useState(errors);
  if (seenErrors !== errors) {
    setSeenErrors(errors);
    if (errors.name) setEditName(true);
  }
  const model = docs.find((d) => !d.required);
  const proxy = isProxyRelation(form.relation);
  const underFourteen = form.ageBand === 'under_14';

  /* 오류가 생기면 화면 차례의 첫 칸으로 간다. 바닥 단추만 보고 있던 사람에게 아무 일도 안 일어난 것처럼 보이면 안 된다 */
  useEffect(() => {
    const target = firstProblemTarget(errors, form, docs);
    if (!target) return;
    const el = document.getElementById(target);
    el?.scrollIntoView({ block: 'center' });
    el?.focus({ preventScroll: true });
    // 오류가 새로 정해졌을 때만 — 칸을 고칠 때마다 옮기면 안 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errors]);

  /* 본인 ↔ 대리가 바뀌면 체크 글이 달라진다 — 다른 글에 누른 체크를 그대로 두지 않는다 */
  const pickRelation = (relation: NonNullable<ReviewForm['relation']>) => {
    const flips = form.relation != null && isProxyRelation(relation) !== proxy;
    setForm(flips ? { relation, agreed: {} } : { relation });
  };

  const a = picked.side?.facts;
  const b = picked.rear?.facts;
  const apart =
    a && b
      ? labPairBlock(
          { fp: null, startMs: a.captureAtMs, timeSource: a.captureSource, durationSec: a.sampleDurationSec },
          { fp: null, startMs: b.captureAtMs, timeSource: b.captureSource, durationSec: b.sampleDurationSec },
        ) != null
      : false;

  return (
    <Screen
      screenKey="review"
      title="이 두 영상을 보내면 돼요"
      step={4}
      onBack={onBack}
      actions={
        <>
          {errors.form && <FieldError>{errors.form}</FieldError>}
          <PrimaryButton onClick={onSubmit} busy={busy} disabled={inspecting != null}>
            {underFourteen ? '이 나이로 계속' : '영상 보내기'}
          </PrimaryButton>
        </>
      }
    >
      <section aria-label="선수 이름" className="rounded-2xl bg-surface p-(--block-pad)">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-footnote text-muted">선수 이름</h2>
            {editName ? (
              <div className="mt-1.5">
                <label htmlFor="review-name" className="sr-only">
                  선수 이름
                </label>
                <Input
                  id="review-name"
                  value={form.name}
                  onChange={(e) => setForm({ name: e.currentTarget.value })}
                  autoComplete="off"
                  maxLength={80}
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby={errors.name ? 'review-name-error' : undefined}
                />
              </div>
            ) : (
              <p className="mt-0.5 truncate text-base font-bold text-ink">{form.name}</p>
            )}
          </div>
          <button type="button" onClick={() => setEditName((v) => !v)} className={`inline-flex items-center gap-1 ${LINK_BUTTON}`} aria-expanded={editName}>
            {!editName && <Pencil aria-hidden className="h-4 w-4" />}
            {editName ? '닫기' : '고치기'}
          </button>
        </div>
        {errors.name && (
          <div className="mt-2">
            <FieldError id="review-name-error">{errors.name}</FieldError>
          </div>
        )}
      </section>

      {(['side', 'rear'] as const).map((view) => {
        const p = picked[view];
        if (!p) return null;
        return (
          <ReviewFile
            key={view}
            view={view}
            picked={p}
            failed={pickError?.view === view ? pickError.message : null}
            inspecting={inspecting === view}
            locked={inspecting != null}
            onPick={(f) => onPick(view, f)}
          />
        );
      })}

      <div className="space-y-1">
        <CheckRow
          id="same-pitch"
          checked={form.samePitch}
          onChange={(samePitch) => setForm({ samePitch })}
          label="두 영상은 같은 투구를 동시에 찍은 영상이에요"
          invalid={errors.samePitch != null}
          describedBy={errors.samePitch ? 'same-pitch-error' : undefined}
        />
        {errors.samePitch && <FieldError id="same-pitch-error">{errors.samePitch}</FieldError>}
        {apart && <NoteBox tone="warn">파일에 적힌 촬영 시각이 서로 달라요. 같은 투구를 동시에 찍은 영상이 맞는지 다시 봐 주세요.</NoteBox>}
      </div>

      <fieldset className="space-y-2" aria-describedby={errors.age ? 'age-error' : undefined}>
        <legend className="text-sm font-bold text-ink">선수 나이</legend>
        <div className="flex gap-2">
          <Choice id="age-14_or_over" name="age" value="14_or_over" checked={form.ageBand === '14_or_over'} label="만 14세 이상" onSelect={(ageBand) => setForm({ ageBand })} />
          <Choice id="age-under_14" name="age" value="under_14" checked={underFourteen} label="만 14세 미만" onSelect={(ageBand) => setForm({ ageBand })} />
        </div>
        {errors.age && <FieldError id="age-error">{errors.age}</FieldError>}
        {underFourteen && <NoteBox tone="warn">만 14세 미만 선수의 영상은 아직 받을 수 없어요. 법정대리인 동의 절차를 준비하고 있어요. 이대로 계속하면 적어 둔 이름은 지워요.</NoteBox>}
      </fieldset>

      <fieldset className="space-y-2" aria-describedby={errors.relation ? 'relation-error' : undefined}>
        <legend className="text-sm font-bold text-ink">누가 보내나요?</legend>
        <div className="grid grid-cols-2 gap-2">
          {SUBMITTER_RELATIONS.map((r) => (
            <Choice key={r} id={`relation-${r}`} name="relation" value={r} checked={form.relation === r} label={SUBMITTER_RELATION_TEXT[r]} onSelect={pickRelation} />
          ))}
        </div>
        {errors.relation && <FieldError id="relation-error">{errors.relation}</FieldError>}
        {proxy && (
          <div className="space-y-1.5 pt-1">
            <label htmlFor="submitter-name" className="text-footnote text-muted">
              보내는 분의 이름(선택)
            </label>
            <Input id="submitter-name" value={form.submitterName} onChange={(e) => setForm({ submitterName: e.currentTarget.value })} autoComplete="off" maxLength={40} />
          </div>
        )}
      </fieldset>

      <div className="space-y-3">
        {proxy && <NoteBox>{PROXY_CONSENT_NOTE}</NoteBox>}
        <RequiredConsents
          docs={docs}
          agreed={form.agreed}
          onChange={(kind, next) => setForm({ agreed: { ...form.agreed, [kind]: next } })}
          invalid={errors.consent != null}
          describedBy={errors.consent ? 'consent-error' : undefined}
          proxy={proxy}
        />
        {errors.consent && <FieldError id="consent-error">{errors.consent}</FieldError>}
      </div>

      <details className="group rounded-2xl bg-surface">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-(--block-pad) text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
          선택 항목
          <ChevronDown aria-hidden className="h-5 w-5 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="space-y-5 px-(--block-pad) pb-(--block-pad)">
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold text-ink">던지는 손</legend>
            <div className="flex gap-2">
              <Choice name="hand" value="R" checked={form.hand === 'R'} label="오른손" onSelect={(hand) => setForm({ hand })} />
              <Choice name="hand" value="L" checked={form.hand === 'L'} label="왼손" onSelect={(hand) => setForm({ hand })} />
            </div>
          </fieldset>

          {model && (
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-ink">{model.title}</h3>
              <ConsentText body={model.body} />
              <CheckRow checked={form.agreed[model.kind] === true} onChange={(next) => setForm({ agreed: { ...form.agreed, [model.kind]: next } })} label={modelCheckLabel(proxy)} />
            </div>
          )}
        </div>
      </details>
    </Screen>
  );
}

