'use client';

import { useRef, useState } from 'react';
import { Gauge, Upload } from 'lucide-react';
import { analyzeVideo, type AnalyzeResult } from '@/lib/velocity-engine/analyze-video';
import { Button, Card } from '@/components/ui';

/**
 * 영상에서 구속을 재는 화면.
 *
 * 영상은 서버로 올리지 않는다. 브라우저가 파일을 직접 열어 계산하고 끝난다.
 * 용량이 큰 영상을 주고받지 않아 빠르고, 기록을 남기기 전까지 아무것도
 * 서버에 남지 않는다.
 *
 * 아직 시험 단계라 결과를 투구 일지에 저장하지 않는다. 정확도가 검증되기 전에
 * 기록에 섞이면, 나중에 그 숫자가 맞는지 아닌지 가릴 수 없게 된다.
 */

/** 신뢰도 표시 문구 */
const CONFIDENCE_LABEL = {
  high: { text: '신뢰도 높음', tone: 'text-sky' },
  medium: { text: '신뢰도 보통', tone: 'text-ink' },
  low: { text: '참고용 — 신뢰도 낮음', tone: 'text-warn' },
} as const;

export function VelocityClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (file: File) => {
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(0);
    setFileName(file.name);

    try {
      const analyzed = await analyzeVideo({ file, onProgress: setProgress });
      setResult(analyzed);
    } catch (e) {
      setError(e instanceof Error ? e.message : '영상을 분석하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 촬영 조건 — 지키지 않으면 측정이 거부되므로 먼저 크게 알린다 */}
      <Card className="space-y-3">
        <p className="text-sm font-bold text-ink">이렇게 찍어야 측정됩니다</p>
        <ul className="space-y-1.5 text-sm leading-relaxed text-muted">
          <li>· 삼각대나 고정된 곳에 폰을 거치하세요 (손으로 들면 측정 불가)</li>
          <li>· <strong className="text-ink">투수 바로 뒤 1m 이내</strong>에 두고, 던지는 방향을 향하게 하세요</li>
          <li>· 공을 놓는 지점이 <strong className="text-ink">화면 한가운데</strong> 오도록 높이를 맞추세요</li>
          <li>· 공이 네트·포수에 닿을 때까지 녹화를 이어가세요</li>
          <li>
            · <strong className="text-ink">반드시 슬로모션</strong>으로, 화질은{' '}
            <strong className="text-ink">1080p 이상</strong>으로 찍으세요
          </li>
        </ul>
        <p className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-muted">
          슬로모션이 <strong className="text-ink">권장이 아니라 필수</strong>인 이유가
          있습니다. 일반 촬영(초당 30장)에서는 공이 손을 떠나 네트에 닿기까지가 한두
          장면 사이에 끝나버려, 날아가는 모습이 아예 안 담깁니다.
        </p>
        <p className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-muted">
          조건을 못 지킨 영상은 <strong className="text-ink">숫자를 내지 않고 이유를 알려드립니다.</strong>{' '}
          틀린 구속이 기록에 남는 것보다 낫기 때문입니다.
        </p>
      </Card>

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void run(file);
          e.target.value = '';
        }}
      />

      <Button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 py-4"
      >
        <Upload className="h-4 w-4" />
        {busy ? '분석 중…' : '투구 영상 고르기'}
      </Button>

      {busy && (
        <Card className="space-y-2">
          <p className="text-sm text-muted">
            {fileName} — 영상을 한 프레임씩 살펴보는 중입니다
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-sky transition-[width]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted">
            영상 길이에 따라 30초 이상 걸릴 수 있습니다. 창을 닫지 마세요.
          </p>
        </Card>
      )}

      {error && (
        <p className="rounded-lg border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {result && !result.measure.ok && (
        <Card className="space-y-2 border-warn-line bg-warn-bg">
          <p className="text-sm font-bold text-warn">측정하지 않았습니다</p>
          <p className="text-sm leading-relaxed text-warn">{result.measure.message}</p>
          <p className="text-sm leading-relaxed text-warn">{result.measure.fix}</p>
          <p className="border-t border-warn-line pt-2 text-xs text-warn/80">
            {result.sourceSize.width}×{result.sourceSize.height}
            {result.fps != null && ` · 초당 ${Math.round(result.fps)}장`} · 살펴본 프레임{' '}
            {result.frameCount}개 · 공을 이어붙인 프레임 {result.track.length}개
            {result.shakePx > 0 && ` · 흔들림 ${result.shakePx}`}
          </p>
        </Card>
      )}

      {result?.measure.ok && (
        <Card className="space-y-4">
          <div className="flex items-baseline gap-2">
            <Gauge className="h-5 w-5 text-sky" />
            <span className="text-display text-5xl leading-none text-ink tabular-nums">
              {result.measure.kmh}
            </span>
            <span className="text-lg text-muted">km/h</span>
            <span className="text-sm text-muted">± {result.measure.errorKmh}</span>
          </div>

          <p className={`text-sm font-medium ${CONFIDENCE_LABEL[result.measure.confidence].tone}`}>
            {CONFIDENCE_LABEL[result.measure.confidence].text}
          </p>

          <div className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-muted">
            이 값은 공이 날아간 구간의 <strong className="text-ink">평균 속도</strong>입니다.
            공은 날아가며 느려지므로, 레이더건이 재는 릴리스 직후 속도보다 몇 km/h 낮게
            나옵니다. 같은 방식으로 계속 재면 변화를 비교하는 데는 문제가 없습니다.
          </div>

          <details className="rounded-2xl border border-line px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-ink">
              어떻게 계산했나요?
            </summary>
            <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-muted">
              <li>— 공을 이어붙인 프레임 {result.measure.detail.frames}개</li>
              <li>— 릴리스 지점까지 거리 {result.measure.detail.releaseDistanceM}m</li>
              <li>— 공이 날아간 구간 {result.measure.detail.travelM}m</li>
              <li>— 걸린 시간 {result.measure.detail.durationSec}초</li>
              <li>— 궤적이 직선에 맞은 정도 {result.measure.detail.fitQuality}</li>
              <li>— 살펴본 프레임 {result.frameCount}개 · 흔들림 {result.shakePx}</li>
            </ul>
            <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-muted">
              야구공 지름이 7.3cm로 정해져 있어, 화면에 몇 픽셀로 찍혔는지 재면 카메라에서
              얼마나 떨어져 있는지 알 수 있습니다. 프레임마다 그 거리를 재고 시간으로 나눠
              속도를 냅니다. 그래서 거리를 따로 입력하지 않아도 됩니다.
            </p>
          </details>
        </Card>
      )}
    </div>
  );
}
