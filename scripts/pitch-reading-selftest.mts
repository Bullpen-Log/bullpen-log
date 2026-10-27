import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  devicePitchDisplay,
  iphonePpi,
  isPitchDisplay,
  isPitchHistory,
  embedPitchScene,
} from '../lib/pitch-reading.ts';

assert.equal(iphonePpi('iPhone 16 Pro'), 460);
assert.equal(iphonePpi('iPhone 11'), 326);
assert.equal(iphonePpi('iPhone 14 Plus'), 458);
assert.equal(iphonePpi('an unmeasured phone'), null);
assert.equal(devicePitchDisplay('iPhone 16 Pro', 0), null);
const d = devicePitchDisplay('iPhone 16 Pro', 3)!;
assert.ok(isPitchDisplay(d));
assert.ok(Math.abs(393 / d.cssPixelsPerCm - 6.5101304348) < 0.0001);
assert.equal(isPitchDisplay({ ...d, cssPixelsPerCm: Infinity }), false);
assert.equal(isPitchHistory([]), true);
assert.equal(
  isPitchHistory([
    { id: 'x', engineVersion: 'reference-aero-8', eye: 'R', trials: [] },
  ]),
  true
);
assert.equal(
  isPitchHistory(
    Array.from({ length: 31 }, () => ({
      id: 'x',
      engineVersion: 'x',
      eye: 'R',
      trials: [],
    }))
  ),
  false
);
assert.equal(
  isPitchHistory([
    { id: 'x', engineVersion: 'x', eye: 'R', trials: Array(11).fill({}) },
  ]),
  false
);
const injection = '</script><script>untrusted()</script>';
const embedded = embedPitchScene('<head></head>', { history: [{ id: injection }] });
assert.equal(embedded.includes(injection), false);
assert.equal(embedded.split('</script>').length, 2);
const web = await readFile(
  new URL('../public/pitch-reading/index.html', import.meta.url),
  'utf8'
);
const native = JSON.parse(
  await readFile(
    new URL('../native/src/pitch-reading/scene.generated.json', import.meta.url),
    'utf8'
  )
);
assert.equal(native.html, web, 'Web and iPhone must ship the same scene');
assert.ok(web.includes('fixed-window-150cm-2') && web.includes('fixed-release-view-2') && web.includes('physical-window-1'));
console.log(
  'Pitch-reading integration: device scale, bridge limits, boot escaping, identical web/native artifact passed.'
);
