import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPracticePlan,generatePracticePitch} from '../src/practice-sequence.ts';
import {PITCHERS} from '../src/physics.ts';
import {assessZone} from '../src/strike-zone.ts';

test('ten-pitch mixes balance total calls while allowing random streaks and their continuation',()=>{
  const sequences=new Set<string>();let four=0,five=0,continued=0;
  for(let seed=0;seed<1000;seed++){
    const calls=createPracticePlan(seed),strikes=calls.filter(call=>call==='strike').length;
    assert.equal(calls.length,10);assert.ok(strikes>=4&&strikes<=6);
    if(calls.some((call,i)=>i>=3&&calls.slice(i-3,i).every(previous=>previous===call)))four++;
    if(calls.some((call,i)=>i>=4&&calls.slice(i-4,i).every(previous=>previous===call)))five++;
    if(calls.slice(0,4).every(call=>call===calls[0])&&calls[4]===calls[0])continued++;
    assert.deepEqual(calls,createPracticePlan(seed));sequences.add(calls.join(','));
  }
  assert.ok(sequences.size>100);assert.ok(four>0);assert.ok(five>0);assert.ok(continued>0);
});
test('every repertoire supplies both calls using real KBO-assessed flights without changing the pitch type',()=>{
  for(const pitcher of PITCHERS)for(const spec of pitcher.pitches)for(const call of ['strike','ball'] as const){
    const positions=new Set<string>();
    for(let seed=0;seed<15;seed++){
      const pitch=generatePracticePitch(pitcher,spec.kind,call,seed);
      assert.equal(pitch.kind,spec.kind);assert.equal(pitch.pitcherId,pitcher.id);
      assert.equal(assessZone(pitch).call,call);positions.add(`${pitch.target.x},${pitch.target.y}`);
    }
    assert.ok(positions.size>10);
  }
});
