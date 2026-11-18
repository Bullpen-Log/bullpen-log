import { useId } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '~/lib/ui';
import { MARK_PATH } from './mark-path';

const CAP_HEIGHT = 882;
const MARK_WIDTH = 1006;
const MARK_HEIGHT = 1001;
const DEPTH_X = 36;
const DEPTH_Y = 48;
const CAP_EM = 0.7;
const MARK_GAP = 69;
const LETTER_GAP = 99;

// The approved wordmark's letter outlines. Their 45° cuts echo the original S.
const LETTERS = {
  I: { width: 164, path: 'M28 0H164V854L136 882H0V28Z' },
  N: { width: 536, path: 'M30 0H156L377 511V28L405 0H536V854L508 882H379L159 371V854L131 882H0V30Z' },
  K: { width: 519, path: 'M30 0H164V363L337 28L365 0H519L292 427L519 852L489 882H350L164 522V854L136 882H0V30Z' },
  E: { width: 449, path: 'M30 0H449V107L416 140H164V355H397V461L364 494H164V742H449V849L416 882H0V30Z' },
  R: {
    width: 518,
    path: 'M30 0H408L469 26L505 74L517 133V385L500 452L458 501L418 519L518 851L488 882H354L249 527H164V854L136 882H0V30ZM164 140V387H320L346 373L355 346V181L346 154L320 140Z',
  },
};

export const SINKER_LETTERS = ['I', 'N', 'K', 'E', 'R'] as const;
export const MARK_ASPECT = (MARK_WIDTH + DEPTH_X) / (MARK_HEIGHT + DEPTH_Y);
const unitAt = (size: number) => size * CAP_EM / CAP_HEIGHT;

export function sinkerMarkSlot(size: number) {
  const unit = unitAt(size);
  return { h: (MARK_HEIGHT + DEPTH_Y) * unit, right: (MARK_GAP - DEPTH_X) * unit, bottom: 0 };
}

const MARK_FINISH = { faceTop: '#68b5ff', faceBottom: '#2085dc', edge: '#a7d9ff', side: '#075b9e' };
const ICE_FINISH = { faceTop: '#edf7ff', faceBottom: '#b6d6f1', edge: '#ffffff', side: '#658eb2' };
const NAVY_FINISH = { faceTop: '#385b87', faceBottom: '#1c385e', edge: '#7494b8', side: '#14283f' };

function Relief({
  path, w, h, unit, finish,
}: {
  path: string;
  w: number;
  h: number;
  unit: number;
  finish: typeof MARK_FINISH;
}) {
  const gradient = `wordmark${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const width = w + DEPTH_X;
  const height = h + DEPTH_Y;
  return (
    <Svg width={width * unit} height={height * unit} viewBox={`0 0 ${width} ${height}`} accessible={false}>
      <Defs>
        <LinearGradient id={gradient} x1="0%" y1="0%" x2="32%" y2="100%">
          <Stop offset="0" stopColor={finish.faceTop} />
          <Stop offset="1" stopColor={finish.faceBottom} />
        </LinearGradient>
      </Defs>
      {/* Shift the same outline toward the lower-right to form the bevel and side. */}
      <Path d={path} transform="translate(28 40)" fill={finish.side} stroke={finish.side} strokeWidth={16} strokeLinejoin="round" />
      <Path d={path} transform="translate(19 27)" fill={finish.side} stroke={finish.side} strokeWidth={16} strokeLinejoin="round" />
      <Path d={path} transform="translate(9 13)" fill={finish.side} stroke={finish.side} strokeWidth={16} strokeLinejoin="round" />
      <Path d={path} fill={`url(#${gradient})`} fillRule="evenodd" />
      <Path d={path} fill="none" stroke={finish.edge} strokeOpacity={0.45} strokeWidth={8} strokeLinejoin="round" />
    </Svg>
  );
}

export function SinkerMark({ height }: { height: number }) {
  return <Relief path={MARK_PATH} w={MARK_WIDTH} h={MARK_HEIGHT} unit={height / (MARK_HEIGHT + DEPTH_Y)} finish={MARK_FINISH} />;
}

export function SinkerLetter({ index, size, onDark }: { index: number; size: number; onDark: boolean }) {
  const letter = LETTERS[SINKER_LETTERS[index]];
  const unit = unitAt(size);
  return (
    <View style={{ marginBottom: (MARK_HEIGHT - CAP_HEIGHT) * unit, marginRight: index < SINKER_LETTERS.length - 1 ? (LETTER_GAP - DEPTH_X) * unit : 0 }}>
      <Relief path={letter.path} w={letter.width} h={CAP_HEIGHT} unit={unit} finish={onDark ? ICE_FINISH : NAVY_FINISH} />
    </View>
  );
}

export function Wordmark({ size = 24, onDark, allowFontScaling = true }: { size?: number; onDark?: boolean; allowFontScaling?: boolean }) {
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const darkSurface = onDark ?? theme !== 'light';
  const scaledSize = allowFontScaling ? size * fontScale : size;
  const slot = sinkerMarkSlot(scaledSize);
  return (
    <View accessible accessibilityRole="header" accessibilityLabel="싱커" style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <View style={{ marginRight: slot.right }}>
        <SinkerMark height={slot.h} />
      </View>
      {SINKER_LETTERS.map((letter, index) => <SinkerLetter key={letter} index={index} size={scaledSize} onDark={darkSurface} />)}
    </View>
  );
}
