'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CaptureGuide, OriginalGuide } from '@/components/intake/guides';
import { NameStep, ReviewStep, VideoStep, WelcomeStep } from '@/components/intake/guided-steps';
import { consentAnswers } from '@/components/intake/consent-block';
import { ModelConsentPart } from '@/components/intake/model-consent';
import { hashOnce, inspectPick, type Picked } from '@/components/intake/pick';
import { REPICK_VIEW_TEXT, SAME_AS_SENT_TEXT, correctionConsentDocs, correctionStopViews, reviewProblems, sentAssetOf, staleRequiredDocs, type ReviewErrors, type ReviewForm } from '@/components/intake/review-rules';
import { SendStep } from '@/components/intake/send-step';
import { LoadingScreen, NoteBox } from '@/components/intake/shell';
import { BLOCK_TEXT, CorrectionStep, FinishStep, NoticeScreen, ReceiptStep, ReconsentStep, RecoveryStep, type CorrectionSubmit } from '@/components/intake/status-steps';
import { LINK_BUTTON, VIEW_LABEL } from '@/components/intake/slots';
import { useSend } from '@/components/intake/use-send';
import { useWakeLock } from '@/components/use-wake-lock';
import { agreedAfterDocs, changedConsentKinds, isAgeBand, isSubmitterRelation } from '@/lib/intake/consent';
import { IntakeRequestError, NETWORK_TEXT, TIMEOUT_TEXT, createIntakeClient, type IntakeReceipt, type PublicAsset, type PublicConsentDoc, type PublicStateResponse } from '@/lib/intake/public-client';
import { assetGone, assetInTransit, type IntakeScreen, type IntakeView } from '@/lib/intake/state';
import { refreshQuietly, stateAfterReceipt, type RunItem, type RunStop } from '@/lib/intake/upload-run';

/** 결과 화면은 3D 를 끌고 와서 공개된 뒤에만 받는다 */
const ResultView = dynamic(() => import('@/components/intake/result-view').then((m) => m.ResultView), {
  ssr: false,
  loading: () => <LoadingScreen label="결과를 불러오고 있어요" />,
});

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/* 토큰은 주소 조각에만 있다 — 서버로 안 가고, 이 화면의 메모리에서만 쓴다 */
const subscribeHash = (notify: () => void) => {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
};
const readToken = () => {
  const t = window.location.hash.slice(1);
  return TOKEN_RE.test(t) ? t : '';
};
const noToken = () => null;

export function IntakeFlow() {
  const token = useSyncExternalStore(subscribeHash, readToken, noToken);
  if (token === null) return <LoadingScreen />;
  if (!token) return <NoticeScreen screenKey="invalid" tone="stop" {...BLOCK_TEXT.invitation_invalid} />;
  return <Flow key={token} token={token} />;
}

type LocalStep = 'welcome' | 'name' | 'side' | 'rear' | 'review' | 'send';
type Step = LocalStep | 'finish' | 'recovery' | Exclude<IntakeScreen, 'welcome' | 'side' | 'upload' | 'upload_recovery'>;

const isLocal = (s: Step): s is LocalStep => ['welcome', 'name', 'side', 'rear', 'review', 'send'].includes(s);

function stepOf(screen: IntakeScreen): Step {
  if (screen === 'upload') return 'finish';
  if (screen === 'upload_recovery') return 'recovery';
  return screen;
}

const PREVIOUS: Partial<Record<LocalStep, LocalStep>> = { name: 'welcome', side: 'name', rear: 'side', review: 'rear' };

type Boot = { kind: 'loading' } | { kind: 'ready' } | { kind: 'blocked'; code: string } | { kind: 'offline'; message: string };

const NO_PICK: Record<IntakeView, Picked | null> = { side: null, rear: null };
const otherOf = (v: IntakeView): IntakeView => (v === 'side' ? 'rear' : 'side');

/* 이 코드들은 지금 고른 파일을 다시 골라야 풀린다 */
const REPICK = new Set(['same_file', 'same_as_sent', 'file_too_large', 'total_too_large', 'file_empty', 'file_unreadable', 'asset_rejected', 'upload_size_mismatch']);
/* 이 코드들은 서버의 지금 상태를 다시 봐야 다음 행동을 안다 */
const RELOAD = new Set([
  'stale_selection',
  'stale_version',
  'asset_not_selected',
  'assets_incomplete',
  'correction_incomplete',
  'not_editable',
  'invalid_state',
  'consent_required',
  'consent_stale',
  'under_14',
  'age_band_required',
  'athlete_name_required',
  'same_pitch_required',
  'invitation_revoked',
  'invitation_invalid',
  'upload_expired',
  'submission_not_found',
  'asset_not_found',
  /* 완료를 보낸 뒤 결과를 못 받았다 — 서버의 지금 화면(영수증일 수 있다)을 다시 본다 */
  'finalize_unknown',
]);

const stopPlan = (stop: RunStop) => (REPICK.has(stop.code) ? 'repick' : RELOAD.has(stop.code) ? 'reload' : 'retry');

function stopLabel(stop: RunStop): string {
  const plan = stopPlan(stop);
  if (plan === 'retry') return '이어서 보내기';
  if (plan === 'reload') return '최신 내용 확인';
  return stop.view ? `${VIEW_LABEL[stop.view]} 다시 고르기` : '영상 다시 고르기';
}

function Flow({ token }: { token: string }) {
  const client = useMemo(() => createIntakeClient(token), [token]);
  const [boot, setBoot] = useState<Boot>({ kind: 'loading' });
  const [data, setData] = useState<PublicStateResponse | null>(null);
  const [step, setStep] = useState<Step>('welcome');
  const [picked, setPicked] = useState(NO_PICK);
  const [inspecting, setInspecting] = useState<IntakeView | null>(null);
  const [pickError, setPickError] = useState<{ view: IntakeView; message: string } | null>(null);
  const [notes, setNotes] = useState<Partial<Record<IntakeView, string>>>({});
  /* 처음 고른 파일과 다른 파일을 고른 칸 — 그 짝은 같은 투구라고 다시 확인받아야 한다 */
  const [changed, setChanged] = useState<Partial<Record<IntakeView, boolean>>>({});
  const [form, setFormState] = useState<ReviewForm | null>(null);
  const [errors, setErrors] = useState<ReviewErrors>({});
  const [busy, setBusy] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [guide, setGuide] = useState<'capture' | 'original' | null>(null);
  /* 고침 · 다시 동의 화면에서 공개 결과를 보는 중 */
  const [viewResult, setViewResult] = useState(false);
  /* 동의 체크를 버릴 때마다 오른다 — 화면 안의 체크(고침)도 같이 비운다 */
  const [consentEpoch, setConsentEpoch] = useState(0);
  const pushed = useRef(0);
  const shownDocs = useRef<readonly PublicConsentDoc[] | null>(null);
  const pickedRef = useRef(picked);
  useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);

  /** 서버 상태를 읽는다. moveTo 면 서버가 말하는 화면으로 간다. 요청은 시한이 있어 멈춘 채 남지 않는다(public-client) */
  const load = useCallback(
    async (moveTo: boolean, signal?: AbortSignal) => {
      const r = await client.state({ signal });
      const before = shownDocs.current;
      shownDocs.current = r.consentDocs;
      setData(r);
      setBoot({ kind: 'ready' });
      setFormState((f) => {
        if (f) {
          /* 동의 글이 바뀌었으면 그 칸의 체크는 옛 글에 누른 것이다 */
          const agreed = agreedAfterDocs(f.agreed, before, r.consentDocs);
          return agreed === f.agreed ? f : { ...f, agreed };
        }
        const relation = r.state.draft.submitterRelation;
        return {
          name: r.state.draft.athleteName ?? '',
          ageBand: isAgeBand(r.state.draft.athleteAgeBand) ? r.state.draft.athleteAgeBand : null,
          samePitch: r.state.draft.samePitchConfirmed,
          agreed: r.state.consent.granted,
          hand: r.state.draft.throwingHand === 'R' || r.state.draft.throwingHand === 'L' ? r.state.draft.throwingHand : null,
          /* DB 기본값이 'self' 라 답하기 전에는 비워 둔다 — 답했는지는 대리 관계이거나 필수 동의가 있는 것으로 안다 */
          relation: isSubmitterRelation(relation) && (relation !== 'self' || r.state.consent.requiredOk) ? relation : null,
          submitterName: r.state.draft.submitterName ?? '',
        };
      });
      if (changedConsentKinds(before, r.consentDocs).length > 0) setConsentEpoch((n) => n + 1);
      if (moveTo) {
        const next = stepOf(r.state.screen);
        const both = pickedRef.current.side != null && pickedRef.current.rear != null;
        /*
         * 나이를 고쳐 이름이 지워진 경우도 'welcome' 이다 — 고른 두 영상이 있으면 검토로 돌아가 이름만 다시 받는다.
         * 이 기기에 파일이 없어도 서버에 올라온 파일이 있으면 소개를 건너뛰고 이름부터 받는다. 저장하면 서버가 다음 화면을 고른다.
         */
        const resume = next === 'welcome' && r.state.assetsOnFile;
        setStep((next === 'side' || next === 'welcome') && both ? 'review' : resume ? 'name' : next);
      }
      return r;
    },
    [client],
  );

  /**
   * 불러오기 실패를 화면으로 — 폐기 · 틀린 링크는 막힌 화면, 그 밖(끊김 · 시한 · 서버 오류)은 '다시 시도'가 있는 화면.
   * 고른 파일 · 적은 글 · 이어 올리기 기록은 이 화면의 상태라 그대로 남는다. 멈춘 요청(화면을 떠남)은 아무것도 안 그린다.
   */
  const refresh = useCallback(
    async (moveTo = true, signal?: AbortSignal) => {
      try {
        await load(moveTo, signal);
      } catch (e) {
        if (!(e instanceof IntakeRequestError)) throw e;
        if (e.code === 'cancelled' || signal?.aborted) return;
        if (e.code === 'invitation_invalid' || e.code === 'invitation_revoked') setBoot({ kind: 'blocked', code: e.code });
        else setBoot({ kind: 'offline', message: e.code === 'network' ? NETWORK_TEXT : e.code === 'timeout' ? TIMEOUT_TEXT : e.message });
      }
    },
    [load],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 서버 응답을 받은 뒤에 칠한다(바로 칠하지 않는다)
    void refresh(true, ctrl.signal);
    /* 화면이 떨어지면 첫 읽기를 멈춘다 — 늦은 응답이 화면을 안 바꾼다 */
    return () => ctrl.abort();
  }, [refresh]);

  const onReserved = useCallback((view: IntakeView, asset: PublicAsset, version: number) => {
    setData((d) => (d ? { ...d, state: { ...d.state, version, assets: { ...d.state.assets, [view]: asset } } } : d));
  }, []);
  /* 영수증이 있으면 접수는 끝났다. 상태 읽기가 끊겨도 영수증 화면으로 가고, 조용히 다시 읽는다(이 화면의 묻기도 이어 받는다) */
  const onDone = useCallback(
    (receipt: IntakeReceipt) => {
      setData((d) => (d ? { ...d, state: stateAfterReceipt(d.state, receipt) } : d));
      setStep('receipt');
      void refreshQuietly(() => load(true)).then((e) => {
        if (e?.code === 'invitation_invalid' || e?.code === 'invitation_revoked') setBoot({ kind: 'blocked', code: e.code });
      });
    },
    [load],
  );
  const send = useSend({ client, submissionId: data?.state.submissionId ?? '', onReserved, onDone });

  const sending = send.run?.running === true;
  useWakeLock(sending);
  useEffect(() => {
    if (!sending) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [sending]);

  /* 앞뒤 단추 — 안내 단계 사이만 오간다. 보내는 중이거나 접수 뒤에는 화면을 그대로 둔다 */
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const target = (e.state as { intakeStep?: LocalStep } | null)?.intakeStep;
      if (!isLocal(step) || step === 'send') {
        window.history.pushState({ intakeStep: step }, '');
        return;
      }
      pushed.current = Math.max(0, pushed.current - 1);
      setStep(target ?? PREVIOUS[step] ?? 'welcome');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [step]);

  /* 접수 뒤에는 서버 상태만 따른다 — 보이는 동안만 묻는다 */
  const followServer = step === 'receipt' || step === 'analysis_running' || step === 'admin_review';
  useEffect(() => {
    if (!followServer) return;
    const quick = data?.state.submissionStatus === 'submitted';
    const ctrl = new AbortController();
    /* 한 번에 하나만 묻는다 — 응답이 시한까지 늦어도 묻기가 쌓이지 않는다 */
    let asking = false;
    const tick = () => {
      if (document.visibilityState !== 'visible' || asking) return;
      asking = true;
      /* 잠깐 끊긴 것 · 늦은 것으로 화면을 바꾸지 않는다. 폐기 · 틀린 링크만 막는다 */
      load(true, ctrl.signal)
        .catch((e: unknown) => {
          if (e instanceof IntakeRequestError && (e.code === 'invitation_invalid' || e.code === 'invitation_revoked')) setBoot({ kind: 'blocked', code: e.code });
        })
        .finally(() => {
          asking = false;
        });
    };
    const id = window.setInterval(tick, quick ? 5_000 : 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      ctrl.abort();
    };
  }, [followServer, data?.state.submissionStatus, load]);

  const go = (next: LocalStep) => {
    window.history.pushState({ intakeStep: next }, '');
    pushed.current += 1;
    setStepError(null);
    setPickError(null);
    setStep(next);
  };
  const back = (from: LocalStep) => {
    setStepError(null);
    setPickError(null);
    if (pushed.current > 0) window.history.back();
    else setStep(PREVIOUS[from] ?? 'welcome');
  };

  const setForm = (patch: Partial<ReviewForm>) => {
    setFormState((f) => (f ? { ...f, ...patch } : f));
    setErrors({});
  };

  /** 동의 체크를 버린다 — 서버가 동의를 다시 달라고 했다. 새 글을 안 읽고 옛 체크로 동의가 남으면 안 된다 */
  const dropAgreement = () => {
    setFormState((f) => (f ? { ...f, agreed: {} } : f));
    setConsentEpoch((n) => n + 1);
  };

  /** 서버가 거절했을 때 — 폐기 · 만료면 화면을 옮기고, 낡은 판이면 최신을 읽어 둔다. 동의 글이 바뀌었으면 새 글을 받고 체크를 비운다 */
  const failure = async (e: unknown): Promise<string> => {
    const r = e instanceof IntakeRequestError ? e : new IntakeRequestError('unknown', '다시 시도해 주세요.');
    if (r.code === 'consent_stale' || r.code === 'consent_required') dropAgreement();
    if (r.code === 'invitation_revoked' || r.code === 'upload_expired' || r.code === 'invitation_invalid') await refresh();
    else if (r.code === 'stale_version' || r.code === 'consent_stale') await refresh(false);
    return r.message;
  };

  const pick = async (view: IntakeView, file: File, checkAgainst?: PublicAsset | null) => {
    if (!data) return;
    setInspecting(view);
    setPickError(null);
    const other = otherOf(view);
    /* 지운 파일은 없는 것으로 본다 — 서버의 같은 파일 판정과 같다 */
    const otherAsset = data.state.assets[other];
    const r = await inspectPick(file, data.state.limits, { picked: picked[other], asset: otherAsset && !assetGone(otherAsset.status) ? otherAsset : null });
    if (!r.ok) {
      /* 이 칸의 전 선택도, 다른 칸의 선택도 그대로 둔다 */
      setPickError({ view, message: r.message });
      setInspecting(null);
      return;
    }
    /* 고침에서 이미 보낸 그 영상을 다시 고르면 판이 안 바뀐다 — 보낸 뒤에 막연한 글을 보이지 않고 고를 때 말한다 */
    const sent = sentAssetOf(data.state, view);
    if (sent && file.size === sent.sizeBytes && (await hashOnce(file).then((h) => h === sent.sha256, () => false))) {
      URL.revokeObjectURL(r.picked.url);
      setPickError({ view, message: SAME_AS_SENT_TEXT });
      setInspecting(null);
      return;
    }
    setPicked((p) => {
      const old = p[view];
      if (old) URL.revokeObjectURL(old.url);
      return { ...p, [view]: r.picked };
    });
    /* 같은 투구 확인은 짝에 대한 것이다 — 파일을 고르면 다시 받는다 */
    setFormState((f) => (f ? { ...f, samePitch: false } : f));
    /* 기록이 없는 칸을 채우면 새 짝이다 — 서버 표시가 남아 있어도 다시 묻는다(null 은 복구 화면의 빈 칸이다) */
    if (checkAgainst === null) setChanged((c) => ({ ...c, [view]: true }));
    if (checkAgainst) {
      const same =
        file.size === checkAgainst.sizeBytes &&
        (await hashOnce(file).then(
          (sha) => sha === checkAgainst.sha256,
          () => false,
        ));
      setChanged((c) => ({ ...c, [view]: !same }));
      setNotes((n) => ({
        ...n,
        [view]: !assetInTransit(checkAgainst.status)
          ? undefined
          : same
            ? '같은 파일이에요. 전송 기록이 살아 있으면 끊긴 곳부터 이어서 보내요.'
            : '처음 고른 파일과 달라요. 이대로 보내면 이 파일을 처음부터 보내요. 같은 파일을 고르면 이어서 보내요.',
      }));
    } else {
      setNotes((n) => ({ ...n, [view]: undefined }));
    }
    setInspecting(null);
  };

  const itemsOf = (views: readonly IntakeView[]): RunItem[] =>
    views.flatMap((view) => {
      const p = picked[view];
      return p ? [{ view, file: p.file, fileName: p.file.name, type: p.file.type || null }] : [];
    });

  /** version 은 화면이 그린 판이다. 이 화면에서 글을 저장해 판이 올랐으면 그 판을 넘긴다 */
  const beginSend = (views: readonly IntakeView[], samePitchConfirmed: true | undefined, version?: number) => {
    if (!data) return;
    const { assets, receipt } = data.state;
    setStep('send');
    send.start(itemsOf(views), {
      known: { side: assets.side?.id ?? null, rear: assets.rear?.id ?? null },
      round: receipt?.revision ?? 0,
      version: version ?? data.state.version,
      samePitchConfirmed,
    });
  };

  const submitReview = async () => {
    if (!data || !form) return;
    const problems = reviewProblems(form, data.consentDocs);
    if (Object.keys(problems).length) {
      setErrors(problems);
      return;
    }
    setBusy(true);
    try {
      if (form.ageBand === 'under_14') {
        /* 받을 수 없는 사람이다 — 나이만 보낸다. 서버가 이름을 비우고, 이 화면도 들고 있지 않는다 */
        await client.saveDraft({ expectedVersion: data.state.version, athleteAgeBand: 'under_14' });
        setFormState((f) => (f ? { ...f, name: '', submitterName: '', samePitch: false, agreed: {} } : f));
        await refresh();
        return;
      }
      const { version } = await client.saveDraft({
        expectedVersion: data.state.version,
        athleteName: form.name.trim(),
        athleteAgeBand: form.ageBand ?? undefined,
        throwingHand: form.hand,
        submitterRelation: form.relation ?? undefined,
        submitterName: form.relation === 'self' ? null : form.submitterName.trim() || null,
        samePitchConfirmed: true,
      });
      /* 동의가 막혀도 다음 시도가 낡은 판으로 부딪히지 않게 바로 맞춘다 */
      setData((d) => (d ? { ...d, state: { ...d.state, version } } : d));
      /* 바이트보다 동의가 먼저다 */
      await client.recordConsents(consentAnswers(data.consentDocs, form.agreed));
      window.history.pushState({ intakeStep: 'send' }, '');
      beginSend(['side', 'rear'], true, version);
    } catch (e) {
      setErrors({ form: await failure(e) });
    } finally {
      setBusy(false);
    }
  };

  const submitCorrection = async (s: CorrectionSubmit) => {
    if (!data) return;
    setBusy(true);
    setStepError(null);
    try {
      let version = data.state.version;
      if (Object.keys(s.patch).length) {
        ({ version } = await client.saveDraft({ expectedVersion: version, ...s.patch }));
        const saved = version;
        setData((d) => (d ? { ...d, state: { ...d.state, version: saved } } : d));
      }
      /* 보내는 사람의 관계를 고쳤으면 옛 동의는 그 사람의 것이 아니다 — 판을 저장한 뒤에 받아 새 관계로 남긴다 */
      const relationChanged = s.patch.submitterRelation !== undefined && s.patch.submitterRelation !== data.state.draft.submitterRelation;
      /* 고침 화면은 필수 동의만 보인다 — 묻지 않은 선택 동의를 '안 함'으로 적지 않는다. 옛 관계의 선택 동의는 쓰이지 않는다 */
      if (!data.state.consent.requiredOk || relationChanged) {
        await client.recordConsents(consentAnswers(correctionConsentDocs(data.consentDocs), s.agreed));
      }
      beginSend(data.state.correction?.views ?? [], s.samePitch ? true : undefined, version);
    } catch (e) {
      setStepError(await failure(e));
    } finally {
      setBusy(false);
    }
  };

  /** 접수 뒤 동의 글이 바뀐 경우 — 바뀐 글만 다시 받는다. 올리기 기간과 상관없다 */
  const submitReconsent = async (agreed: Record<string, boolean>) => {
    if (!data) return;
    setBusy(true);
    setStepError(null);
    try {
      await client.recordConsents(consentAnswers(staleRequiredDocs(data.state, data.consentDocs), agreed));
      await refresh();
    } catch (e) {
      setStepError(await failure(e));
      /* 다른 기기에서 먼저 받았으면 서버의 지금 화면으로 간다 */
      if (e instanceof IntakeRequestError && e.code === 'not_editable') await refresh();
    } finally {
      setBusy(false);
    }
  };

  /** 거둔 사실은 서버가 이미 안다 — 다시 읽기가 끊겨도 실패로 말하지 않는다 */
  const withdrawModel = async () => {
    await client.withdrawModelConsent();
    setData((d) => (d ? { ...d, state: { ...d.state, consent: { ...d.state.consent, granted: { ...d.state.consent.granted, model: false } } } } : d));
    setFormState((f) => (f ? { ...f, agreed: { ...f.agreed, model: false } } : f));
    void load(false).catch(() => {});
  };

  /** 멈춘 뒤 다음 행동 — 코드에 따라 파일을 다시 고르거나, 서버를 다시 보거나, 이어서 보낸다 */
  const resolveStop = (stop: RunStop) => {
    const plan = stopPlan(stop);
    if (plan === 'retry') return void send.retry();
    const view = stop.view;
    if (plan === 'repick' && view) {
      setPicked((p) => {
        const old = p[view];
        if (old) URL.revokeObjectURL(old.url);
        return { ...p, [view]: null };
      });
      setPickError({ view, message: stop.message });
    }
    /* 서버가 고칠 칸을 말했다 — 그 칸에 고른 파일은 쓸 수 없으니 비우고, 다시 읽은 고침 화면의 그 칸 곁에 말한다 */
    const fix = correctionStopViews(stop);
    if (fix.length) {
      setPicked((p) => {
        const next = { ...p };
        for (const v of fix) {
          const old = next[v];
          if (old) URL.revokeObjectURL(old.url);
          next[v] = null;
        }
        return next;
      });
      setPickError({ view: fix[0], message: REPICK_VIEW_TEXT });
    }
    if (stop.code === 'consent_stale' || stop.code === 'consent_required') dropAgreement();
    void refresh();
  };

  /* ── 그리기 ── */
  if (boot.kind === 'loading') return <LoadingScreen />;
  if (boot.kind === 'blocked') return <NoticeScreen screenKey={boot.code} tone="stop" {...BLOCK_TEXT[boot.code]} />;
  if (boot.kind === 'offline') {
    return <NoticeScreen screenKey="offline" tone="stop" title="접수 내용을 불러오지 못했어요" desc={boot.message} action={{ label: '다시 시도', run: () => void refresh() }} />;
  }
  if (!data || !form) return <LoadingScreen />;

  const { state, consentDocs: docs } = data;
  /* 새로고침 뒤 앞뒤 단추로 온 경우 — 파일이 없는 단계는 그 앞 단계로 */
  const shown: Step = step === 'review' && !picked.rear ? (picked.side ? 'rear' : 'side') : step === 'rear' && !picked.side ? 'side' : step;

  const guides = (
    <>
      <CaptureGuide open={guide === 'capture'} onClose={() => setGuide(null)} />
      <OriginalGuide open={guide === 'original'} onClose={() => setGuide(null)} />
    </>
  );

  /* 모델 동의 글이 '언제든 철회'를 약속한다 — 받는 사람이 닿는 화면마다 둔다 */
  const modelPart = <ModelConsentPart granted={state.consent.granted.model} onWithdraw={withdrawModel} />;

  /* 공개 결과 위의 안내 — 공개는 고침 · 재동의와 겹칠 수 있다. 결과는 그대로 보이고, 지금 해야 할 일로 돌아갈 길을 준다 */
  const backLink = (text: string, label: string) => (
    <NoteBox>
      <span className="flex flex-wrap items-center justify-between gap-x-3">
        {text}
        <button type="button" onClick={() => setViewResult(false)} className={`-mr-2 ${LINK_BUTTON}`}>
          {label}
        </button>
      </span>
    </NoteBox>
  );
  const resultNotice = (() => {
    if (shown === 'correction') return backLink('고쳐 주셔야 할 내용이 있어요.', '고침 화면으로');
    if (state.needsReconsent) return backLink('동의 내용이 바뀌었어요. 다시 확인해 주시면 이어서 진행해요.', '다시 동의하기');
    if (state.submissionStatus === 'correction_requested') return <NoteBox>{state.statusText}</NoteBox>;
    return state.correctionStatusLine ? <NoteBox>{state.correctionStatusLine}</NoteBox> : null;
  })();
  const resultScreen = <ResultView token={token} notice={resultNotice} footer={modelPart} />;

  /* 접수 뒤 동의 판이 바뀌면 분석이 멈춘다 — 어느 화면에 있든 먼저 다시 받는다 */
  if (state.needsReconsent && !viewResult && shown !== 'send') {
    return (
      <ReconsentStep
        key={consentEpoch}
        state={state}
        docs={docs}
        busy={busy}
        error={stepError}
        extra={modelPart}
        onSubmit={(agreed) => void submitReconsent(agreed)}
        onViewResult={state.resultAvailable ? () => setViewResult(true) : undefined}
      />
    );
  }

  switch (shown) {
    case 'welcome':
      return (
        <>
          <WelcomeStep
            onStart={() => go('name')}
            onCapture={() => setGuide('capture')}
            onOriginal={() => setGuide('original')}
            inKakao={/KAKAOTALK/i.test(navigator.userAgent)}
          />
          {guides}
        </>
      );
    case 'name':
      return (
        <NameStep
          initial={form.name}
          busy={busy}
          error={stepError}
          onBack={() => back('name')}
          onNext={async (name) => {
            setBusy(true);
            setStepError(null);
            try {
              const { version } = await client.saveDraft({ expectedVersion: state.version, athleteName: name });
              setData((d) => (d ? { ...d, state: { ...d.state, version, draft: { ...d.state.draft, athleteName: name } } } : d));
              setForm({ name });
              /* 이미 올라온 파일이 있으면 서버가 끝내기 · 이어 보내기 화면을 고른다 */
              if (state.assetsOnFile && state.consent.requiredOk) await refresh();
              else go('side');
            } catch (e) {
              setStepError(await failure(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      );
    case 'side':
    case 'rear':
      return (
        <>
          <VideoStep
            key={shown}
            view={shown}
            picked={picked[shown]}
            inspecting={inspecting === shown}
            error={pickError?.view === shown ? pickError.message : null}
            limits={state.limits}
            onPick={(f) => void pick(shown, f)}
            onBack={() => back(shown)}
            onNext={() => go(shown === 'side' ? 'rear' : 'review')}
            onOriginal={() => setGuide('original')}
            extra={modelPart}
          />
          {guides}
        </>
      );
    case 'review':
      return (
        <ReviewStep
          form={form}
          setForm={setForm}
          docs={docs}
          picked={picked}
          inspecting={inspecting}
          pickError={pickError}
          errors={errors}
          busy={busy}
          onPick={(view, f) => void pick(view, f)}
          onBack={() => back('review')}
          onSubmit={() => void submitReview()}
        />
      );
    case 'send': {
      if (!send.run) return <LoadingScreen />;
      return (
        <SendStep
          run={send.run}
          actionLabel={send.run.stop ? stopLabel(send.run.stop) : null}
          onAction={() => send.run?.stop && resolveStop(send.run.stop)}
          /* 진행이 오래 멈추면 멈추고 '이어서 보내기'로 — 고른 파일 · 이어 올리기 기록 · 완료 키는 그대로 둔다 */
          onCancel={send.cancel}
        />
      );
    }
    case 'recovery':
      return (
        <>
          <RecoveryStep
            state={state}
            picked={picked}
            inspecting={inspecting}
            pickError={pickError}
            notes={notes}
            changed={changed.side === true || changed.rear === true}
            onPick={(view, f) => void pick(view, f, state.assets[view])}
            onSend={(same) => beginSend(['side', 'rear'], same)}
            onOriginal={() => setGuide('original')}
            extra={modelPart}
          />
          {guides}
        </>
      );
    case 'finish':
      return <FinishStep state={state} onFinish={(same) => beginSend([], same)} extra={modelPart} />;
    case 'correction':
      if (viewResult && state.resultAvailable) return resultScreen;
      return (
        <CorrectionStep
          state={state}
          docs={docs}
          picked={picked}
          inspecting={inspecting}
          pickError={pickError}
          notes={notes}
          busy={busy}
          error={stepError}
          consentEpoch={consentEpoch}
          onPick={(view, f) => void pick(view, f, state.assets[view])}
          onSubmit={(s) => void submitCorrection(s)}
          onViewResult={state.resultAvailable ? () => setViewResult(true) : undefined}
          extra={modelPart}
        />
      );
    case 'receipt':
    case 'analysis_running':
    case 'admin_review':
      return <ReceiptStep state={state} extra={modelPart} />;
    case 'published':
    case 'access_code':
      return resultScreen;
    case 'under_14':
      return (
        <NoticeScreen
          screenKey="under-14"
          title="만 14세 미만 선수의 영상은 아직 받을 수 없어요"
          desc={
            state.assetsOnFile
              ? '법정대리인 동의 절차를 준비하고 있어요. 이 접수로 이미 올라온 영상이 있어요. 링크를 보내 준 분에게 문의해 주세요.'
              : '법정대리인 동의 절차를 준비하고 있어요. 보낸 영상은 없어요.'
          }
          action={
            state.uploadExpired
              ? undefined
              : {
                  label: '나이를 잘못 골랐어요',
                  run: () => {
                    void client.saveDraft({ expectedVersion: state.version, athleteAgeBand: '14_or_over' }).then(
                      () => {
                        setForm({ ageBand: '14_or_over' });
                        void refresh();
                      },
                      () => void refresh(),
                    );
                  },
                }
          }
        >
          {modelPart}
        </NoticeScreen>
      );
    case 'upload_expired':
    case 'result_expired':
    case 'withdrawn':
      return (
        <NoticeScreen screenKey={shown} tone="stop" {...BLOCK_TEXT[shown]}>
          {modelPart}
        </NoticeScreen>
      );
    case 'revoked':
      return <NoticeScreen screenKey="revoked" tone="stop" {...BLOCK_TEXT.invitation_revoked} />;
    default:
      return null;
  }
}
