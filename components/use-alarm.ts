'use client';

import { useCallback, useEffect, useRef } from 'react';
import { buzz } from '@/lib/haptics';

/** 무엇이 끝났나 — 버티기 끝은 두 번, 쉬기 끝은 한 번 울린다 */
export type AlarmKind = 'hold' | 'rest';

/**
 * 시계가 끝났다는 신호 — 진동과 짧은 소리.
 *
 * 암케어 따라하기(버티기 · 쉬기 시계)와 운동 화면(쉬는 시간 목표)이 같이 쓴다.
 *
 * 예전에는 진동뿐이었는데, 아이폰은 웹에서 진동을 쓸 수 없어 버티기가 끝나도 아무
 * 신호가 없었다(2026-09-26 검토). 소리는 사람이 누른 순간에 한 번 깨워 둬야 난다
 * (브라우저 규칙) — 화면의 단추를 누를 때마다 깨운다(arm). 무음 모드면 소리가 안 날 수
 * 있다 — 아이폰 앱은 진동(lib/haptics.ts, 앱의 진동)이 대신 알린다.
 */
export function useAlarm() {
  const audio = useRef<AudioContext | null>(null);

  const arm = useCallback(() => {
    let ac = audio.current;
    if (!ac) {
      const Ctor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      try {
        ac = audio.current = new Ctor();
        /* 아이폰은 누른 순간에 무엇이든 한 번 울려야 뒤에 소리가 난다 — 들리지 않는 한 점 */
        const silent = ac.createBufferSource();
        silent.buffer = ac.createBuffer(1, 1, 22050);
        silent.connect(ac.destination);
        silent.start(0);
      } catch {
        /* 소리 없이 진동만 */
        return;
      }
    }
    /*
     * 'running' 이 아니면 깨운다. 아이폰 사파리는 다른 앱 · 전화 · 화면 잠금에 다녀오면
     * 'suspended' 가 아니라 'interrupted' 로 남기도 해서, 'suspended' 만 깨웠더니 그 뒤로
     * 끝 소리가 안 났다(2026-09-27 검토).
     */
    if (ac.state !== 'running' && ac.state !== 'closed') ac.resume().catch(() => {});
  }, []);

  const ring = useCallback((kind: AlarmKind) => {
    buzz(kind === 'hold' ? [180, 80, 180] : 250);
    const ac = audio.current;
    if (!ac || ac.state !== 'running') return;
    /* 버티기 끝은 두 번, 쉬기 끝은 한 번 — 눈을 안 떼도 어느 쪽인지 */
    for (let k = 0; k < (kind === 'hold' ? 2 : 1); k++) {
      const t = ac.currentTime + k * 0.22;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    }
  }, []);

  /* 화면을 떠나면 소리 연결을 닫는다 — 브라우저가 한 번에 여는 수에 한도가 있다 */
  useEffect(() => {
    const box = audio;
    return () => {
      const ac = box.current;
      box.current = null;
      ac?.close().catch(() => {});
    };
  }, []);

  return { arm, ring };
}
