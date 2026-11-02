import assert from 'node:assert/strict';
import { analysisWindow, readAnalysisRange } from '../lib/report/analysis-range.ts';
import { daysOf, slotsOf, trendValues, trendCardOf, METRIC_SPECS, formatMetric } from '../lib/report/trends.ts';
let passed = 0;
const check = (label: string, value: boolean) => { assert.ok(value, label); passed++; };

const past = analysisWindow('2026-01-04');
check('historical window ends on selected day', past.to === '2026-01-04');
check('window contains exactly168 days', daysOf(past).length === 168);
check('window includes84 previous comparison days', daysOf(past).slice(-84).length === 84);
check('leap boundary', daysOf(analysisWindow('2024-03-01')).includes('2024-02-29'));
check('past does not include future', !daysOf(past).includes('2026-01-05'));
const earliest = '2025-07-22', asOf = '2026-01-04';
for (const raw of [null, [], false, {period:'unknown'}, {period:'custom',from:'2026-01-04',to:'2026-01-05'}, {period:'custom',from:'2025-12-31',to:'2025-12-01'}, {period:'custom',from:'2025-02-29',to:asOf}, {period:'custom',from:'2025-01-01',to:asOf}, {period:'custom',from:'<input>',to:asOf}]) {
  const read = readAnalysisRange(raw, earliest, asOf);
  check('invalid saved range safely falls back', read.period === '4w' && read.custom.to === asOf);
}
check('12week choice retained', readAnalysisRange({period:'12w'},earliest,asOf).period === '12w');
const saved = readAnalysisRange({period:'custom',from:'2025-12-01',to:'2025-12-31'},earliest,asOf);
check('valid past range retained', saved.period === 'custom' && saved.custom.to === '2025-12-31');
check('weekly/daily switch boundary', slotsOf({from:'2025-11-01',to:'2025-12-16'}).daily === false);
const values = trendValues({logs:[{date:'2026-01-02',pitchCount:0,maxVelocity:null},{date:'2026-01-03',pitchCount:20,maxVelocity:126},{date:'2026-01-03',pitchCount:10,maxVelocity:128}]});
check('explicit rest is zero', values('pitches','2026-01-02') === 0);
check('missing day stays null', values('pitches','2026-01-01') === null);
check('unmeasured speed stays null', values('velocity','2026-01-02') === null);
check('multiple sessions are summed', values('pitches','2026-01-03') === 30);
check('daily speed is peak', values('velocity','2026-01-03') === 128);
const range={from:'2026-01-01',to:'2026-01-04'}, slots=slotsOf(range).slots;
const pitch=METRIC_SPECS.find(m=>m.key==='pitches')!;
const card=trendCardOf(pitch,values,daysOf(range),null,slots,v=>formatMetric('pitches',v,'kmh','kg'),'4일');
check('no comparison is not zero percent', card.change === null);
check('range total counts actual entries', card.value?.[0] === '30');
const velocity=METRIC_SPECS.find(m=>m.key==='velocity')!;
const speedCard=trendCardOf(velocity,values,daysOf(range),null,slots,v=>formatMetric('velocity',v,'mph','kg'),'4일');
check('unit conversion preserved', speedCard.value?.[1] === 'mph' && speedCard.value?.[0] === '79.5');
check('measurement copy', speedCard.note.startsWith('측정 1일'));
console.log('analysis range: '+passed+' checks passed');
