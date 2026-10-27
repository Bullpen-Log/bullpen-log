import {test} from 'node:test';
import assert from 'node:assert/strict';
import {locationFeedback} from '../src/pitch-feedback.ts';
import {classifyCrossings,STRIKE_ZONE,type ZoneAssessment} from '../src/strike-zone.ts';

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
