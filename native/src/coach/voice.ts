import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { NativeModule } from 'expo';
import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * 코치에게 말로 하기(자비스 4단계, docs/designs/ai-coach-knowledge-memory.md 12절) — 앱 부품 CoachVoice(modules/bullpen-native/ios/CoachVoiceCore.swift).
 * 받아쓰기는 폰 안에서만(소리를 밖으로 안 보낸다) · 읽기는 기기 한국어 목소리. 옛 앱 판 · 폰 안 받아쓰기를 못 하는 폰이면 available 이 false(마이크를 숨긴다).
 * 받아쓴 글은 입력 칸에 넣기만 한다 — 보내기는 선수가 누른다(잘못 들은 말 · 이름이 그대로 AI 로 가지 않게).
 */
type Events = {
  text(e: { text: string; final: boolean }): void;
  end(e: { error: string }): void;
  spoken(e: Record<string, never>): void;
};
declare class CoachVoiceModule extends NativeModule<Events> {
  available(): boolean;
  authorize(): Promise<boolean>;
  start(): Promise<void>;
  stop(): Promise<void>;
  cancel(): Promise<void>;
  speak(text: string): Promise<void>;
  stopSpeaking(): Promise<void>;
}

const Voice = Platform.OS === 'ios' ? requireOptionalNativeModule<CoachVoiceModule>('CoachVoice') : null;

/** 말이 멈추고 이만큼 조용하면 듣기를 끝낸다 */
export const SILENCE_MS = 1600;
/** 누르고 아무 말도 없으면 */
const FIRST_WORD_MS = 7000;
/** 한 번에 이만큼까지(폰 받아쓰기는 1분쯤이 한도) */
const MAX_MS = 50_000;

export function useCoachVoice() {
  const [available] = useState(() => {
    try {
      return !!Voice?.available();
    } catch {
      return false;
    }
  });
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const heard = useRef<((text: string) => void) | null>(null);
  const silence = useRef<ReturnType<typeof setTimeout> | null>(null);
  const max = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* 화면을 닫은 뒤 늦게 온 답은 읽지 않는다 */
  const alive = useRef(true);

  const clear = () => {
    if (silence.current) clearTimeout(silence.current);
    if (max.current) clearTimeout(max.current);
    silence.current = max.current = null;
  };
  const quietIn = (ms: number) => {
    if (silence.current) clearTimeout(silence.current);
    silence.current = setTimeout(() => void Voice?.stop(), ms);
  };

  useEffect(() => {
    if (!Voice) return;
    alive.current = true;
    const subs = [
      Voice.addListener('text', (e) => {
        heard.current?.(e.text);
        if (!e.final) quietIn(SILENCE_MS);
      }),
      Voice.addListener('end', (e) => {
        clear();
        heard.current = null;
        setListening(false);
        if (e.error) setNote(e.error);
      }),
      Voice.addListener('spoken', () => setSpeaking(null)),
    ];
    return () => {
      alive.current = false;
      subs.forEach((s) => s.remove());
      clear();
      void Voice.cancel();
      void Voice.stopSpeaking();
    };
  }, []);

  /** 마이크 — 듣는 중이면 끝(받은 말까지 마저 받아씀), 아니면 듣기 시작. onText 는 지금까지 받아쓴 글 전부 */
  const listen = useCallback(
    async (onText: (text: string) => void) => {
      if (!Voice) return;
      if (listening) return void Voice.stop();
      setNote(null);
      setSpeaking(null);
      const ok = await Voice.authorize().catch(() => false);
      if (!ok) return setNote('설정 › Sinker 에서 마이크와 음성 인식을 허용해 주세요.');
      heard.current = onText;
      /* 시작 전에 켠다 — 듣기가 곧바로 끝나도 'end' 가 끈다 */
      setListening(true);
      try {
        await Voice.start();
        quietIn(FIRST_WORD_MS);
        max.current = setTimeout(() => void Voice.stop(), MAX_MS);
      } catch (e) {
        heard.current = null;
        setListening(false);
        setNote(e instanceof Error ? e.message : '마이크를 켜지 못했어요.');
      }
    },
    [listening]
  );

  /** 듣기 그만(받아쓴 글을 더 넣지 않음) — 듣는 중에 보낼 때 */
  const cancel = useCallback(() => {
    heard.current = null;
    clear();
    setListening(false);
    void Voice?.cancel();
  }, []);

  /** 코치 말 읽기 — 같은 말을 다시 누르면 멈춤 */
  const speak = useCallback(
    (id: string, text: string) => {
      if (!Voice || !alive.current) return;
      if (speaking === id) return void Voice.stopSpeaking();
      setSpeaking(id);
      void Voice.speak(text);
    },
    [speaking]
  );

  return { available, listening, speaking, note, listen, cancel, speak };
}
