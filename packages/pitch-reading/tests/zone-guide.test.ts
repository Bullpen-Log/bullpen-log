import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zoneGuideFrame,locationFeedback,zoneGuideMarkup} from '../src/zone-guide.ts';
import {createTrainingPitcher,TRAINING_LEVELS} from '../src/training-profile.ts';
import {generatePracticePitch} from '../src/practice-sequence.ts';
import {assessZone,classifyCrossings,STRIKE_ZONE,type ZoneAssessment} from '../src/strike-zone.ts';
import {trackingAt} from '../src/physics.ts';

test('guide observes current positions, then retains the real middle crossing only after it is reached',()=>{
  for(const hand of ['R','L'] as const)for(const level of TRAINING_LEVELS){
    const pitcher=createTrainingPitcher(level.id,hand,14);
    for(const spec of pitcher.pitches)for(const call of ['strike','ball'] as const){
      const pitch=generatePracticePitch(pitcher,spec.kind,call,14),result=assessZone(pitch);
      assert.equal(zoneGuideFrame(pitch,0).near,false);
      const t=result.time-.03,point=trackingAt(pitch,t),frame=zoneGuideFrame(pitch,t);
      assert.equal(frame.x,Math.max(16,Math.min(204,110+point.x*200)));
      assert.equal(frame.y,Math.max(18,Math.min(232,258-point.y*200)));
      assert.equal(frame.complete,false);
      assert.equal(zoneGuideFrame(pitch,result.decisionTime-1e-5).complete,false);
      const complete=zoneGuideFrame(pitch,result.decisionTime);
      assert.equal(complete.near,true);assert.equal(complete.complete,true);
      assert.deepEqual(zoneGuideFrame(pitch,result.decisionTime+1),complete);
      assert.equal(complete.x,Math.max(16,Math.min(204,110+result.middle.x*200)));
      assert.equal(complete.y,Math.max(18,Math.min(232,258-result.middle.y*200)));
      assert.ok(complete.x>=16&&complete.x<=204&&complete.y>=18&&complete.y<=232);
      assert.equal('call' in frame,false);assert.equal('kind' in frame,false);
    }
  }
  assert.doesNotMatch(zoneGuideMarkup(),/>스트라이크<|>볼<|#34d399|#f87171/);
});

test('location feedback distinguishes high and low misses, handed inside/outside and edge-contact strikes',()=>{
  const make=(x:number,y:number,endY=y)=>{
    const middle={x,y,z:18.22},end={x,y:endY,z:18.44};
    return {...classifyCrossings(middle,end),middle,end,point:middle,front:middle,time:.5,decisionTime:.51} as ZoneAssessment;
  };
  assert.equal(locationFeedback(make(0,1.3),'R'),'높게 벗어난 공');
  assert.equal(locationFeedback(make(0,.2),'R'),'낮게 벗어난 공');
  assert.equal(locationFeedback(make(-.7,.75),'R'),'몸쪽으로 벗어난 공');
  assert.equal(locationFeedback(make(-.7,.75),'L'),'바깥쪽으로 벗어난 공');
  assert.equal(locationFeedback(make(.7,.75),'L'),'몸쪽으로 벗어난 공');
  assert.equal(locationFeedback(make(0,.92),'R'),'존 안의 높은 공');
  assert.equal(locationFeedback(make(0,.54),'R'),'존 안의 낮은 공');
  const edge=make(0,STRIKE_ZONE.bottom-.01,STRIKE_ZONE.bottom-.01);
  assert.equal(edge.call,'strike');assert.equal(locationFeedback(edge,'R'),'낮은 쪽 경계에 걸친 공');
  const endLow=make(0,STRIKE_ZONE.bottom-.01,STRIKE_ZONE.bottom-.08);
  assert.equal(endLow.call,'ball');assert.equal(locationFeedback(endLow,'R'),'낮게 벗어난 공');
});
