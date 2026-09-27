'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { Settings2 } from 'lucide-react';
import {
  calibrationText,
  loadFov,
  saveFov,
  type CalFit,
} from '@/lib/velocity-calibration';
import { DEFAULT_FOV_DEG } from '@/lib/velocity-engine/analyze-frames';
import {
  CAMERA_OPTIONS,
  clearSetup,
  DEFAULT_SETUP,
  DEFAULT_ZONE,
  loadSetup,
  MODE_OPTIONS,
  NET_OPTIONS,
  saveSetup,
  SETUP_CHANGE_EVENT,
  SETUP_KEY,
  type VelocitySetup,
} from '@/lib/velocity-setup';
import { BottomSheet } from './pitch-editor';

/**
 * 불펜 벨로시티 설정 — 측정 화면 · 벨로시티 홈 · 투구 기록 탭이 같은 칸을 쓴다.
 *
 * 값은 브라우저(localStorage)에 있다(lib/velocity-setup.ts). 측정 화면은 제 상태를 넘겨 주고
 * (controlled), 홈과 투구 기록 탭은 저장된 것을 읽어 바로 고친다(VelocitySettingsButton).
 */

export type SettingsValues = Pick<
  VelocitySetup,
  'mode' | 'cameraPos' | 'net' | 'voice' | 'useCal'
> & { fovDeg: number };

export function VelocitySettingsFields({
  values,
  onChange,
  calibration,
  showChoices = true,
}: {
  values: SettingsValues;
  onChange: (patch: Partial<SettingsValues>) => void;
  calibration: CalFit;
  /** 녹화 종류 · 카메라 위치 · 네트도 여기서 바꿀까 — 측정 중에는 숨긴다 */
  showChoices?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl bg-surface-2">
        <Row
          title="소리로 구속 알려주기"
          hint="공을 잴 때마다 폰이 숫자를 읽어요. 카메라를 볼 필요 없이 던질 수 있어요."
        >
          <input
            type="checkbox"
            checked={values.voice}
            onChange={(e) => {
              onChange({ voice: e.target.checked });
              if (e.target.checked && typeof speechSynthesis !== 'undefined') {
                const u = new SpeechSynthesisUtterance('소리 안내를 켰어요');
                u.lang = 'ko-KR';
                speechSynthesis.speak(u);
              }
            }}
            className="h-5 w-5 accent-sky"
          />
        </Row>
        <Row
          title="카메라 가로 화각"
          hint="아이폰 후면 기본 카메라 약 69°. 크게 잡으면 구속이 높게 나와요."
        >
          <span className="inline-flex items-center gap-1 text-[15px]">
            <input
              inputMode="decimal"
              key={values.fovDeg}
              defaultValue={values.fovDeg}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (n >= 30 && n <= 120 && n !== values.fovDeg) onChange({ fovDeg: n });
                else e.target.value = String(values.fovDeg);
              }}
              aria-label="카메라 가로 화각(도)"
              className="h-10 w-16 rounded-xl border border-line bg-surface px-2 text-right tabular-nums focus:border-sky focus:outline-none"
            />
            °
          </span>
        </Row>
        <Row
          title="스피드건 보정 적용"
          hint={
            calibration.n > 0
              ? `내 짝 ${calibration.n}개로 맞춘 식 ${calibrationText(calibration)}`
              : '아직 짝이 없어요 — 공에 스피드건 값을 적고 저장하면 쌓여요.'
          }
        >
          <input
            type="checkbox"
            checked={values.useCal}
            disabled={calibration.n === 0}
            onChange={(e) => onChange({ useCal: e.target.checked })}
            className="h-5 w-5 accent-sky"
          />
        </Row>
      </div>

      {showChoices && (
        <div className="overflow-hidden rounded-2xl bg-surface-2">
          <ChipRow
            title="녹화 종류"
            options={MODE_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
            value={values.mode}
            onPick={(k) => onChange({ mode: k as SettingsValues['mode'] })}
          />
          <ChipRow
            title="카메라 위치"
            options={CAMERA_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
            value={values.cameraPos}
            onPick={(k) => onChange({ cameraPos: k as SettingsValues['cameraPos'] })}
          />
          <ChipRow
            title="네트"
            hint="있으면 초점을 고정해요(수동초점) — 자동초점은 그물코에 잡혀요"
            options={NET_OPTIONS.map((o) => ({ key: String(o.key), label: o.label }))}
            value={String(values.net)}
            onPick={(k) => onChange({ net: k === 'true' })}
          />
        </div>
      )}
    </div>
  );
}

function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 first:border-t-0">
      <span>
        <span className="block text-[15px]">{title}</span>
        <span className="block text-[11px] leading-snug text-muted">{hint}</span>
      </span>
      {children}
    </label>
  );
}

function ChipRow({
  title,
  hint,
  options,
  value,
  onPick,
}: {
  title: string;
  hint?: string;
  options: { key: string; label: string }[];
  value: string;
  onPick: (key: string) => void;
}) {
  return (
    <div className="border-t border-line px-4 py-3 first:border-t-0">
      <p className="text-[15px]">{title}</p>
      {hint && <p className="text-[11px] leading-snug text-muted">{hint}</p>}
      <div role="radiogroup" aria-label={title} className="mt-2 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={value === o.key}
            onClick={() => onPick(o.key)}
            className={`min-h-9 rounded-full px-3.5 text-[13px] font-semibold transition-colors ${
              value === o.key
                ? 'bg-sky text-white'
                : 'bg-surface text-ink hover:bg-line'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───────────── 저장된 설정을 그리는 동안 읽는다 ───────────── */

const subscribe = (cb: () => void) => {
  window.addEventListener('storage', cb);
  window.addEventListener(SETUP_CHANGE_EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(SETUP_CHANGE_EVENT, cb);
  };
};
const readRaw = () => {
  try {
    return localStorage.getItem(SETUP_KEY);
  } catch {
    return null;
  }
};

/** 저장된 설정 — 서버에서는 null, 브라우저에서는 있으면 값. 바뀌면 다시 그린다 */
export function useStoredSetup(): VelocitySetup | null {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  return useMemo(() => (raw ? loadSetup() : null), [raw]);
}

/**
 * 톱니 단추 하나 — 누르면 설정 시트. 홈과 투구 기록 탭이 쓴다.
 * 저장된 설정이 없으면 기본값을 보여 주고, 고치는 순간 저장한다.
 */
export function VelocitySettingsButton({
  calibration,
  className = '',
  label = '불펜 벨로시티 설정',
}: {
  calibration: CalFit;
  className?: string;
  label?: string;
}) {
  const stored = useStoredSetup();
  const [open, setOpen] = useState(false);
  const [fov, setFov] = useState(() => loadFov(DEFAULT_FOV_DEG));
  const base = stored ?? { ...DEFAULT_SETUP, savedAt: '' };
  const values: SettingsValues = {
    mode: base.mode,
    cameraPos: base.cameraPos,
    net: base.net,
    voice: base.voice,
    useCal: base.useCal,
    fovDeg: fov,
  };
  const change = (patch: Partial<SettingsValues>) => {
    if (patch.fovDeg != null) {
      setFov(patch.fovDeg);
      saveFov(patch.fovDeg);
    }
    const rest: Partial<SettingsValues> = { ...patch };
    delete rest.fovDeg;
    if (Object.keys(rest).length > 0) {
      saveSetup({
        mode: base.mode,
        cameraPos: base.cameraPos,
        net: base.net,
        zone: base.zone,
        voice: base.voice,
        useCal: base.useCal,
        ...rest,
      });
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className={className}
      >
        <Settings2 aria-hidden className="h-4 w-4" />
      </button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="불펜 벨로시티 설정"
      >
        <div className="space-y-4">
          <VelocitySettingsFields
            values={values}
            onChange={change}
            calibration={calibration}
          />
          <div className="flex flex-wrap gap-2 text-[13px]">
            <button
              type="button"
              onClick={() =>
                saveSetup({
                  mode: base.mode,
                  cameraPos: base.cameraPos,
                  net: base.net,
                  zone: DEFAULT_ZONE,
                  voice: base.voice,
                  useCal: base.useCal,
                })
              }
              className="rounded-full bg-surface-2 px-3.5 py-2 font-semibold text-ink hover:bg-line"
            >
              스트라이크 존 자리 초기화
            </button>
            <button
              type="button"
              onClick={() => clearSetup()}
              className="rounded-full bg-surface-2 px-3.5 py-2 font-semibold text-ink hover:bg-line"
            >
              저장된 설정 지우기
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted">
            이 설정은 이 기기에만 남아요. 지우면 다음 측정 때 처음부터 다시 물어요.
          </p>
        </div>
      </BottomSheet>
    </>
  );
}
