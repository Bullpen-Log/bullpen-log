import { useId, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Svg, { Defs, G, Image as SvgImage, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '~/lib/ui';
import { BRAND, MARK_FRAME, MARK_PATH, MARK_RENDER } from './mark-path';

const SINKER_MARK = require('../../assets/sinker-mark-soft-bevel.png');
const CAP_HEIGHT = 882;
const MARK_WIDTH = 1006;
const MARK_HEIGHT = 1001;
const DEPTH_X = 17;
const DEPTH_Y = 30;
const CAP_EM = 0.7;
const MARK_GAP = 114;
const LETTER_GAP = 99;

// The approved wordmark's letter outlines. Their 45° cuts echo the original S.
const LETTERS = {
  I: { width: 184, path: 'M20 0H184V862L164 882H0V20Z' },
  N: { width: 536, path: 'M30 0H156L377 511V28L405 0H536V854L508 882H379L159 371V854L131 882H0V30Z' },
  K: { width: 519, path: 'M30 0H164V363L337 28L365 0H519L292 427L519 852L489 882H350L164 522V854L136 882H0V30Z' },
  E: { width: 449, path: 'M30 0H449V107L416 140H164V355H397V461L364 494H164V742H449V849L416 882H0V30Z' },
  R: {
    width: 518,
    path: 'M30 0H408L469 26L505 74L517 133V385L500 452L458 501L418 519L518 851L488 882H354L249 527H164V854L136 882H0V30ZM164 140V387H320L346 373L355 346V181L346 154L320 140Z',
  },
};

export const SINKER_LETTERS = ['I', 'N', 'K', 'E', 'R'] as const;
export const MARK_ASPECT = MARK_FRAME.width / MARK_FRAME.height;
const unitAt = (size: number) => size * CAP_EM / CAP_HEIGHT;

export function sinkerMarkSlot(size: number) {
  const unit = unitAt(size);
  return { h: MARK_FRAME.height * unit, right: (MARK_WIDTH + MARK_GAP - MARK_FRAME.width) * unit, bottom: 0 };
}

// Join each edge of the face to its projected back edge. The quads share a
// winding direction so adjoining side faces fill as one continuous shape.
function sidePath(path: string) {
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let sides = '';
  for (const [, command, coords] of path.matchAll(/([MLlHVZ])([^MLlHVZ]*)/g)) {
    const [first, second] = coords.trim().split(/\s+/).map(Number);
    if (command === 'M') {
      startX = x = first;
      startY = y = second;
      continue;
    }

    let nextX = x;
    let nextY = y;
    switch (command) {
      case 'l': nextX += first; nextY += second; break;
      case 'L': nextX = first; nextY = second; break;
      case 'H': nextX = first; break;
      case 'V': nextY = first; break;
      case 'Z': nextX = startX; nextY = startY; break;
    }

    const cross = (nextX - x) * DEPTH_Y - (nextY - y) * DEPTH_X;
    if (cross > 0) sides += `M${x} ${y}L${nextX} ${nextY}l${DEPTH_X} ${DEPTH_Y}L${x + DEPTH_X} ${y + DEPTH_Y}Z`;
    if (cross < 0) sides += `M${nextX} ${nextY}L${x} ${y}l${DEPTH_X} ${DEPTH_Y}L${nextX + DEPTH_X} ${nextY + DEPTH_Y}Z`;
    x = nextX;
    y = nextY;
  }
  return sides;
}

let nextLetterX = MARK_WIDTH + MARK_GAP;
const GLYPHS = SINKER_LETTERS.map((name) => {
  const { path, width } = LETTERS[name];
  const x = nextLetterX;
  nextLetterX += width + LETTER_GAP;
  return { name, path, width, x, sides: sidePath(path) };
});
const WORDMARK_WIDTH = nextLetterX - LETTER_GAP + DEPTH_X;
const ICE_FINISH = { faceTop: '#edf7ff', faceBottom: '#bcd7ef', side: '#7a9ebd' };
const NAVY_FINISH = { faceTop: '#365579', faceBottom: '#1a3659', side: '#132943' };

function Relief({ path, sides, finish }: { path: string; sides: string; finish: typeof ICE_FINISH }) {
  const gradient = `wordmark${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <>
      <Defs>
        <LinearGradient id={gradient} x1="0%" y1="0%" x2="25%" y2="100%">
          <Stop offset="0" stopColor={finish.faceTop} />
          <Stop offset="1" stopColor={finish.faceBottom} />
        </LinearGradient>
      </Defs>
      <Path d={sides} fill={finish.side} />
      <Path d={path} fill={`url(#${gradient})`} fillRule="evenodd" />
    </>
  );
}

function SinkerMarkArt({ onLoad }: { onLoad?: () => void }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded ? <Path d={MARK_PATH} fill={BRAND} /> : null}
      <SvgImage
        {...MARK_RENDER}
        href={SINKER_MARK}
        onLoad={() => {
          setLoaded(true);
          onLoad?.();
        }}
      />
    </>
  );
}

export function SinkerMark({ height, onLoad }: { height: number; onLoad?: () => void }) {
  return (
    <Svg width={height * MARK_ASPECT} height={height} viewBox={`0 0 ${MARK_FRAME.width} ${MARK_FRAME.height}`} accessible={false}>
      <SinkerMarkArt onLoad={onLoad} />
    </Svg>
  );
}

export function SinkerLetter({ index, size, onDark }: { index: number; size: number; onDark: boolean }) {
  const letter = GLYPHS[index];
  const unit = unitAt(size);
  const width = letter.width + DEPTH_X;
  const height = CAP_HEIGHT + DEPTH_Y;
  return (
    <View style={{ marginBottom: (MARK_HEIGHT - CAP_HEIGHT) * unit, marginRight: index < GLYPHS.length - 1 ? (LETTER_GAP - DEPTH_X) * unit : 0 }}>
      <Svg width={width * unit} height={height * unit} viewBox={`0 0 ${width} ${height}`} accessible={false}>
        <Relief path={letter.path} sides={letter.sides} finish={onDark ? ICE_FINISH : NAVY_FINISH} />
      </Svg>
    </View>
  );
}

export function Wordmark({ size = 24, onDark, allowFontScaling = true }: { size?: number; onDark?: boolean; allowFontScaling?: boolean }) {
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const finish = (onDark ?? theme !== 'light') ? ICE_FINISH : NAVY_FINISH;
  const unit = unitAt(allowFontScaling ? size * fontScale : size);
  const height = MARK_FRAME.height;

  return (
    <View accessible accessibilityRole="header" accessibilityLabel="싱커">
      {/* A single viewport keeps the letters on the same cap line and baseline at header sizes. */}
      <Svg width={WORDMARK_WIDTH * unit} height={height * unit} viewBox={`0 0 ${WORDMARK_WIDTH} ${height}`} accessible={false}>
        <SinkerMarkArt />
        {GLYPHS.map((glyph) => (
          <G key={glyph.name} x={glyph.x}>
            <Relief path={glyph.path} sides={glyph.sides} finish={finish} />
          </G>
        ))}
      </Svg>
    </View>
  );
}
