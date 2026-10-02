'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, Settings2 } from 'lucide-react';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui';
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
  defaultZone,
  loadSetup,
  NET_OPTIONS,
  saveSetup,
  SETUP_CHANGE_EVENT,
  SETUP_KEY,
  type VelocitySetup,
  approachOf,
  RELEASE_DIST_MIN,
  RELEASE_DIST_MAX,
} from '@/lib/velocity-setup';
import {
  LENS_CHANGE_EVENT,
  LENS_KEY,
  loadLens,
  type LensCalibration,
} from '@/lib/velocity-lens';
import { applySpeedUnit, SPEED_UNITS } from '@/lib/units';
import { useSpeedUnit } from '@/components/use-units';
import { dualReasonText, useDualCameraStatus } from '@/lib/dual-camera';
import { BottomSheet } from './pitch-editor';
import { Panel, SectionLabel } from './kit';

/**
 * 불펜 벨로시티 설정 — 측정 화면 · 투구 기록 탭의 [구속 측정] 보기가 같은 칸을 쓴다.
 *
 * 값은 브라우저(localStorage)에 있다(lib/velocity-setup.ts). 측정 화면은 제 상태를 넘겨 주고
 * (controlled), 보기는 저장된 것을 읽어 바로 고친다(VelocitySettingsButton).
 * 고르는 줄은 앱의 Segmented(캘린더 | 목록과 같은 부품), 켜고 끄는 것은 체크 상자.
 */

export type SettingsValues = Pick<
  VelocitySetup,
  | 'cameraPos'
  | 'net'
  | 'voice'
  | 'useCal'
  | 'releaseDistM'
  | 'autoMode'
  | 'calibSave'
  | 'clipZone'
  | 'wideClip'
> & { fovDeg: number };

const NET_VALUES = [
  { value: 'yes', label: '네트 있음' },
  { value: 'no', label: '네트 없음' },
] as const;

export function VelocitySettingsFields({
  values,
  onChange,
  calibration,
  showChoices = true,
  isAdmin = false,
}: {
  values: SettingsValues;
  onChange: (patch: Partial<SettingsValues>) => void;
  calibration: CalFit;
  /** 관리자에게만 '정확도 보정용 저장' 줄을 보인다 */
  isAdmin?: boolean;
  /** 녹화 종류 · 카메라 위치 · 네트도 여기서 바꿀까 — 측정 중에는 숨긴다 */
  showChoices?: boolean;
}) {
  /* 구속 단위 — 앱 전체의 단위 설정(내 정보 · 투구 기록)과 같은 값. 여기서 바꾸면 거기도 바뀐다 */
  const speedUnit = useSpeedUnit();
  /*
   * 이 기기가 일반 · 광각을 함께 켤 수 있나(앱 부품에 묻는다 — 웹 · 옛 앱 · 못 하는 아이폰은 안 됨). 안 되면 '광각 영상도 같이
   * 저장'을 보이되 못 켜게 잠그고 까닭을 경고로 띄운다(2026-10-03 사용자). 켜 둔 채 저장된 값이 있어도 꺼진 것으로 보인다.
   */
  const dual = useDualCameraStatus();
  const dualOk = dual?.supported === true;
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>측정</SectionLabel>
        <Panel className="divide-y divide-line">
          <ChoiceRow title="구속 단위" hint="앱 전체에 적용돼요 — 투구 기록 · 내 정보도 같은 단위로 보여요.">
            <Segmented
              label="구속 단위"
              value={speedUnit}
              onChange={applySpeedUnit}
              options={SPEED_UNITS.map((u) => ({ value: u.value, label: u.label, hint: u.hint }))}
              size="sm"
            />
          </ChoiceRow>
          <ToggleRow
            title="소리로 구속 알려주기"
            hint="공을 잴 때마다 폰이 숫자를 읽어요. 카메라를 볼 필요 없이 던질 수 있어요."
            checked={values.voice}
            onChange={(voice) => {
              onChange({ voice });
              if (voice && typeof speechSynthesis !== 'undefined') {
                const u = new SpeechSynthesisUtterance('소리 안내를 켰어요');
                u.lang = 'ko-KR';
                speechSynthesis.speak(u);
              }
            }}
          />
          <ToggleRow
            title="자동 측정"
            hint="켜 두면 공마다 알아서 잡아요. 끄면 공마다 '다음 공'을 눌러 기다려요."
            checked={values.autoMode}
            onChange={(autoMode) => onChange({ autoMode })}
          />
          {isAdmin && (
            <ToggleRow
              title="정확도 보정용 저장(관리자)"
              hint="켜고 잰 세션이 구속 측정 관리자에서 보정 자료로 표시돼요. 영상 클립 · 분석 자료는 이것과 상관없이 모든 세션에서 올라가요."
              checked={values.calibSave}
              onChange={(calibSave) => onChange({ calibSave })}
            />
          )}
          <ToggleRow
            title="영상에 스트라이크 존 표시"
            hint="저장된 공 영상(▶ · 구속 측정 관리자)을 볼 때 잰 순간의 스트라이크 존과 짐작한 코스 칸을 겹쳐 보여요. 영상 파일은 그대로예요."
            checked={values.clipZone}
            onChange={(clipZone) => onChange({ clipZone })}
          />
          <ToggleRow
            title="광각 영상도 같이 저장"
            hint={
              dual == null
                ? '이 기기에서 되는지 확인하는 중이에요…'
                : '측정은 일반 카메라로 하고, 공마다 광각 카메라 영상도 함께 남겨요. 구속 측정 관리자에서 두 영상을 나란히 봐요.'
            }
            warning={dual && !dualOk ? dualReasonText(dual.reason) : undefined}
            checked={values.wideClip && dualOk}
            disabled={!dualOk}
            onChange={(wideClip) => onChange({ wideClip })}
          />
          <ToggleRow
            title="스피드건 보정 적용"
            hint={
              calibration.n > 0
                ? `내 짝 ${calibration.n}개로 맞춘 식 ${calibrationText(calibration)}`
                : '아직 짝이 없어요 — 공에 스피드건 값을 적고 저장하면 쌓여요.'
            }
            checked={values.useCal}
            disabled={calibration.n === 0}
            onChange={(useCal) => onChange({ useCal })}
          />
          <label className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
            <span className="min-w-0">
              <span className="block text-sm text-ink">카메라 가로 화각</span>
              <span className="block text-xs leading-snug text-muted">
                아이폰 후면 기본 카메라 약 69°. 크게 잡으면 구속이 낮게 나와요. 렌즈
                보정을 하면 이 값 대신 잰 초점거리를 써요.
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-sm">
              <input
                inputMode="decimal"
                key={values.fovDeg}
                defaultValue={values.fovDeg}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (n >= 30 && n <= 120 && n !== values.fovDeg)
                    onChange({ fovDeg: n });
                  else e.target.value = String(values.fovDeg);
                }}
                aria-label="카메라 가로 화각(도)"
                className="h-11 w-20 rounded-xl border border-line bg-surface-2 px-3 text-right text-sm tabular-nums text-ink transition-colors focus:border-sky focus:outline-none"
              />
              °
            </span>
          </label>
          {approachOf(values) === 'approaching' && (
            <label className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block text-sm text-ink">
                  카메라에서 릴리스 지점까지
                </span>
                <span className="block text-xs leading-snug text-muted">
                  다가오는 공은 마지막 몇 m 만 보여요. 이 거리만큼 공기저항(1m 에 약
                  0.8km/h)을 되돌려 릴리스 구속을 내요. 정규 마운드 · 홈 뒤 1.8m 면 약
                  18.5m.
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-sm">
                <input
                  inputMode="decimal"
                  key={values.releaseDistM}
                  defaultValue={values.releaseDistM}
                  onBlur={(e) => {
                    const n = Math.round(Number(e.target.value) * 10) / 10;
                    if (
                      n >= RELEASE_DIST_MIN &&
                      n <= RELEASE_DIST_MAX &&
                      n !== values.releaseDistM
                    )
                      onChange({ releaseDistM: n });
                    else e.target.value = String(values.releaseDistM);
                  }}
                  aria-label="카메라에서 릴리스 지점까지 거리(m)"
                  className="h-11 w-20 rounded-xl border border-line bg-surface-2 px-3 text-right text-sm tabular-nums text-ink transition-colors focus:border-sky focus:outline-none"
                />
                m
              </span>
            </label>
          )}
        </Panel>
      </div>

      {showChoices && (
        <div>
          <SectionLabel>촬영</SectionLabel>
          <Panel className="divide-y divide-line">
            <ChoiceRow title="카메라 위치">
              <Segmented
                label="카메라 위치"
                value={values.cameraPos}
                onChange={(cameraPos) => onChange({ cameraPos })}
                options={CAMERA_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
                size="sm"
              />
            </ChoiceRow>
            <ChoiceRow
              title="네트"
              hint={NET_OPTIONS.find((o) => o.key === values.net)?.hint}
            >
              <Segmented
                label="네트"
                value={values.net ? 'yes' : 'no'}
                onChange={(v) => onChange({ net: v === 'yes' })}
                options={NET_VALUES}
                size="sm"
              />
            </ChoiceRow>
          </Panel>
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  title,
  hint,
  warning,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  hint: string;
  /** 켤 수 없는 까닭 — 있으면 경고 줄로 보인다(스위치는 disabled 로 함께 잠근다) */
  warning?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className={`flex min-h-14 items-center justify-between gap-3 px-4 py-3 ${
        disabled ? 'cursor-not-allowed' : ''
      }`}
    >
      <span className="min-w-0">
        <span className={`block text-sm ${disabled ? 'text-muted' : 'text-ink'}`}>
          {title}
        </span>
        <span className="block text-xs leading-snug text-muted">{hint}</span>
        {warning && (
          <span
            role="alert"
            className="mt-1.5 flex items-start gap-1.5 text-xs font-medium leading-snug text-warn"
          >
            <AlertTriangle aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
            {warning}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 accent-sky"
      />
    </label>
  );
}

function ChoiceRow({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-sm text-ink">{title}</p>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-2 text-xs leading-snug text-muted">{hint}</p>}
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

/** 저장된 렌즈 보정 — 서버에서는 null. 바뀌면 다시 그린다 */
export function useStoredLens(): LensCalibration | null {
  const raw = useSyncExternalStore(subscribeLens, readLensRaw, () => null);
  return useMemo(() => (raw ? loadLens() : null), [raw]);
}
const subscribeLens = (cb: () => void) => {
  window.addEventListener('storage', cb);
  window.addEventListener(LENS_CHANGE_EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(LENS_CHANGE_EVENT, cb);
  };
};
const readLensRaw = () => {
  try {
    return localStorage.getItem(LENS_KEY);
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
 * 톱니 단추 하나 — 누르면 설정 시트. [구속 측정] 보기가 쓴다.
 * 저장된 설정이 없으면 기본값을 보여 주고, 고치는 순간 저장한다.
 */
export function VelocitySettingsButton({
  calibration,
  className = '',
  label = '불펜 벨로시티 설정',
  isAdmin = false,
}: {
  calibration: CalFit;
  className?: string;
  label?: string;
  isAdmin?: boolean;
}) {
  const stored = useStoredSetup();
  const [open, setOpen] = useState(false);
  const [fov, setFov] = useState(() => loadFov(DEFAULT_FOV_DEG));
  const base = stored ?? { ...DEFAULT_SETUP, savedAt: '' };
  const values: SettingsValues = {
    cameraPos: base.cameraPos,
    net: base.net,
    voice: base.voice,
    useCal: base.useCal,
    releaseDistM: base.releaseDistM,
    autoMode: base.autoMode,
    calibSave: base.calibSave,
    clipZone: base.clipZone,
    wideClip: base.wideClip,
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
        sessionType: base.sessionType,
        cameraPos: base.cameraPos,
        net: base.net,
        /* 카메라 위치를 바꾸면 존 크기 범위가 달라 그 자리의 기본 존으로 */
        zone:
          rest.cameraPos && rest.cameraPos !== base.cameraPos
            ? defaultZone(rest.cameraPos)
            : base.zone,
        voice: base.voice,
        useCal: base.useCal,
        releaseDistM: base.releaseDistM,
        autoMode: base.autoMode,
        calibSave: base.calibSave,
        clipZone: base.clipZone,
        wideClip: base.wideClip,
        camMode: base.camMode,
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
        <div className="space-y-5">
          <VelocitySettingsFields
            values={values}
            onChange={change}
            calibration={calibration}
            isAdmin={isAdmin}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              className="h-10 px-3.5 text-xs"
              onClick={() =>
                saveSetup({
                  sessionType: base.sessionType,
                  cameraPos: base.cameraPos,
                  net: base.net,
                  zone: defaultZone(base.cameraPos),
                  voice: base.voice,
                  useCal: base.useCal,
                  releaseDistM: base.releaseDistM,
                  autoMode: base.autoMode,
                  calibSave: base.calibSave,
                  clipZone: base.clipZone,
                  wideClip: base.wideClip,
                  camMode: base.camMode,
                })
              }
            >
              스트라이크 존 자리 초기화
            </Button>
            <Button
              variant="secondary"
              className="h-10 px-3.5 text-xs"
              onClick={() => clearSetup()}
            >
              저장된 설정 지우기
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            이 설정은 이 기기에만 남아요. 지우면 다음 측정 때 처음부터 다시 물어요.
          </p>
        </div>
      </BottomSheet>
    </>
  );
}
