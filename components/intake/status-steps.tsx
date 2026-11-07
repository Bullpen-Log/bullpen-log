'use client';

import { useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Clock3, Copy } from '@/components/icon';
import { Input } from '@/components/ui';
import { Choice } from '@/components/intake/choice';
import { CheckRow, RequiredConsents } from '@/components/intake/consent-block';
import type { Picked } from '@/components/intake/pick';
import { FieldError, NoteBox, PrimaryButton, Screen, SecondaryButton } from '@/components/intake/shell';
import { SlotCard, VIEW_LABEL } from '@/components/intake/slots';
import { GONE_VIEW_TEXT, goneViewsToPick, staleRequiredDocs } from '@/components/intake/review-rules';
import { PROXY_CONSENT_NOTE, SUBMITTER_RELATIONS, SUBMITTER_RELATION_TEXT, isProxyRelation } from '@/lib/intake/consent';
import { INTAKE_ERROR_TEXT } from '@/lib/intake/errors';
import { formatBytes } from '@/lib/intake/limits';
import type { PublicAsset, PublicConsentDoc, PublicIntakeState } from '@/lib/intake/public-client';
import { assetArrived, assetGone, receiptHead, receiptRetentionRows, type IntakeView } from '@/lib/intake/state';

/* ── 막힌 화면 ── */
export function NoticeScreen({
  screenKey,
  title,
  desc,
  tone = 'plain',
  action,
  children,
}: {
  screenKey: string;
  title: string;
  desc?: string;
  tone?: 'plain' | 'stop';
  action?: { label: string; run: () => void };
  children?: ReactNode;
}) {
  return (
    <Screen screenKey={screenKey} title={title} desc={desc} actions={action ? <SecondaryButton onClick={action.run}>{action.label}</SecondaryButton> : undefined}>
      {tone === 'stop' && <CircleAlert aria-hidden className="h-8 w-8 text-muted" />}
      {children}
    </Screen>
  );
}

/* ── 영수증 · 진행 상태 ── */

const keyDateText = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
};

/** 복사 — 카카오톡 안 브라우저처럼 clipboard 가 막힌 곳은 옛 길로, 그것도 안 되면 안내한다 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="shrink-0 text-footnote text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-semibold break-keep text-ink">{children}</dd>
    </div>
  );
}

function AssetLine({ view, asset }: { view: IntakeView; asset: PublicAsset | null }) {
  if (!asset) return null;
  const facts = [asset.fps, asset.timing].filter(Boolean).join(' · ');
  return (
    <li className="py-2">
      <p className="flex items-center justify-between gap-3 text-sm font-semibold text-ink">
        {VIEW_LABEL[view]}
        <span className="truncate text-footnote font-normal text-muted">{formatBytes(asset.sizeBytes)}</span>
      </p>
      <p className="mt-0.5 flex items-start gap-1.5 text-footnote leading-5 break-keep text-muted">
        {asset.status === 'verified' ? <CircleCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <Clock3 aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />}
        {asset.integrity ?? '파일이 잘 도착했는지 확인하고 있어요'}
      </p>
      {facts && <p className="mt-0.5 text-footnote text-muted">{facts}</p>}
    </li>
  );
}

export function ReceiptStep({ state, extra }: { state: PublicIntakeState; extra?: ReactNode }) {
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const head = receiptHead(state);

  return (
    <Screen
      screenKey={`status-${state.screen}`}
      title={head.title}
      desc={head.desc}
      actions={
        <PrimaryButton
          onClick={async () => {
            setCopied((await copyText(window.location.href)) ? 'ok' : 'fail');
          }}
        >
          <Copy aria-hidden className="h-5 w-5" />
          링크 복사
        </PrimaryButton>
      }
    >
      <dl className="divide-y divide-line rounded-2xl bg-surface px-(--block-pad) py-1">
        <Row label="선수 이름">{state.draft.athleteName}</Row>
        {state.receipt && <Row label="접수일">{keyDateText(state.receipt.receiptDate)}</Row>}
        {state.receipt && <Row label="접수 번호">{state.receipt.code}</Row>}
        <Row label="지금 상태">{state.statusText}</Row>
        {receiptRetentionRows(state).map((row) => (
          <Row key={row.label} label={row.label}>
            {'date' in row ? keyDateText(row.date) : row.text}
          </Row>
        ))}
      </dl>

      <ul aria-label="보낸 영상" className="divide-y divide-line rounded-2xl bg-surface px-(--block-pad) py-1">
        <AssetLine view="side" asset={state.assets.side} />
        <AssetLine view="rear" asset={state.assets.rear} />
      </ul>

      <p aria-live="polite" className="text-footnote leading-5 break-keep text-muted">
        {copied === 'ok' ? '링크를 복사했어요.' : copied === 'fail' ? '복사하지 못했어요. 주소창의 링크를 길게 눌러 복사해 주세요.' : ''}
      </p>
      <NoteBox>이 링크를 가진 사람은 누구나 접수 상태와 공개된 결과를 볼 수 있어요. 필요한 분에게만 보내 주세요.</NoteBox>

      {extra}
    </Screen>
  );
}

/* ── 동의 글이 바뀌어 다시 받기 ── */

/** 접수 뒤에 필수 동의 글의 판이 바뀌면 분석이 멈춘다. 바뀐 글만 다시 보이고, 공개 중인 결과는 그대로 볼 수 있게 둔다 */
export function ReconsentStep({
  state,
  docs,
  busy,
  error,
  extra,
  onSubmit,
  onViewResult,
}: {
  state: PublicIntakeState;
  docs: readonly PublicConsentDoc[];
  busy: boolean;
  error: string | null;
  extra?: ReactNode;
  onSubmit: (agreed: Record<string, boolean>) => void;
  onViewResult?: () => void;
}) {
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [missing, setMissing] = useState(false);
  const stale = staleRequiredDocs(state, docs);
  const proxy = isProxyRelation(state.draft.submitterRelation);
  return (
    <Screen
      screenKey="reconsent"
      title="동의 내용이 바뀌었어요"
      desc="아래 글을 다시 읽고 동의해 주시면 이어서 진행해요. 동의하지 않으려면 링크를 보내 준 분에게 알려 주세요."
      actions={
        <>
          {error && <FieldError>{error}</FieldError>}
          <PrimaryButton
            busy={busy}
            onClick={() => {
              if (stale.some((d) => agreed[d.kind] !== true)) {
                setMissing(true);
                document.getElementById(`consent-${stale.find((d) => agreed[d.kind] !== true)?.kind}`)?.focus();
                return;
              }
              setMissing(false);
              onSubmit(agreed);
            }}
          >
            동의하고 이어가기
          </PrimaryButton>
          {onViewResult && <SecondaryButton onClick={onViewResult}>공개 결과 보기</SecondaryButton>}
        </>
      }
    >
      {proxy && <NoteBox>{PROXY_CONSENT_NOTE}</NoteBox>}
      <div className="space-y-3">
        <RequiredConsents
          docs={stale}
          agreed={agreed}
          onChange={(kind, next) => {
            setMissing(false);
            setAgreed((a) => ({ ...a, [kind]: next }));
          }}
          invalid={missing}
          describedBy={missing ? 'reconsent-error' : undefined}
          proxy={proxy}
        />
        {missing && <FieldError id="reconsent-error">{INTAKE_ERROR_TEXT.consent_required}</FieldError>}
      </div>
      {extra}
    </Screen>
  );
}

/* ── 끊긴 전송 다시 잇기 ── */
export function RecoveryStep({
  state,
  picked,
  inspecting,
  pickError,
  notes,
  changed,
  onPick,
  onSend,
  onOriginal,
  extra,
}: {
  state: PublicIntakeState;
  picked: Record<IntakeView, Picked | null>;
  inspecting: IntakeView | null;
  pickError: { view: IntakeView; message: string } | null;
  notes: Partial<Record<IntakeView, string>>;
  /** 처음 고른 파일과 다른 파일을 고른 칸이 있나 — 그 짝은 아직 같은 투구라고 확인받지 않았다 */
  changed: boolean;
  onPick: (view: IntakeView, file: File) => void;
  /** 같은 투구를 새로 확인받았으면 true */
  onSend: (samePitch: true | undefined) => void;
  onOriginal: () => void;
  extra?: ReactNode;
}) {
  const hasFile = picked.side != null || picked.rear != null;
  const [tried, setTried] = useState(false);
  const [same, setSame] = useState(false);
  const askSame = changed || !state.draft.samePitchConfirmed;
  const sameMissing = tried && askSame && !same;
  return (
    <Screen
      screenKey="recovery"
      title="보내던 영상을 이어서 보낼게요"
      desc="화면을 닫으면 브라우저가 파일을 놓아요. 같은 파일을 다시 고르면 이어서 보낼 수 있어요."
      actions={
        <>
          {tried && !hasFile && <FieldError>먼저 보낼 영상을 골라 주세요.</FieldError>}
          <PrimaryButton
            disabled={inspecting != null}
            onClick={() => {
              setTried(true);
              if (hasFile && (!askSame || same)) onSend(askSame ? true : undefined);
            }}
          >
            이어서 보내기
          </PrimaryButton>
        </>
      }
    >
      {(['side', 'rear'] as const).map((view) => (
        <SlotCard
          key={view}
          view={view}
          asset={state.assets[view]}
          picked={picked[view]}
          inspecting={inspecting === view}
          error={pickError?.view === view ? pickError.message : null}
          note={notes[view] ?? null}
          onPick={(f) => onPick(view, f)}
        />
      ))}
      {askSame && (
        <div className="space-y-1">
          <CheckRow checked={same} onChange={setSame} label="두 영상은 같은 투구를 동시에 찍은 영상이에요" invalid={sameMissing} describedBy={sameMissing ? 'recovery-same' : undefined} />
          {sameMissing && <FieldError id="recovery-same">{INTAKE_ERROR_TEXT.same_pitch_required}</FieldError>}
        </div>
      )}
      <NoteBox>다른 기기에서 보내는 중이라면 그 기기에서 끝낸 뒤 이 화면을 다시 열어 주세요.</NoteBox>
      <button type="button" onClick={onOriginal} className="min-h-11 text-sm font-semibold text-sky-strong">
        원본 영상을 고르는 방법
      </button>
      {extra}
    </Screen>
  );
}

/* ── 두 영상이 다 왔고 접수만 남음 ── */
export function FinishStep({ state, onFinish, extra }: { state: PublicIntakeState; onFinish: (samePitch: true | undefined) => void; extra?: ReactNode }) {
  const [same, setSame] = useState(false);
  const [tried, setTried] = useState(false);
  /* 서버가 이 짝을 확인받았다고 할 때만 안 묻는다 — 다른 파일로 바뀌면 그 표시는 지워진다 */
  const ask = !state.draft.samePitchConfirmed;
  return (
    <Screen
      screenKey="finish"
      title="두 영상이 모두 도착했어요"
      desc="접수를 마치면 접수 번호를 드려요."
      actions={
        <PrimaryButton
          onClick={() => {
            setTried(true);
            if (!ask || same) onFinish(ask ? true : undefined);
          }}
        >
          접수 마치기
        </PrimaryButton>
      }
    >
      {/* 접수는 지금 내용을 얼린다 — 무엇이 얼려지는지 보이게 둔다 */}
      <dl className="rounded-2xl bg-surface px-(--block-pad) py-1">
        <Row label="선수 이름">{state.draft.athleteName}</Row>
      </dl>
      <ul aria-label="도착한 영상" className="divide-y divide-line rounded-2xl bg-surface px-(--block-pad) py-1">
        <AssetLine view="side" asset={state.assets.side} />
        <AssetLine view="rear" asset={state.assets.rear} />
      </ul>
      {ask && (
        <div className="space-y-1">
          <CheckRow checked={same} onChange={setSame} label="두 영상은 같은 투구를 동시에 찍은 영상이에요" invalid={tried && !same} describedBy={tried && !same ? 'finish-same' : undefined} />
          {tried && !same && <FieldError id="finish-same">{INTAKE_ERROR_TEXT.same_pitch_required}</FieldError>}
        </div>
      )}
      {extra}
    </Screen>
  );
}

/* ── 고침 요청 ── */
export type CorrectionSubmit = {
  patch: { athleteName?: string; throwingHand?: 'R' | 'L' | null; submitterRelation?: string; submitterName?: string | null };
  agreed: Record<string, boolean>;
  samePitch: boolean;
};

export function CorrectionStep({
  state,
  docs,
  picked,
  inspecting,
  pickError,
  notes,
  busy,
  error,
  consentEpoch,
  onPick,
  onSubmit,
  onViewResult,
  extra,
}: {
  state: PublicIntakeState;
  docs: readonly PublicConsentDoc[];
  picked: Record<IntakeView, Picked | null>;
  inspecting: IntakeView | null;
  pickError: { view: IntakeView; message: string } | null;
  notes: Partial<Record<IntakeView, string>>;
  busy: boolean;
  error: string | null;
  /** 동의 글이 바뀌었거나 서버가 동의를 다시 달라고 하면 오른다 — 옛 글에 누른 체크를 버린다 */
  consentEpoch: number;
  onPick: (view: IntakeView, file: File) => void;
  onSubmit: (s: CorrectionSubmit) => void;
  /** 공개 중인 결과가 있으면 — 고치는 동안에도 볼 수 있다 */
  onViewResult?: () => void;
  extra?: ReactNode;
}) {
  const correction = state.correction;
  const fields = correction?.fields ?? [];
  const views = correction?.views ?? [];
  const [name, setName] = useState(state.draft.athleteName ?? '');
  const [hand, setHand] = useState(state.draft.throwingHand);
  const [relation, setRelation] = useState(state.draft.submitterRelation);
  const [submitterName, setSubmitterName] = useState(state.draft.submitterName ?? '');
  const [agreed, setAgreed] = useState<Record<string, boolean>>(state.consent.granted);
  const [seenEpoch, setSeenEpoch] = useState(consentEpoch);
  if (seenEpoch !== consentEpoch) {
    setSeenEpoch(consentEpoch);
    setAgreed(state.consent.granted);
  }
  const [same, setSame] = useState(false);
  const [problem, setProblem] = useState<'name' | 'file' | 'consent' | 'same' | null>(null);
  /* 관계를 바꾸면 옛 동의는 다른 사람의 것이다 — 새 관계로 다시 받는다 */
  const relationChanged = fields.includes('submitterRelation') && relation !== state.draft.submitterRelation;
  const needsConsent = !state.consent.requiredOk || relationChanged;
  const proxy = isProxyRelation(fields.includes('submitterRelation') ? relation : state.draft.submitterRelation);

  /* 지운 칸은 새 파일이 있어야 낼 수 있다 — 보낸 뒤에 전송이 안 끝났다는 글을 보이지 않고 여기서 그 칸을 말한다 */
  const missing = goneViewsToPick(state, picked);

  const submit = () => {
    if (fields.includes('athleteName') && !name.trim()) return setProblem('name');
    if (missing.length > 0) return setProblem('file');
    if (needsConsent && docs.some((d) => d.required && agreed[d.kind] !== true)) return setProblem('consent');
    if (views.length > 0 && !same) return setProblem('same');
    setProblem(null);
    const patch: CorrectionSubmit['patch'] = {};
    if (fields.includes('athleteName')) patch.athleteName = name.trim();
    if (fields.includes('throwingHand')) patch.throwingHand = hand === 'R' || hand === 'L' ? hand : null;
    if (fields.includes('submitterRelation')) patch.submitterRelation = relation;
    if (fields.includes('submitterName')) patch.submitterName = submitterName.trim() || null;
    onSubmit({ patch, agreed, samePitch: same });
  };

  return (
    <Screen
      screenKey="correction"
      title="이 내용만 고쳐 주세요"
      desc="요청받은 칸만 바꿀 수 있어요. 나머지는 그대로 둘게요."
      actions={
        <>
          {error && <FieldError>{error}</FieldError>}
          <PrimaryButton onClick={submit} busy={busy} disabled={inspecting != null}>
            고친 내용 보내기
          </PrimaryButton>
          {onViewResult && <SecondaryButton onClick={onViewResult}>공개 결과 보기</SecondaryButton>}
        </>
      }
    >
      {correction?.message && <NoteBox>{correction.message}</NoteBox>}

      {fields.includes('athleteName') && (
        <div className="space-y-1.5">
          <label htmlFor="fix-name" className="text-sm font-bold text-ink">
            선수 이름
          </label>
          <Input id="fix-name" value={name} onChange={(e) => setName(e.currentTarget.value)} autoComplete="off" maxLength={80} aria-invalid={problem === 'name' || undefined} aria-describedby={problem === 'name' ? 'fix-name-error' : undefined} />
          {problem === 'name' && <FieldError id="fix-name-error">{INTAKE_ERROR_TEXT.athlete_name_required}</FieldError>}
        </div>
      )}

      {fields.includes('throwingHand') && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold text-ink">던지는 손</legend>
          <div className="flex gap-2">
            {(['R', 'L'] as const).map((h) => (
              <Choice key={h} name="fix-hand" value={h} checked={hand === h} label={h === 'R' ? '오른손' : '왼손'} onSelect={setHand} />
            ))}
          </div>
        </fieldset>
      )}

      {fields.includes('submitterRelation') && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold text-ink">보내는 사람</legend>
          <div className="grid grid-cols-2 gap-2">
            {SUBMITTER_RELATIONS.map((r) => (
              <Choice key={r} name="fix-relation" value={r} checked={relation === r} label={SUBMITTER_RELATION_TEXT[r]} onSelect={(r) => {
                  setRelation(r);
                  /* 다른 사람의 자격으로 눌렀던 체크다 */
                  setAgreed({});
                }} />
            ))}
          </div>
        </fieldset>
      )}

      {fields.includes('submitterName') && (
        <div className="space-y-1.5">
          <label htmlFor="fix-submitter" className="text-sm font-bold text-ink">
            보내는 분의 이름
          </label>
          <Input id="fix-submitter" value={submitterName} onChange={(e) => setSubmitterName(e.currentTarget.value)} autoComplete="off" maxLength={40} />
        </div>
      )}

      {views.map((view) => {
        const asset = state.assets[view];
        return (
          <SlotCard
            key={view}
            view={view}
            asset={asset}
            picked={picked[view]}
            inspecting={inspecting === view}
            error={pickError?.view === view ? pickError.message : problem === 'file' && missing.includes(view) ? GONE_VIEW_TEXT : null}
            note={notes[view] ?? null}
            requested={asset != null && (assetArrived(asset.status) || assetGone(asset.status))}
            onPick={(f) => onPick(view, f)}
          />
        );
      })}

      {views.length > 0 && (
        <div className="space-y-1">
          <CheckRow checked={same} onChange={setSame} label="두 영상은 같은 투구를 동시에 찍은 영상이에요" invalid={problem === 'same'} describedBy={problem === 'same' ? 'fix-same' : undefined} />
          {problem === 'same' && <FieldError id="fix-same">{INTAKE_ERROR_TEXT.same_pitch_required}</FieldError>}
        </div>
      )}

      {needsConsent && (
        <div className="space-y-3">
          {proxy && <NoteBox>{PROXY_CONSENT_NOTE}</NoteBox>}
          <RequiredConsents docs={docs} agreed={agreed} onChange={(kind, next) => setAgreed((a) => ({ ...a, [kind]: next }))} invalid={problem === 'consent'} describedBy={problem === 'consent' ? 'fix-consent' : undefined} proxy={proxy} />
          {problem === 'consent' && <FieldError id="fix-consent">{INTAKE_ERROR_TEXT.consent_required}</FieldError>}
        </div>
      )}
      {extra}
    </Screen>
  );
}

/* ── 접근 코드 없는 결과 등 막힌 상태 글 ── */
export const BLOCK_TEXT: Record<string, { title: string; desc: string }> = {
  invitation_invalid: { title: '이 링크는 쓸 수 없어요', desc: '링크를 보내 준 분에게 다시 받아 주세요.' },
  invitation_revoked: { title: '이 링크는 더 쓸 수 없어요', desc: '링크를 보내 준 분에게 문의해 주세요.' },
  upload_expired: { title: '영상을 보낼 수 있는 기간이 끝났어요', desc: '링크를 보내 준 분에게 문의해 주세요.' },
  result_expired: { title: '결과를 볼 수 있는 기간이 끝났어요', desc: '링크를 보내 준 분에게 문의해 주세요.' },
  withdrawn: { title: '접수가 철회됐어요', desc: '더 이어서 보낼 수 없어요. 궁금한 점은 링크를 보내 준 분에게 문의해 주세요.' },
};
