'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button, Input } from '@/components/ui';
import { CONTROL_TIMEOUT_MS, IntakeRequestError, requestJson } from '@/lib/intake/public-client';
import { body3dResultOf, type PublicResult } from '@/lib/intake/public-result';

/**
 * 공개 결과 화면 — 초대 링크로 들어온 사람이 승인된 판 하나를 본다. 데이터는 POST /api/intake/public/result 하나뿐이고, 허용 칸만 온다.
 * 3D 는 기존 부품(Body3D)을 그대로 쓴다. 그 부품은 로그인 · 서버 동작을 안 쓴다(돌리기 · 확대 · 재생 · 속도 · 니업 · 착지 · 릴리스가 다 그 안에 있다).
 * 접근 코드는 이 화면의 메모리에만 둔다. 주소 · 저장소에 남기지 않는다.
 * 폼 칸보다 넓게 그린다. 부모는 좁은 칸 밖에 놓아 준다.
 * notice · footer 는 부모가 넘기는 칸이다(고침 안내, 다시 동의 안내, 모델 동의 거두기). 코드를 묻는 동안에도 보인다.
 */
const Body3D = dynamic(() => import('@/app/(app)/videos/lab/[id]/body-3d').then((m) => m.Body3D), {
  ssr: false,
  loading: () => <p className="grid aspect-[4/5] max-h-[60vh] w-full place-items-center text-sm text-[#c7cfdd]">3D 화면을 준비하고 있어요.</p>,
});

type Phase =
  | { kind: 'loading' }
  | { kind: 'code'; error: string | null; busy: boolean }
  | { kind: 'ready'; result: PublicResult }
  | { kind: 'blocked'; text: string; retry: boolean };

function dateText(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

const waitText = (sec: number) => (sec >= 60 ? `${Math.ceil(sec / 60)}분` : `${sec}초`);

type Answer = { ok: true; result: PublicResult } | { ok: false; code: string; message: string; retryAfterSec: number | null };

/** 응답을 못 받은 것 — 서버 거절이 아니라 다시 물으면 될 수 있다 */
const lost = (code: string) => code === 'network' || code === 'timeout' || code === 'internal';

/** 결과 한 번 묻기 — 공개 화면의 다른 요청과 같은 시한 · 같은 취소를 쓴다(requestJson). 멈추면 null 이다 */
async function askResult(token: string, accessCode: string | null, signal: AbortSignal): Promise<Answer | null> {
  let r: Awaited<ReturnType<typeof requestJson>>;
  try {
    r = await requestJson(
      (...a) => fetch(...a),
      '/api/intake/public/result',
      {
        method: 'POST',
        headers: { Authorization: `Intake ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(accessCode ? { accessCode } : {}),
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      },
      { timeoutMs: CONTROL_TIMEOUT_MS, signal },
    );
  } catch (e) {
    const err = e instanceof IntakeRequestError ? e : new IntakeRequestError('network', '');
    if (err.code === 'cancelled') return null;
    return { ok: false, code: err.code, message: err.message, retryAfterSec: null };
  }
  const body = r.data as {
    result?: PublicResult;
    error?: { code?: string; message?: string; detail?: { retryAfterSec?: number } | null };
  } | null;
  if (r.ok && body?.result) return { ok: true, result: body.result };
  return {
    ok: false,
    code: body?.error?.code ?? 'internal',
    message: body?.error?.message ?? '잠시 뒤에 다시 시도해 주세요.',
    retryAfterSec: body?.error?.detail?.retryAfterSec ?? null,
  };
}

export function ResultView({ token, notice, footer }: { token: string; notice?: ReactNode; footer?: ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [code, setCode] = useState('');

  /* 한 번에 한 요청만 산다 — 새로 물으면 앞 요청을 멈추고, 화면이 떨어지면 지금 요청을 멈춘다 */
  const inflight = useRef<AbortController | null>(null);

  const apply = useCallback((a: Answer, accessCode: string | null) => {
    /* 코드를 넣다 끊겼으면 코드 칸을 그대로 두고 그 아래에 말한다 — 적은 코드는 화면 상태라 남는다 */
    if (a.ok) setPhase({ kind: 'ready', result: a.result });
    else if (accessCode != null && lost(a.code)) setPhase({ kind: 'code', error: a.message, busy: false });
    else if (a.code === 'access_code_required') setPhase({ kind: 'code', error: null, busy: false });
    else if (a.code === 'access_code_wrong') setPhase({ kind: 'code', error: a.message, busy: false });
    else if (a.code === 'rate_limited') {
      const wait = a.retryAfterSec != null ? `${waitText(a.retryAfterSec)} 뒤에 다시 시도해 주세요.` : a.message;
      setPhase(accessCode != null ? { kind: 'code', error: `시도가 너무 많아요. ${wait}`, busy: false } : { kind: 'blocked', text: `요청이 너무 많아요. ${wait}`, retry: true });
    } else setPhase({ kind: 'blocked', text: a.message, retry: lost(a.code) });
  }, []);

  const load = useCallback(
    async (accessCode: string | null) => {
      inflight.current?.abort();
      const ctrl = new AbortController();
      inflight.current = ctrl;
      const a = await askResult(token, accessCode, ctrl.signal);
      /* 멈췄거나 더 새 요청이 있으면 그리지 않는다 */
      if (!a || ctrl.signal.aborted || inflight.current !== ctrl) return;
      inflight.current = null;
      apply(a, accessCode);
    },
    [token, apply],
  );

  useEffect(() => {
    void load(null);
    return () => {
      inflight.current?.abort();
      inflight.current = null;
    };
  }, [load]);

  const box = `mx-auto w-full px-5 ${phase.kind === 'ready' ? 'max-w-6xl lg:px-8' : 'max-w-[32.5rem]'}`;
  return (
    <>
      {notice && <div className={`${box} pt-6`}>{notice}</div>}
      {phase.kind === 'ready' ? <ResultBody result={phase.result} /> : <ResultPhase phase={phase} code={code} setCode={setCode} setPhase={setPhase} load={load} />}
      {footer && <div className={`${box} pb-8`}>{footer}</div>}
    </>
  );
}

function ResultPhase({
  phase,
  code,
  setCode,
  setPhase,
  load,
}: {
  phase: Exclude<Phase, { kind: 'ready' }>;
  code: string;
  setCode: (v: string) => void;
  setPhase: (p: Phase) => void;
  load: (accessCode: string | null) => Promise<void>;
}) {
  if (phase.kind === 'loading') {
    return (
      <p role="status" className="mx-auto w-full max-w-[32.5rem] px-5 py-16 text-center text-sm text-muted">
        결과를 불러오고 있어요.
      </p>
    );
  }

  if (phase.kind === 'blocked') {
    return (
      <div className="mx-auto w-full max-w-[32.5rem] space-y-4 px-5 py-16 text-center">
        <p role="alert" className="text-base text-ink break-keep">
          {phase.text}
        </p>
        {phase.retry && (
          <Button
            variant="secondary"
            onClick={() => {
              setPhase({ kind: 'loading' });
              void load(null);
            }}
          >
            다시 시도
          </Button>
        )}
      </div>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = code.trim();
    if (!value) {
      setPhase({ kind: 'code', error: '접근 코드를 입력해 주세요.', busy: false });
      return;
    }
    setPhase({ kind: 'code', error: null, busy: true });
    void load(value);
  };
  return (
    <form onSubmit={submit} noValidate className="mx-auto w-full max-w-[32.5rem] space-y-5 px-5 py-12">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-ink">접근 코드를 입력해 주세요</h2>
        <p className="text-sm text-muted break-keep">이 결과는 코드를 아는 사람만 볼 수 있어요. 링크를 보내 준 분에게 코드를 받아 주세요.</p>
      </div>
      <div className="space-y-2">
        <label htmlFor="intake-access-code" className="block text-sm font-medium text-ink">
          접근 코드
        </label>
        <Input
          id="intake-access-code"
          name="access-code"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={phase.error != null}
          aria-describedby={phase.error ? 'intake-access-code-error' : undefined}
        />
        {phase.error && (
          <p id="intake-access-code-error" role="alert" className="text-sm text-danger break-keep">
            {phase.error}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" disabled={phase.busy} className="w-full">
        {phase.busy ? '확인하고 있어요' : '결과 보기'}
      </Button>
    </form>
  );
}

/**
 * 결과 본문 — 공개 화면과 관리자 3D 검토가 같이 쓴다(공개 전에 받는 사람이 볼 모양 그대로 확인하게).
 * preview 면 위에 '아직 공개 전'을 말하고 제목 초점을 옮기지 않는다(창 안에서 연다).
 */
export function ResultBody({ result, preview = false }: { result: PublicResult; preview?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const body3d = useMemo(() => body3dResultOf(result.view), [result.view]);

  /* 불러온 뒤 바뀐 화면을 보조 기술이 읽게 제목으로 옮긴다 */
  useEffect(() => {
    if (!preview) heading.current?.focus();
  }, [preview]);

  return (
    <article className="mx-auto w-full max-w-6xl px-5 py-6 lg:px-8">
      {preview && (
        <p role="status" className="mb-4 rounded-lg border border-warn-line bg-warn-bg px-4 py-3 text-sm text-warn break-keep">
          아직 공개 전이에요. 공개하면 받는 사람에게 이 모양 그대로 보여요.
        </p>
      )}
      <header className="mb-5 space-y-1">
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold text-ink outline-none break-keep">
          {result.athleteName} 선수의 3D 투구 분석
        </h1>
        <p className="text-sm text-muted">결과일 {dateText(result.resultDate)}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section aria-label="3D 동작" className="theme-dark min-w-0 rounded-3xl bg-[#151722] p-3 text-ink">
          <Body3D result={body3d} />
        </section>

        <aside className="space-y-5">
          {result.explanation && (
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-ink">담당자 설명</h2>
              <p className="whitespace-pre-line text-sm leading-6 text-ink break-keep">{result.explanation}</p>
            </section>
          )}
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-ink">보는 방법</h2>
            <p className="text-sm leading-6 text-muted break-keep">
              화면을 끌면 돌아가요. 두 손가락으로 벌리거나 Ctrl 을 누른 채 휠을 굴리면 크게 볼 수 있어요. 니업, 착지, 릴리스를 누르면 그 순간으로 가요.
            </p>
          </section>
          <p className="text-xs leading-5 text-muted break-keep">이 링크를 가진 사람은 누구나 이 화면을 열 수 있어요. 믿을 수 있는 사람에게만 전해 주세요.</p>
        </aside>
      </div>
    </article>
  );
}
