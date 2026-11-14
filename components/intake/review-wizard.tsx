'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pencil } from '@/components/icon';
import { Input } from '@/components/ui';
import { Choice } from '@/components/intake/choice';
import { CheckRow, ConsentSummary, TermsDialog, consentCopyOf } from '@/components/intake/consent-block';
import { FileFacts } from '@/components/intake/file-summary';
import { RearFrame, SideFrame } from '@/components/intake/illustrations';
import type { Picked } from '@/components/intake/pick';
import { FieldError, HelpButton, NoteBox, PrimaryButton, Screen, SecondaryButton } from '@/components/intake/shell';
import { firstProblemTarget, panelProblem, reviewPanels, validPanel, type ReviewErrors, type ReviewForm, type ReviewPanel } from '@/components/intake/review-rules';
import { FileButton, LINK_BUTTON, PickStatus, VIEW_LABEL, useFocusOnPick } from '@/components/intake/slots';
import { PROXY_CONSENT_NOTE, SUBMITTER_RELATIONS, SUBMITTER_RELATION_TEXT, consentCheckLabel, isProxyRelation, optionalCheckLabel } from '@/lib/intake/consent';
import type { PublicConsentDoc } from '@/lib/intake/public-client';
import type { IntakeView } from '@/lib/intake/state';
import { labPairBlock } from '@/lib/pitch-lab-guard';

/*
 * 보내기 전 확인(INTAKE-MAIN/R04) — 긴 한 장 대신 한 화면에 결정 하나씩, 이전 · 다음으로 오가고 마지막 요약에서 '영상 보내기'.
 * 고른 파일 · 적은 값은 부르는 쪽(intake-flow)의 상태라 화면을 오가도 그대로 남는다. 화면 차례 · 막는 규칙은 review-rules.ts(순수 함수, 시험이 부른다).
 * 동의 글 전문은 '약관 보기' 창에만 둔다. 창을 열기만 해서는 동의가 되지 않는다 — 체크 칸은 늘 이 화면에 있고 기본은 꺼져 있다.
 */

const consentCopy = consentCopyOf;

const HAND_TEXT = { R: '오른손', L: '왼손' } as const;

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
      <FileButton label={inspecting ? '영상을 살펴보는 중' : '다른 영상 선택'} onFile={onPick} className={`-ml-2 ${LINK_BUTTON}`} disabled={locked} />
    </section>
  );
}

/**
 * 요약의 한 줄 — 이름 · 값 · 고치기(연필) 한 줄. 375×667 에서 요약 전체와 단추가 굴리지 않고 들어오게 줄 높이를 40px 로 둔다(누르는 칸 40px).
 * 글자를 키우거나 좁은 화면이면 줄이 늘어 화면이 굴러간다 — 그때도 잘리지 않는다.
 */
function SummaryRow({ label, value, onEdit, children }: { label: string; value?: ReactNode; onEdit?: () => void; children?: ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-2 py-0.5">
      <p className="w-[5.5rem] shrink-0 text-footnote leading-5 break-keep text-muted">{label}</p>
      <div className="min-w-0 flex-1 text-sm leading-5 font-semibold break-keep text-ink">{value ?? children}</div>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`${label} 고치기`}
          className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sky-strong hover:bg-ink/6 focus-visible:outline-2 focus-visible:outline-sky"
        >
          <Pencil aria-hidden className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** 요약의 동의 칸 — 짧은 이름과 상태. 누르면 그 동의 화면으로 간다 */
const CONSENT_SHORT: Record<string, string> = { submission: '영상 제출', overseas: '국외 이전', model: '모델 개발' };

export function ReviewStep({
  panel: rawPanel,
  form,
  setForm,
  docs,
  picked,
  inspecting,
  pickError,
  errors,
  busy,
  onPick,
  onPanel,
  onBack,
  onSubmit,
}: {
  panel: string;
  form: ReviewForm;
  setForm: (patch: Partial<ReviewForm>) => void;
  docs: readonly PublicConsentDoc[];
  picked: Record<IntakeView, Picked | null>;
  inspecting: IntakeView | null;
  pickError: { view: IntakeView; message: string } | null;
  errors: ReviewErrors;
  busy: boolean;
  onPick: (view: IntakeView, file: File) => void;
  /** 다음 결정 화면으로(앞뒤 단추 기록에 남긴다) */
  onPanel: (panel: ReviewPanel) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const panels = reviewPanels(form, docs);
  const panel = validPanel(rawPanel, panels);
  const at = panels.indexOf(panel);
  const proxy = isProxyRelation(form.relation);
  const underFourteen = form.ageBand === 'under_14';
  /* 이 화면의 막힘 — '다음'을 누른 뒤에만 보인다. 서버 · 보내기의 오류(errors)는 부르는 쪽이 준다 */
  const [local, setLocal] = useState<ReviewErrors>({});
  const [seen, setSeen] = useState(panel);
  /* 요약에서 고치러 왔으면 '다음'이 요약으로 돌아간다 */
  const [editing, setEditing] = useState(false);
  const [terms, setTerms] = useState<PublicConsentDoc | null>(null);
  const [nameOpen, setEditName] = useState(!form.name.trim());
  if (seen !== panel) {
    setSeen(panel);
    setLocal({});
    if (panel === 'summary') setEditing(false);
  }
  const shown: ReviewErrors = { ...errors, ...local };
  /* 이름 오류가 있으면 입력칸을 열어 둔다 — 닫힌 채로는 초점을 옮길 곳이 없다 */
  const editName = nameOpen || shown.name != null;

  /* 오류가 새로 생기면 그 칸으로 초점을 옮긴다 — 바닥 단추만 보던 사람에게 아무 일도 없는 것처럼 보이면 안 된다 */
  useEffect(() => {
    const target = firstProblemTarget(shown, form, docs);
    if (!target) return;
    const el = document.getElementById(target);
    el?.scrollIntoView({ block: 'center' });
    el?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errors, local]);

  const next = () => {
    const problem = panelProblem(panel, form, docs);
    if (Object.keys(problem).length) return setLocal(problem);
    if (panel === 'age' && underFourteen) return onSubmit();
    if (editing) return onPanel('summary');
    const after = panels[at + 1];
    if (after) onPanel(after);
  };
  const jump = (p: ReviewPanel) => {
    setEditing(true);
    onPanel(p);
  };

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

  const isLast = panel === 'summary';
  const actions = (
    <>
      {isLast && errors.form && <FieldError>{errors.form}</FieldError>}
      <div className="flex gap-2">
        <div className="w-[38%] shrink-0">
          <SecondaryButton onClick={onBack} disabled={busy} className="h-14 w-full">
            이전
          </SecondaryButton>
        </div>
        <div className="min-w-0 flex-1">
          <PrimaryButton onClick={isLast ? onSubmit : next} busy={busy} disabled={inspecting != null}>
            {isLast ? '영상 보내기' : panel === 'age' && underFourteen ? '이 나이로 계속' : editing ? '확인' : '다음'}
          </PrimaryButton>
        </div>
      </div>
    </>
  );

  const doc = panel.startsWith('consent:') ? docs.find((d) => `consent:${d.kind}` === panel) : undefined;
  const copy = doc ? consentCopy(doc) : null;

  const common = { screenKey: `review-${panel}`, step: 4, onBack, actions };
  /* 몇 번째 결정인지 — 위의 진행 막대가 보여 주므로 화면 읽기에만 말한다(세로 공간을 아낀다) */
  const counter = <p className="sr-only">{`${panels.length}개 중 ${at + 1}번째 질문`}</p>;

  const body = (() => {
    switch (panel) {
      case 'files':
        return (
          <Screen {...common} title="이 두 영상을 보낼까요?" desc="두 영상 모두 슬로 모션 120fps 이상으로 촬영한 원본이어야 합니다.">
            {counter}
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
          </Screen>
        );
      case 'same':
        return (
          <Screen {...common} title="두 영상은 같은 투구를 동시에 찍은 영상인가요?" desc="3D 동작 결과는 한 번의 투구를 옆과 뒤에서 동시에 촬영한 두 영상으로만 만들 수 있습니다.">
            {counter}
            <div aria-hidden className="flex items-end justify-center gap-3 rounded-2xl bg-surface px-4 py-4">
              <SideFrame flip={form.hand === 'L'} className="w-[46%]" />
              <RearFrame flip={form.hand === 'L'} className="w-[22%]" />
            </div>
            <div className="space-y-1">
              <CheckRow
                id="same-pitch"
                checked={form.samePitch}
                onChange={(samePitch) => setForm({ samePitch })}
                label="네, 같은 투구를 동시에 촬영했습니다"
                invalid={shown.samePitch != null}
                describedBy={shown.samePitch ? 'same-pitch-error' : undefined}
              />
              {shown.samePitch && <FieldError id="same-pitch-error">{shown.samePitch}</FieldError>}
            </div>
            {apart && <NoteBox tone="warn">{'파일에 기록된 촬영 시각이 서로 다릅니다.\n같은 투구를 동시에 촬영한 영상인지 다시 확인하십시오.'}</NoteBox>}
          </Screen>
        );
      case 'age':
        return (
          <Screen {...common} title="선수는 만 14세 이상인가요?" desc="만 14세 미만 선수의 영상은 법정대리인 동의 절차가 준비될 때까지 받지 않습니다.">
            {counter}
            <fieldset className="space-y-2" aria-describedby={shown.age ? 'age-error' : undefined}>
              <legend className="sr-only">선수 나이</legend>
              <div className="flex gap-2">
                <Choice id="age-14_or_over" name="age" value="14_or_over" checked={form.ageBand === '14_or_over'} label="만 14세 이상" onSelect={(ageBand) => setForm({ ageBand })} />
                <Choice id="age-under_14" name="age" value="under_14" checked={underFourteen} label="만 14세 미만" onSelect={(ageBand) => setForm({ ageBand })} />
              </div>
              {shown.age && <FieldError id="age-error">{shown.age}</FieldError>}
            </fieldset>
            {underFourteen && <NoteBox tone="warn">{'만 14세 미만 선수의 영상은 아직 받을 수 없습니다.\n이대로 계속하면 입력한 이름은 지워집니다.'}</NoteBox>}
          </Screen>
        );
      case 'relation':
        return (
          <Screen {...common} title="누가 보내나요?" desc="선수 본인이 아니면 보내는 분과 선수의 관계가 동의와 함께 기록됩니다.">
            {counter}
            <fieldset className="space-y-2" aria-describedby={shown.relation ? 'relation-error' : undefined}>
              <legend className="sr-only">보내는 사람</legend>
              <div className="grid grid-cols-2 gap-2">
                {SUBMITTER_RELATIONS.map((r) => (
                  <Choice key={r} id={`relation-${r}`} name="relation" value={r} checked={form.relation === r} label={SUBMITTER_RELATION_TEXT[r]} onSelect={pickRelation} />
                ))}
              </div>
              {shown.relation && <FieldError id="relation-error">{shown.relation}</FieldError>}
            </fieldset>
            {proxy && (
              <div className="space-y-1.5">
                <label htmlFor="submitter-name" className="text-footnote text-muted">
                  보내는 분의 이름(선택)
                </label>
                <Input id="submitter-name" value={form.submitterName} onChange={(e) => setForm({ submitterName: e.currentTarget.value })} autoComplete="off" maxLength={40} />
              </div>
            )}
          </Screen>
        );
      case 'hand':
        return (
          <Screen {...common} title="던지는 손은 어느 쪽인가요?" desc={'선택 항목입니다. 고르지 않아도 보낼 수 있습니다.\n결과를 만들 때 담당자가 확인합니다.'}>
            {counter}
            <fieldset className="space-y-2">
              <legend className="sr-only">던지는 손(선택)</legend>
              <div className="flex gap-2">
                <Choice id="hand-R" name="hand" value="R" checked={form.hand === 'R'} label="오른손" onSelect={(hand) => setForm({ hand })} />
                <Choice id="hand-L" name="hand" value="L" checked={form.hand === 'L'} label="왼손" onSelect={(hand) => setForm({ hand })} />
              </div>
            </fieldset>
          </Screen>
        );
      case 'summary': {
        const orderedDocs = [...docs.filter((d) => d.required), ...docs.filter((d) => !d.required)];
        return (
          <Screen {...common} dense title="이대로 보낼까요?" desc="고칠 항목은 연필을 누릅니다.">
            <section aria-label="보낼 내용" className="divide-y divide-line rounded-2xl bg-surface px-(--block-pad) py-1">
              {editName ? (
                <div className="py-2">
                  <label htmlFor="review-name" className="text-footnote text-muted">
                    선수 이름
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input
                      id="review-name"
                      value={form.name}
                      onChange={(e) => setForm({ name: e.currentTarget.value })}
                      autoComplete="off"
                      maxLength={80}
                      aria-invalid={shown.name ? true : undefined}
                      aria-describedby={shown.name ? 'review-name-error' : undefined}
                    />
                    <button type="button" onClick={() => setEditName(false)} className={LINK_BUTTON}>
                      닫기
                    </button>
                  </div>
                  {shown.name && (
                    <div className="mt-1">
                      <FieldError id="review-name-error">{shown.name}</FieldError>
                    </div>
                  )}
                </div>
              ) : (
                <SummaryRow label="선수 이름" value={<span className="block break-all">{form.name}</span>} onEdit={() => setEditName(true)} />
              )}
              <SummaryRow label="영상" value="옆 · 뒤 각 1개" onEdit={() => jump('files')} />
              <SummaryRow label="같은 투구" value={form.samePitch ? '확인함' : '확인 안 함'} onEdit={() => jump('same')} />
              <SummaryRow label="선수 나이" value={form.ageBand === '14_or_over' ? '만 14세 이상' : '고르지 않음'} onEdit={() => jump('age')} />
              <SummaryRow
                label="보내는 사람"
                value={<span className="block break-keep">{form.relation ? `${SUBMITTER_RELATION_TEXT[form.relation]}${proxy && form.submitterName.trim() ? ` · ${form.submitterName.trim()}` : ''}` : '고르지 않음'}</span>}
                onEdit={() => jump('relation')}
              />
              <SummaryRow label="던지는 손" value={form.hand ? HAND_TEXT[form.hand] : '고르지 않음(선택)'} onEdit={() => jump('hand')} />
              <div className="py-1.5">
                <p className="text-footnote leading-5 text-muted">동의</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {orderedDocs.map((d) => {
                    const on = form.agreed[d.kind] === true;
                    const name = CONSENT_SHORT[d.kind] ?? d.title;
                    const state = on ? '동의함' : d.required ? '동의 필요' : '안 함';
                    return (
                      <button
                        key={d.kind}
                        type="button"
                        onClick={() => jump(`consent:${d.kind}`)}
                        aria-label={`${d.title}: ${on ? '동의함' : '동의 안 함'}${d.required ? '(필수)' : '(선택)'}, 고치기`}
                        className={`inline-flex min-h-10 items-center gap-1 rounded-full border px-3 text-footnote font-semibold focus-visible:outline-2 focus-visible:outline-sky ${
                          on ? 'border-sky/40 bg-sky/10 text-sky-strong' : d.required ? 'border-danger text-danger' : 'border-line text-muted'
                        }`}
                      >
                        {name} {state}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          </Screen>
        );
      }
      default: {
        if (!doc || !copy) return null;
        const checkId = `consent-${doc.kind}`;
        return (
          <Screen {...common} dense title={copy.question} desc={doc.required ? '필수 항목입니다.' : '선택 항목입니다. 동의하지 않아도 보낼 수 있습니다.'}>
            {counter}
            {proxy && <NoteBox>{PROXY_CONSENT_NOTE}</NoteBox>}
            <section aria-label={doc.title} className="space-y-1.5 rounded-2xl bg-surface p-(--block-pad)">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-ink">{doc.title}</h2>
                <HelpButton onClick={() => setTerms(doc)} aria-haspopup="dialog" className="-mr-1 shrink-0">
                  약관 보기
                </HelpButton>
              </div>
              {copy.summary && <ConsentSummary text={copy.summary} />}
              <CheckRow
                id={checkId}
                checked={form.agreed[doc.kind] === true}
                onChange={(on) => setForm({ agreed: { ...form.agreed, [doc.kind]: on } })}
                label={doc.required ? consentCheckLabel(proxy) : optionalCheckLabel(doc.kind, proxy)}
                invalid={doc.required && shown.consent != null && form.agreed[doc.kind] !== true}
                describedBy={shown.consent ? 'consent-error' : undefined}
              />
              {shown.consent && doc.required && <FieldError id="consent-error">{shown.consent}</FieldError>}
            </section>
          </Screen>
        );
      }
    }
  })();

  return (
    <>
      {body}
      <TermsDialog doc={terms} onClose={() => setTerms(null)} />
    </>
  );
}
